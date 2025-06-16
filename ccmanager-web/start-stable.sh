#!/bin/bash

# Stable start script with better error handling

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
    echo -e "${BLUE}Network access enabled${NC}"
fi

echo -e "${GREEN}Starting CCManager Web (Stable Mode)${NC}"

# Ensure we're in the right directory
cd "$(dirname "$0")"

# Kill any existing processes
echo -e "${YELLOW}Cleaning up any existing processes...${NC}"
pkill -f "node.*vite" 2>/dev/null
pkill -f "node.*nodemon" 2>/dev/null
pkill -f "node.*ts-node.*index.ts" 2>/dev/null
sleep 2

# Check dependencies
if [ ! -d "node_modules" ] || [ ! -d "backend/node_modules" ] || [ ! -d "frontend/node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

# Ensure .env exists
if [ ! -f "backend/.env" ]; then
    cp backend/.env.example backend/.env
fi

# Create required directories
mkdir -p data logs

# Build shared types
echo -e "${GREEN}Building shared types...${NC}"
npm run build:shared

# Function to start backend
start_backend() {
    echo -e "${GREEN}Starting backend server...${NC}"
    cd backend
    if [[ -n "$HOST_FLAG" ]]; then
        export HOST=0.0.0.0
    else
        export HOST=localhost
    fi
    npm run dev &
    BACKEND_PID=$!
    cd ..
    echo -e "${YELLOW}Backend PID: $BACKEND_PID${NC}"
}

# Function to start frontend
start_frontend() {
    echo -e "${GREEN}Starting frontend server...${NC}"
    cd frontend
    if [[ -n "$HOST_FLAG" ]]; then
        npm run dev -- --host &
    else
        npm run dev &
    fi
    FRONTEND_PID=$!
    cd ..
    echo -e "${YELLOW}Frontend PID: $FRONTEND_PID${NC}"
}

# Trap to handle shutdown
cleanup() {
    echo -e "\n${YELLOW}Shutting down servers...${NC}"
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null
    fi
    pkill -f "node.*vite" 2>/dev/null
    pkill -f "node.*nodemon" 2>/dev/null
    pkill -f "node.*ts-node.*index.ts" 2>/dev/null
    echo -e "${GREEN}Shutdown complete${NC}"
    exit 0
}

trap cleanup EXIT INT TERM

# Start servers
start_backend
sleep 3  # Give backend time to start
start_frontend

# Wait for both to be ready
echo -e "\n${GREEN}Waiting for servers to be ready...${NC}"
sleep 5

# Display access information
if [[ -n "$HOST_FLAG" ]]; then
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    echo -e "\n${GREEN}CCManager Web is running!${NC}"
    echo -e "${YELLOW}Backend:${NC}"
    echo -e "  - Local: http://localhost:3001"
    echo -e "  - Network: http://${LOCAL_IP}:3001"
    echo -e "${YELLOW}Frontend:${NC}"
    echo -e "  - Local: http://localhost:5173"
    echo -e "  - Network: http://${LOCAL_IP}:5173"
else
    echo -e "\n${GREEN}CCManager Web is running!${NC}"
    echo -e "${YELLOW}Backend:${NC} http://localhost:3001"
    echo -e "${YELLOW}Frontend:${NC} http://localhost:5173"
fi

echo -e "\n${YELLOW}Login credentials:${NC}"
echo -e "  Username: admin"
echo -e "  Password: AdminPass123!"

echo -e "\n${BLUE}Press Ctrl+C to stop${NC}"

# Keep script running
while true; do
    sleep 1
done