import { randomBytes } from 'crypto';

/**
 * Generate a unique ID with an optional prefix
 */
export function generateId(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  const randomPart = randomBytes(8).toString('hex');
  return prefix ? `${prefix}_${timestamp}${randomPart}` : `${timestamp}${randomPart}`;
}

/**
 * Generate a secure random token
 */
export function generateToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Get the last N characters of a string (for API key hints)
 */
export function getStringHint(str: string, length: number = 4): string {
  if (str.length <= length) return str;
  return str.slice(-length);
}