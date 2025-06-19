import { AuthService } from '../src/services/auth';
import { ApiKeyManager } from '../src/services/apiKeyManager';
import path from 'path';

async function demonstrateAuth() {
  const dbPath = path.join(__dirname, '../../data/demo.db');
  const authService = new AuthService(dbPath);
  const apiKeyManager = new ApiKeyManager(dbPath);

  console.log('=== Authentication Demo ===\n');

  try {
    // 1. Register a new user
    console.log('1. Registering new user...');
    const { userId, username } = await authService.register('demouser', 'DemoPass123!');
    console.log(`   ✓ User registered: ${username} (${userId})`);

    // 2. Authenticate the user
    console.log('\n2. Authenticating user...');
    const authResult = await authService.authenticate('demouser', 'DemoPass123!');
    console.log(`   ✓ Authentication successful!`);
    console.log(`   ✓ JWT Token: ${authResult.token?.substring(0, 20)}...`);

    // 3. Validate the token
    console.log('\n3. Validating JWT token...');
    const validation = await authService.validateToken(authResult.token!);
    console.log(`   ✓ Token is valid: ${validation.valid}`);
    console.log(`   ✓ User ID from token: ${validation.userId}`);

    // 4. Store an API key
    console.log('\n4. Storing API key...');
    const demoApiKey = 'sk-ant-demo-key-1234567890';
    await apiKeyManager.storeApiKey(userId, demoApiKey);
    console.log(`   ✓ API key stored securely`);

    // 5. Retrieve API key
    console.log('\n5. Retrieving API key...');
    const retrievedKey = await apiKeyManager.getApiKey(userId);
    console.log(`   ✓ Retrieved key matches: ${retrievedKey === demoApiKey}`);

    // 6. Get key info (without revealing the key)
    console.log('\n6. Getting API key info...');
    const keyInfo = await apiKeyManager.getRawStoredKey(userId);
    console.log(`   ✓ Key hint: ****${keyInfo?.key_hint}`);
    console.log(`   ✓ Key is encrypted: ${keyInfo?.encrypted_key !== demoApiKey}`);

    // 7. Start key rotation
    console.log('\n7. Starting API key rotation...');
    const newApiKey = 'sk-ant-new-key-0987654321';
    const rotationId = await apiKeyManager.startKeyRotation(userId, newApiKey);
    console.log(`   ✓ Rotation started: ${rotationId}`);

    // 8. Complete rotation
    console.log('\n8. Completing key rotation...');
    await apiKeyManager.completeKeyRotation(userId, rotationId);
    const finalKey = await apiKeyManager.getApiKey(userId);
    console.log(`   ✓ New key active: ${finalKey === newApiKey}`);

    console.log('\n=== Demo completed successfully! ===');

  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    authService.close();
    apiKeyManager.close();
  }
}

// Run the demo
demonstrateAuth().catch(console.error);