const io = require('socket.io-client');

async function testSession() {
  // First login
  const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin123!' })
  });

  const loginData = await loginResponse.json();
  console.log('Login response:', loginData);

  if (!loginData.token) {
    console.error('Login failed:', loginData.error);
    return;
  }

  // Connect WebSocket
  const socket = io('http://localhost:3001', {
    auth: { token: loginData.token }
  });

  socket.on('connect', () => {
    console.log('Connected to WebSocket');
    
    // Send create_session message
    const message = {
      type: 'create_session',
      workingDir: '/home/ross',
      id: 'test_' + Date.now()
    };
    
    console.log('Sending:', message);
    socket.emit('create_session', message);
  });

  socket.on('session_created', (data) => {
    console.log('Session created:', data);
    process.exit(0);
  });

  socket.on('session_error', (data) => {
    console.error('Session error:', data);
    process.exit(1);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
  });
}

testSession().catch(console.error);