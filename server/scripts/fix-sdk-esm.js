/**
 * Postinstall patch: fix @yellow-org/sdk extensionless ESM imports.
 *
 * The published SDK dist uses bare relative imports (e.g. `from './utils'`,
 * `from './core'`) without .js extensions. Node strict ESM rejects these.
 * This script resolves each import to either a .js file or a directory index.
 *
 * NOTE: Remove this script once SDK PR #623 is merged and a new version
 * of @yellow-org/sdk and @yellow-org/sdk-compat is published with proper
 * .js extensions in the dist output.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const sdkDist = resolve('node_modules/@yellow-org/sdk/dist');
const compatDist = resolve('node_modules/@yellow-org/sdk-compat/dist');

function resolveImport(importPath, fromFile) {
  const dir = dirname(fromFile);
  const abs = resolve(dir, importPath);

  if (existsSync(abs + '.js')) {
    return importPath + '.js';
  }

  if (existsSync(abs) && statSync(abs).isDirectory()) {
    if (existsSync(join(abs, 'index.js'))) {
      return importPath + '/index.js';
    }
  }

  return null;
}

function patchFile(filePath) {
  let content = readFileSync(filePath, 'utf-8');
  const original = content;

  content = content.replace(
    /((?:from|import)\s+['"])(\.\.?\/[^'"]+?)(['"])/g,
    (match, prefix, path, suffix) => {
      if (/\.\w+$/.test(path)) return match;
      const resolved = resolveImport(path, filePath);
      if (resolved) return `${prefix}${resolved}${suffix}`;
      return match;
    }
  );

  if (content !== original) {
    writeFileSync(filePath, content, 'utf-8');
    return true;
  }
  return false;
}

function walkAndPatch(dir) {
  let patched = 0;
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        patched += walkAndPatch(full);
      } else if (full.endsWith('.js')) {
        if (patchFile(full)) patched++;
      }
    }
  } catch { /* dir might not exist */ }
  return patched;
}

let total = 0;
total += walkAndPatch(sdkDist);
total += walkAndPatch(compatDist);
console.log(`fix-sdk-esm: patched ${total} file(s)`);
