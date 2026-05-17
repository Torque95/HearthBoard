import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const IDLE_MS = 120_000; // screensaver idle timeout — change to taste (ms)
const PALETTE = ["#4A90D9","#FF6B6B","#50C878","#FFB347","#AB47BC","#26C6DA","#FF8A65","#A5D6A7"];

// ─── STORAGE ──────────────────────────────────────────────────────────────────
function useStorage() {
  const DEFAULTS = {
    darkMode: true,
    accentColor: "#FF7B5C",
    credentials: null,
    accounts: [],
    familyColor: "#9B59B6",
    chores: [],
    meals: {
      Mon:{b:"",l:"",d:""}, Tue:{b:"",l:"",d:""}, Wed:{b:"",l:"",d:""},
      Thu:{b:"",l:"",d:""}, Fri:{b:"",l:"",d:""}, Sat:{b:"",l:"",d:""}, Sun:{b:"",l:"",d:""},
    },
    photoFolder: null,
  };
  const [data, setRaw] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      let s = {};
      if (window.electronAPI) s = await window.electronAPI.getStorage() || {};
      else { try { s = JSON.parse(localStorage.getItem("hearthboard") || "{}"); } catch {} }
      setRaw(p => ({ ...p, ...s }));
      setLoaded(true);
    })();
  }, []);

  const set = useCallback((updater) => {
    setRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      if (window.electronAPI) window.electronAPI.setStorage(next);
      else localStorage.setItem("hearthboard", JSON.stringify(next));
      return next;
    });
  }, []);

  return [data, set, loaded];
}

// ─── USER COLOR — persists per email in localStorage ─────────────────────────
const getUserColor  = email => { try { return localStorage.getItem("hb_color_" + email) || null; } catch { return null; } };
const saveUserColor = (email, color) => { try { localStorage.setItem("hb_color_" + email, color); } catch {} };

// ─── OAUTH TOKEN HELPERS ──────────────────────────────────────────────────────
const saveToken   = (e, t) => localStorage.setItem("hb_tok_" + e, JSON.stringify(t));
const loadToken   = e => { try { return JSON.parse(localStorage.getItem("hb_tok_" + e)); } catch { return null; } };
const removeToken = e => localStorage.removeItem("hb_tok_" + e);

async function refreshToken(email, creds) {
  const tok = loadToken(email);
  if (!tok?.refresh_token) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: creds.clientId, client_secret: creds.clientSecret, refresh_token: tok.refresh_token, grant_type: "refresh_token" }),
  });
  const d = await r.json();
  if (d.access_token) {
    const u = { ...tok, access_token: d.access_token, expires_at: Date.now() + d.expires_in * 1000 };
    saveToken(email, u); return u.access_token;
  }
  return null;
}

async function getToken(email, creds) {
  const tok = loadToken(email);
  if (!tok) return null;
  if (tok.expires_at && Date.now() < tok.expires_at - 60000) return tok.access_token;
  return refreshToken(email, creds);
}

// ─── GOOGLE CALENDAR SYNC ─────────────────────────────────────────────────────
async function syncAccount(acc, creds) {
  const token = await getToken(acc.email, creds);
  if (!token) return [];
  const now    = new Date().toISOString();
  const future = new Date(Date.now() + 90 * 86400000).toISOString();
  const out = [];
  for (const cal of (acc.calendars || []).filter(c => c.enabled)) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?timeMin=${now}&timeMax=${future}&singleEvents=true&orderBy=startTime&maxResults=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      for (const item of data.items || []) {
        const start = item.start?.dateTime || item.start?.date || "";
        out.push({
          id: item.id,
          title: item.summary || "(no title)",
          date: start.split("T")[0],
          time: item.start?.dateTime ? (start.split("T")[1] || "").slice(0, 5) : "",
          allDay: !item.start?.dateTime,
          calendarId: cal.id,
          calendarName: cal.name,
          accountEmail: acc.email,
          userColor: acc.color || "#4A90D9",
          isFamily: false,
          location: item.location || "",
        });
      }
    } catch {}
  }
  return out;
}

// ─── TOUCH KEYBOARD ───────────────────────────────────────────────────────────
// Fires onboard OSK on Linux/Electron. On touch browsers the native OSK
// appears automatically — this is a no-op for them.
const triggerKeyboard = () => { if (window.electronAPI?.showKeyboard) window.electronAPI.showKeyboard(); };

