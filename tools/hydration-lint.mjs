#!/usr/bin/env node
// Detects common SSR hydration mismatch patterns in Next.js App Router source
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

let hasWarning = false;
let fileCount = 0;
let issueCount = 0;

const PATTERNS = [
  {
    pattern: /Math\.random\(\)/,
    message: 'Math.random() in render — produces different values on server vs client',
  },
  {
    pattern: /new Date\(\)/,
    message: 'new Date() in render without useMemo/suppressHydrationWarning — timestamp mismatch',
  },
  {
    pattern: /window\./,
    message: 'window.* accessed outside useEffect — window is undefined on server',
  },
  {
    pattern: /document\./,
    message: 'document.* accessed outside useEffect — document is undefined on server',
  },
  {
    pattern: /localStorage\./,
    message: 'localStorage accessed outside useEffect — not available on server',
  },
  {
    pattern: /sessionStorage\./,
    message: 'sessionStorage accessed outside useEffect — not available on server',
  },
  {
    pattern: /navigator\./,
    message: 'navigator.* accessed outside useEffect — not available on server',
  },
];

function walkDir(dir, files = []) {
  if (!existsSync(dir)) return files;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (['node_modules', '.next', '.turbo', 'dist', 'build'].includes(entry)) continue;
      walkDir(fullPath, files);
    } else if (['.tsx', '.ts', '.jsx', '.js'].includes(extname(entry))) {
      // Skip Next.js Route Handlers — server-only, not subject to SSR hydration
      if (entry === 'route.ts' || entry === 'route.tsx') continue;
      files.push(fullPath);
    }
  }
  return files;
}

const appsDir = resolve(root, 'apps');
const files = walkDir(appsDir);

for (const filePath of files) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let fileHasIssue = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments and useEffect blocks (heuristic)
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
    if (line.includes('useEffect') || line.includes('useLayoutEffect')) continue;

    for (const { pattern, message } of PATTERNS) {
      if (pattern.test(line)) {
        if (!fileHasIssue) {
          console.warn(`\n⚠  ${filePath.replace(root + '/', '')}`);
          fileHasIssue = true;
          hasWarning = true;
        }
        console.warn(`   Line ${i + 1}: ${message}`);
        issueCount++;
      }
    }
  }

  fileCount++;
}

console.log(`\n📊 Hydration lint: ${fileCount} files scanned`);
if (issueCount > 0) {
  console.warn(`   ${issueCount} potential hydration issue(s) found — review above`);
} else {
  console.log('✅ No obvious hydration mismatches detected');
}
