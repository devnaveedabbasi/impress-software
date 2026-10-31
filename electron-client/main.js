const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('./config.json');

const port = config.frontendPort || 3000;
const frontendUrl = `http://127.0.0.1:${port}`;
let frontendProc;

function startFrontend() {
  if (!app.isPackaged) return; // development mein aap khud chalate ho

  const frontendDir = path.join(process.resourcesPath, 'frontend');
  const serverScript = path.join(frontendDir, 'server.js');

  if (!fs.existsSync(serverScript)) {
    console.error(`[Frontend Error] server.js not found at: ${serverScript}`);
    return;
  }

  frontendProc = spawn(process.execPath, ['server.js'], {
    cwd: frontendDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
    },
  });

  frontendProc.stdout?.on('data', (d) => console.log(`[Frontend]: ${d}`));
  frontendProc.stderr?.on('data', (d) => console.error(`[Frontend Error]: ${d}`));
  frontendProc.on('exit', (code, sig) => console.log(`[Frontend Exit]: code ${code}, sig ${sig}`));
}

async function waitForFrontend() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(frontendUrl);
      if (res.ok || res.status < 500) {
        return true;
      }
    } catch {
      // waiting for server to start
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
    },
  });

  win.setMenuBarVisibility(false);

  // Enable F12 toggle devtools
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`Failed to load ${frontendUrl}: ${errorCode} - ${errorDescription}`);
    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.loadURL(frontendUrl).catch(() => { });
      }
    }, 1000);
  });

  win.loadURL(frontendUrl);

  // Window state queries & events
  ipcMain.removeHandler('is-maximized');
  ipcMain.handle('is-maximized', () => {
    if (!win || win.isDestroyed()) return false;
    return win.isMaximized();
  });

  win.on('maximize', () => {
    if (!win.isDestroyed()) win.webContents.send('window-state', true);
  });

  win.on('unmaximize', () => {
    if (!win.isDestroyed()) win.webContents.send('window-state', false);
  });

  // Window action handlers (Left side: Back, Forward, Reload | Right side: Minimize, Maximize, Close)
  ipcMain.removeHandler('window-action');
  ipcMain.handle('window-action', (_, action) => {
    if (!win || win.isDestroyed()) return;

    switch (action) {
      case 'back':
        if (win.webContents.canGoBack()) win.webContents.goBack();
        break;

      case 'forward':
        if (win.webContents.canGoForward()) win.webContents.goForward();
        break;

      case 'reload':
        win.webContents.reload();
        break;

      case 'minimize':
        win.minimize();
        break;

      case 'maximize':
        if (win.isMaximized()) win.unmaximize();
        else win.maximize();
        break;

      case 'close':
        win.close();
        break;
    }
  });
}

// security: sirf apni page khule, baqi sab block
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (e, url) => {
    const isAllowed = url.startsWith(frontendUrl) || url.startsWith(`http://localhost:${port}`);
    if (!isAllowed) e.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

app.whenReady().then(async () => {
  startFrontend();
  await waitForFrontend();
  createWindow();
});

app.on('before-quit', () => {
  if (frontendProc) {
    try {
      frontendProc.kill();
    } catch { }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});