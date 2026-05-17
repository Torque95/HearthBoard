const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // Window
  close: () => ipcRenderer.send('win-close'),

  // Persistent storage
  getStorage: ()     => ipcRenderer.invoke('storage-get'),
  setStorage: (data) => ipcRenderer.invoke('storage-set', data),

  // Touch keyboard (fires onboard on Linux/Electron)
  showKeyboard: () => ipcRenderer.send('show-keyboard'),

  // Photo folder — pick once, then file watcher pushes updates automatically
  pickPhotoFolder: ()           => ipcRenderer.invoke('pick-photo-folder'),
  scanPhotoFolder: (folderPath) => ipcRenderer.invoke('scan-photo-folder', folderPath),
  onPhotosUpdated: (cb)         => ipcRenderer.on('photos-updated', (_, photos) => cb(photos)),

  // Google OAuth
  googleOAuth: (params) => ipcRenderer.invoke('google-oauth', params),
})
