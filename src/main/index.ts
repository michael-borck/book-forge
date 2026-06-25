import { app, BrowserWindow, session, shell } from 'electron';
import { URL } from 'url';
import * as path from 'path';
import { registerIPCHandlers } from './ipc/handlers';
import { registerAppProtocolScheme, registerAppProtocol, APP_INDEX_URL } from './appProtocol';

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;

// Development mode check
const isDevelopment = process.env.NODE_ENV === 'development';

// Content-Security-Policy applied to every response loaded by the app.
// Production loads a static export over file:// and talks to AI providers only
// through the main process, so it can be locked down hard. Development needs the
// looser policy that Next.js' dev server / HMR require (eval + websocket).
const buildCSP = (): string => {
  if (isDevelopment) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' ws: http://localhost:*",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; ');
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    // Tailwind / Next inject inline <style> tags; scripts stay locked to 'self'.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
};

// Register the custom app:// scheme used to serve the packaged static export.
// Must happen before the app is ready.
if (!isDevelopment) {
  registerAppProtocolScheme();
}

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
    const port = process.env.RENDERER_PORT || '3000';
    mainWindow.loadURL(`http://localhost:${port}`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(APP_INDEX_URL);
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// App event handlers
app.whenReady().then(async () => {
  // Security: inject a Content-Security-Policy on every response.
  const csp = buildCSP();
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  // Serve the packaged static export over app:// in production.
  if (!isDevelopment) {
    registerAppProtocol(csp);
  }

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

// Returns true when a URL points at the app's own content (the dev server in
// development, or the bundled app:// export in production).
const isInternalUrl = (target: string): boolean => {
  try {
    const url = new URL(target);
    if (isDevelopment) {
      const port = process.env.RENDERER_PORT || '3000';
      return url.protocol === 'http:' && url.hostname === 'localhost' && url.port === port;
    }
    return url.protocol === 'app:';
  } catch {
    return false;
  }
};

// Security: control window creation and navigation.
app.on('web-contents-created', (_, contents) => {
  // Deny all attempts to open new windows; route external http(s) links to the OS browser.
  contents.setWindowOpenHandler(({ url }) => {
    try {
      if (!isInternalUrl(url) && /^https?:$/.test(new URL(url).protocol)) {
        shell.openExternal(url);
      }
    } catch {
      // Malformed URL — fall through and deny.
    }
    return { action: 'deny' };
  });

  // Block navigation away from the app's own content (e.g. a redirect or
  // injected link trying to load remote/arbitrary pages into the main window).
  contents.on('will-navigate', (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault();
    }
  });
});