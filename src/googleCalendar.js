const REDIRECT = 'http://localhost'

// ── Token storage ─────────────────────────────────────────────────────────────
export const saveTokens   = (id, t) => localStorage.setItem(`hb_tok_${id}`, JSON.stringify(t))
export const loadTokens   = (id)    => { try { return JSON.parse(localStorage.getItem(`hb_tok_${id}`)) } catch { return null } }
export const removeTokens = (id)    => localStorage.removeItem(`hb_tok_${id}`)

const isExpired = (t) => !t?.obtained_at || Date.now() > t.obtained_at + (t.expires_in - 120) * 1000

// ── OAuth ─────────────────────────────────────────────────────────────────────
export async function exchangeCode(code, clientId, clientSecret) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT, grant_type: 'authorization_code' }),
  })
  if (!res.ok) throw new Error('Token exchange failed: ' + await res.text())
  const t = await res.json()
  t.obtained_at = Date.now()
  return t
}

async function refresh(t, clientId, clientSecret) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: t.refresh_token, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }),
  })
  if (!res.ok) throw new Error('Token refresh failed')
  const fresh = await res.json()
  return { ...t, access_token: fresh.access_token, obtained_at: Date.now(), expires_in: fresh.expires_in || 3600 }
}

export async function getToken(accountId, clientId, clientSecret) {
  let t = loadTokens(accountId)
  if (!t) throw new Error('Not authenticated: ' + accountId)
  if (isExpired(t)) {
    t = await refresh(t, clientId, clientSecret)
    saveTokens(accountId, t)
  }
  return t.access_token
}

// ── API ───────────────────────────────────────────────────────────────────────
async function gFetch(path, token) {
  const res = await fetch(`https://www.googleapis.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Google API ${res.status}: ${path}`)
  return res.json()
}

export const getUserInfo      = (token) => gFetch('/oauth2/v2/userinfo', token)
export const getCalendarList  = async (token) => { const d = await gFetch('/calendar/v3/users/me/calendarList?maxResults=50', token); return d.items || [] }

export async function getEvents(token, calendarId, daysAhead = 60) {
  const now    = new Date()
  const future = new Date(now.getTime() + daysAhead * 86400000)
  const params = new URLSearchParams({ timeMin: now.toISOString(), timeMax: future.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250' })
  const data   = await gFetch(`/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`, token)
  return (data.items || []).map(normalizeEvent)
}

function normalizeEvent(e) {
  const startRaw = e.start?.dateTime || e.start?.date || ''
  const endRaw   = e.end?.dateTime   || e.end?.date   || ''
  const isAllDay = !e.start?.dateTime
  const date     = startRaw.split('T')[0]
  let time = 'All day', endTime = ''
  if (!isAllDay) {
    time    = new Date(startRaw).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })
    endTime = endRaw ? new Date(endRaw).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }) : ''
  }
  return {
    id: e.id, title: e.summary || '(No title)',
    date, time, endTime, isAllDay, startRaw, endRaw,
    location: e.location || '', description: e.description || '',
    calendarId: e.calendarId || '', source: 'google',
  }
}
