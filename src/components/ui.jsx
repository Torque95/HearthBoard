import { useCallback, useRef } from 'react'

export function useRipple(color = 'rgba(255,255,255,0.25)') {
  const ref = useRef(null)
  const trigger = useCallback((e) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const size = Math.max(rect.width, rect.height) * 2
    const ripple = document.createElement('span')
    ripple.className = 'ripple'
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${clientX-rect.left-size/2}px;top:${clientY-rect.top-size/2}px;background:${color};position:absolute;border-radius:50%;animation:ripple-expand 0.5s ease-out forwards;pointer-events:none;`
    el.appendChild(ripple)
    ripple.addEventListener('animationend', () => ripple.remove())
  }, [color])
  return { ref, props: { ref, onTouchStart: trigger, onMouseDown: trigger, style: { position:'relative', overflow:'hidden' } } }
}

export function TapButton({ onClick, children, style = {}, className = '', rippleColor, disabled = false }) {
  const ripple = useRipple(rippleColor)
  return (
    <button {...ripple.props} onClick={onClick} disabled={disabled} className={className}
      style={{ minHeight:48, minWidth:48, border:'none', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', ...ripple.props.style, ...style, opacity: disabled ? 0.45 : 1 }}>
      {children}
    </button>
  )
}

export function Modal({ onClose, children, width = 480 }) {
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,0.65)', display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'var(--bg-modal)', borderRadius:'var(--radius-lg)', border:'1px solid var(--border)', padding:32, width, maxWidth:'calc(100vw - 40px)', maxHeight:'calc(100vh - 80px)', overflowY:'auto', boxShadow:'var(--shadow)' }}>
        {children}
      </div>
    </div>
  )
}

export function Input({ style = {}, ...props }) {
  return (
    <input
      style={{ width:'100%', height:52, padding:'0 16px', borderRadius:'var(--radius-sm)', background:'var(--bg-input)', border:'1.5px solid var(--border)', color:'var(--text)', fontSize:15, fontFamily:'inherit', outline:'none', boxSizing:'border-box', ...style }}
      onFocus={e => e.target.style.borderColor = 'var(--accent, #FF7B5C)'}
      onBlur={e  => e.target.style.borderColor = 'var(--border)'}
      {...props}
    />
  )
}

export function Label({ children, style = {} }) {
  return <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:6, ...style }}>{children}</div>
}