function TInput({ value, onChange, placeholder, type = "text", style, onKeyDown }) {
  return (
    <input
      type={type} value={value} onChange={onChange} placeholder={placeholder}
      onKeyDown={onKeyDown} onFocus={triggerKeyboard}
      style={{
        width: "100%", background: "var(--bg-input)", border: "1.5px solid var(--border)",
        borderRadius: 10, padding: "10px 14px", color: "var(--text)", fontSize: 14,
        fontFamily: "inherit", outline: "none", boxSizing: "border-box", ...style,
      }}
    />
  );
}

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────
function Btn({ children, onClick, style, title, disabled }) {
  const ref = useRef(null);
  const go = e => {
    if (disabled) return;
    const el = ref.current;
    if (el) {
      const rip = document.createElement("span");
      const r = el.getBoundingClientRect(), sz = Math.max(r.width, r.height);
      rip.style.cssText = `position:absolute;width:${sz}px;height:${sz}px;left:${e.clientX-r.left-sz/2}px;top:${e.clientY-r.top-sz/2}px;border-radius:50%;background:rgba(255,255,255,0.22);animation:rip .5s ease-out forwards;pointer-events:none;`;
      el.appendChild(rip); setTimeout(() => rip.remove(), 600);
    }
    onClick?.(e);
  };
  return (
    <button ref={ref} onClick={go} title={title} disabled={disabled}
      style={{ border: "none", cursor: disabled ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", transition: "all .15s", outline: "none", fontFamily: "inherit", ...style }}>
      {children}
    </button>
  );
}

function Modal({ children, onClose, title, width = 480 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, backdropFilter: "blur(4px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg-card)", borderRadius: 20, padding: 28, width: `min(92vw,${width}px)`, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.5)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 20, gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--text)", flex: 1 }}>{title}</h2>
          <Btn onClick={onClose} style={{ width: 34, height: 34, borderRadius: 9, background: "var(--bg-input)", color: "var(--text-sub)", fontSize: 15 }}>✕</Btn>
        </div>
        {children}
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-sub)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>{children}</div>;
}

// ─── CLOCK ────────────────────────────────────────────────────────────────────
function Clock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  return (
    <div style={{ textAlign: "right", lineHeight: 1.2 }}>
      <div style={{ fontSize: 21, fontWeight: 800, color: "var(--text)" }}>{t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
      <div style={{ fontSize: 11, color: "var(--text-sub)", fontWeight: 600 }}>{t.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</div>
    </div>
  );
}

// ─── SCREENSAVER ──────────────────────────────────────────────────────────────
// After IDLE_MS of no interaction: fades in full-screen over everything.
// Any touch / click / key / mouse movement dismisses it.
function Screensaver({ photos, photoFolder }) {
  const [active,  setActive]  = useState(false);
  const [visible, setVisible] = useState(false);
  const [cur,     setCur]     = useState(0);
  const [next,    setNext]    = useState(1);
  const [phase,   setPhase]   = useState("idle"); // "idle" | "crossfade"
  const idleTimer  = useRef(null);
  const slideTimer = useRef(null);
  const activeRef  = useRef(false); // readable inside event callbacks without stale closure

  const toSrc = p => p ? `file://${p.replace(/\\/g, "/")}` : "";

  const wake = useCallback(() => {
    clearTimeout(idleTimer.current);

    if (activeRef.current) {
      setVisible(false);
      setTimeout(() => { setActive(false); activeRef.current = false; setCur(0); setNext(1); setPhase("idle"); }, 600);
    }

    idleTimer.current = setTimeout(() => {
      if (!photos.length || !photoFolder) return;
      setCur(0); setNext(Math.min(1, photos.length - 1));
      setActive(true); activeRef.current = true;
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    }, IDLE_MS);
  }, [photos.length, photoFolder]);

  useEffect(() => {
    const EVENTS = ["mousemove","mousedown","touchstart","keydown","wheel"];
    EVENTS.forEach(ev => window.addEventListener(ev, wake, { passive: true }));
    wake();
    return () => {
      EVENTS.forEach(ev => window.removeEventListener(ev, wake));
      clearTimeout(idleTimer.current);
      clearInterval(slideTimer.current);
    };
  }, [wake]);

  useEffect(() => {
    if (!active || photos.length < 2) return;
    slideTimer.current = setInterval(() => {
      setCur(c => {
        const n = (c + 1) % photos.length;
        setNext(n); setPhase("crossfade");
        setTimeout(() => setPhase("idle"), 2200);
        return n;
      });
    }, 10_000);
    return () => clearInterval(slideTimer.current);
  }, [active, photos.length]);

  if (!active) return null;

  return (
    <div onClick={wake} onTouchStart={wake}
      style={{ position: "fixed", inset: 0, zIndex: 500, background: "#000", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease-in-out", cursor: "none", userSelect: "none" }}>
      {/* Back layer — always the next photo */}
      {photos.length > 1 && (
        <img key={"b"+next} src={toSrc(photos[next])} alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }} />
      )}
      {/* Front layer — fades out on crossfade */}
      <img key={"f"+cur} src={toSrc(photos[cur])} alt=""
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: phase === "crossfade" ? 0 : 1, transition: phase === "crossfade" ? "opacity 2.2s ease-in-out" : "none", zIndex: 1 }} />
      {/* Clock */}
      <ScreensaverClock />
      {/* Wake hint */}
      <div style={{ position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)", fontSize: 13, color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "0.08em", zIndex: 3, pointerEvents: "none", animation: "ssHint 1s ease-in 4s both" }}>
        Tap anywhere to wake
      </div>
      <style>{`@keyframes ssHint { from { opacity:0 } to { opacity:1 } }`}</style>
    </div>
  );
}

function ScreensaverClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  return (
    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", zIndex: 2, pointerEvents: "none", textShadow: "0 4px 32px rgba(0,0,0,.9),0 1px 4px rgba(0,0,0,.9)" }}>
      <div style={{ fontSize: 80, fontWeight: 900, color: "#fff", lineHeight: 1, fontFamily: "'Nunito',sans-serif" }}>
        {t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
      <div style={{ fontSize: 20, color: "rgba(255,255,255,0.75)", fontWeight: 600, marginTop: 10, fontFamily: "'Nunito',sans-serif" }}>
        {t.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
      </div>
    </div>
  );
}

// ─── COLOR PICKER — shown on first Google login ───────────────────────────────
function PickColorModal({ name, email, existingColor, onConfirm, onClose }) {
  const [color, setColor] = useState(existingColor || PALETTE[0]);
  return (
    <Modal title={`Pick a color for ${name}`} onClose={onClose} width={360}>
      <div style={{ fontSize: 13, color: "var(--text-sub)", marginBottom: 16 }}>{email}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        {PALETTE.map(c => (
          <Btn key={c} onClick={() => setColor(c)} style={{ width: 46, height: 46, borderRadius: "50%", background: c, border: color === c ? "3px solid #fff" : "3px solid transparent", boxShadow: color === c ? `0 0 0 2px ${c}` : "none" }} />
        ))}
      </div>
      <Label>Custom</Label>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
        <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 52, height: 52, border: "1.5px solid var(--border)", borderRadius: 10, cursor: "pointer", padding: 4, background: "var(--bg-input)" }} />
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: color }} />
        <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 13 }}>{color}</span>
      </div>
      <Btn onClick={() => onConfirm(color)} style={{ width: "100%", height: 50, borderRadius: 12, background: color, color: "#fff", fontWeight: 800, fontSize: 15 }}>
        Use this color
      </Btn>
    </Modal>
  );
}

// ─── GOOGLE PANEL ─────────────────────────────────────────────────────────────
function GooglePanel({ accounts, credentials, onSaveCredentials, onAddAccount, onRemoveAccount, onClose, accent }) {
  const [cid,     setCid]     = useState(credentials?.clientId || "");
  const [csec,    setCsec]    = useState(credentials?.clientSecret || "");
  const [status,  setStatus]  = useState("");
  const [popup,   setPopup]   = useState(null);
  const [pending, setPending] = useState(null);

  const saveCreds = () => {
    if (!cid || !csec) { setStatus("❌ Both fields required"); return; }
    onSaveCredentials({ clientId: cid.trim(), clientSecret: csec.trim() });
    setStatus("✅ Saved");
  };

  const startAuth = () => {
    const c = credentials || { clientId: cid.trim(), clientSecret: csec.trim() };
    if (!c.clientId) { setStatus("❌ Save credentials first"); return; }
    const p = new URLSearchParams({ client_id: c.clientId, redirect_uri: "http://localhost", response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
      access_type: "offline", prompt: "consent" });
    const w = window.open(`https://accounts.google.com/o/oauth2/v2/auth?${p}`, "gauth", "width=500,height=650");
    setPopup(w); setStatus("⏳ Complete sign-in in the popup…");
  };

  const handleCode = async (code) => {
    const c = credentials || { clientId: cid.trim(), clientSecret: csec.trim() };
    setStatus("⏳ Connecting…");
    const tok = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: "http://localhost", grant_type: "authorization_code" }),
    }).then(r => r.json());
    if (!tok.access_token) { setStatus("❌ Auth failed"); return; }

    const [info, calData] = await Promise.all([
      fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } }).then(r => r.json()),
      fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50", { headers: { Authorization: `Bearer ${tok.access_token}` } }).then(r => r.json()),
    ]);
    saveToken(info.email, { ...tok, expires_at: Date.now() + tok.expires_in * 1000 });

    const calendars = (calData.items || [])
      .filter(c => !["en.usa#holiday","contacts"].some(s => c.id.includes(s)))
      .map((c, i) => ({ id: c.id, name: c.summary, enabled: c.selected !== false, color: c.backgroundColor || PALETTE[i % PALETTE.length] }));

    const storedColor = getUserColor(info.email);
    const fallback    = PALETTE[accounts.length % PALETTE.length];
    const accObj      = { id: info.email, email: info.email, name: info.name, picture: info.picture, color: storedColor || fallback, calendars };

    if (storedColor) {
      onAddAccount(accObj); setStatus(`✅ ${info.name} connected`);
    } else {
      setPending(accObj); setStatus("");
    }
  };

  useEffect(() => {
    if (!popup) return;
    const id = setInterval(() => {
      try {
        const url = popup.location?.href || "";
        if (url.startsWith("http://localhost")) {
          const code = new URL(url).searchParams.get("code");
          if (code) { popup.close(); setPopup(null); clearInterval(id); handleCode(code); }
        }
      } catch {}
      if (popup.closed) { clearInterval(id); setPopup(null); }
    }, 500);
    return () => clearInterval(id);
  }, [popup]);

  const handleColorConfirm = (color) => {
    saveUserColor(pending.email, color);
    onAddAccount({ ...pending, color });
    setStatus(`✅ ${pending.name} connected`);
    setPending(null);
  };

  return (
    <>
      <Modal title="Google Calendar" onClose={onClose} width={520}>
        <Label>OAuth Client ID</Label>
        <TInput value={cid} onChange={e => setCid(e.target.value)} placeholder="….apps.googleusercontent.com" style={{ marginBottom: 10 }} />
        <Label>OAuth Client Secret</Label>
        <TInput value={csec} onChange={e => setCsec(e.target.value)} placeholder="GOCSPX-…" style={{ marginBottom: 14 }} />
        <Btn onClick={saveCreds} style={{ height: 40, padding: "0 18px", borderRadius: 10, background: accent, color: "#fff", fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Save Credentials</Btn>

        {status && <div style={{ fontSize: 13, color: "var(--text-sub)", marginBottom: 14, padding: "8px 12px", borderRadius: 10, background: "var(--bg-input)" }}>{status}</div>}

        <Btn onClick={startAuth} style={{ height: 48, width: "100%", borderRadius: 12, background: "#4285F4", color: "#fff", fontWeight: 700, fontSize: 14, gap: 10, marginBottom: 20 }}>
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="white" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z" /></svg>
          Sign in with Google
        </Btn>

        {accounts.length > 0 && (
          <div>
            <Label>Connected accounts</Label>
            {accounts.map(acc => (
              <div key={acc.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, background: "var(--bg-input)", marginBottom: 8 }}>
                {acc.picture && <img src={acc.picture} style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} alt="" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{acc.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-sub)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{acc.email}</div>
                </div>
                {/* Color dot — tap to repick */}
                <div onClick={() => setPending(acc)} title="Tap to change color"
                  style={{ width: 24, height: 24, borderRadius: "50%", background: acc.color, border: "2px solid var(--border)", cursor: "pointer", flexShrink: 0 }} />
                <Btn onClick={() => { removeToken(acc.email); onRemoveAccount(acc.id); }}
                  style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,107,107,.15)", color: "#FF6B6B", fontSize: 13, flexShrink: 0 }}>✕</Btn>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {pending && (
        <PickColorModal name={pending.name} email={pending.email} existingColor={pending.color}
          onConfirm={handleColorConfirm}
          onClose={() => { setPending(null); setStatus(""); }} />
      )}
    </>
  );
}

// ─── SETTINGS MODAL ───────────────────────────────────────────────────────────
function SettingsModal({ familyColor, setFamilyColor, onClose }) {
  return (
    <Modal title="Settings" onClose={onClose} width={360}>
      <Label>Family event color</Label>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, background: "var(--bg-input)" }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: familyColor }} />
        <span style={{ flex: 1, fontSize: 13, color: "var(--text)" }}>Used when you mark an event as "Family"</span>
        <input type="color" value={familyColor} onChange={e => setFamilyColor(e.target.value)}
          style={{ width: 40, height: 40, border: "none", borderRadius: 8, cursor: "pointer", padding: 0 }} />
      </div>
      <div style={{ marginTop: 16, fontSize: 12, color: "var(--text-sub)", lineHeight: 1.6 }}>
        Each person's color is set when they sign in with Google. Tap their color dot in the Google panel to change it.
      </div>
    </Modal>
  );
}

