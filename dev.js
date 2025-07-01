const { spawn } = require('child_process');
const path = require('path');

console.log('Starting BookForge Development Server...\n');

// Start Next.js first
const nextProcess = spawn('npm', ['run', 'dev'], {
  cwd: path.join(__dirname, 'src/renderer'),
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development' }
});

// Wait for Next.js to start
setTimeout(() => {
  console.log('\nStarting Electron...\n');
  
  // Start Electron with proper flags
  const electronProcess = spawn('npx', [
    'electron',
    '--no-sandbox',
    '--disable-gpu-sandbox',
    'dist/main/index.js'
  ], {
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' }
  });
  
  electronProcess.on('close', (code) => {
    console.log(`Electron process exited with code ${code}`);
    nextProcess.kill();
    process.exit(code);
  });
}, 5000);

// Handle termination
process.on('SIGINT', () => {
  console.log('\nShutting down development server...');
  process.exit(0);
});