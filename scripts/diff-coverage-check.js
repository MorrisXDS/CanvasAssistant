#!/usr/bin/env node
/**
 * scripts/diff-coverage-check.js
 *
 * Per-PR strict gate (PR-Gate-1 slice 3).
 *
 * Reads:
 *   - Output of `git diff --unified=0 ${BASE} -- 'src/**.{ts,tsx}'`
 *     (default BASE = origin/main; overridable via DIFF_BASE env var).
 *   - coverage/coverage-final.json (Istanbul format, produced by
 *     `npm test -- --coverage`).
 *   - .diffcov-allow.json (globs of paths exempted from the gate).
 *
 * Fails (exit 1) if any added or modified line under src/ is EXECUTABLE
 * (covered by at least one Istanbul statement) yet UNHIT (no statement
 * over that line has hit count > 0).
 *
 * Non-executable lines (blank, comments, type-only declarations) have no
 * statements in Istanbul's statementMap and are skipped silently — they
 * are not testable, so the gate can't fail on them.
 *
 * Edge cases handled:
 *   - Renames (`R` status in git diff): skipped; renames produce diff lines
 *     for content drift but we don't track them as new lines.
 *   - Files outside src/: filtered out by the `git diff` path spec.
 *   - File in coverage-final.json but using absolute path: normalized to
 *     repo-relative.
 *   - Allowlisted files (.diffcov-allow.json): skipped entirely.
 *   - Coverage file missing: hard fail with instructions (the test step
 *     must run first).
 *   - Running on main with no diff vs origin/main: no-op, exits 0.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const COVERAGE_FILE = path.join(REPO_ROOT, 'coverage', 'coverage-final.json');
const ALLOWLIST_FILE = path.join(REPO_ROOT, '.diffcov-allow.json');
const DIFF_BASE = process.env.DIFF_BASE || 'origin/main';

function readJsonOrEmpty(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadAllowlist() {
  const data = readJsonOrEmpty(ALLOWLIST_FILE, { paths: [] });
  return new Set(data.paths || []);
}

function loadCoverage() {
  if (!fs.existsSync(COVERAGE_FILE)) {
    console.error(
      `✗ Coverage file not found: ${path.relative(REPO_ROOT, COVERAGE_FILE)}`
    );
    console.error('  Run `npm test -- --coverage` first.');
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(COVERAGE_FILE, 'utf8'));
}

function runGitDiff() {
  // --unified=0 → only changed lines, no context. Easier to parse.
  // Path spec uses `-- src/` (literal directory) because git pathspec does
  // NOT expand `**` globs the way shells do — `src/**/*.ts` matches nothing.
  // Extension filtering happens in JS after parsing.
  let raw;
  try {
    raw = execSync(
      `git diff --unified=0 --diff-filter=ACMR ${DIFF_BASE} -- src/`,
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (err) {
    // Most likely: DIFF_BASE doesn't exist in the local repo (e.g., shallow clone).
    console.error(`✗ git diff failed (base: ${DIFF_BASE}):`);
    console.error(`  ${err.stderr || err.message}`);
    console.error('  In CI, ensure actions/checkout@v4 has `fetch-depth: 0`.');
    process.exit(2);
  }
  return raw;
}

/** Filter parsed diff entries to TS/TSX files only. */
function filterToTsFiles(diffMap) {
  const out = new Map();
  for (const [file, lines] of diffMap) {
    if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      // Also exclude declaration files; their coverage is meaningless and
      // they're excluded from collectCoverageFrom in jest.config.js anyway.
      if (file.endsWith('.d.ts')) continue;
      out.set(file, lines);
    }
  }
  return out;
}

/**
 * Parse git diff output to a map: file → Set<lineNumber>
 * Only added/modified lines (lines prefixed `+` after the hunk header).
 */
function parseDiff(diffText) {
  const result = new Map();
  let currentFile = null;
  let currentLineNo = 0;

  for (const line of diffText.split('\n')) {
    // File header: "+++ b/src/foo.ts" or "+++ /dev/null" for deletion-only
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      if (!result.has(currentFile)) result.set(currentFile, new Set());
      continue;
    }
    // Hunk header: "@@ -10,0 +11,3 @@ ..." → next added lines start at 11
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentLineNo = parseInt(hunkMatch[1], 10);
      continue;
    }
    if (currentFile === null) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      // Added line at currentLineNo
      result.get(currentFile).add(currentLineNo);
      currentLineNo++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // Removed line — doesn't advance the +line counter
    } else if (line.startsWith(' ')) {
      // Context line (shouldn't appear with --unified=0, but defensive)
      currentLineNo++;
    }
  }
  return result;
}

/**
 * Normalize an absolute coverage path to repo-relative posix.
 */
function normalizeCoveragePath(absPath) {
  const relative = path.relative(REPO_ROOT, absPath);
  return relative.split(path.sep).join('/');
}

/**
 * For one file's coverage entry, build map: lineNo → wasHit (bool).
 * A line is "wasHit" if any statement starting at that line has count > 0.
 * A line not present in the map is non-executable (no statement on it).
 */
function buildLineCoverageMap(fileCov) {
  const map = new Map(); // lineNo → wasHit
  const { statementMap, s } = fileCov;
  if (!statementMap || !s) return map;

  for (const stmtId of Object.keys(statementMap)) {
    const stmt = statementMap[stmtId];
    if (!stmt || !stmt.start || stmt.start.line == null) continue;
    const startLine = stmt.start.line;
    const endLine = (stmt.end && stmt.end.line) || startLine;
    const hits = s[stmtId] || 0;
    for (let ln = startLine; ln <= endLine; ln++) {
      // A line is hit if ANY statement on it is hit.
      const prev = map.get(ln);
      map.set(ln, (prev === true) || hits > 0);
    }
  }
  return map;
}

function main() {
  const allowlist = loadAllowlist();
  const coverage = loadCoverage();
  const diffText = runGitDiff();
  if (!diffText.trim()) {
    console.log('✓ No src/ changes in diff. Nothing to verify.');
    return;
  }

  // Build path → coverage entry, normalized to repo-relative posix.
  const covByPath = new Map();
  for (const absPath of Object.keys(coverage)) {
    covByPath.set(normalizeCoveragePath(absPath), coverage[absPath]);
  }

  const added = filterToTsFiles(parseDiff(diffText));
  const uncovered = []; // { file, line }

  for (const [file, lineSet] of added) {
    if (allowlist.has(file)) continue;
    const fileCov = covByPath.get(file);
    if (!fileCov) {
      // File added to diff but no coverage collected — usually means the
      // file is excluded from `collectCoverageFrom` in jest.config.js
      // (e.g., src/types/*, *.d.ts). Skip — those are intentionally
      // out-of-scope.
      continue;
    }
    const lineMap = buildLineCoverageMap(fileCov);
    for (const ln of lineSet) {
      if (!lineMap.has(ln)) continue; // non-executable line
      if (lineMap.get(ln) === true) continue; // covered
      uncovered.push({ file, line: ln });
    }
  }

  if (uncovered.length === 0) {
    console.log(`✓ Diff-coverage clean (base: ${DIFF_BASE}).`);
    return;
  }

  console.error('✗ Uncovered lines added/modified in this diff:');
  const byFile = new Map();
  for (const { file, line } of uncovered) {
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(line);
  }
  for (const [file, lines] of byFile) {
    lines.sort((a, b) => a - b);
    console.error(`  ${file}:`);
    for (const ln of lines) console.error(`    L${ln}`);
  }
  console.error('');
  console.error(`Total uncovered lines: ${uncovered.length}`);
  console.error('');
  console.error('Add tests that exercise these lines, OR if a line is genuinely');
  console.error('untestable (e.g., a defensive branch that can never be reached),');
  console.error('add the file to .diffcov-allow.json (`paths` array) with a comment.');
  process.exit(1);
}

main();
