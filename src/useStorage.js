import { useState, useEffect, useCallback } from 'react'

const DEFAULTS = {
  darkMode: true,
  accentColor: '#FF7B5C',
  credentials: null,
  accounts: [],
  familyMembers: [
    { name: 'Mom',  color: '#FF6B6B' },
    { name: 'Dad',  color: '#4A90D9' },
    { name: 'Emma', color: '#50C878' },
    { name: 'Jake', color: '#FFB347' },
  ],
  chores: [],
  meals: {
    Mon: { breakfast: '', lunch: '', dinner: '' },
    Tue: { breakfast: '', lunch: '', dinner: '' },
    Wed: { breakfast: '', lunch: '', dinner: '' },
    Thu: { breakfast: '', lunch: '', dinner: '' },
    Fri: { breakfast: '', lunch: '', dinner: '' },
    Sat: { breakfast: '', lunch: '', dinner: '' },
    Sun: { breakfast: '', lunch: '', dinner: '' },
  },
  photoFolder: null,
}

export function useStorage() {
  const [data,   setDataRaw] = useState(DEFAULTS)
  const [loaded, setLoaded]  = useState(false)

  useEffect(() => {
    async function load() {
      let stored = {}
      try {
        if (window.electronAPI) {
          stored = await window.electronAPI.getStorage() || {}
        } else {
          stored = JSON.parse(localStorage.getItem('hearthboard') || '{}')
        }
      } catch(e) {
        console.warn('Storage load error:', e)
      }

      // Strip any stale test keys
      const clean = Object.fromEntries(
        Object.entries(stored).filter(([k]) => k !== 'test')
      )

      // Inject credentials from .env at build time
      // Client never sees these — they're baked in at build
      const envId     = import.meta.env.VITE_GOOGLE_CLIENT_ID
      const envSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET
      if (envId && envSecret) {
        clean.credentials = { clientId: envId, clientSecret: envSecret }
      }

      setDataRaw(prev => ({ ...prev, ...clean }))
      setLoaded(true)
    }
    load()
  }, [])

  const setData = useCallback((updater) => {
    setDataRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
      try {
        if (window.electronAPI) {
          window.electronAPI.setStorage(next)
        } else {
          localStorage.setItem('hearthboard', JSON.stringify(next))
        }
      } catch(e) {
        console.warn('Storage save error:', e)
      }
      return next
    })
  }, [])

  return [data, setData, loaded]
}
