const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron:      true,
  close:           ()       => ipcRenderer.send('win-close'),
  getStorage:      ()       => ipcRenderer.invoke('storage-get'),
  setStorage:      (data)   => ipcRenderer.invoke('storage-set', data),
  pickPhotoFolder: ()       => ipcRenderer.invoke('pick-photo-folder'),
  scanPhotoFolder: (folder) => ipcRenderer.invoke('scan-photo-folder', folder),
  onPhotosUpdated: (cb)     => ipcRenderer.on('photos-updated', (_, photos) => cb(photos)),
  googleOAuth:     (params) => ipcRenderer.invoke('google-oauth', params),
})
