import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { registerIPCHandlers } from './ipc/handlers';

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;

// Development mode check
const isDevelopment = process.env.NODE_ENV === 'development';

// Disable sandbox if environment variable is set
if (process.env.ELECTRON_DISABLE_SANDBOX || isDevelopment) {
  app.commandLine.appendSwitch('no-sandbox');
  app.commandLine.appendSwitch('disable-gpu-sandbox');
}

console.log('Starting BookForge...');
console.log('Development mode:', isDevelopment);
console.log('Sandbox disabled:', process.env.ELECTRON_DISABLE_SANDBOX);

const createWindow = async () => {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/index.js')
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: path.join(__dirname, '../../resources/icon.png')
  });

  // Load the app
  if (isDevelopment) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/out/index.html'));
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// App event handlers
app.whenReady().then(async () => {
  // Register IPC handlers
  registerIPCHandlers();
  
  // Create window
  await createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});