// ─── EVENT TAP MODAL — family toggle ─────────────────────────────────────────
function EventModal({ event, familyColor, accounts, onToggleFamily, onClose }) {
  const owner = accounts.find(a => a.email === event.accountEmail);
  return (
    <Modal title={event.title} onClose={onClose} width={400}>
      <div style={{ fontSize: 12, color: "var(--text-sub)", marginBottom: 20 }}>
        {event.date}{event.time ? " · " + event.time : ""} · {event.calendarName}
        {owner && <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 6, background: owner.color + "33", color: owner.color, fontSize: 11, fontWeight: 700 }}>{owner.name}</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
        <div style={{ padding: 14, borderRadius: 12, background: "var(--bg-input)", border: event.isFamily ? "1.5px solid var(--border)" : `1.5px solid ${event.userColor}`, opacity: event.isFamily ? 0.6 : 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: event.userColor }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{owner?.name || "Personal"}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-sub)" }}>Personal event</div>
        </div>
        <div style={{ padding: 14, borderRadius: 12, background: "var(--bg-input)", border: event.isFamily ? `1.5px solid ${familyColor}` : "1.5px solid var(--border)", opacity: event.isFamily ? 1 : 0.6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: familyColor }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Family</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-sub)" }}>Shared event</div>
        </div>
      </div>
      <Btn onClick={() => { onToggleFamily(event.id); onClose(); }}
        style={{ width: "100%", height: 48, borderRadius: 12, background: event.isFamily ? event.userColor : familyColor, color: "#fff", fontWeight: 800, fontSize: 15 }}>
        {event.isFamily ? `Switch to ${owner?.name || "Personal"}` : "Mark as Family"}
      </Btn>
    </Modal>
  );
}

