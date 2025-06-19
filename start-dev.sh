#!/bin/bash

# CCManager Web Development Start Script

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command line arguments
HOST_FLAG=""
if [[ "$1" == "--host" ]]; then
    HOST_FLAG="--host"
    echo -e "${BLUE}Network access enabled - servers will be accessible from other devices${NC}"
fi

echo -e "${GREEN}Starting CCManager Web Development Environment${NC}"

# Check if node_modules are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing root dependencies...${NC}"
    npm install
fi

if [ ! -d "backend/node_modules" ]; then
    echo -e "${YELLOW}Installing backend dependencies...${NC}"
    cd backend && npm install && cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo -e "${YELLOW}Installing frontend dependencies...${NC}"
    cd frontend && npm install && cd ..
fi

if [ ! -d "shared/node_modules" ]; then
    echo -e "${YELLOW}Installing shared dependencies...${NC}"
    cd shared && npm install && cd ..
fi

# Check if backend .env exists
if [ ! -f "backend/.env" ]; then
    echo -e "${YELLOW}Creating backend .env file from example...${NC}"
    cp backend/.env.example backend/.env
    echo -e "${YELLOW}Please review and update backend/.env with your configuration${NC}"
fi

# Create data directory if it doesn't exist
mkdir -p data

# Create logs directory if it doesn't exist
mkdir -p logs

# Build shared types first
echo -e "${GREEN}Building shared types...${NC}"
npm run build:shared

# Start the development servers
echo -e "${GREEN}Starting backend and frontend servers...${NC}"

if [[ -n "$HOST_FLAG" ]]; then
    # Get local IP address
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    echo -e "${YELLOW}Backend will run on:${NC}"
    echo -e "  - Local: http://localhost:3001"
    echo -e "  - Network: http://${LOCAL_IP}:3001"
    echo -e "${YELLOW}Frontend will run on:${NC}"
    echo -e "  - Local: http://localhost:5173"
    echo -e "  - Network: http://${LOCAL_IP}:5173"
    
    # Set environment variables for network access
    export HOST=0.0.0.0
    export VITE_HOST=0.0.0.0
    
    # Run with host flag
    npm run dev -- $HOST_FLAG
else
    echo -e "${YELLOW}Backend will run on http://localhost:3001${NC}"
    echo -e "${YELLOW}Frontend will run on http://localhost:5173${NC}"
    
    # Run both backend and frontend in development mode
    npm run dev
fi