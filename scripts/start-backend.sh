#!/bin/bash

# CCManager Backend Startup Script
# This script ensures proper startup of the CCManager backend with all required services

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

print_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Change to backend directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/../backend"
cd "$BACKEND_DIR"

print_status "Starting CCManager Backend..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    print_warning "Node modules not found. Installing dependencies..."
    npm install
fi

# Create required directories
mkdir -p ../data
mkdir -p ../logs

# Check for .env file
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        print_warning ".env file not found. Creating from .env.example..."
        cp .env.example .env
        print_warning "Please update .env with your configuration"
    else
        print_error ".env file not found and no .env.example available"
        exit 1
    fi
fi

# Source environment variables
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check database path
DB_PATH="${DB_PATH:-../data/ccmanager.db}"
print_status "Using database: $DB_PATH"

# Build TypeScript if needed
if [ ! -d "dist" ] || [ "$(find src -name '*.ts' -newer dist -print -quit)" ]; then
    print_status "Building TypeScript..."
    npm run build
fi

# Function to handle shutdown
cleanup() {
    print_status "Shutting down CCManager Backend..."
    # The Node.js process will handle graceful shutdown
    exit 0
}

# Trap signals for cleanup
trap cleanup SIGINT SIGTERM

# Start the backend server
print_status "Starting server on port ${PORT:-3001}..."

# Use npm start for production or npm run dev for development
if [ "$NODE_ENV" = "development" ]; then
    npm run dev
else
    npm start
fi