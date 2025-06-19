// Reset admin password
const path = require('path');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, 'data', 'ccmanager.db');
const db = new Database(dbPath);

async function resetAdmin() {
  try {
    // Update admin password to Admin123!
    const passwordHash = await bcrypt.hash('Admin123!', 10);
    
    const result = db.prepare(`
      UPDATE users SET password_hash = ? WHERE username = ?
    `).run(passwordHash, 'admin');

    if (result.changes > 0) {
      console.log('Admin password reset successfully');
      console.log('Username: admin');
      console.log('Password: Admin123!');
    } else {
      console.log('Admin user not found');
    }
  } catch (error) {
    console.error('Reset failed:', error);
  } finally {
    db.close();
  }
}

resetAdmin();