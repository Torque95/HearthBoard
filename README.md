# 🏡 HearthBoard

Family dashboard — fullscreen, touchscreen, Google Calendar sync.

---

## First time setup on Ubuntu

```bash
# 1. Clone from GitHub
git clone https://github.com/YOURUSERNAME/hearthboard.git ~/hearthboard
cd ~/hearthboard

# 2. Add your credentials (only ever do this once on the machine)
cp .env.example .env
nano .env
# Fill in your VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_SECRET

# 3. Install and run
npm install
npm run electron:dev
```

---

## Updating from GitHub (no touching the screen)

SSH in from another machine:

```bash
ssh user@<device-ip>
cd ~/hearthboard
git pull
npm install
npm run build
# Restart the app
pkill -f electron && npm run electron:dev
```

---

## File structure

```
hearthboard/
├── electron/
│   ├── main.js           ← Kiosk window, OAuth popup, photo watcher
│   └── preload.js        ← Secure bridge
├── src/
│   ├── App.jsx           ← All UI
│   ├── useStorage.js     ← Persistent storage + env credential injection
│   ├── googleCalendar.js ← Google Calendar API
│   ├── main.jsx
│   └── components/
│       └── ui.jsx        ← Touch-optimized components
├── .env                  ← YOUR CREDENTIALS (never commit this)
├── .env.example          ← Template (safe to commit)
├── .gitignore
├── index.html
├── package.json
└── vite.config.js
```

---

## How OAuth works for the client

The client only ever sees a **"Sign in with Google"** button.

Your API credentials are baked into the app at build time via the `.env` file — they are never visible in the UI. The client signs in with their own Google account through a standard Google popup, exactly like signing into any other app.

---

## Google Cloud setup (one time)

1. [console.cloud.google.com](https://console.cloud.google.com) → New Project → `HearthBoard`
2. APIs & Services → Library → enable **Google Calendar API** + **People API**
3. Credentials → Create → OAuth 2.0 Client ID → Desktop app
4. OAuth consent screen → External → add your Gmail as Test User
5. Authorized redirect URIs → add `http://localhost`
6. Copy Client ID + Secret into `.env`
