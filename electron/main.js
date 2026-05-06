const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const chokidar = require('chokidar')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const storageFile = path.join(app.getPath('userData'), 'hearthboard.json')

// ── Storage ───────────────────────────────────────────────────────────────────
function loadStorage() {
  try { if (fs.existsSync(storageFile)) return JSON.parse(fs.readFileSync(storageFile, 'utf8')) } catch {}
  return {}
}
function saveStorage(data) {
  try { fs.writeFileSync(storageFile, JSON.stringify(data, null, 2)) } catch {}
}

// ── Photo folder watcher ──────────────────────────────────────────────────────
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
let photoWatcher = null
let mainWindow = null

function isImage(f) { return IMAGE_EXTS.includes(path.extname(f).toLowerCase()) }
function scanFolder(folder) {
  try { return fs.readdirSync(folder).filter(isImage).map(f => path.join(folder, f)) } catch { return [] }
}
function watchPhotoFolder(folder) {
  if (photoWatcher) photoWatcher.close()
  if (!folder || !fs.existsSync(folder)) return
  photoWatcher = chokidar.watch(folder, { persistent:true, ignoreInitial:false, depth:0 })
  const send = () => mainWindow?.webContents?.send('photos-updated', scanFolder(folder))
  photoWatcher.on('add', send).on('unlink', send).on('ready', send)
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().bounds

  mainWindow = new BrowserWindow({
    width, height, x:0, y:0,
    fullscreen: true,
    kiosk: !isDev,
    frame: false,
    resizable: false,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Disable GPU for VM/older Intel compatibility
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-software-rasterizer')

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  const storage = loadStorage()
  if (storage.photoFolder) watchPhotoFolder(storage.photoFolder)
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())

// ── IPC: Window ───────────────────────────────────────────────────────────────
ipcMain.on('win-close', () => app.quit())

// ── IPC: Storage ──────────────────────────────────────────────────────────────
ipcMain.handle('storage-get', () => loadStorage())
ipcMain.handle('storage-set', (_, data) => { saveStorage(data); return true })

// ── IPC: Photos ───────────────────────────────────────────────────────────────
ipcMain.handle('pick-photo-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose your photo folder',
    properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths.length) return null
  const folder = result.filePaths[0]
  const storage = loadStorage()
  storage.photoFolder = folder
  saveStorage(storage)
  watchPhotoFolder(folder)
  return { folderPath: folder, photos: scanFolder(folder) }
})
ipcMain.handle('scan-photo-folder', (_, folder) => scanFolder(folder))

// ── IPC: Google OAuth popup ───────────────────────────────────────────────────
ipcMain.handle('google-oauth', async (_, { clientId, redirectUri }) => {
  return new Promise((resolve, reject) => {
    const scopes = [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' ')

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&access_type=offline&prompt=consent`

    const popup = new BrowserWindow({
      width:500, height:660,
      parent: mainWindow, modal: true,
      title: 'Sign in with Google',
      backgroundColor: '#ffffff',
      webPreferences: { nodeIntegration:false, contextIsolation:true },
    })

    popup.loadURL(authUrl)

    const handle = (_, url) => {
      if (!url.startsWith(redirectUri)) return
      const u = new URL(url)
      popup.close()
      const code = u.searchParams.get('code')
      const err  = u.searchParams.get('error')
      code ? resolve(code) : reject(new Error(err || 'cancelled'))
    }

    popup.webContents.on('will-redirect', handle)
    popup.webContents.on('will-navigate',  handle)
    popup.on('closed', () => reject(new Error('Window closed')))
  })
})