// ─── CALENDAR VIEW ────────────────────────────────────────────────────────────
function CalendarView({ events, accounts, familyColor, accent, onToggleFamily }) {
  const now = new Date();
  const [month,  setMonth]  = useState(now.getMonth());
  const [year,   setYear]   = useState(now.getFullYear());
  const [view,   setView]   = useState("month");
  const [tapped, setTapped] = useState(null);

  const eColor = e => e.isFamily ? familyColor : (e.userColor || accent);

  const nav = dir => {
    let m = month + dir, y = year;
    if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y);
  };

  const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const onDay    = d => { const ds = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; return events.filter(e => e.date === ds); };
  const todayStr = now.toISOString().split("T")[0];
  const upcoming = [...events].filter(e => e.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).slice(0, 20);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 10 }}>
      {/* Controls */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
        {["month","agenda"].map(v => (
          <Btn key={v} onClick={() => setView(v)} style={{ height: 36, padding: "0 16px", borderRadius: 18, background: view===v ? accent : "var(--bg-card)", color: view===v ? "#fff" : "var(--text-sub)", fontWeight: view===v ? 700 : 500, fontSize: 13 }}>
            {v[0].toUpperCase() + v.slice(1)}
          </Btn>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <Btn onClick={() => nav(-1)} style={{ width: 36, height: 36, borderRadius: 10, background: "var(--bg-card)", color: "var(--text)", fontSize: 18 }}>‹</Btn>
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", minWidth: 138, textAlign: "center" }}>{MONTHS[month]} {year}</span>
          <Btn onClick={() => nav(1)}  style={{ width: 36, height: 36, borderRadius: 10, background: "var(--bg-card)", color: "var(--text)", fontSize: 18 }}>›</Btn>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", flexShrink: 0, alignItems: "center" }}>
        {accounts.map(a => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-sub)" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: a.color }} />{a.name || a.email.split("@")[0]}
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-sub)" }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: familyColor }} />Family
        </div>
        {events.length > 0 && <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>Tap an event to toggle Family</span>}
      </div>

      {/* Month grid */}
      {view === "month" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1, marginBottom: 4 }}>
            {DAYS.map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-sub)", padding: "3px 0" }}>{d}</div>)}
          </div>
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7,1fr)", gridAutoRows: "1fr", gap: 3, minHeight: 0, overflow: "hidden" }}>
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const ds = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
              const isToday = ds === todayStr;
              const evts = onDay(d);
              return (
                <div key={i} style={{ background: isToday ? "rgba(255,123,92,.1)" : "var(--bg-card)", borderRadius: 10, padding: "5px 4px", display: "flex", flexDirection: "column", gap: 2, overflow: "hidden", border: isToday ? `1.5px solid ${accent}` : "1px solid var(--border)" }}>
                  <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? accent : "var(--text)", textAlign: "center", marginBottom: 2 }}>{d}</div>
                  {evts.slice(0, 3).map(e => (
                    <div key={e.id} onClick={() => setTapped(e)}
                      style={{ fontSize: 10, fontWeight: 600, padding: "2px 4px", borderRadius: 4, background: eColor(e)+"30", borderLeft: `2px solid ${eColor(e)}`, color: "var(--text)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", cursor: "pointer" }}>
                      {e.title}
                    </div>
                  ))}
                  {evts.length > 3 && <div style={{ fontSize: 9, color: "var(--text-muted)", textAlign: "center" }}>+{evts.length-3}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agenda */}
      {view === "agenda" && (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {!upcoming.length && <div style={{ color: "var(--text-sub)", textAlign: "center", padding: 40 }}>No upcoming events</div>}
          {upcoming.map(e => (
            <div key={e.id} onClick={() => setTapped(e)}
              style={{ display: "flex", gap: 12, padding: "10px 14px", borderRadius: 12, background: "var(--bg-card)", border: "1px solid var(--border)", cursor: "pointer", alignItems: "flex-start" }}>
              <div style={{ width: 4, borderRadius: 2, background: eColor(e), alignSelf: "stretch", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{e.title}</div>
                <div style={{ fontSize: 11, color: "var(--text-sub)", marginTop: 2 }}>
                  {e.date}{e.time ? " · "+e.time : ""}
                  {e.isFamily && <span style={{ marginLeft: 8, padding: "1px 6px", borderRadius: 6, background: familyColor+"33", color: familyColor, fontSize: 10, fontWeight: 700 }}>FAMILY</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tapped && (
        <EventModal event={tapped} familyColor={familyColor} accounts={accounts}
          onToggleFamily={id => onToggleFamily(id)}
          onClose={() => setTapped(null)} />
      )}
    </div>
  );
}

// ─── CHORES VIEW ──────────────────────────────────────────────────────────────
function ChoresView({ chores, setChores, accounts, accent }) {
  const [text,     setText]     = useState("");
  const [assignee, setAssignee] = useState("");

  const add    = () => { if (!text.trim()) return; setChores(c => [...(c||[]), { id: Date.now()+"", text: text.trim(), assignee, done: false }]); setText(""); setAssignee(""); };
  const toggle = id => setChores(c => c.map(x => x.id===id ? { ...x, done: !x.done } : x));
  const del    = id => setChores(c => c.filter(x => x.id!==id));
  const color  = email => accounts.find(a => a.email===email)?.color || accent;
  const name   = email => accounts.find(a => a.email===email)?.name  || email;

  const pending = (chores||[]).filter(c => !c.done);
  const done    = (chores||[]).filter(c =>  c.done);

  const Row = ({ c }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 12, background: "var(--bg-card)", border: "1px solid var(--border)", opacity: c.done ? 0.65 : 1 }}>
      <Btn onClick={() => toggle(c.id)} style={{ width: 30, height: 30, borderRadius: 8, background: c.done ? color(c.assignee) : "transparent", border: `2px solid ${color(c.assignee)}`, color: "#fff", fontSize: 14, flexShrink: 0 }}>
        {c.done ? "✓" : ""}
      </Btn>
      <div style={{ width: 4, height: 32, borderRadius: 2, background: color(c.assignee), flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", textDecoration: c.done ? "line-through" : "none", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{c.text}</div>
        {c.assignee && <div style={{ fontSize: 11, color: "var(--text-sub)", marginTop: 1 }}>{name(c.assignee)}</div>}
      </div>
      <Btn onClick={() => del(c.id)} style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,107,107,.1)", color: "#FF6B6B", fontSize: 13, flexShrink: 0 }}>✕</Btn>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12 }}>
      <div style={{ background: "var(--bg-card)", borderRadius: 14, padding: 16, border: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <TInput value={text} onChange={e => setText(e.target.value)} placeholder="Add a chore…" onKeyDown={e => e.key==="Enter" && add()} style={{ flex: 1 }} />
          <Btn onClick={add} style={{ height: 44, padding: "0 18px", borderRadius: 10, background: accent, color: "#fff", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>Add</Btn>
        </div>
        <select value={assignee} onChange={e => setAssignee(e.target.value)}
          style={{ width: "100%", background: "var(--bg-input)", border: "1.5px solid var(--border)", borderRadius: 10, padding: "10px 14px", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none" }}>
          <option value="">Unassigned</option>
          {accounts.map(a => <option key={a.id} value={a.email}>{a.name || a.email}</option>)}
        </select>
      </div>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {!pending.length && !done.length && <div style={{ textAlign: "center", color: "var(--text-sub)", padding: 40 }}>No chores! 🎉</div>}
        {pending.map(c => <Row key={c.id} c={c} />)}
        {done.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".1em", padding: "8px 0 4px" }}>Done ({done.length})</div>
            {done.map(c => <Row key={c.id} c={c} />)}
          </>
        )}
      </div>
    </div>
  );
}

// ─── MEALS VIEW ───────────────────────────────────────────────────────────────
function MealsView({ meals, setMeals }) {
  const DAYS  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const SLOTS = [{ key:"b", label:"🌅" }, { key:"l", label:"☀️" }, { key:"d", label:"🌙" }];
  const upd   = (day, key, val) => setMeals(m => ({ ...m, [day]: { ...(m?.[day]||{}), [key]: val } }));
  return (
    <div style={{ flex: 1, overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `60px repeat(${DAYS.length},1fr)`, gap: 6, minWidth: 580 }}>
        <div />
        {DAYS.map(d => <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: "var(--text-sub)", padding: "4px 0" }}>{d}</div>)}
        {SLOTS.map(s => (
          <>
            <div key={s.key+"_l"} style={{ display: "flex", alignItems: "center", fontSize: 18 }}>{s.label}</div>
            {DAYS.map(d => (
              <TInput key={d+s.key} value={meals?.[d]?.[s.key]||""} onChange={e => upd(d, s.key, e.target.value)} placeholder="—"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px", fontSize: 12 }} />
            ))}
          </>
        ))}
      </div>
    </div>
  );
}

// ─── PHOTOS VIEW ──────────────────────────────────────────────────────────────
// Pick a folder once. Electron watches it via chokidar and pushes updates.
// The Photos tab shows a fullscreen viewer. The screensaver handles idle display.
function PhotosView({ photoFolder, setPhotoFolder, photos, setPhotos, accent }) {
  const [cur,    setCur]    = useState(0);
  const [prev,   setPrev]   = useState(null);
  const [fading, setFading] = useState(false);
  const timerRef = useRef(null);

  // Register Electron push-updates from chokidar
  useEffect(() => {
    if (!window.electronAPI?.onPhotosUpdated) return;
    window.electronAPI.onPhotosUpdated(newPhotos => setPhotos(newPhotos));
  }, []);

  // Re-scan saved folder on mount (handles restarts)
  useEffect(() => {
    if (photoFolder && window.electronAPI?.scanPhotoFolder) {
      window.electronAPI.scanPhotoFolder(photoFolder).then(ps => { if (ps?.length) setPhotos(ps); });
    }
  }, [photoFolder]);

  // Photos-tab viewer slideshow
  useEffect(() => {
    if (photos.length < 2) return;
    timerRef.current = setInterval(() => {
      setCur(c => { const n = (c + 1) % photos.length; setPrev(c); return n; });
      setFading(true);
      setTimeout(() => setFading(false), 1800);
    }, 8000);
    return () => clearInterval(timerRef.current);
  }, [photos.length]);

  const pickFolder = async () => {
    if (!window.electronAPI?.pickPhotoFolder) { alert("Folder picker only works in the Electron app."); return; }
    const r = await window.electronAPI.pickPhotoFolder();
    if (!r) return;
    setPhotoFolder(r.folder); setPhotos(r.photos); setCur(0); setPrev(null);
  };

  const changeFolder = async () => {
    const r = await window.electronAPI?.pickPhotoFolder?.();
    if (!r) return;
    setPhotoFolder(r.folder); setPhotos(r.photos); setCur(0); setPrev(null);
  };

  const toSrc = p => p ? `file://${p.replace(/\\/g, "/")}` : "";

  if (!photoFolder) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 20 }}>
        <div style={{ fontSize: 52 }}>📷</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>Set up your photo slideshow</div>
        <div style={{ fontSize: 13, color: "var(--text-sub)", textAlign: "center", maxWidth: 340, lineHeight: 1.6 }}>
          Choose a folder once — HearthBoard watches it automatically. New photos show up in the screensaver right away.
        </div>
        <Btn onClick={pickFolder} style={{ height: 52, padding: "0 32px", borderRadius: 14, background: accent, color: "#fff", fontWeight: 800, fontSize: 15 }}>
          📁 Choose Photo Folder
        </Btn>
      </div>
    );
  }

  if (!photos.length) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16 }}>
        <div style={{ fontSize: 40 }}>🖼️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>No photos found</div>
        <div style={{ fontSize: 12, color: "var(--text-sub)" }}>{photoFolder}</div>
        <div style={{ fontSize: 12, color: "var(--text-sub)", marginBottom: 8 }}>Add .jpg / .png / .gif / .webp files to this folder.</div>
        <Btn onClick={changeFolder} style={{ height: 42, padding: "0 22px", borderRadius: 12, background: "var(--bg-card)", color: "var(--text-sub)", fontSize: 13, border: "1px solid var(--border)" }}>
          Change Folder
        </Btn>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12 }}>
      <div style={{ flex: 1, borderRadius: 16, overflow: "hidden", position: "relative", background: "#000", minHeight: 0 }}>
        {prev !== null && fading && (
          <img src={toSrc(photos[prev])} alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0, transition: "opacity 1.8s ease-in-out", zIndex: 1 }} />
        )}
        <img key={photos[cur]} src={toSrc(photos[cur])} alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 2 }} />
        <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6, zIndex: 3 }}>
          {photos.slice(0, 12).map((_, i) => (
            <div key={i} onClick={() => { setPrev(cur); setCur(i); }}
              style={{ width: i===cur ? 20 : 8, height: 8, borderRadius: 4, background: i===cur ? "#fff" : "rgba(255,255,255,.4)", cursor: "pointer", transition: "all .3s" }} />
          ))}
          {photos.length > 12 && <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", lineHeight: "8px" }}>+{photos.length-12}</div>}
        </div>
        <div style={{ position: "absolute", top: 12, right: 12, padding: "4px 10px", borderRadius: 20, background: "rgba(0,0,0,.5)", color: "#fff", fontSize: 11, fontWeight: 700, zIndex: 3 }}>
          {cur+1} / {photos.length}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-sub)", textTransform: "uppercase", letterSpacing: ".08em" }}>Photo folder</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{photoFolder}</div>
        </div>
        <Btn onClick={changeFolder} style={{ height: 38, padding: "0 16px", borderRadius: 10, background: "var(--bg-card)", color: "var(--text-sub)", fontSize: 12, border: "1px solid var(--border)", whiteSpace: "nowrap", flexShrink: 0 }}>
          Change Folder
        </Btn>
      </div>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: "calendar", label: "📅 Calendar" },
  { id: "chores",   label: "✅ Chores" },
  { id: "meals",    label: "🍽️ Meals" },
  { id: "photos",   label: "📷 Photos" },
];

