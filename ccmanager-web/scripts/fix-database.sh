#!/bin/bash

# Database fix script for missing columns

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}CCManager Web - Database Fix${NC}"
echo

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "backend" ]; then
    echo -e "${RED}Error: Please run this script from the ccmanager-web root directory${NC}"
    exit 1
fi

# Create the fix script
cat > backend/dist/fix-database.js << 'EOF'
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/ccmanager.db');
console.log(`Fixing database at: ${dbPath}`);

try {
    const db = new Database(dbPath);
    
    // Enable foreign keys
    db.pragma('foreign_keys = ON');
    
    console.log('Checking and adding missing columns...');
    
    // Check if last_login column exists
    const userColumns = db.prepare("PRAGMA table_info(users)").all();
    const hasLastLogin = userColumns.some(col => col.name === 'last_login');
    
    if (!hasLastLogin) {
        console.log('Adding last_login column to users table...');
        db.prepare('ALTER TABLE users ADD COLUMN last_login DATETIME').run();
        console.log('✓ Added last_login column');
    } else {
        console.log('✓ last_login column already exists');
    }
    
    // Check if is_active column exists
    const hasIsActive = userColumns.some(col => col.name === 'is_active');
    
    if (!hasIsActive) {
        console.log('Adding is_active column to users table...');
        db.prepare('ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1').run();
        console.log('✓ Added is_active column');
    } else {
        console.log('✓ is_active column already exists');
    }
    
    // Verify the changes
    const updatedColumns = db.prepare("PRAGMA table_info(users)").all();
    console.log('\nCurrent users table schema:');
    updatedColumns.forEach(col => {
        console.log(`  - ${col.name}: ${col.type}${col.notnull ? ' NOT NULL' : ''}${col.dflt_value ? ` DEFAULT ${col.dflt_value}` : ''}`);
    });
    
    db.close();
    console.log('\n✓ Database fix completed successfully!');
    
} catch (error) {
    console.error(`Error fixing database: ${error.message}`);
    process.exit(1);
}
EOF

# Build if needed
if [ ! -d "backend/dist" ]; then
    echo -e "${YELLOW}Building backend...${NC}"
    npm run build:backend
fi

# Run the fix
echo -e "${YELLOW}Fixing database schema...${NC}"
cd backend && node dist/fix-database.js && cd ..

if [ $? -eq 0 ]; then
    echo
    echo -e "${GREEN}Database fixed successfully!${NC}"
    echo -e "${YELLOW}You can now login to the application.${NC}"
else
    echo -e "${RED}Database fix failed. Please check the error messages above.${NC}"
    exit 1
fi

# Clean up
rm -f backend/dist/fix-database.js