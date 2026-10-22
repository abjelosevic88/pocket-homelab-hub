import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api, V1 } from '../lib/api'
import { useApp } from '../lib/app-context'
import { Shield } from '../components/icons'

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

  return (
    <div className="login-page">
      <div className="login">
        <img src="/pocket-box.png" alt="" width={88} height={88} className="login-logo" />
        <h1>{mode === 'setup' ? 'Welcome to Pocket Box' : 'Welcome home'}</h1>
        <p>{mode === 'setup' ? 'Create your account to get started.' : 'Sign in to see your apps, photos and plans.'}</p>
        {sso && <a className="btn primary lg block" href={`${V1}/auth/oidc/start?next=${encodeURIComponent(from)}`}>Sign in</a>}
        {sso && pwAllowed && !showPw && <button className="btn link" onClick={() => setShowPw(true)}>Use a password instead</button>}
        {(!sso || showPw) && pwAllowed && (
          <form onSubmit={submit} className="form">
            {mode === 'setup' && <label className="field"><span>Your name</span><input value={form.name} onChange={set('name')} autoFocus /></label>}
            <label className="field"><span>Email</span><input type="email" value={form.email} onChange={set('email')} required autoFocus={mode === 'login'} autoComplete="username" /></label>
            <label className="field"><span>Password</span><input type="password" value={form.password} onChange={set('password')} required minLength={mode === 'setup' ? 8 : 1} autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} /></label>
            <button className={`btn lg block ${sso ? '' : 'primary'}`} disabled={busy}>{busy ? 'Please wait…' : mode === 'setup' ? 'Create account' : 'Sign in'}</button>
          </form>
        )}
        {!sso && !pwAllowed && <p className="callout">Your Pocket Box is still being set up. Ask the person who set it up to finish connecting your account.</p>}
        {err && <p className="callout" role="alert">{err}</p>}
        <div className="login-foot"><Shield size={14} />Private to your home{status?.version ? ` · v${status.version.replace(/^v/, '')}` : ''}</div>
      </div>
    </div>
  )
}
