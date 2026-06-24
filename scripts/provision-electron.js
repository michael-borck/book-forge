#!/usr/bin/env node
/**
 * Provision the Electron binary onto an APFS location (the user's home cache)
 * and point node_modules/electron at it. Needed because the repo may live on an
 * exFAT volume that can't store the symlinks inside Electron.app.
 *
 * Run automatically by scripts/dev-runner.js, or manually via
 * `npm run provision:electron`.
 */

const fs = require('fs');
const path = require('path');
const extract = require('extract-zip');
const { downloadArtifact } = require('@electron/get');
const { version, distDir, platformExePath } = require('./electron-dist');

async function main() {
  const dest = distDir();
  const exeRel = platformExePath();
  const exe = path.join(dest, exeRel);
  const pathTxt = path.join(__dirname, '..', 'node_modules', 'electron', 'path.txt');

  // Always (re)write path.txt so electron/index.js resolves OVERRIDE + exeRel.
  const writePathTxt = () => fs.writeFileSync(pathTxt, exeRel);

  if (fs.existsSync(exe)) {
    writePathTxt();
    console.log('Electron already provisioned:', dest);
    return;
  }

  fs.mkdirSync(dest, { recursive: true });
  console.log(`Downloading Electron ${version} (${process.platform}-${process.arch})…`);

  let checksums;
  try {
    checksums = require('../node_modules/electron/checksums.json');
  } catch {
    checksums = undefined;
  }

  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: process.platform,
    arch: process.arch,
    checksums,
  });

  console.log('Extracting to', dest);
  await extract(zipPath, { dir: dest });
  writePathTxt();
  console.log('Electron provisioned at', dest);
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
