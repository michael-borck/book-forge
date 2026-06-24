/**
 * Where the Electron binary lives.
 *
 * The repo may sit on an exFAT volume, which cannot store the symlinks inside
 * macOS's `Electron.app` bundle — so the binary can't be extracted into
 * `node_modules/electron/dist`. Instead we keep it under the user's home cache
 * (APFS) and point Electron at it via ELECTRON_OVERRIDE_DIST_PATH.
 */

const os = require('os');
const path = require('path');

const version = require('../node_modules/electron/package.json').version;

/** Path of the executable inside the extracted dist, per platform. */
function platformExePath() {
  switch (process.platform) {
    case 'mas':
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron';
    case 'win32':
      return 'electron.exe';
    default:
      return 'electron';
  }
}

/** Absolute directory (on APFS/home) the Electron dist is extracted into. */
function distDir() {
  return path.join(
    os.homedir(),
    '.cache',
    'bookforge',
    `electron-${version}-${process.platform}-${process.arch}`
  );
}

module.exports = { version, distDir, platformExePath };
