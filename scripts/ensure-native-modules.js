/**
 * Ensures better-sqlite3 is compiled for the current Node.js ABI.
 * Runs before tests automatically.
 *
 * Must create an actual database instance to verify the native module loads
 * (require alone only loads the JS wrapper, not the .node binary).
 */
const { execSync } = require('child_process');

// Check in a subprocess — must instantiate to trigger native module load
try {
  execSync('node -e "require(\'better-sqlite3\')(\':memory:\').close()"', {
    stdio: 'ignore',
    timeout: 5000,
  });
  process.exit(0);
} catch {
  // ABI mismatch or other load failure — rebuild needed
}

console.log('Rebuilding better-sqlite3 for Node.js...');

// Kill processes that may lock the .node file (Windows)
if (process.platform === 'win32') {
  const myPid = process.pid;
  try { execSync('taskkill /F /IM electron.exe 2>nul', { stdio: 'ignore' }); } catch {}
  // Kill node processes except ourselves and our parent
  try {
    const ppid = process.ppid;
    const out = execSync(
      'powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id"',
      { encoding: 'utf8' }
    );
    const pids = out.trim().split(/\r?\n/)
      .map(s => parseInt(s.trim()))
      .filter(pid => !isNaN(pid) && pid !== myPid && pid !== ppid);
    for (const pid of pids) {
      try { execSync(`taskkill /F /PID ${pid} 2>nul`, { stdio: 'ignore' }); } catch {}
    }
  } catch {}
  // Wait for file handles to release
  try { execSync('timeout /t 2 /nobreak >nul', { stdio: 'ignore' }); } catch {}
}

try {
  execSync('npm rebuild better-sqlite3', { stdio: 'inherit' });
  console.log('Rebuild complete.\n');
} catch {
  console.error(
    '\nRebuild failed — the native module file is still locked.\n' +
    'Close all applications and try again.\n'
  );
  process.exit(1);
}
