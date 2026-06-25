/**
 * Copy the Next.js static export into dist/, where the packaged main process
 * loads it from (dist/renderer/out) and electron-builder bundles it (files:
 * "dist/**"). Run after `build:renderer`.
 */

const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'renderer', 'out');
const dest = path.join(__dirname, '..', 'dist', 'renderer', 'out');

if (!fs.existsSync(src)) {
  console.error(`Renderer export not found at ${src}. Run "npm run build:renderer" first.`);
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`Copied renderer export -> ${dest}`);
