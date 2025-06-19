#!/bin/bash

# CCManager Web Admin Setup Script

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}CCManager Web - Admin Account Setup${NC}"
echo

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "backend" ]; then
    echo -e "${RED}Error: Please run this script from the ccmanager-web root directory${NC}"
    exit 1
fi

# Default values
DEFAULT_USERNAME="admin"
DEFAULT_PASSWORD="AdminPass123!"
DEFAULT_API_KEY=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --username)
            USERNAME="$2"
            shift 2
            ;;
        --password)
            PASSWORD="$2"
            shift 2
            ;;
        --api-key)
            API_KEY="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo
            echo "Options:"
            echo "  --username <username>   Admin username (default: admin)"
            echo "  --password <password>   Admin password (default: AdminPass123!)"
            echo "  --api-key <key>        Claude API key (optional)"
            echo "  --help                 Show this help message"
            echo
            echo "Example:"
            echo "  $0 --username admin --password MySecurePass123! --api-key sk-ant-..."
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Use defaults if not provided
USERNAME=${USERNAME:-$DEFAULT_USERNAME}
PASSWORD=${PASSWORD:-$DEFAULT_PASSWORD}
API_KEY=${API_KEY:-$DEFAULT_API_KEY}

# Validate password meets requirements
if [[ ${#PASSWORD} -lt 8 ]]; then
    echo -e "${RED}Error: Password must be at least 8 characters${NC}"
    exit 1
fi

if ! [[ "$PASSWORD" =~ [A-Z] ]]; then
    echo -e "${RED}Error: Password must contain at least one uppercase letter${NC}"
    exit 1
fi

if ! [[ "$PASSWORD" =~ [a-z] ]]; then
    echo -e "${RED}Error: Password must contain at least one lowercase letter${NC}"
    exit 1
fi

if ! [[ "$PASSWORD" =~ [0-9] ]]; then
    echo -e "${RED}Error: Password must contain at least one number${NC}"
    exit 1
fi

# Build the project if needed
if [ ! -d "backend/dist" ]; then
    echo -e "${YELLOW}Building backend...${NC}"
    npm run build:backend
fi

# Create the setup script
cat > backend/dist/setup-admin.js << 'EOF'
const path = require('path');
const { AuthService } = require('./services/auth');
const { ApiKeyManager } = require('./services/apiKeyManager');

async function setupAdmin() {
    const username = process.argv[2];
    const password = process.argv[3];
    const apiKey = process.argv[4];
    
    const dbPath = path.join(__dirname, '../../data/ccmanager.db');
    
    console.log(`Creating admin account: ${username}`);
    
    try {
        // Create auth service
        const authService = new AuthService(dbPath);
        
        // Check if user already exists
        const existingUser = await authService.getUser(username);
        if (existingUser) {
            console.error(`Error: User '${username}' already exists`);
            process.exit(1);
        }
        
        // Register the user
        const { userId } = await authService.register(username, password);
        console.log(`✓ Admin account created successfully (ID: ${userId})`);
        
        // Store API key if provided
        if (apiKey && apiKey !== 'none') {
            const apiKeyManager = new ApiKeyManager(dbPath);
            await apiKeyManager.storeApiKey(userId, apiKey);
            console.log('✓ API key stored successfully');
        }
        
        // Close database connections
        authService.close();
        
        console.log('\nSetup complete! You can now login with:');
        console.log(`  Username: ${username}`);
        console.log(`  Password: [the password you provided]`);
        
        process.exit(0);
    } catch (error) {
        console.error(`Setup failed: ${error.message}`);
        process.exit(1);
    }
}

setupAdmin();
EOF

# Create data directory if it doesn't exist
mkdir -p data

# Run the setup
echo -e "${BLUE}Creating admin account...${NC}"
cd backend && node dist/setup-admin.js "$USERNAME" "$PASSWORD" "${API_KEY:-none}" && cd ..

if [ $? -eq 0 ]; then
    echo
    echo -e "${GREEN}Admin setup complete!${NC}"
    echo
    echo -e "${YELLOW}You can now start the application and login with:${NC}"
    echo -e "  Username: ${BLUE}$USERNAME${NC}"
    echo -e "  Password: ${BLUE}[your password]${NC}"
    echo
    if [ -n "$API_KEY" ] && [ "$API_KEY" != "" ]; then
        echo -e "${GREEN}✓ Claude API key has been configured${NC}"
    else
        echo -e "${YELLOW}Note: No API key provided. You can add one later in the web interface.${NC}"
    fi
else
    echo -e "${RED}Setup failed. Please check the error messages above.${NC}"
    exit 1
fi

# Clean up
rm -f backend/dist/setup-admin.js