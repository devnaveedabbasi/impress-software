const { contextBridge, ipcRenderer } = require('electron');

let apiUrl = 'http://192.168.1.210:5000';
try {
  const fs = require('fs');
  const path = require('path');
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.apiUrl) apiUrl = parsed.apiUrl;
  }
} catch (err) {
  console.warn('Could not read config.json in preload:', err);
}

contextBridge.exposeInMainWorld('appConfig', {
  apiUrl,
  isElectron: true,
  windowAction: (action) => ipcRenderer.invoke('window-action', action),
  isMaximized: () => ipcRenderer.invoke('is-maximized'),
  onWindowStateChange: (callback) => {
    ipcRenderer.on('window-state', (_, isMaximized) => {
      if (typeof callback === 'function') {
        callback(Boolean(isMaximized));
      }
    });
  },
});