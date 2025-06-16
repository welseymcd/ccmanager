#!/usr/bin/env node

/**
 * Development server with auto-restart on crashes
 */

const { spawn } = require('child_process');
const path = require('path');

// Colors for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

let backendProcess = null;
let frontendProcess = null;
let isShuttingDown = false;

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function startBackend() {
  log('green', '🚀 Starting backend server...');
  
  backendProcess = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, 'backend'),
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' }
  });

  backendProcess.on('exit', (code, signal) => {
    if (!isShuttingDown) {
      log('yellow', `⚠️  Backend exited with code ${code}, signal ${signal}`);
      log('yellow', '🔄 Restarting backend in 3 seconds...');
      setTimeout(startBackend, 3000);
    }
  });

  backendProcess.on('error', (err) => {
    log('red', `❌ Backend error: ${err.message}`);
  });
}

function startFrontend() {
  log('green', '🚀 Starting frontend server...');
  
  frontendProcess = spawn('npm', ['run', 'dev', '--', '--host'], {
    cwd: path.join(__dirname, 'frontend'),
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' }
  });

  frontendProcess.on('exit', (code, signal) => {
    if (!isShuttingDown && code !== 0) {
      log('yellow', `⚠️  Frontend exited with code ${code}, signal ${signal}`);
      log('yellow', '🔄 Restarting frontend in 3 seconds...');
      setTimeout(startFrontend, 3000);
    }
  });

  frontendProcess.on('error', (err) => {
    log('red', `❌ Frontend error: ${err.message}`);
  });
}

function shutdown() {
  if (isShuttingDown) return;
  
  isShuttingDown = true;
  log('yellow', '\n🛑 Shutting down servers...');

  const promises = [];
  
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
    promises.push(new Promise(resolve => {
      backendProcess.on('exit', resolve);
      setTimeout(resolve, 5000); // Force resolve after 5s
    }));
  }
  
  if (frontendProcess) {
    frontendProcess.kill('SIGTERM');
    promises.push(new Promise(resolve => {
      frontendProcess.on('exit', resolve);
      setTimeout(resolve, 5000); // Force resolve after 5s
    }));
  }

  Promise.all(promises).then(() => {
    log('green', '✅ Shutdown complete');
    process.exit(0);
  });
}

// Handle various shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', shutdown);

// Catch uncaught exceptions
process.on('uncaughtException', (err) => {
  log('red', `❌ Uncaught exception: ${err.message}`);
  console.error(err);
  shutdown();
});

// Main execution
async function main() {
  log('blue', '🌟 CCManager Web Development Server');
  log('blue', '===================================\n');

  // Check if running with --host flag
  const useHost = process.argv.includes('--host');
  if (useHost) {
    process.env.HOST = '0.0.0.0';
    log('blue', '🌐 Network access enabled');
  }

  // Build shared types first
  log('green', '📦 Building shared types...');
  const buildShared = spawn('npm', ['run', 'build:shared'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true
  });

  await new Promise(resolve => buildShared.on('exit', resolve));

  // Start servers with a delay to avoid race conditions
  startBackend();
  setTimeout(startFrontend, 2000);

  // Display access information after a delay
  setTimeout(() => {
    log('green', '\n✅ Development servers are running!');
    if (useHost) {
      const os = require('os');
      const networkInterfaces = os.networkInterfaces();
      const addresses = [];
      
      for (const iface of Object.values(networkInterfaces)) {
        for (const addr of iface) {
          if (addr.family === 'IPv4' && !addr.internal) {
            addresses.push(addr.address);
          }
        }
      }
      
      log('yellow', '\n📡 Backend:');
      console.log(`   Local:   http://localhost:3001`);
      addresses.forEach(addr => {
        console.log(`   Network: http://${addr}:3001`);
      });
      
      log('yellow', '\n🖥️  Frontend:');
      console.log(`   Local:   http://localhost:5173`);
      addresses.forEach(addr => {
        console.log(`   Network: http://${addr}:5173`);
      });
    } else {
      log('yellow', '\n📡 Backend:  http://localhost:3001');
      log('yellow', '🖥️  Frontend: http://localhost:5173');
    }
    
    log('blue', '\n💡 Login credentials:');
    console.log('   Username: admin');
    console.log('   Password: AdminPass123!');
    
    log('blue', '\n🛑 Press Ctrl+C to stop all servers\n');
  }, 5000);
}

// Start the application
main().catch(err => {
  log('red', `❌ Failed to start: ${err.message}`);
  process.exit(1);
});