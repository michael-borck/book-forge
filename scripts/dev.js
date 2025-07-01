const { spawn } = require('child_process');
const path = require('path');

console.log('Starting BookForge in development mode...\n');

// Start Next.js dev server first
console.log('Starting Next.js renderer...');
const nextProcess = spawn('npm', ['run', 'dev'], {
  cwd: path.join(__dirname, '../src/renderer'),
  shell: true,
  stdio: 'inherit'
});

// Wait a bit for Next.js to start
setTimeout(() => {
  console.log('\nStarting Electron main process...');
  
  // Start Electron with TypeScript
  const electronProcess = spawn('npx', ['electronmon', '-r', 'ts-node/register/transpile-only', './src/main/index.ts'], {
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' }
  });
  
  electronProcess.on('close', (code) => {
    console.log(`Electron process exited with code ${code}`);
    nextProcess.kill();
    process.exit(code);
  });
}, 3000);

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  process.exit(0);
});