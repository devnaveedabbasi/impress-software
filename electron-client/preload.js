const { contextBridge, ipcRenderer } = require('electron');

let apiUrl = 'http://127.0.0.1:5000';
try {
  const config = require('./config.json');
  if (config && config.apiUrl) apiUrl = config.apiUrl;
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