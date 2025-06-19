import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

// Global flag to track if migrations have been run
let migrationsRun = false;

export class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    
    this.initializeSchema();
    this.runMigrations();
  }

  private initializeSchema(): void {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    try {
      this.db.exec(schema);
      logger.info('Database schema initialized');
    } catch (error) {
      logger.error('Failed to initialize database schema:', error);
      throw error;
    }
  }

  private runMigrations(): void {
    // Skip if migrations have already been run in this process
    if (migrationsRun) {
      logger.info('Migrations already run in this process, skipping');
      return;
    }
    
    // Create migrations table if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrationsPath = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsPath)) {
      logger.info('No migrations directory found');
      return;
    }

    const migrationFiles = fs.readdirSync(migrationsPath)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const version = parseInt(file.split('_')[0]);
      
      // Check if migration has already been applied
      const applied = this.db.prepare('SELECT version FROM migrations WHERE version = ?').get(version);
      if (applied) {
        continue;
      }

      const migrationPath = path.join(migrationsPath, file);
      const migration = fs.readFileSync(migrationPath, 'utf-8');
      
      try {
        logger.info(`Running migration ${file}`);
        this.db.exec(migration);
        
        // Record that the migration has been applied
        const name = file.replace('.sql', '');
        this.db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(version, name);
        
        logger.info(`Migration ${file} completed`);
      } catch (error) {
        logger.error(`Failed to run migration ${file}:`, error);
        throw error;
      }
    }
    
    // Mark migrations as run for this process
    migrationsRun = true;
  }

  getTables(): string[] {
    const tables = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all();
    
    return tables.map((t: any) => t.name);
  }

  getTableSchema(tableName: string): any {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
    const schema: any = {};
    
    columns.forEach((col: any) => {
      schema[col.name] = {
        type: col.type,
        notNull: col.notnull === 1,
        default: col.dflt_value,
        primaryKey: col.pk === 1
      };
    });

    // Add foreign key information
    const foreignKeys = this.db.prepare(`PRAGMA foreign_key_list(${tableName})`).all();
    foreignKeys.forEach((fk: any) => {
      if (schema[fk.from]) {
        schema[fk.from].foreignKey = `${fk.table}.${fk.to}`;
      }
    });

    // Add unique constraint information
    const uniqueIndexes = this.db.prepare(`
      SELECT sql FROM sqlite_master 
      WHERE type = 'table' AND name = ?
    `).get(tableName) as { sql?: string } | undefined;
    
    if (uniqueIndexes && uniqueIndexes.sql) {
      // Parse UNIQUE constraints from CREATE TABLE statement
      const uniqueMatches = uniqueIndexes.sql.match(/(\w+)\s+TEXT\s+UNIQUE/gi);
      if (uniqueMatches) {
        uniqueMatches.forEach((match: string) => {
          const columnName = match.split(/\s+/)[0];
          if (schema[columnName]) {
            schema[columnName].unique = true;
          }
        });
      }
    }
    
    // Also check for unique indexes
    const indexes = this.db.prepare(`PRAGMA index_list(${tableName})`).all() as Array<{ name: string; unique: number }>;
    for (const index of indexes) {
      if (index.unique === 1 && !index.name.startsWith('sqlite_')) {
        const indexInfo = this.db.prepare(`PRAGMA index_info(${index.name})`).all();
        indexInfo.forEach((info: any) => {
          if (schema[info.name]) {
            schema[info.name].unique = true;
          }
        });
      }
    }
    
    return schema;
  }

  getTableIndexes(tableName: string): string[] {
    const indexes = this.db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='index' AND tbl_name=?
    `).all(tableName);
    
    return indexes.map((idx: any) => idx.name);
  }

  run(sql: string, params?: any): Database.RunResult {
    return this.db.prepare(sql).run(params);
  }

  get(sql: string, params?: any): any {
    return this.db.prepare(sql).get(params);
  }

  all(sql: string, params?: any): any[] {
    return this.db.prepare(sql).all(params);
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    this.db.close();
  }

  async initialize(): Promise<void> {
    // Database is already initialized in constructor
    // This method exists for API consistency
    return Promise.resolve();
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Simple query to check database connectivity
      this.db.prepare('SELECT 1').get();
      return true;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }
}