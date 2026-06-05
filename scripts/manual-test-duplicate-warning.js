/**
 * manual-test-duplicate-warning.js
 *
 * Isolated manual test for DuplicateWarningModal. Real DB is NEVER touched.
 *
 * Two-step usage (run these in your own terminal, not through Claude Code):
 *
 *   Step 1 — seed the isolated copy:
 *     node scripts/manual-test-duplicate-warning.js --seed
 *     (prints the temp dir path)
 *
 *   Step 2 — rebuild for Electron, then launch:
 *     npm run rebuild
 *     node scripts/manual-test-duplicate-warning.js --launch C:\path\to\cid-dup-test-XXXXX
 *
 *   Press Ctrl+C when done — temp dir cleaned up automatically.
 *
 * One-shot (only works when better-sqlite3 is already on Electron ABI):
 *   node scripts/manual-test-duplicate-warning.js --launch-fresh
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const REAL_DB = path.join(PROJECT_ROOT, 'database', 'canvas.db');
const ELECTRON_BIN = (() => {
  const win = path.join(PROJECT_ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
  if (fs.existsSync(win)) return win;
  return path.join(PROJECT_ROOT, 'node_modules', '.bin', 'electron');
})();
const MAIN_JS = path.join(PROJECT_ROOT, 'dist', 'main.js');
// The duplicate-warning seed matrix now lives in a shared CJS lib so the e2e
// fixture (e2e/fixtures/seed.ts) and this manual-test CLI seed identically.
const SEED_SCRIPT = path.join(PROJECT_ROOT, 'e2e', 'fixtures', 'seedDuplicateWarning.js');

const args = process.argv.slice(2);
const mode = args[0]; // '--seed', '--launch', '--launch-fresh'
const launchDir = args[1]; // used with --launch

// ─────────────────────────────────────────────────────────────────────────────
function seedToDir(tmpDir) {
  const dbDir = path.join(tmpDir, 'database');
  const configDir = path.join(tmpDir, '.config');
  const userDataDir = path.join(tmpDir, 'userData');
  [dbDir, configDir, userDataDir].forEach(d => fs.mkdirSync(d, { recursive: true }));

  for (const suffix of ['', '-wal', '-shm']) {
    const src = REAL_DB + suffix;
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dbDir, 'canvas.db' + suffix));
  }

  // Seed in a subprocess (the shared seed lib) to avoid locking the .node file
  // in the parent. The matrix itself now lives in e2e/fixtures/seedDuplicateWarning.js
  // so this CLI and the e2e fixture seed identically. The lib's `require.main`
  // guard makes it runnable as `<runner> seedDuplicateWarning.js <dbPath>`,
  // printing COURSE_A=id:code / COURSE_B=id:code.
  //
  // This step keeps the historical Node-ABI contract: `--seed` is documented to
  // run after `npm test` (Node ABI), then the user `npm run rebuild`s and
  // `--launch`es separately under Electron ABI. So we spawn with process.execPath
  // (plain Node), exactly as before. (The e2e fixture instead spawns under
  // Electron-as-Node because it launches the app back-to-back — see seed.ts.)
  const r = spawnSync(process.execPath, [SEED_SCRIPT, path.join(dbDir, 'canvas.db')], {
    cwd: PROJECT_ROOT, encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error('❌ Seeding failed:', r.stderr || r.stdout);
    return null;
  }
  const lines = (r.stdout || '').split('\n');
  const codeA = lines.find(l => l.startsWith('COURSE_A='))?.split(':')[1] ?? 'Course A';
  const codeB = lines.find(l => l.startsWith('COURSE_B='))?.split(':')[1] ?? 'Course B';
  return { dbDir, configDir, userDataDir, codeA, codeB };
}

// ─────────────────────────────────────────────────────────────────────────────
function launch(tmpDir, codeA, codeB) {
  const configDir = path.join(tmpDir, '.config');
  const userDataDir = path.join(tmpDir, 'userData');

  if (!fs.existsSync(MAIN_JS)) {
    console.error('❌ dist/main.js not found. Run: npm run build');
    return;
  }

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && (req.url ?? '').startsWith('/api/v1/users/self')) {
      res.statusCode = 200;
      res.end(JSON.stringify({ id: 1, name: 'Test User', login_id: 'test@local' }));
      return;
    }
    res.statusCode = 503;
    res.end(JSON.stringify({ errors: [{ message: 'mock: not served' }] }));
  });

  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    const mockUrl = `http://127.0.0.1:${port}`;

    fs.writeFileSync(
      path.join(configDir, 'canvas-connection.json'),
      JSON.stringify({ baseUrl: mockUrl }, null, 2)
    );
    console.log(`\n🎭 Mock Canvas at ${mockUrl}`);

    const app = spawn(ELECTRON_BIN, [MAIN_JS, `--user-data-dir=${userDataDir}`], {
      cwd: tmpDir,
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: 'inherit',
    });

    console.log(`\n🚀 App launched (pid ${app.pid})`);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📚 Course A (${codeA}) — 7 queued items covering every case:`);
    console.log('');
    console.log('  ① Problem Set 1        → EXACT match, NO conflicts');
    console.log('                            (user task identical: same title + dueAt)');
    console.log('                            Modal subtext: "No field conflicts — values are identical"');
    console.log('');
    console.log('  ② Quiz 1               → EXACT match, due-date CONFLICT');
    console.log('                            (user task due Jun 10, canvas due Jun 12)');
    console.log('                            Conflict highlight on the Due date row only');
    console.log('');
    console.log('  ③ Midterm              → EXACT match, MULTI-field conflict');
    console.log('                            (dueAt + taskType both differ)');
    console.log('                            Both rows highlight as conflicts');
    console.log('');
    console.log('  ④ HW 3                 → FUZZY match ("may match")');
    console.log('                            User task: "Homework 3" — abbreviation expansion');
    console.log('');
    console.log('  ⑤ Lab #2               → FUZZY match — punctuation difference only');
    console.log('                            User task: "Lab 2" — normalises identical');
    console.log('');
    console.log('  ⑥ PS #4                → FUZZY match — abbreviation + punctuation');
    console.log('                            User task: "Problem Set 4"');
    console.log('');
    console.log('  ⑦ Lecture Reflection 1 → NO match (control)');
    console.log('                            Accepting should NOT show a modal — task just accepts');
    console.log('');
    console.log(`📚 Course B (${codeB}) — clean single-mode fuzzy walkthrough:`);
    console.log('  • HW Assignment → user task "Homework Assignment" (fuzzy)');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧪 How to test:');
    console.log('  • SINGLE MODE: Course Detail → Queue → A (or click ✓) on any item ①–⑥');
    console.log('                 Item ⑦ should accept directly (no modal)');
    console.log('  • BULK MODE  : Course Detail → Queue → "Accept all"');
    console.log('                 Modal shows ALL 6 matched items (⑦ auto-accepts in background)');
    console.log('                 Keys: ↑↓ navigate · Space toggle · A select-all · L/S set · Enter confirm');
    console.log('  • UPDATES    : Updates page → Action Required → accept any → single-mode modal');
    console.log('');
    console.log('✅ Verify in the modal:');
    console.log('  • Canvas (incoming) column shows the REAL queued title (not "Canvas assignment")');
    console.log('  • Due date / Type rows highlight when they actually differ');
    console.log('  • "Link to existing" → user task gets Canvas due/title; user notes/weight preserved');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nCtrl+C to quit and clean up.\n');

    const cleanup = () => {
      app.kill();
      server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
      console.log('\n🗑  Cleaned up. Real DB untouched.\n');
      process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    app.on('exit', cleanup);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
if (!fs.existsSync(REAL_DB)) {
  console.error('\n❌ database/canvas.db not found.\n');
  process.exit(1);
}

if (mode === '--seed' || mode === '--launch-fresh') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cid-dup-test-'));
  console.log(`\n📦 Creating isolated environment at:\n   ${tmpDir}\n`);
  const result = seedToDir(tmpDir);
  if (!result) { fs.rmSync(tmpDir, { recursive: true, force: true }); process.exit(1); }
  console.log(`  ✓ Exact match seeded → ${result.codeA}`);
  console.log(`  ✓ Fuzzy match seeded → ${result.codeB}`);

  if (mode === '--seed') {
    console.log('\n✅ Seeding complete. Now run in your terminal:');
    console.log(`\n   npm run rebuild`);
    console.log(`   node scripts/manual-test-duplicate-warning.js --launch "${tmpDir}"\n`);
  } else {
    // --launch-fresh: seed + launch without rebuild (caller ensures correct ABI)
    console.log('\n⚡ Launching without rebuild (assumes Electron ABI already set)...');
    launch(tmpDir, result.codeA, result.codeB);
  }

} else if (mode === '--launch' && launchDir) {
  if (!fs.existsSync(launchDir)) {
    console.error(`\n❌ Directory not found: ${launchDir}\n`);
    process.exit(1);
  }
  // Read course codes from a marker file if it exists, or use defaults
  const markerFile = path.join(launchDir, '.test-courses.json');
  let codeA = 'ECE311H1 S LEC0101', codeB = 'ECE342H1 S LEC0101';
  if (fs.existsSync(markerFile)) {
    const m = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
    codeA = m.codeA; codeB = m.codeB;
  }
  console.log(`\n🚀 Launching against: ${launchDir}`);
  launch(launchDir, codeA, codeB);

} else {
  console.log(`
Isolated duplicate-warning test environment.

Usage (run in your own terminal):

  Step 1 — seed isolated DB copy (uses Node ABI, exits cleanly):
    node scripts/manual-test-duplicate-warning.js --seed

  Step 2 — rebuild for Electron, then launch:
    npm run rebuild
    node scripts/manual-test-duplicate-warning.js --launch <dir from step 1>

  One-shot (if better-sqlite3 is already on Electron ABI — e.g. after npm run rebuild):
    node scripts/manual-test-duplicate-warning.js --launch-fresh
`);
}
