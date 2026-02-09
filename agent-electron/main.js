const { app, BrowserWindow, Tray, Menu, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store({ name: 'remote-admin-agent' });

let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'consent.html'));
}

app.whenReady().then(() => {
  // create tray
  tray = new Tray(path.join(__dirname, 'icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open', click: () => mainWindow.show() },
    { label: 'Exit', click: () => app.quit() }
  ]);
  tray.setToolTip('RemoteAdmin Agent');
  tray.setContextMenu(contextMenu);

  createWindow();

  // first run consent
  const consent = store.get('consentGiven', false);
  if (!consent) {
    mainWindow.show();
  } else {
    // start background streaming (renderer will handle)
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('start-stream', {});
    });
  }
});

app.on('window-all-closed', (e) => {
  // keep app running in tray
});

