import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { useApp } from '../lib/app-context'
import { wallpaper } from '../lib/wallpapers'
import { Glass } from '../components/ui'

export default function Login({ mode }: { mode: 'login' | 'setup' }) {
  const { status, user, refresh } = useApp()
  const navigate = useNavigate()
  const loc = useLocation()
  const [form, setForm] = useState({ email: '', password: '', name: '' })
  const [err, setErr] = useState(() => new URLSearchParams(window.location.search).get('error') || '')
  const [busy, setBusy] = useState(false)
  const [showPw, setShowPw] = useState(mode === 'setup')

  if (status && user) return <Navigate to={(loc.state as { from?: string })?.from || '/'} replace />
  if (status && mode === 'setup' && !status.needs_setup) return <Navigate to="/login" replace />
  if (status && mode === 'login' && status.needs_setup) return <Navigate to="/setup" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { await api.post(`${V1}/auth/${mode}`, form); await refresh(); navigate('/') } catch (e: unknown) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const from = (loc.state as { from?: string })?.from || '/'
  const sso = mode === 'login' && status?.oidc
  const pwAllowed = status?.password_login !== false
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const wp = wallpaper('pocket-ember')

  return (
    <div className="desk login-desk" style={{ ['--accent' as string]: wp.accent }}>
      <div className="wallpaper" style={{ background: wp.css }} aria-hidden="true" />
      <div className="wallpaper-noise" aria-hidden="true" />
      <div className="center">
        <Glass className="login">
          <img src="/pocket-ember.png" alt="" width={72} height={72} className="login-logo" />
          <div className="login-maker">POCKET HOMELAB</div><h1>Pocket Box</h1>
          <p className="muted">{mode === 'setup' ? 'Make yourself at home. Create your account.' : 'Your everyday, close to home.'}</p>
          {sso && <a className="btn primary lg block" href={`${V1}/auth/oidc/start?next=${encodeURIComponent(from)}`}>Welcome back. Sign in</a>}
          {sso && pwAllowed && !showPw && <button className="btn link" onClick={() => setShowPw(true)}>or use a password</button>}
          {(!sso || showPw) && pwAllowed && (
            <form onSubmit={submit} className="form">
              {mode === 'setup' && <label className="field"><span>Your name</span><input value={form.name} onChange={set('name')} autoFocus /></label>}
              <label className="field"><span>Email</span><input type="email" value={form.email} onChange={set('email')} required autoFocus={mode === 'login'} autoComplete="username" /></label>
              <label className="field"><span>Password</span><input type="password" value={form.password} onChange={set('password')} required minLength={mode === 'setup' ? 8 : 1} autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} /></label>
              <button className={`btn lg block ${sso ? '' : 'primary'}`} disabled={busy}>{busy ? 'Please wait…' : mode === 'setup' ? 'Create account' : 'Sign in'}</button>
            </form>
          )}
          {!sso && !pwAllowed && <p className="callout">Your box is still being prepared. Contact the person who set it up to finish connecting your account.</p>}
          {err && <p className="callout">{err}</p>}
          {status?.version && <p className="muted small">v{status.version.replace(/^v/, '')}</p>}
        </Glass>
      </div>
    </div>
  )
}
