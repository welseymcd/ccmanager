# Step 01: Project Setup and Structure

## Objective
Initialize the CCManager Web project with proper structure, dependencies, and development environment.

## Test First: Project Structure Validation

```bash
# tests/infrastructure/project-structure.test.js
describe('Project Structure', () => {
  test('required directories exist', () => {
    const requiredDirs = [
      'backend/src',
      'backend/tests',
      'frontend/src',
      'frontend/tests',
      'shared/types',
      'data',
      'logs'
    ];
    
    requiredDirs.forEach(dir => {
      expect(fs.existsSync(path.join(process.cwd(), dir))).toBe(true);
    });
  });

  test('configuration files exist', () => {
    const configFiles = [
      'package.json',
      'tsconfig.json',
      'backend/tsconfig.json',
      'frontend/tsconfig.json',
      '.env.example',
      'docker-compose.yml'
    ];
    
    configFiles.forEach(file => {
      expect(fs.existsSync(path.join(process.cwd(), file))).toBe(true);
    });
  });
});
```

## Implementation Steps

### 1. Initialize Project Structure

```bash
mkdir ccmanager-web && cd ccmanager-web
npm init -y

# Create directory structure
mkdir -p backend/{src/{routes,services,middleware,models,utils},tests}
mkdir -p frontend/{src/{components,hooks,services,utils},tests}
mkdir -p shared/types
mkdir -p {data,logs,scripts}
```

### 2. Root package.json Configuration

```json
{
  "name": "ccmanager-web",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "backend",
    "frontend",
    "shared"
  ],
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "cd backend && npm run dev",
    "dev:frontend": "cd frontend && npm run dev",
    "build": "npm run build:shared && npm run build:backend && npm run build:frontend",
    "build:shared": "cd shared && npm run build",
    "build:backend": "cd backend && npm run build",
    "build:frontend": "cd frontend && npm run build",
    "test": "npm run test:backend && npm run test:frontend",
    "test:backend": "cd backend && npm test",
    "test:frontend": "cd frontend && npm test",
    "lint": "eslint . --ext .ts,.tsx,.js,.jsx",
    "typecheck": "tsc --noEmit -p backend && tsc --noEmit -p frontend"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^5.59.0",
    "@typescript-eslint/parser": "^5.59.0",
    "concurrently": "^8.0.1",
    "eslint": "^8.38.0",
    "typescript": "^5.0.4"
  }
}
```

### 3. Backend package.json

```json
{
  "name": "@ccmanager/backend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "nodemon",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.6.1",
    "node-pty": "^1.0.0",
    "bcrypt": "^5.1.0",
    "jsonwebtoken": "^9.0.0",
    "sqlite3": "^5.1.6",
    "better-sqlite3": "^8.0.0",
    "winston": "^3.8.2",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "express-rate-limit": "^6.7.0",
    "dotenv": "^16.0.3"
  },
  "devDependencies": {
    "@types/node": "^18.15.11",
    "@types/express": "^4.17.17",
    "@types/bcrypt": "^5.0.0",
    "@types/jsonwebtoken": "^9.0.1",
    "@types/better-sqlite3": "^7.6.3",
    "nodemon": "^2.0.22",
    "ts-node": "^10.9.1",
    "vitest": "^0.30.1",
    "@vitest/coverage-c8": "^0.30.1"
  }
}
```

### 4. Frontend package.json

```json
{
  "name": "@ccmanager/frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@tanstack/react-router": "^1.0.0",
    "@tanstack/react-query": "^4.29.5",
    "zustand": "^4.3.7",
    "socket.io-client": "^4.6.1",
    "xterm": "^5.1.0",
    "xterm-addon-fit": "^0.7.0",
    "xterm-addon-web-links": "^0.8.0",
    "xterm-addon-search": "^0.11.0",
    "@radix-ui/react-tabs": "^1.0.3",
    "@radix-ui/react-dialog": "^1.0.3",
    "@radix-ui/react-dropdown-menu": "^2.0.4",
    "class-variance-authority": "^0.6.0",
    "clsx": "^1.2.1",
    "tailwind-merge": "^1.12.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.35",
    "@types/react-dom": "^18.0.11",
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^4.3.0",
    "vitest": "^0.30.1",
    "@vitest/coverage-c8": "^0.30.1",
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^5.16.5",
    "tailwindcss": "^3.3.1",
    "postcss": "^8.4.23",
    "autoprefixer": "^10.4.14"
  }
}
```

### 5. TypeScript Configuration

```typescript
// tsconfig.json (root)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "paths": {
      "@shared/*": ["./shared/*"]
    }
  },
  "references": [
    { "path": "./backend" },
    { "path": "./frontend" },
    { "path": "./shared" }
  ]
}
```

### 6. Environment Configuration

```bash
# .env.example
# Server Configuration
PORT=3001
NODE_ENV=development

# Database
DATABASE_PATH=./data/ccmanager.db

# Session Configuration
SESSION_SECRET=your-session-secret-here
JWT_SECRET=your-jwt-secret-here
JWT_EXPIRY=7d

# Claude Configuration
CLAUDE_COMMAND=claude
MAX_SESSIONS_PER_USER=20

# Security
CORS_ORIGIN=http://localhost:5173
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=debug
LOG_DIR=./logs
```

## Verification

Run the test to ensure project structure is correct:

```bash
npm test -- tests/infrastructure/project-structure.test.js
```

## Rollback Plan

If initialization fails:
1. Remove node_modules directories
2. Clear npm cache: `npm cache clean --force`
3. Re-run initialization steps
4. Verify Node.js version compatibility (>=18.0.0)

## Next Step
Proceed to [02-express-server.md](./02-express-server.md) to set up the Express server.