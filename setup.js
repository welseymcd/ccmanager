// Setup script to create initial admin user
const path = require('path');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'data', 'ccmanager.db');
const db = new Database(dbPath);

async function setup() {
  try {
    // Check if admin user exists
    const adminUser = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
    
    if (adminUser) {
      console.log('Admin user already exists');
      return;
    }

    // Create admin user
    const passwordHash = await bcrypt.hash('admin123', 10);
    const userId = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);

    db.prepare(`
      INSERT INTO users (id, username, password_hash, is_active)
      VALUES (?, ?, ?, 1)
    `).run(userId, 'admin', passwordHash);

    // Create default preferences
    db.prepare(`
      INSERT INTO user_preferences (user_id)
      VALUES (?)
    `).run(userId);

    console.log('Admin user created successfully');
    console.log('Username: admin');
    console.log('Password: admin123');
  } catch (error) {
    console.error('Setup failed:', error);
  } finally {
    db.close();
  }
}

setup();