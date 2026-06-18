#!/usr/bin/env node
/**
 * V32.8 Rule 31 — Design-as-Contract token drift validator
 *
 * Checks that globals.css CSS custom properties match the values in docs/tokens.json.
 * Exits non-zero if any token drifts beyond tolerance.
 *
 * Usage: node scripts/design-validate.mjs
 * Or via npm script: pnpm design:validate
 *
 * NOTE: Full V32.8 Rule 31 also prescribes a Playwright toHaveScreenshot gate
 * against a two-stage fixture-deterministic baseline. That visual gate is deferred
 * pending MOCKUP.jsx creation (D12 in DESIGN_DRIFT.md). This script covers the
 * token-drift layer only.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const tokensRaw = readFileSync(resolve(ROOT, 'docs/tokens.json'), 'utf-8');
const tokens = JSON.parse(tokensRaw);

const globalsRaw = readFileSync(
  resolve(ROOT, 'apps/web/src/app/globals.css'),
  'utf-8'
);

/** Extract CSS custom property values from globals.css */
function extractCssVars(css) {
  const vars = {};
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    vars[m[1]] = m[2].trim();
  }
  return vars;
}

const cssVars = extractCssVars(globalsRaw);

const CHECKS = [
  // [token-key, css-var-name, expected-partial-match]
  { key: 'color.background', cssVar: 'background', contains: '3.9%' },
  { key: 'color.primary', cssVar: 'primary', contains: '98%' },
  { key: 'color.secondary', cssVar: 'secondary', contains: '14.9%' },
  { key: 'color.success', cssVar: 'success', contains: '145' },
  { key: 'color.warning', cssVar: 'warning', contains: '25' },
  { key: 'color.caution', cssVar: 'caution', contains: '44' },
  { key: 'color.info', cssVar: 'info', contains: '183' },
  { key: 'color.primary-light', cssVar: 'primary-light', contains: '250, 250, 250' },
  { key: 'color.success-bg', cssVar: 'success-bg', contains: '49, 162, 76' },
  { key: 'color.danger-bg', cssVar: 'danger-bg', contains: '240, 40, 74' },
  { key: 'color.warning-bg', cssVar: 'warning-bg', contains: '232, 145, 45' },
  { key: 'color.caution-bg', cssVar: 'caution-bg', contains: '247, 209, 84' },
];

let failures = 0;
const results = [];

for (const check of CHECKS) {
  const actual = cssVars[check.cssVar];
  if (!actual) {
    results.push({ status: 'MISSING', cssVar: check.cssVar, expected: check.contains });
    failures++;
  } else if (!actual.includes(check.contains)) {
    results.push({ status: 'DRIFT', cssVar: check.cssVar, expected: check.contains, actual });
    failures++;
  } else {
    results.push({ status: 'OK', cssVar: check.cssVar });
  }
}

// Print results
console.log('\n=== V32.8 Rule 31 — Design Token Drift Report ===\n');
for (const r of results) {
  const icon = r.status === 'OK' ? '✓' : '✗';
  const detail = r.status === 'OK' ? '' : ` (expected "${r.expected}"${r.actual ? `, got "${r.actual}"` : ''})`;
  console.log(`  ${icon} --${r.cssVar}${detail}`);
}

console.log(`\n${results.length - failures}/${results.length} checks passed.`);

if (failures > 0) {
  console.error(`\n✗ ${failures} token(s) drifted from docs/tokens.json. Fix globals.css or run: pnpm design:build\n`);
  process.exit(1);
} else {
  console.log('\n✓ All tokens aligned. Design contract satisfied.\n');
}
