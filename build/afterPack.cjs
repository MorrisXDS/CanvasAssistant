/**
 * electron-builder afterPack hook
 *
 * Ad-hoc signs the macOS .app bundle after it's assembled but before
 * DMG/zip artifacts are created. This ensures the distributed archives
 * contain a properly signed app that Apple Silicon Macs won't reject.
 */

const { execSync } = require('child_process');
const path = require('path');

module.exports = async function afterPack(context) {
  if (process.platform !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  console.log(`[afterPack] Ad-hoc signing: ${appPath}`);
  execSync(`codesign --force --deep -s - "${appPath}"`, { stdio: 'inherit' });

  console.log('[afterPack] Verifying signature...');
  execSync(`codesign --verify --verbose "${appPath}"`, { stdio: 'inherit' });

  console.log('[afterPack] Ad-hoc signing complete');
};
