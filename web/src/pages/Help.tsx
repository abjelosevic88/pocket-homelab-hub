import { Link } from 'react-router-dom'
import { useApp } from '../lib/app-context'
import { capture } from '../lib/daily-context'
import { Grid, Phone, Plus, Search, Shield, Sun } from '../components/icons'
import { PhoneSteps } from './Home'

// A short guide written for people who have never run a server.
export default function HelpPage() {
  const { setPalette, launcher } = useApp()
  const box = launcher?.box?.name || 'Pocket Box'
  return (
    <div className="page narrow">
      <header className="page-head"><div><h1>Help</h1><p>Everything you need to know to get comfortable with {box}.</p></div></header>

      <section className="help-grid">
        <div className="help-card"><span><Grid /></span><div><h3>Open an app</h3><p>Tap any app on <Link to="/">Home</Link> or in <Link to="/apps">Apps</Link>. It opens right here, and stays open while you switch between apps.</p></div></div>
        <div className="help-card"><span><Search /></span><div><h3>Find anything</h3><p>Search for an app by name, or by what you want to do — “photos”, “recipes”, “budget”. <button className="text-button" onClick={() => setPalette(true)}>Try it</button></p></div></div>
        <div className="help-card"><span><Plus /></span><div><h3>Jot something down</h3><p>The <b>New</b> button adds a task, a note or a journal memory from anywhere — even while another app is open. <button className="text-button" onClick={() => capture()}>Try it</button></p></div></div>
        <div className="help-card"><span><Sun /></span><div><h3>Make it yours</h3><p>Choose light or dark, a colour and a bigger text size in <Link to="/settings">Settings</Link>. Star the apps you use most to keep them in the sidebar.</p></div></div>
      </section>

      <section className="settings-section">
        <h2><span style={{ verticalAlign: '-3px', marginRight: 8 }}><Phone /></span>Use it on your phone</h2>
        <p>Pocket Box works in any browser. Add it to your home screen and it opens like a normal app.</p>
        <PhoneSteps />
      </section>

      <section className="settings-section">
        <h2>Questions</h2>
        <div className="faq">
          <details><summary>What is a Pocket Box?</summary><div>A small computer that lives in your home and keeps your photos, files, notes, plans and more. Your things stay on the box — not on someone else’s cloud — and you can reach them from your phone, tablet or computer.</div></details>
          <details><summary>Who can see my things?</summary><div><span style={{ verticalAlign: '-4px', marginRight: 6 }}><Shield size={18} /></span>Everyone in your household has their own account. The Pocket apps keep each person’s notes, tasks, plans and journal separate, so other members don’t see yours.</div></details>
          <details><summary>An app says it isn’t responding</summary><div>Wait a minute and try again — apps sometimes restart to update themselves. If it keeps happening, check that the box is switched on and connected, then tell the person who looks after it.</div></details>
          <details><summary>An app asks me to sign in again</summary><div>Open the app’s details (press and hold its icon, or use ⋯ in Apps) and choose <b>New tab</b>. Sign in there once, then come back and reload the app.</div></details>
          <details><summary>Can I use it when I’m away from home?</summary><div>Yes, if your box was set up for it. Use the same address you use at home. If it doesn’t load, ask the person who set up the box to connect your device.</div></details>
          <details><summary>Is my data backed up?</summary><div>Ask the person who looks after your box how backups are set up and where copies are kept.</div></details>
        </div>
      </section>

      <section className="settings-section">
        <h2>Keyboard shortcuts</h2>
        <div className="card-surface panel pad">
          <div className="shortcut-list">
            <span><kbd>⌘</kbd> / <kbd>Ctrl</kbd> + <kbd>K</kbd></span><span>Search apps</span>
            <span><kbd>⌘</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>K</kbd></span><span>Add a task, note or memory</span>
            <span><kbd>Esc</kbd></span><span>Close a window</span>
          </div>
        </div>
      </section>
    </div>
  )
}
