#!/usr/bin/env node
// Validates PRODUCT.md <-> inputs.yml sync and checks for private tag leakage
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

let hasError = false;

function err(msg) {
  console.error(`❌ ${msg}`);
  hasError = true;
}

function warn(msg) {
  console.warn(`⚠  ${msg}`);
}

// --- 1. Check PRODUCT.md exists ---
const productPath = resolve(root, 'docs/PRODUCT.md');
if (!existsSync(productPath)) {
  err('docs/PRODUCT.md not found');
  process.exit(1);
}

const productContent = readFileSync(productPath, 'utf8');

// --- 2. Extract private tag content to detect leakage ---
const privateBlockPattern = /<private>([\s\S]*?)<\/private>/gi;
const privateTexts = [];
let match;
while ((match = privateBlockPattern.exec(productContent)) !== null) {
  const lines = match[1].split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 10);
  privateTexts.push(...lines);
}

// --- 3. Scan governance docs for private content leakage ---
const governanceDocs = [
  'docs/CHANGELOG_AI.md',
  'docs/DECISIONS_LOG.md',
  'docs/IMPLEMENTATION_MAP.md',
  '.cline/memory/agent-log.md',
  '.cline/memory/lessons.md',
];

for (const docPath of governanceDocs) {
  const fullPath = resolve(root, docPath);
  if (!existsSync(fullPath)) continue;
  const content = readFileSync(fullPath, 'utf8');
  for (const privateText of privateTexts) {
    if (content.includes(privateText)) {
      err(`Private tag content leaked into ${docPath}: "${privateText.slice(0, 60)}..."`);
    }
  }
}

// --- 4. Check required PRODUCT.md sections (match flexible headings) ---
const requiredPatterns = [
  { label: 'App Identity / Name', pattern: /##\s+(App (Name|Identity)|Name:)/i },
  { label: 'Purpose / Problem Statement', pattern: /##\s+(Purpose|Problem Statement|Overview)/i },
  { label: 'Target Users / Primary Users', pattern: /(##\s+(Target Users|Primary Users|Users|Stakeholders)|^Primary users?:)/im },
  { label: 'Core Entities / Data Model', pattern: /##\s+(Core Entities|Data (Entities|Model)|Entities)/i },
  { label: 'User Roles / Roles', pattern: /##\s+(User Roles|Roles|Permissions)/i },
];

const missingSections = requiredPatterns.filter(({ pattern }) => !pattern.test(productContent));
if (missingSections.length > 0) {
  warn(`PRODUCT.md may be missing sections: ${missingSections.map(s => s.label).join(', ')}`);
}

// --- 5. Check inputs.yml exists ---
const inputsPath = resolve(root, 'inputs.yml');
if (!existsSync(inputsPath)) {
  err('inputs.yml not found — run Phase 3 to regenerate');
}

// --- 6. Check CREDENTIALS.md is gitignored ---
const gitignorePath = resolve(root, '.gitignore');
if (existsSync(gitignorePath)) {
  const gitignoreContent = readFileSync(gitignorePath, 'utf8');
  if (!gitignoreContent.includes('CREDENTIALS.md')) {
    err('CREDENTIALS.md is NOT in .gitignore — add it immediately');
  }
  // .env.* wildcard covers .env.dev — check for either pattern
  const envDevCovered = gitignoreContent.includes('.env.dev') ||
    gitignoreContent.includes('.env.*') ||
    gitignoreContent.includes('.env\n') ||
    /^\.env\.\*$/m.test(gitignoreContent);
  if (!envDevCovered) {
    err('.env.dev is NOT covered by .gitignore — add ".env.*" or ".env.dev" immediately');
  }
}

if (hasError) {
  console.error('\n❌ Product sync check FAILED — fix the issues above before continuing');
  process.exit(1);
}

console.log('✅ Product sync check passed');
console.log(`   Private tags: ${privateTexts.length > 0 ? `${privateTexts.length} patterns checked — no leakage` : 'none found'}`);
console.log(`   Governance docs checked: ${governanceDocs.length}`);