export default function App() {
  const [storage, setStorage, loaded] = useStorage();
  const [tab,          setTab]          = useState("calendar");
  const [showGoogle,   setShowGoogle]   = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [googleEvents, setGoogleEvents] = useState([]);
  const [familyFlags,  setFamilyFlags]  = useState({});
  const [syncing,      setSyncing]      = useState(false);
  const [photos,       setPhotos]       = useState([]);

  const dark        = storage.darkMode ?? true;
  const accent      = storage.accentColor || "#FF7B5C";
  const accounts    = storage.accounts || [];
  const credentials = storage.credentials || null;
  const familyColor = storage.familyColor || "#9B59B6";
  const chores      = storage.chores || [];
  const meals       = storage.meals || {};
  const photoFolder = storage.photoFolder || null;
  const set = key => val => setStorage(s => ({ ...s, [key]: typeof val === "function" ? val(s[key]) : val }));

  // Merge family-toggle overrides into events
  const events = googleEvents.map(e => ({ ...e, isFamily: familyFlags[e.id] ?? e.isFamily }));

  // Apply CSS theme variables
  useEffect(() => {
    const r = document.documentElement.style;
    if (dark) {
      r.setProperty("--bg","#0F1117"); r.setProperty("--bg-card","#1A1D27"); r.setProperty("--bg-input","#13151F");
      r.setProperty("--text","#F0F0F6"); r.setProperty("--text-sub","rgba(240,240,246,.5)"); r.setProperty("--text-muted","rgba(240,240,246,.28)");
      r.setProperty("--border","rgba(255,255,255,.07)");
    } else {
      r.setProperty("--bg","#F4F4F6"); r.setProperty("--bg-card","#FFFFFF"); r.setProperty("--bg-input","#EBEBF0");
      r.setProperty("--text","#1A1A2E"); r.setProperty("--text-sub","rgba(26,26,46,.5)"); r.setProperty("--text-muted","rgba(26,26,46,.28)");
      r.setProperty("--border","rgba(0,0,0,.08)");
    }
    document.body.style.cssText = "margin:0;background:var(--bg);font-family:'Nunito',sans-serif;";
  }, [dark]);

  // Google Calendar sync — on load + every 15 min
  const sync = useCallback(async () => {
    if (!credentials || !accounts.length) return;
    setSyncing(true);
    const all = [];
    for (const acc of accounts) all.push(...await syncAccount(acc, credentials));
    setGoogleEvents(all); setSyncing(false);
  }, [credentials, accounts]);

  useEffect(() => {
    if (loaded && accounts.length && credentials) {
      sync();
      const id = setInterval(sync, 15 * 60 * 1000);
      return () => clearInterval(id);
    }
  }, [loaded, accounts.length, !!credentials]);

  const toggleFamily = id => setFamilyFlags(f => ({ ...f, [id]: !events.find(e => e.id===id)?.isFamily }));

  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#fff", fontSize: 18 }}>Loading HearthBoard…</div>;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--text)", overflow: "hidden", position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 2px; }
        @keyframes rip { to { transform: scale(2.5); opacity: 0; } }
        @keyframes ssHint { from { opacity: 0; } to { opacity: 1; } }
        select option { background: #1A1D27; color: #F0F0F6; }
      `}</style>

      {/* Screensaver — sits at zIndex 500, only mounts when idle */}
      <Screensaver photos={photos} photoFolder={photoFolder} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0, gap: 12 }}>
        <span style={{ fontSize: 21 }}>🏡</span>
        <span style={{ fontSize: 18, fontWeight: 900, color: accent }}>HearthBoard</span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <Btn onClick={() => set("darkMode")(!dark)} style={{ width: 38, height: 38, borderRadius: 10, background: "var(--bg-card)", color: "var(--text)", fontSize: 16, border: "1px solid var(--border)" }}>
            {dark ? "☀️" : "🌙"}
          </Btn>
          <div style={{ position: "relative", width: 38, height: 38 }} title="Accent color">
            <input type="color" value={accent} onChange={e => set("accentColor")(e.target.value)}
              style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%", cursor: "pointer" }} />
            <div style={{ width: 38, height: 38, borderRadius: 10, background: accent, border: "2px solid var(--border)", pointerEvents: "none" }} />
          </div>
          <Btn onClick={() => setShowSettings(true)} style={{ width: 38, height: 38, borderRadius: 10, background: "var(--bg-card)", color: "var(--text)", fontSize: 16, border: "1px solid var(--border)" }}>⚙️</Btn>
          <Btn onClick={() => setShowGoogle(true)} style={{ height: 38, padding: "0 14px", borderRadius: 10, background: accounts.length ? "#4285F422" : "var(--bg-card)", color: accounts.length ? "#4285F4" : "var(--text-sub)", border: `1.5px solid ${accounts.length ? "#4285F4" : "var(--border)"}`, fontWeight: 600, fontSize: 13, gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 48 48"><path fill={accounts.length ? "#4285F4" : "currentColor"} d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/></svg>
            {accounts.length ? `${accounts.length} Account${accounts.length > 1 ? "s" : ""}` : "Connect Google"}
          </Btn>
          {accounts.length > 0 && (
            <Btn onClick={sync} style={{ height: 38, padding: "0 12px", borderRadius: 10, background: "var(--bg-card)", color: syncing ? accent : "var(--text-sub)", fontSize: 13, border: "1px solid var(--border)" }}>
              {syncing ? "↻ Syncing…" : "↻ Sync"}
            </Btn>
          )}
          <Clock />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", padding: "0 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        {TABS.map(t => (
          <Btn key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 18px", background: "transparent", color: tab===t.id ? "var(--text)" : "var(--text-sub)", fontWeight: tab===t.id ? 800 : 500, fontSize: 13, borderBottom: tab===t.id ? `2.5px solid ${accent}` : "2.5px solid transparent", borderRadius: 0 }}>
            {t.label}
          </Btn>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: "14px 20px", overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
        {tab === "calendar" && <CalendarView events={events} accounts={accounts} familyColor={familyColor} accent={accent} onToggleFamily={toggleFamily} />}
        {tab === "chores"   && <ChoresView chores={chores} setChores={set("chores")} accounts={accounts} accent={accent} />}
        {tab === "meals"    && <MealsView meals={meals} setMeals={set("meals")} />}
        {tab === "photos"   && <PhotosView photoFolder={photoFolder} setPhotoFolder={set("photoFolder")} photos={photos} setPhotos={setPhotos} accent={accent} />}
      </div>

      {showGoogle && (
        <GooglePanel accounts={accounts} credentials={credentials}
          onSaveCredentials={set("credentials")}
          onAddAccount={acc => set("accounts")(a => [...(a||[]).filter(x => x.id!==acc.id), acc])}
          onRemoveAccount={id => set("accounts")(a => (a||[]).filter(x => x.id!==id))}
          onClose={() => setShowGoogle(false)} accent={accent} />
      )}
      {showSettings && (
        <SettingsModal familyColor={familyColor} setFamilyColor={set("familyColor")} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
