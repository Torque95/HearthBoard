import { useState, useEffect, useCallback, useRef } from 'react'
import { useStorage } from './useStorage.js'
import { TapButton, Modal, Input, Label } from './components/ui.jsx'
import { exchangeCode, getUserInfo, getCalendarList, getEvents, getToken, saveTokens, removeTokens } from './googleCalendar.js'

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS    = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS_S    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DAYS_F    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MEAL_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const ACCENTS   = ['#FF7B5C','#FF6B6B','#FFB347','#FFD93D','#6BCB77','#4ECDC4','#45B7D1','#4A90D9','#9B59B6','#E91E8C','#FF69B4','#A0522D']

function useNow() {
  const [now, setNow] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t) }, [])
  return now
}

// ─── CLOCK ────────────────────────────────────────────────────────────────────
function Clock() {
  const now = useNow()
  const h = now.getHours() % 12 || 12
  const m = String(now.getMinutes()).padStart(2,'0')
  const ap = now.getHours() >= 12 ? 'PM' : 'AM'
  return (
    <div style={{ textAlign:'right', lineHeight:1 }}>
      <div style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:600, color:'var(--text)' }}>{h}:{m} <span style={{ fontSize:14, color:'var(--text-muted)' }}>{ap}</span></div>
      <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:3 }}>{DAYS_F[now.getDay()]}, {MONTHS[now.getMonth()]} {now.getDate()}</div>
    </div>
  )
}

