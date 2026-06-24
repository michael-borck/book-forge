const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { distDir, platformExePath } = require('./electron-dist');

const yellow = '\x1b[33m';
const blue = '\x1b[34m';
const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';

console.log(`${green}Starting BookForge Development Environment...${reset}\n`);

let electronProcess = null;
let nextProcess = null;
let nextPort = 3000; // Default port

// Function to start Next.js
function startNext() {
  console.log(`${blue}[RENDERER]${reset} Starting Next.js...`);
  
  nextProcess = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, '../src/renderer'),
    shell: true,
    env: { ...process.env, NODE_ENV: 'development' }
  });
  
  nextProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => {
      console.log(`${blue}[RENDERER]${reset} ${line}`);
      
      // Extract port number from Next.js output
      const portMatch = line.match(/http:\/\/localhost:(\d+)/);
      if (portMatch) {
        nextPort = portMatch[1];
        console.log(`${green}[INFO]${reset} Next.js running on port ${nextPort}`);
      }
      
      // When Next.js is ready, start Electron
      if (line.includes('Ready in') || line.includes('ready')) {
        setTimeout(startElectron, 1000);
      }
    });
  });
  
  nextProcess.stderr.on('data', (data) => {
    console.error(`${red}[RENDERER ERROR]${reset} ${data}`);
  });
  
  nextProcess.on('close', (code) => {
    console.log(`${blue}[RENDERER]${reset} Process exited with code ${code}`);
    if (electronProcess) {
      electronProcess.kill();
    }
  });
}

// Function to compile TypeScript
function compileTypeScript() {
  console.log(`${yellow}[BUILD]${reset} Compiling TypeScript...`);
  
  const tscProcess = spawn('npm', ['run', 'build:main'], {
    shell: true,
    stdio: 'inherit'
  });
  
  tscProcess.on('close', (code) => {
    if (code === 0) {
      console.log(`${green}[BUILD]${reset} TypeScript compilation successful!\n`);
      startNext();
    } else {
      console.error(`${red}[BUILD]${reset} TypeScript compilation failed!`);
      process.exit(1);
    }
  });
}

// Function to start Electron
function startElectron() {
  if (electronProcess) {
    console.log(`${green}[MAIN]${reset} Electron already running`);
    return;
  }
  
  console.log(`${green}[MAIN]${reset} Starting Electron...`);
  
  electronProcess = spawn('npx', ['electron', '--no-sandbox', '.'], {
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      RENDERER_PORT: nextPort,
      // Load Electron from its APFS location (see ensureElectron / electron-dist).
      ELECTRON_OVERRIDE_DIST_PATH: distDir(),
    }
  });
  
  electronProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    lines.forEach(line => {
      console.log(`${green}[MAIN]${reset} ${line}`);
    });
  });
  
  electronProcess.stderr.on('data', (data) => {
    console.error(`${red}[MAIN ERROR]${reset} ${data}`);
  });
  
  electronProcess.on('close', (code) => {
    console.log(`${green}[MAIN]${reset} Process exited with code ${code}`);
    if (nextProcess) {
      nextProcess.kill();
    }
    process.exit(code);
  });
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log(`\n${yellow}Shutting down development environment...${reset}`);
  
  if (electronProcess) {
    electronProcess.kill();
  }
  
  if (nextProcess) {
    nextProcess.kill();
  }
  
  process.exit(0);
});

// Ensure the Electron binary is available on an APFS path before starting.
function ensureElectron() {
  const exe = path.join(distDir(), platformExePath());
  if (fs.existsSync(exe)) return;
  console.log(
    `${yellow}[SETUP]${reset} Provisioning Electron to ~/.cache (this volume can't hold its symlinks)...`
  );
  execFileSync('node', [path.join(__dirname, 'provision-electron.js')], { stdio: 'inherit' });
}

// Start the development process
ensureElectron();
compileTypeScript();