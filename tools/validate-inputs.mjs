#!/usr/bin/env node
// Validates inputs.yml against inputs.schema.json
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadJSON(path) {
  if (!existsSync(path)) {
    console.error(`❌ Missing required file: ${path}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Basic YAML parser for simple key: value pairs (no dependency required)
function parseYaml(content) {
  const lines = content.split('\n');
  const result = {};
  const stack = [{ obj: result, indent: -1 }];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.search(/\S/);
    const match = line.match(/^(\s*)([^:]+):\s*(.*)?$/);
    if (!match) continue;

    const [, , key, value] = match;
    const cleanKey = key.trim();

    // Pop stack to correct level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;

    if (value && value.trim() && !value.trim().startsWith('#')) {
      parent[cleanKey] = value.trim().replace(/^["']|["']$/g, '');
    } else {
      parent[cleanKey] = {};
      stack.push({ obj: parent[cleanKey], indent });
    }
  }
  return result;
}

const schemaPath = resolve(root, 'inputs.schema.json');
const inputsPath = resolve(root, 'inputs.yml');

if (!existsSync(inputsPath)) {
  console.error('❌ inputs.yml not found at project root');
  process.exit(1);
}

if (!existsSync(schemaPath)) {
  console.error('❌ inputs.schema.json not found at project root');
  process.exit(1);
}

const schema = loadJSON(schemaPath);
const content = readFileSync(inputsPath, 'utf8');
const inputs = parseYaml(content);

// Validate required top-level sections
const requiredSections = schema.required ?? ['app', 'apps', 'tenancy', 'auth', 'ports', 'docker', 'git'];
const missing = requiredSections.filter(key => !(key in inputs));

if (missing.length > 0) {
  console.error(`❌ inputs.yml is missing required sections: ${missing.join(', ')}`);
  process.exit(1);
}

// Validate app section
const app = inputs.app ?? {};
const requiredAppFields = ['name', 'slug'];
const missingApp = requiredAppFields.filter(f => !app[f]);
if (missingApp.length > 0) {
  console.error(`❌ inputs.yml app section missing: ${missingApp.join(', ')}`);
  process.exit(1);
}

// Validate ports exist
if (!inputs.ports || !inputs.ports.dev) {
  console.error('❌ inputs.yml missing ports.dev section');
  process.exit(1);
}

console.log(`✅ inputs.yml is valid`);
console.log(`   App: ${app.name}`);
console.log(`   Slug: ${app.slug}`);
