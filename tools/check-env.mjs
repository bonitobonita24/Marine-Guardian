#!/usr/bin/env node
// Validates that all required env vars are declared in .env.dev
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const ENV_FILE = resolve(root, '.env.dev');
const EXAMPLE_FILE = resolve(root, '.env.example');

function loadEnvKeys(filePath) {
  if (!existsSync(filePath)) return new Set();
  const lines = readFileSync(filePath, 'utf8').split('\n');
  const keys = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) keys.add(trimmed.slice(0, eqIdx).trim());
  }
  return keys;
}

// Required env vars that must be present in .env.dev
const REQUIRED_DEV = [
  'COMPOSE_PROJECT_NAME',
  'APP_ENV',
  'APP_PORT',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'DATABASE_URL',
  'PGBOUNCER_PORT',
  'PGBOUNCER_AUTH_PASSWORD',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'REDIS_URL',
  'AUTH_SECRET',
  'NEXTAUTH_URL',
  'SMTP_HOST',
  'SMTP_PORT',
  'PGADMIN_PORT',
  'PGADMIN_EMAIL',
  'PGADMIN_PASSWORD',
  'ENCRYPTION_KEY',
];

if (!existsSync(ENV_FILE)) {
  console.error(`❌ .env.dev not found. Run Phase 3 to generate it.`);
  process.exit(1);
}

const devKeys = loadEnvKeys(ENV_FILE);
const missing = REQUIRED_DEV.filter(k => !devKeys.has(k));

if (missing.length > 0) {
  console.error(`❌ .env.dev is missing required env vars:`);
  for (const k of missing) console.error(`   - ${k}`);
  process.exit(1);
}

// Check .env.example exists and is committed-safe
if (!existsSync(EXAMPLE_FILE)) {
  console.warn('⚠  .env.example not found — add it for new developer onboarding');
} else {
  const exampleContent = readFileSync(EXAMPLE_FILE, 'utf8');
  // Detect if .env.example accidentally has real-looking secrets
  const hasRealSecrets = exampleContent.match(/[A-Za-z0-9+/]{32,}={0,2}\n/);
  if (hasRealSecrets) {
    console.warn('⚠  .env.example may contain real secret values — verify before committing');
  }
}

console.log(`✅ .env.dev has all ${REQUIRED_DEV.length} required env vars`);