// ─── THEME TOGGLE ─────────────────────────────────────────────────────────────
function ThemeToggle({ dark, onToggle }) {
  return (
    <TapButton onClick={onToggle} style={{ width:56, height:30, borderRadius:15, padding:3, background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)', justifyContent:'flex-start' }}>
      <div style={{ width:24, height:24, borderRadius:'50%', background: dark ? '#FFD93D' : '#1a1a1a', transform: dark ? 'translateX(0)' : 'translateX(26px)', transition:'transform 0.25s ease', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>
        {dark ? '🌙' : '☀️'}
      </div>
    </TapButton>
  )
}

// ─── COLOR PICKER ─────────────────────────────────────────────────────────────
function ColorPicker({ accent, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position:'relative' }}>
      <TapButton onClick={() => setOpen(v=>!v)} style={{ width:36, height:36, borderRadius:'50%', background:accent, minWidth:36, minHeight:36 }} />
      {open && (
        <div style={{ position:'absolute', top:44, right:0, zIndex:300, background:'var(--bg-modal)', border:'1px solid var(--border)', borderRadius:'var(--radius-md)', padding:14, boxShadow:'var(--shadow)', display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8, width:220 }}>
          {ACCENTS.map(c => (
            <div key={c} onClick={() => { onChange(c); setOpen(false) }} style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', border: c===accent ? '3px solid var(--text)' : '3px solid transparent' }} />
          ))}
          <input type="color" value={accent} onChange={e => onChange(e.target.value)} style={{ gridColumn:'span 2', height:28, border:'none', background:'none', cursor:'pointer', padding:0 }} />
        </div>
      )}
    </div>
  )
}

// ─── TOP BAR ──────────────────────────────────────────────────────────────────
function TopBar({ tab, setTab, dark, onToggleDark, accent, onAccentChange, onSettings, syncing }) {
  const TABS = [
    { id:'calendar', label:'📅  Calendar' },
    { id:'chores',   label:'✅  Chores'   },
    { id:'meals',    label:'🍽️  Meals'    },
    { id:'photos',   label:'📷  Photos'   },
  ]
  return (
    <div style={{ height:64, display:'flex', alignItems:'center', borderBottom:'1px solid var(--border)', background:'var(--titlebar,var(--bg))', padding:'0 20px', gap:8, flexShrink:0 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginRight:8 }}>
        <span style={{ fontSize:26 }}>🏡</span>
        <span key={accent} style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:600, background:`linear-gradient(135deg,${accent},${accent}bb)`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>HearthBoard</span>
      </div>
      <div style={{ display:'flex', gap:2, flex:1 }}>
        {TABS.map(t => (
          <TapButton key={t.id} onClick={() => setTab(t.id)} rippleColor={accent+'44'} style={{ padding:'0 20px', height:48, borderRadius:'var(--radius-sm)', background: tab===t.id ? accent+'22' : 'transparent', color: tab===t.id ? accent : 'var(--text-sub)', fontWeight: tab===t.id ? 700 : 500, fontSize:14, borderBottom: tab===t.id ? `2.5px solid ${accent}` : '2.5px solid transparent' }}>
            {t.label}
          </TapButton>
        ))}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        {syncing && <span style={{ fontSize:11, color:'var(--text-muted)' }}>↻ syncing…</span>}
        <Clock />
        <ThemeToggle dark={dark} onToggle={onToggleDark} />
        <ColorPicker accent={accent} onChange={onAccentChange} />
        <TapButton onClick={onSettings} style={{ width:40, height:40, borderRadius:'var(--radius-sm)', background:'var(--bg-card)', fontSize:18 }}>⚙️</TapButton>
      </div>
    </div>
  )
}

// ─── GOOGLE PANEL — client only sees "Sign in with Google" ────────────────────
function GooglePanel({ accounts, credentials, onAddAccount, onRemoveAccount, onClose, accent }) {
  const [connecting, setConnecting] = useState(false)
  const [error,      setError]      = useState('')

  const connect = async () => {
    if (!credentials?.clientId) { setError('App credentials not configured. Contact support.'); return }
    if (!window.electronAPI)    { setError('Sign in requires the desktop app.'); return }
    setConnecting(true); setError('')
    try {
      const code   = await window.electronAPI.googleOAuth({ clientId: credentials.clientId, redirectUri:'http://localhost' })
      const tokens = await exchangeCode(code, credentials.clientId, credentials.clientSecret)
      const user   = await getUserInfo(tokens.access_token)
      // Save tokens to both localStorage and Electron storage
      saveTokens(user.email, tokens)
      const stored = await window.electronAPI.getStorage()
      await window.electronAPI.setStorage({ ...stored, [`tok_${user.email}`]: tokens })
      const calList = await getCalendarList(tokens.access_token)
      onAddAccount({
        id: user.email, email: user.email, name: user.name, picture: user.picture,
        calendars: calList.map(c => ({ id:c.id, name:c.summary, color:c.backgroundColor||accent, enabled: !!c.primary || c.accessRole==='owner' }))
      })
    } catch(e) {
      setError(e.message === 'Window closed' ? 'Sign in cancelled.' : e.message)
    }
    setConnecting(false)
  }

  return (
    <Modal onClose={onClose} width={480}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:28 }}>
        <h2 style={{ fontFamily:'var(--font-display)', fontSize:22, color:'var(--text)' }}>Google Calendar</h2>
        <TapButton onClick={onClose} style={{ width:36, height:36, borderRadius:8, background:'var(--bg-input)', color:'var(--text-sub)', fontSize:16 }}>✕</TapButton>
      </div>

      {/* Single sign in button — all the user ever sees */}
      <TapButton onClick={connect} disabled={connecting} style={{ width:'100%', height:60, borderRadius:'var(--radius-md)', background:'linear-gradient(135deg,#4285F4,#34A853)', color:'#fff', fontWeight:800, fontSize:16, gap:12, marginBottom:16 }}>
        <svg width="22" height="22" viewBox="0 0 48 48">
          <path fill="#FFF" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/>
        </svg>
        {connecting ? 'Signing in…' : 'Sign in with Google'}
      </TapButton>

      {error && <div style={{ color:'#FF6B6B', fontSize:13, marginBottom:16, padding:'10px 14px', background:'rgba(255,107,107,0.1)', borderRadius:10 }}>{error}</div>}

      {accounts.length > 0 && (
        <div>
          <Label style={{ marginBottom:10 }}>Connected Accounts</Label>
          {accounts.map(acc => (
            <div key={acc.id} style={{ padding:14, borderRadius:'var(--radius-md)', background:'var(--bg-card)', border:'1px solid var(--border)', marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: acc.calendars?.length ? 10 : 0 }}>
                {acc.picture && <img src={acc.picture} alt="" style={{ width:38, height:38, borderRadius:'50%' }} />}
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:'var(--text)' }}>{acc.name}</div>
                  <div style={{ fontSize:12, color:'var(--text-sub)' }}>{acc.email}</div>
                </div>
                <TapButton onClick={() => { onRemoveAccount(acc.id); removeTokens(acc.id) }} style={{ height:34, padding:'0 12px', borderRadius:8, background:'rgba(255,107,107,0.15)', color:'#FF6B6B', fontSize:12, fontWeight:700 }}>Remove</TapButton>
              </div>
              {acc.calendars?.map(cal => (
                <div key={cal.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'3px 0' }}>
                  <div style={{ width:9, height:9, borderRadius:'50%', background:cal.color, flexShrink:0 }} />
                  <span style={{ fontSize:12, color:'var(--text-sub)', flex:1 }}>{cal.name}</span>
                  <span style={{ fontSize:10, color: cal.enabled ? '#50C878' : 'var(--text-muted)' }}>{cal.enabled ? '● syncing' : '○ off'}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

// ─── CALENDAR ─────────────────────────────────────────────────────────────────
function CalendarView({ events, accounts, accent }) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth())
  const [year,  setYear]  = useState(now.getFullYear())
  const [view,  setView]  = useState('month')
  const [expanded, setExpanded] = useState(null)

  const calColor = (e) => { for (const acc of accounts) { const cal = acc.calendars?.find(c => c.id===e.calendarId); if (cal) return cal.color } return accent }

  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const cells = []
  for (let i=0; i<firstDay; i++) cells.push(null)
  for (let d=1; d<=daysInMonth; d++) cells.push(d)
  while (cells.length%7!==0) cells.push(null)

  const eventsOn = (d) => { const ds=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; return events.filter(e=>e.date===ds) }
  const todayStr  = now.toISOString().split('T')[0]
  const upcoming  = [...events].filter(e=>e.date>=todayStr).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)).slice(0,15)

  const navMonth = (dir) => { let m=month+dir, y=year; if(m<0){m=11;y--} if(m>11){m=0;y++} setMonth(m);setYear(y) }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', gap:12 }}>
      <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
        {['month','agenda'].map(v => (
          <TapButton key={v} onClick={() => setView(v)} style={{ height:40, padding:'0 18px', borderRadius:20, background:view===v?accent:'var(--bg-card)', color:view===v?'#fff':'var(--text-sub)', fontWeight:view===v?700:500, fontSize:13 }}>
            {v.charAt(0).toUpperCase()+v.slice(1)}
          </TapButton>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          <TapButton onClick={() => navMonth(-1)} style={{ width:40, height:40, borderRadius:10, background:'var(--bg-card)', color:'var(--text)', fontSize:20 }}>‹</TapButton>
          <span style={{ fontFamily:'var(--font-display)', fontSize:16, fontWeight:600, minWidth:160, textAlign:'center' }}>{MONTHS[month]} {year}</span>
          <TapButton onClick={() => navMonth(1)}  style={{ width:40, height:40, borderRadius:10, background:'var(--bg-card)', color:'var(--text)', fontSize:20 }}>›</TapButton>
        </div>
      </div>

      {view==='month' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:4 }}>
            {DAYS_S.map(d => <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:'var(--text-muted)' }}>{d}</div>)}
          </div>
          <div style={{ flex:1, display:'grid', gridTemplateColumns:'repeat(7,1fr)', gridAutoRows:'1fr', gap:3 }}>
            {cells.map((day,i) => {
              const isToday = day===now.getDate()&&month===now.getMonth()&&year===now.getFullYear()
              const evs = day ? eventsOn(day) : []
              return (
                <div key={i} style={{ padding:'5px 6px', borderRadius:10, overflow:'hidden', background:day?(isToday?accent+'22':'var(--bg-card)'):'transparent', border:isToday?`1.5px solid ${accent}`:'1.5px solid transparent' }}>
                  {day && <>
                    <div style={{ fontSize:12, fontWeight:isToday?800:500, color:isToday?accent:'var(--text-sub)', marginBottom:2 }}>{day}</div>
                    {evs.slice(0,2).map(e => (
                      <div key={e.id} onClick={() => setExpanded(e)} style={{ fontSize:9, padding:'1px 5px', borderRadius:4, marginBottom:2, background:calColor(e), color:'#fff', fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', cursor:'pointer' }}>
                        {e.isAllDay?'':e.time+' '}{e.title}
                      </div>
                    ))}
                    {evs.length>2 && <div style={{ fontSize:9, color:'var(--text-muted)' }}>+{evs.length-2}</div>}
                  </>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {view==='agenda' && (
        <div style={{ flex:1, overflowY:'auto' }}>
          {upcoming.length===0 && <div style={{ textAlign:'center', color:'var(--text-muted)', paddingTop:60 }}>No upcoming events</div>}
          {upcoming.map(e => (
            <div key={e.id}>
              <div onClick={() => setExpanded(expanded?.id===e.id ? null : e)} style={{ display:'flex', gap:14, alignItems:'center', padding:'14px 16px', borderRadius:'var(--radius-md)', background:'var(--bg-card)', borderLeft:`4px solid ${calColor(e)}`, marginBottom:8, cursor:'pointer' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:15 }}>{e.title}</div>
                  <div style={{ fontSize:12, color:'var(--text-sub)', marginTop:2 }}>{e.date} · {e.time}{e.endTime?` – ${e.endTime}`:''}</div>
                </div>
                <div style={{ color:'var(--text-muted)', fontSize:16, transform:expanded?.id===e.id?'rotate(90deg)':'rotate(0)', transition:'transform 0.2s' }}>›</div>
              </div>
              {expanded?.id===e.id && (
                <div style={{ margin:'-4px 0 8px 20px', padding:'14px 16px', borderRadius:'var(--radius-md)', background:'var(--bg-card)', borderLeft:`4px solid ${calColor(e)}44` }}>
                  {e.location    && <div style={{ fontSize:13, color:'var(--text-sub)', marginBottom:6 }}>📍 {e.location}</div>}
                  {e.description && <div style={{ fontSize:13, color:'var(--text-sub)', lineHeight:1.6 }}>{e.description}</div>}
                  {!e.location&&!e.description && <div style={{ fontSize:13, color:'var(--text-muted)' }}>No additional details.</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {expanded && view==='month' && (
        <Modal onClose={() => setExpanded(null)} width={420}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
            <h3 style={{ fontFamily:'var(--font-display)', fontSize:20, flex:1, paddingRight:12 }}>{expanded.title}</h3>
            <TapButton onClick={() => setExpanded(null)} style={{ width:36, height:36, borderRadius:8, background:'var(--bg-input)', color:'var(--text-sub)', fontSize:16, flexShrink:0 }}>✕</TapButton>
          </div>
          <div style={{ padding:'12px 16px', borderRadius:'var(--radius-md)', background:'var(--bg-card)', border:'1px solid var(--border)' }}>
            <div style={{ fontSize:13, color:'var(--text-sub)', marginBottom:expanded.location||expanded.description?10:0 }}>🗓 {expanded.date} · {expanded.time}{expanded.endTime?` – ${expanded.endTime}`:''}</div>
            {expanded.location    && <div style={{ fontSize:13, color:'var(--text-sub)', marginBottom:8 }}>📍 {expanded.location}</div>}
            {expanded.description && <div style={{ fontSize:13, color:'var(--text-sub)', lineHeight:1.7, borderTop:'1px solid var(--border)', paddingTop:10 }}>{expanded.description}</div>}
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── CHORES ───────────────────────────────────────────────────────────────────
function ChoresView({ chores, setChores, familyMembers, accent }) {
  const [showAdd,  setShowAdd]  = useState(false)
  const [task,     setTask]     = useState('')
  const [member,   setMember]   = useState('')
  const [day,      setDay]      = useState('Mon')
  const [expanded, setExpanded] = useState(null)

  const mc     = (name) => familyMembers.find(m=>m.name===name)?.color || accent
  const add    = () => { if(!task.trim()) return; setChores(c=>[...c,{id:Date.now(),task:task.trim(),member:member||familyMembers[0]?.name||'',done:false,day,notes:''}]); setTask(''); setShowAdd(false) }
  const toggle = (id) => setChores(c=>c.map(ch=>ch.id===id?{...ch,done:!ch.done}:ch))
  const remove = (id) => setChores(c=>c.filter(ch=>ch.id!==id))

  const grouped = MEAL_DAYS.reduce((acc,d) => { const items=chores.filter(c=>c.day===d); if(items.length) acc[d]=items; return acc }, {})

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', gap:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {familyMembers.map(m => (
            <div key={m.name} style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 12px', borderRadius:20, background:m.color+'22' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:m.color }} />
              <span style={{ fontSize:12, fontWeight:600, color:m.color }}>{m.name}</span>
            </div>
          ))}
        </div>
        <TapButton onClick={() => setShowAdd(v=>!v)} style={{ height:44, padding:'0 20px', borderRadius:22, background:accent, color:'#fff', fontWeight:700, fontSize:14 }}>+ Add Chore</TapButton>
      </div>

      {showAdd && (
        <div style={{ padding:18, borderRadius:'var(--radius-md)', background:'var(--bg-card)', border:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <Label>Task name</Label>
            <Input value={task} onChange={e=>setTask(e.target.value)} placeholder="e.g. Vacuum living room" inputMode="text" autoFocus onKeyDown={e=>e.key==='Enter'&&add()} />
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <div style={{ flex:1 }}>
              <Label>Who</Label>
              <select value={member} onChange={e=>setMember(e.target.value)} style={{ width:'100%', height:52, padding:'0 14px', borderRadius:'var(--radius-sm)', background:'var(--bg-input)', border:'1.5px solid var(--border)', color:'var(--text)', fontSize:14, fontFamily:'inherit' }}>
                {familyMembers.map(m=><option key={m.name} value={m.name}>{m.name}</option>)}
              </select>
            </div>
            <div style={{ flex:1 }}>
              <Label>Day</Label>
              <select value={day} onChange={e=>setDay(e.target.value)} style={{ width:'100%', height:52, padding:'0 14px', borderRadius:'var(--radius-sm)', background:'var(--bg-input)', border:'1.5px solid var(--border)', color:'var(--text)', fontSize:14, fontFamily:'inherit' }}>
                {MEAL_DAYS.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <TapButton onClick={() => setShowAdd(false)} style={{ flex:1, height:48, borderRadius:'var(--radius-sm)', background:'var(--bg-input)', color:'var(--text-sub)', fontWeight:600 }}>Cancel</TapButton>
            <TapButton onClick={add} style={{ flex:2, height:48, borderRadius:'var(--radius-sm)', background:accent, color:'#fff', fontWeight:700 }}>Add Chore</TapButton>
          </div>
        </div>
      )}

      <div style={{ flex:1, overflowY:'auto' }}>
        {Object.keys(grouped).length===0 && <div style={{ textAlign:'center', color:'var(--text-muted)', paddingTop:60, fontSize:15 }}>No chores yet. Tap + Add Chore to start.</div>}
        {Object.entries(grouped).map(([d,items]) => (
          <div key={d} style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:800, color:'var(--text-muted)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:8 }}>{d}</div>
            {items.map(ch => (
              <div key={ch.id}>
                <div onClick={() => setExpanded(expanded===ch.id?null:ch.id)} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:'var(--radius-md)', background:'var(--bg-card)', borderLeft:`3px solid ${mc(ch.member)}`, marginBottom:4, cursor:'pointer', opacity:ch.done?0.5:1 }}>
                  <TapButton onClick={e=>{e.stopPropagation();toggle(ch.id)}} rippleColor={mc(ch.member)+'55'} style={{ width:36, height:36, borderRadius:10, minWidth:36, minHeight:36, background:ch.done?mc(ch.member):'transparent', border:`2px solid ${mc(ch.member)}`, color:'#fff', fontSize:16, flexShrink:0 }}>
                    {ch.done?'✓':''}
                  </TapButton>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600, fontSize:14, textDecoration:ch.done?'line-through':'none' }}>{ch.task}</div>
                    <div style={{ fontSize:11, color:mc(ch.member), marginTop:2, fontWeight:600 }}>{ch.member}</div>
                  </div>
                  <div style={{ color:'var(--text-muted)', fontSize:16, transform:expanded===ch.id?'rotate(90deg)':'rotate(0)', transition:'transform 0.2s' }}>›</div>
                  <TapButton onClick={e=>{e.stopPropagation();remove(ch.id)}} style={{ width:36, height:36, borderRadius:8, minWidth:36, minHeight:36, background:'rgba(255,107,107,0.1)', color:'#FF6B6B', fontSize:14 }}>✕</TapButton>
                </div>
                {expanded===ch.id && (
                  <div style={{ margin:'-2px 0 8px 20px', padding:'12px 16px', borderRadius:'var(--radius-md)', background:'var(--bg-card)', borderLeft:`3px solid ${mc(ch.member)}44` }}>
                    <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:4 }}>Notes</div>
                    <div style={{ fontSize:13, color:'var(--text-sub)' }}>{ch.notes||'No notes added.'}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── MEALS ────────────────────────────────────────────────────────────────────
function MealsView({ meals, setMeals, accent }) {
  const todayKey = DAYS_S[new Date().getDay()]
  const [selDay,  setSelDay]  = useState(MEAL_DAYS.includes(todayKey)?todayKey:'Mon')
  const [editing, setEditing] = useState(null)
  const meal   = meals[selDay] || { breakfast:'', lunch:'', dinner:'' }
  const update = (slot, val) => { setMeals(m=>({...m,[selDay]:{...m[selDay],[slot]:val}})); setEditing(null) }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', gap:14 }}>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', flexShrink:0 }}>
        {MEAL_DAYS.map(d => (
          <TapButton key={d} onClick={() => setSelDay(d)} style={{ height:44, padding:'0 18px', borderRadius:22, background:selDay===d?accent:'var(--bg-card)', color:selDay===d?'#fff':'var(--text-sub)', fontWeight:selDay===d?700:500, fontSize:13 }}>{d}</TapButton>
        ))}
      </div>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:12 }}>
        {[['🌅','breakfast','Breakfast'],['☀️','lunch','Lunch'],['🌙','dinner','Dinner']].map(([icon,slot,label]) => (
          <TapButton key={slot} onClick={() => setEditing(editing===slot?null:slot)} style={{ flex:1, padding:'16px 20px', borderRadius:'var(--radius-md)', background:'var(--bg-card)', border:'1px solid var(--border)', flexDirection:'column', alignItems:'flex-start', gap:6, minHeight:80 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em' }}>{icon} {label}</div>
            {editing===slot ? (
              <input autoFocus defaultValue={meal[slot]} inputMode="text"
                onBlur={e=>update(slot,e.target.value)} onKeyDown={e=>e.key==='Enter'&&update(slot,e.target.value)}
                style={{ width:'100%', background:'transparent', border:'none', borderBottom:`2px solid ${accent}`, color:'var(--text)', fontSize:16, fontWeight:600, fontFamily:'inherit', outline:'none', padding:'2px 0' }}
                onClick={e=>e.stopPropagation()} />
            ) : (
              <div style={{ fontWeight:600, fontSize:16, color:meal[slot]?'var(--text)':'var(--text-muted)' }}>{meal[slot]||'Tap to add…'}</div>
            )}
          </TapButton>
        ))}
      </div>
    </div>
  )
}

// ─── PHOTOS ───────────────────────────────────────────────────────────────────
function PhotosView({ photoFolder, photos, setPhotos, accent }) {
  const [current, setCurrent] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => { if (!window.electronAPI) return; window.electronAPI.onPhotosUpdated(setPhotos) }, [])
  useEffect(() => {
    if (!photos.length) return
    timerRef.current = setInterval(() => setCurrent(i=>(i+1)%photos.length), 8000)
    return () => clearInterval(timerRef.current)
  }, [photos.length])

  const pick = async () => { if (!window.electronAPI) return; const r = await window.electronAPI.pickPhotoFolder(); if (r) setPhotos(r.photos) }

  if (!photos.length) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:16 }}>
      <div style={{ fontSize:64 }}>📁</div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:22 }}>No photos yet</div>
      <div style={{ fontSize:14, color:'var(--text-muted)', textAlign:'center', maxWidth:340, lineHeight:1.6 }}>Choose a folder on this computer and HearthBoard will display all photos inside it automatically.</div>
      <TapButton onClick={pick} style={{ height:56, padding:'0 32px', borderRadius:28, background:accent, color:'#fff', fontWeight:700, fontSize:16, marginTop:8 }}>Choose Photo Folder</TapButton>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', gap:12 }}>
      <div style={{ flex:1, position:'relative', borderRadius:'var(--radius-lg)', overflow:'hidden', minHeight:0 }}>
        <img key={current} src={`file://${photos[current]}`} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top,rgba(0,0,0,0.4) 0%,transparent 40%)' }} />
        <div style={{ position:'absolute', bottom:16, left:0, right:0, display:'flex', justifyContent:'center', gap:6 }}>
          {photos.slice(0,12).map((_,i) => <div key={i} onClick={() => setCurrent(i)} style={{ width:i===current?22:7, height:7, borderRadius:4, background:i===current?'#fff':'rgba(255,255,255,0.4)', cursor:'pointer', transition:'all 0.3s' }} />)}
        </div>
        <div onClick={() => setCurrent(i=>(i-1+photos.length)%photos.length)} style={{ position:'absolute', left:0, top:0, bottom:0, width:'20%', cursor:'pointer' }} />
        <div onClick={() => setCurrent(i=>(i+1)%photos.length)} style={{ position:'absolute', right:0, top:0, bottom:0, width:'20%', cursor:'pointer' }} />
      </div>
      <div style={{ display:'flex', gap:8, overflowX:'auto', flexShrink:0, paddingBottom:4 }}>
        {photos.map((p,i) => <img key={i} src={`file://${p}`} alt="" onClick={() => setCurrent(i)} style={{ width:72, height:52, objectFit:'cover', borderRadius:10, flexShrink:0, cursor:'pointer', border:i===current?`2.5px solid ${accent}`:'2.5px solid transparent' }} />)}
        <TapButton onClick={pick} style={{ width:72, height:52, borderRadius:10, background:'var(--bg-card)', border:'1.5px dashed var(--border)', color:'var(--text-muted)', fontSize:22, flexShrink:0 }}>+</TapButton>
      </div>
    </div>
  )
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function SettingsModal({ familyMembers, setFamilyMembers, onClose, accent }) {
  const [name,  setName]  = useState('')
  const [color, setColor] = useState('#4A90D9')
  const add = () => { if (!name.trim()) return; setFamilyMembers(m=>[...m,{name:name.trim(),color}]); setName('') }

  return (
    <Modal onClose={onClose} width={420}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <h2 style={{ fontFamily:'var(--font-display)', fontSize:20 }}>Settings</h2>
        <TapButton onClick={onClose} style={{ width:36, height:36, borderRadius:8, background:'var(--bg-input)', color:'var(--text-sub)', fontSize:16 }}>✕</TapButton>
      </div>
      <Label>Family Members</Label>
      <div style={{ marginBottom:16 }}>
        {familyMembers.map((m,i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:'var(--radius-sm)', background:'var(--bg-card)', marginBottom:6 }}>
            <div style={{ width:16, height:16, borderRadius:'50%', background:m.color }} />
            <span style={{ flex:1, fontWeight:600 }}>{m.name}</span>
            <TapButton onClick={() => setFamilyMembers(fm=>fm.filter((_,j)=>j!==i))} style={{ width:32, height:32, borderRadius:8, minWidth:32, minHeight:32, background:'rgba(255,107,107,0.12)', color:'#FF6B6B', fontSize:13 }}>✕</TapButton>
          </div>
        ))}
        <div style={{ display:'flex', gap:8, marginTop:10, alignItems:'flex-end' }}>
          <div style={{ flex:1 }}><Label>Name</Label><Input value={name} onChange={e=>setName(e.target.value)} placeholder="Name" inputMode="text" onKeyDown={e=>e.key==='Enter'&&add()} /></div>
          <div><Label>Color</Label><input type="color" value={color} onChange={e=>setColor(e.target.value)} style={{ width:52, height:52, border:'1.5px solid var(--border)', borderRadius:'var(--radius-sm)', cursor:'pointer', background:'var(--bg-input)', padding:4 }} /></div>
          <TapButton onClick={add} style={{ height:52, padding:'0 18px', borderRadius:'var(--radius-sm)', background:accent, color:'#fff', fontWeight:700 }}>Add</TapButton>
        </div>
      </div>
    </Modal>
  )
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [storage, setStorage, loaded] = useStorage()
  const [tab,          setTab]          = useState('calendar')
  const [showGoogle,   setShowGoogle]   = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [googleEvents, setGoogleEvents] = useState([])
  const [syncing,      setSyncing]      = useState(false)
  const [photos,       setPhotos]       = useState([])

  const dark          = storage.darkMode    ?? true
  const accent        = storage.accentColor || '#FF7B5C'
  const accounts      = storage.accounts    || []
  const credentials   = storage.credentials || null
  const familyMembers = storage.familyMembers || []
  const chores        = storage.chores || []
  const meals         = storage.meals  || {}

  const set = (key) => (val) => setStorage(s => ({ ...s, [key]: typeof val==='function' ? val(s[key]) : val }))

  useEffect(() => {
    document.body.className = dark ? 'dark' : 'light'
    document.body.style.setProperty('--accent', accent)
  }, [dark, accent])

  const syncCalendars = useCallback(async () => {
    if (!accounts.length || !credentials) return
    setSyncing(true)
    const all = []
    for (const acc of accounts) {
      try {
        const token = await getToken(acc.id, credentials.clientId, credentials.clientSecret)
        for (const cal of (acc.calendars||[]).filter(c=>c.enabled!==false)) {
          const evs = await getEvents(token, cal.id, 60)
          evs.forEach(e => { e.calendarId = cal.id })
          all.push(...evs)
        }
      } catch(e) { console.warn('Sync failed for', acc.email, e.message) }
    }
    setGoogleEvents(all)
    setSyncing(false)
  }, [accounts, credentials])

  useEffect(() => { if (loaded) syncCalendars() }, [loaded])
  useEffect(() => { const t = setInterval(syncCalendars, 15*60000); return () => clearInterval(t) }, [syncCalendars])

  useEffect(() => {
    if (!loaded || !storage.photoFolder || !window.electronAPI) return
    window.electronAPI.scanPhotoFolder(storage.photoFolder).then(setPhotos)
  }, [loaded])

  if (!loaded) return <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#0f1117', fontSize:48 }}>🏡</div>

  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', background:'var(--bg)', overflow:'hidden' }}>
      <TopBar tab={tab} setTab={setTab} dark={dark} onToggleDark={() => set('darkMode')(!dark)} accent={accent} onAccentChange={set('accentColor')} onSettings={() => setShowSettings(true)} syncing={syncing} />

      {/* Google Calendar connect bar */}
      <div style={{ padding:'10px 20px 0', display:'flex', gap:10, alignItems:'center', flexShrink:0 }}>
        <TapButton onClick={() => setShowGoogle(true)} style={{ height:40, padding:'0 18px', borderRadius:20, background:accounts.length?'#4285F422':'var(--bg-card)', color:accounts.length?'#4285F4':'var(--text-sub)', border:`1.5px solid ${accounts.length?'#4285F4':'var(--border)'}`, fontWeight:600, fontSize:13, gap:8 }}>
          <svg width="14" height="14" viewBox="0 0 48 48"><path fill={accounts.length?'#4285F4':'currentColor'} d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/></svg>
          {accounts.length ? `${accounts.length} Google Account${accounts.length>1?'s':''}` : 'Connect Google Calendar'}
        </TapButton>
        {accounts.length>0 && (
          <TapButton onClick={syncCalendars} style={{ height:40, padding:'0 14px', borderRadius:20, background:'var(--bg-card)', color:'var(--text-sub)', fontSize:13 }}>
            {syncing ? '↻ Syncing…' : '↻ Sync'}
          </TapButton>
        )}
      </div>

      <div style={{ flex:1, padding:'12px 20px 20px', overflow:'hidden', display:'flex', flexDirection:'column', minHeight:0 }}>
        {tab==='calendar' && <CalendarView events={googleEvents} accounts={accounts} accent={accent} />}
        {tab==='chores'   && <ChoresView chores={chores} setChores={set('chores')} familyMembers={familyMembers} accent={accent} />}
        {tab==='meals'    && <MealsView meals={meals} setMeals={set('meals')} accent={accent} />}
        {tab==='photos'   && <PhotosView photoFolder={storage.photoFolder} photos={photos} setPhotos={(p) => { setPhotos(p) }} accent={accent} />}
      </div>

      {showGoogle   && <GooglePanel accounts={accounts} credentials={credentials} onAddAccount={acc => { set('accounts')(a=>[...(a||[]).filter(x=>x.id!==acc.id),acc]); syncCalendars() }} onRemoveAccount={id => set('accounts')(a=>(a||[]).filter(x=>x.id!==id))} onClose={() => setShowGoogle(false)} accent={accent} />}
      {showSettings && <SettingsModal familyMembers={familyMembers} setFamilyMembers={set('familyMembers')} onClose={() => setShowSettings(false)} accent={accent} />}
    </div>
  )
}
