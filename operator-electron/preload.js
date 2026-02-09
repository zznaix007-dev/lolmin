const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // no native apis needed for now
});

