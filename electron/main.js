const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron')
const { execSync } = require('child_process')
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

// ── Auto-update cron job ──────────────────────────────────────────────────────
function setupCronJob() {
  try {
    const existing = execSync('crontab -l 2>/dev/null || echo ""').toString()
    if (existing.includes('hearthboard')) return
    const job = '*/5 * * * * cd ~/hearthboard && git pull --quiet && npm install --silent >> ~/hearthboard-update.log 2>&1\n'
    const newCron = existing.trimEnd() + '\n' + job
    execSync(`echo "${newCron}" | crontab -`)
    console.log('HearthBoard: auto-update cron job installed')
  } catch (e) {
    console.warn('HearthBoard: could not install cron job:', e.message)
  }
}

// ── Photo folder watcher ──────────────────────────────────────────────────────
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
let photoWatcher = null
let mainWindow = null

function isImage(f) {
  return IMAGE_EXTS.includes(path.extname(f).toLowerCase())
}

function scanFolder(folder) {
  try {
    return fs.readdirSync(folder)
      .filter(isImage)
      .map(f => path.join(folder, f))
  } catch {
    return []
  }
}

function watchFolder(folder) {
  if (photoWatcher) { photoWatcher.close(); photoWatcher = null }
  if (!folder) return

  // Send initial scan immediately
  const initial = scanFolder(folder)
  if (mainWindow) mainWindow.webContents.send('photos-updated', initial)

  // Watch for additions/removals
  photoWatcher = chokidar.watch(folder, {
    ignored: f => !isImage(f) && !fs.statSync(f).isDirectory(),
    persistent: true,
    ignoreInitial: true,
  })
  photoWatcher.on('add',    () => { if (mainWindow) mainWindow.webContents.send('photos-updated', scanFolder(folder)) })
  photoWatcher.on('unlink', () => { if (mainWindow) mainWindow.webContents.send('photos-updated', scanFolder(folder)) })
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width,
    height,
    fullscreen: !isDev,
    kiosk: !isDev,
    autoHideMenuBar: true,
    backgroundColor: '#0F1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Re-watch the saved photo folder after window loads
  mainWindow.webContents.on('did-finish-load', () => {
    const stored = loadStorage()
    if (stored.photoFolder) watchFolder(stored.photoFolder)
  })
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (!isDev) setupCronJob()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ── IPC: Storage ──────────────────────────────────────────────────────────────
ipcMain.handle('storage-get', () => loadStorage())
ipcMain.handle('storage-set', (_, data) => { saveStorage(data); return true })

// ── IPC: Window controls ──────────────────────────────────────────────────────
ipcMain.on('win-close', () => app.quit())

// ── IPC: Touch keyboard ───────────────────────────────────────────────────────
// Fires onboard (installed via: sudo apt install onboard) when any text input is focused.
// On Windows/Mac this is a no-op — the native OSK handles it automatically.
const { exec } = require('child_process')
ipcMain.on('show-keyboard', () => {
  exec('pgrep onboard', (err, stdout) => {
    if (stdout.trim()) {
      // Already running — bring to front
      exec('onboard')
    } else {
      exec('onboard &', () => {})
    }
  })
})

// ── IPC: Photo folder ─────────────────────────────────────────────────────────
ipcMain.handle('pick-photo-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select your photos folder',
    properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths.length) return null
  const folder = result.filePaths[0]
  // Persist the folder choice
  const stored = loadStorage()
  saveStorage({ ...stored, photoFolder: folder })
  watchFolder(folder)
  return { folder, photos: scanFolder(folder) }
})

ipcMain.handle('scan-photo-folder', (_, folder) => {
  return scanFolder(folder)
})

// ── IPC: Google OAuth popup ───────────────────────────────────────────────────
ipcMain.handle('google-oauth', async (_, { url }) => {
  return new Promise((resolve, reject) => {
    const popup = new BrowserWindow({
      width: 500,
      height: 650,
      parent: mainWindow,
      modal: true,
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })

    popup.loadURL(url)

    const handle = (_, redirectUrl) => {
      try {
        const u = new URL(redirectUrl)
        if (u.hostname === 'localhost') {
          const code = u.searchParams.get('code')
          const error = u.searchParams.get('error')
          popup.close()
          code ? resolve(code) : reject(new Error(error || 'cancelled'))
        }
      } catch {}
    }

    popup.webContents.on('will-redirect', handle)
    popup.webContents.on('will-navigate', handle)
    popup.on('closed', () => reject(new Error('Window closed')))
  })
})
