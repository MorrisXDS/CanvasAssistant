#!/usr/bin/env node

/**
 * Node.js Version Validation Script
 *
 * Ensures the correct Node.js version is used for Electron native module compatibility.
 *
 * Why this matters:
 * - Electron 40.x bundles Node.js 24.x
 * - better-sqlite3 is a native C++ module that must be compiled against the same ABI
 * - Using a mismatched Node.js version to install/build will create incompatible binaries
 *
 * Usage:
 * - Automatically runs via `preinstall` and `predev` npm scripts
 * - Can be run manually: node scripts/check-node-version.js
 */

const requiredMajor = 24;
const currentVersion = process.versions.node;
const currentMajor = parseInt(currentVersion.split('.')[0], 10);

if (currentMajor !== requiredMajor) {
  console.error('');
  console.error('\x1b[31m╔════════════════════════════════════════════════════════════════╗');
  console.error('║  NODE VERSION MISMATCH                                         ║');
  console.error('╠════════════════════════════════════════════════════════════════╣');
  console.error(`║  Required: Node.js ${requiredMajor}.x (for Electron 40 compatibility)        ║`);
  console.error(`║  Current:  Node.js ${currentVersion.padEnd(45)}║`);
  console.error('╠════════════════════════════════════════════════════════════════╣');
  console.error('║  Native modules like better-sqlite3 must be compiled against   ║');
  console.error('║  the same Node.js major version that Electron bundles.         ║');
  console.error('╠════════════════════════════════════════════════════════════════╣');
  console.error('║  To fix:                                                       ║');
  console.error('║    1. nvm use              (switches to Node 24 from .nvmrc)   ║');
  console.error('║    2. npm run setup        (reinstalls + rebuilds modules)     ║');
  console.error('╚════════════════════════════════════════════════════════════════╝\x1b[0m');
  console.error('');
  process.exit(1);
}

console.log(`\x1b[32m✓ Node.js ${currentVersion} (compatible with Electron 40)\x1b[0m`);
