const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onStartStream: (cb) => ipcRenderer.on('start-stream', cb),
  sendConsent: (val) => ipcRenderer.send('consent', val)
});

