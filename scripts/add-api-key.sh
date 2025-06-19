#!/bin/bash

# Add API key to existing user

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}CCManager Web - Add API Key${NC}"
echo

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "backend" ]; then
    echo -e "${RED}Error: Please run this script from the ccmanager-web root directory${NC}"
    exit 1
fi

# Parse command line arguments
USERNAME="admin"
API_KEY=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --username)
            USERNAME="$2"
            shift 2
            ;;
        --api-key)
            API_KEY="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 --api-key <key> [--username <username>]"
            echo
            echo "Options:"
            echo "  --username <username>   Username (default: admin)"
            echo "  --api-key <key>        Claude API key (required)"
            echo "  --help                 Show this help message"
            echo
            echo "Example:"
            echo "  $0 --api-key sk-ant-api03-..."
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

if [ -z "$API_KEY" ]; then
    echo -e "${RED}Error: API key is required${NC}"
    echo "Use --help for usage information"
    exit 1
fi

# Create the script
cat > backend/dist/add-api-key.js << 'EOF'
const path = require('path');
const { AuthService } = require('./services/auth');
const { ApiKeyManager } = require('./services/apiKeyManager');

async function addApiKey() {
    const username = process.argv[2];
    const apiKey = process.argv[3];
    
    const dbPath = path.join(__dirname, '../../data/ccmanager.db');
    
    console.log(`Adding API key for user: ${username}`);
    
    try {
        const authService = new AuthService(dbPath);
        const apiKeyManager = new ApiKeyManager(dbPath);
        
        // Get user
        const user = await authService.getUser(username);
        if (!user) {
            console.error(`Error: User '${username}' not found`);
            process.exit(1);
        }
        
        // Store API key
        await apiKeyManager.storeApiKey(user.id, apiKey);
        console.log('✓ API key added successfully');
        
        // Close database connections
        authService.close();
        apiKeyManager.close();
        
        process.exit(0);
    } catch (error) {
        console.error(`Failed to add API key: ${error.message}`);
        process.exit(1);
    }
}

addApiKey();
EOF

# Build if needed
if [ ! -d "backend/dist" ]; then
    echo -e "${YELLOW}Building backend...${NC}"
    npm run build:backend
fi

# Run the script
echo -e "${BLUE}Adding API key...${NC}"
cd backend && node dist/add-api-key.js "$USERNAME" "$API_KEY" && cd ..

if [ $? -eq 0 ]; then
    echo
    echo -e "${GREEN}API key added successfully!${NC}"
    echo -e "${YELLOW}The user '$USERNAME' can now create Claude Code sessions.${NC}"
else
    echo -e "${RED}Failed to add API key. Please check the error messages above.${NC}"
    exit 1
fi

# Clean up
rm -f backend/dist/add-api-key.js