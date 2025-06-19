const fs = require('fs');
const path = require('path');

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
      '.env.example'
    ];
    
    configFiles.forEach(file => {
      expect(fs.existsSync(path.join(process.cwd(), file))).toBe(true);
    });
  });
});