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
const TEST_TAG = 'DUP_WARN_TEST';

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

  // Seed in a subprocess to avoid locking the .node file in the parent.
  //
  // Course A (cA): comprehensive duplicate matrix — 6 duplicate pairs + 1
  //                no-match control. Each pair exercises a distinct branch
  //                of the detection / conflict logic. The whole set is also
  //                bulk-testable via "Accept all".
  // Course B (cB): one clean single-mode fuzzy case, separate from the noise
  //                in Course A.
  const seedEval = `
    const Database = require('better-sqlite3');
    const db = new Database(${JSON.stringify(path.join(dbDir, 'canvas.db'))});
    db.pragma('journal_mode = WAL');
    const courses = db.prepare("SELECT id, code FROM courses WHERE archived_at IS NULL AND deleted_at IS NULL AND is_hidden=0 LIMIT 2").all();
    if (!courses.length) { process.stderr.write('No visible courses\\n'); process.exit(1); }
    const cA = courses[0], cB = courses[1] || courses[0];

    const insertUser = db.prepare(
      "INSERT OR IGNORE INTO tasks (course_id, title, source_type, weight, due_at, task_type) VALUES (?, ?, 'user', ?, ?, ?)"
    );
    const insertQueue = db.prepare(
      "INSERT OR IGNORE INTO canvas_task_queue (external_id, canvas_data, course_id, title, description, due_at, points_possible, task_type, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')"
    );

    // ── canvas_data blob builder ──────────────────────────────────────────
    // MergeQueuedTaskCommand parses canvas_data via mapAssignment(), which
    // reads description / due_at / unlock_at / lock_at / points_possible /
    // submission_types out of the blob. If the blob omits a field, the
    // merged task gets null — even if the queue's *column* has a real
    // value (the column is for modal display only; the merge reads the
    // blob). The blob must mirror a real Canvas Assignment payload, not a
    // stub. \`submission\` is omitted: queue entries are pre-acceptance,
    // so no submission state exists yet (mapAssignment handles absent).
    function buildCanvasBlob(o) {
      return JSON.stringify({
        id: o.id,
        name: o.name,
        description: o.description ?? null,
        due_at: o.due_at ?? null,
        unlock_at: o.unlock_at ?? null,
        lock_at: o.lock_at ?? null,
        points_possible: o.points_possible ?? 100,
        submission_types: o.submission_types ?? ['online_text_entry'],
      });
    }
    function insertScenario(tag, courseId, o) {
      insertQueue.run(
        tag,
        buildCanvasBlob(o),
        courseId,
        o.name,
        o.description ?? null,
        o.due_at ?? null,
        o.points_possible ?? 100,
        o.queue_task_type ?? 'assignment'
      );
    }

    // ── Course A — comprehensive matrix ────────────────────────────────────
    // Case 1 — EXACT match, NO field conflicts (identical title + dueAt; both task_type=assignment)
    insertUser.run(cA.id, 'Problem Set 1', 15, '2026-06-15T23:59:00Z', 'assignment');
    insertScenario('${TEST_TAG}_EXACT_CLEAN', cA.id, {
      id: 88001, name: 'Problem Set 1',
      description: '<p>Standard PSet.</p>',
      due_at: '2026-06-15T23:59:00Z',
      points_possible: 100,
      submission_types: ['online_upload'],
      queue_task_type: 'assignment',
    });

    // Case 2 — EXACT title, due-date CONFLICT (Jun 10 user vs Jun 12 canvas; same task_type)
    insertUser.run(cA.id, 'Quiz 1', 5, '2026-06-10T23:59:00Z', 'quiz');
    insertScenario('${TEST_TAG}_EXACT_DUE_CONFLICT', cA.id, {
      id: 88002, name: 'Quiz 1',
      description: '<p>In-class quiz, rescheduled.</p>',
      due_at: '2026-06-12T23:59:00Z',
      points_possible: 20,
      submission_types: ['none'],
      queue_task_type: 'quiz',
    });

    // Case 3 — EXACT title, MULTI-field conflict (dueAt + taskType BOTH differ)
    insertUser.run(cA.id, 'Midterm', 25, '2026-06-05T23:59:00Z', 'quiz');
    insertScenario('${TEST_TAG}_EXACT_MULTI_CONFLICT', cA.id, {
      id: 88003, name: 'Midterm',
      description: '<p>Closed-book midterm.</p>',
      due_at: '2026-06-07T23:59:00Z',
      points_possible: 100,
      submission_types: ['on_paper'],
      queue_task_type: 'exam',
    });

    // Case 4 — FUZZY: abbreviation expansion (hw → homework). User has no dueAt.
    insertUser.run(cA.id, 'Homework 3', 8, null, 'assignment');
    insertScenario('${TEST_TAG}_FUZZY_ABBREV', cA.id, {
      id: 88004, name: 'HW 3',
      description: '<p>Weekly assignment #3.</p>',
      due_at: '2026-06-18T23:59:00Z',
      points_possible: 30,
      submission_types: ['online_upload'],
      queue_task_type: 'assignment',
    });

    // Case 5 — FUZZY: punctuation difference only ("Lab #2" vs "Lab 2", same dueAt)
    insertUser.run(cA.id, 'Lab 2', 5, '2026-06-20T23:59:00Z', 'assignment');
    insertScenario('${TEST_TAG}_FUZZY_PUNCT', cA.id, {
      id: 88005, name: 'Lab #2',
      description: '<p>Hands-on lab.</p>',
      due_at: '2026-06-20T23:59:00Z',
      points_possible: 40,
      submission_types: ['online_upload'],
      queue_task_type: 'assignment',
    });

    // Case 6 — FUZZY: combined abbreviation + punctuation ("PS #4" vs "Problem Set 4")
    insertUser.run(cA.id, 'Problem Set 4', 12, '2026-06-25T23:59:00Z', 'assignment');
    insertScenario('${TEST_TAG}_FUZZY_COMBO', cA.id, {
      id: 88006, name: 'PS #4',
      description: '<p>Final problem set.</p>',
      due_at: '2026-06-25T23:59:00Z',
      points_possible: 100,
      submission_types: ['online_upload'],
      queue_task_type: 'assignment',
    });

    // Case 7 — NO match control: queued task with no similar user task.
    // Should auto-accept (no modal) when individually accepted.
    insertScenario('${TEST_TAG}_NO_MATCH', cA.id, {
      id: 88007, name: 'Lecture Reflection 1',
      description: '<p>One-page reflection.</p>',
      due_at: '2026-06-30T23:59:00Z',
      points_possible: 10,
      submission_types: ['online_text_entry'],
      queue_task_type: 'assignment',
    });

    // ── Course B — clean single-mode fuzzy demo ───────────────────────────
    insertUser.run(cB.id, 'Homework Assignment', 10, null, 'assignment');
    insertScenario('${TEST_TAG}_FUZZY', cB.id, {
      id: 88008, name: 'HW Assignment',
      description: '<p>Weekly submission.</p>',
      due_at: '2026-06-20T23:59:00Z',
      points_possible: 50,
      submission_types: ['online_upload'],
      queue_task_type: 'assignment',
    });

    process.stdout.write('COURSE_A=' + cA.id + ':' + cA.code + '\\n');
    process.stdout.write('COURSE_B=' + cB.id + ':' + cB.code + '\\n');
    db.close();
  `;

  const r = spawnSync(process.execPath, ['--eval', seedEval], {
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
