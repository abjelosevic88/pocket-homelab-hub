import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './app.css'
import './widgets.css'
import { AppProvider, useApp } from './lib/app-context'
import { Spinner } from './components/ui'
import { ErrorBoundary } from './components/ErrorBoundary'
import Layout from './components/Layout'
import Login from './pages/Login'
import HomePage from './pages/Home'
import LibraryPage from './pages/Library'
import ActivityPage from './pages/Activity'
import TodayPage from './pages/Today'
import SettingsPage from './pages/Settings'
import HelpPage from './pages/Help'
import { useAppearance } from './lib/theme'

function Gate({ children }: { children: React.ReactNode }) {
  const { status, user } = useApp()
  const loc = useLocation()
  if (!status) return <div className="center"><Spinner /></div>
  if (status.needs_setup) return <Navigate to="/setup" replace />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  return <>{children}</>
}

function App() {
  const { launcher, prefs } = useApp()
  useAppearance(launcher ? prefs : null)
  return (
    <Routes>
      <Route path="/login" element={<Login mode="login" />} />
      <Route path="/setup" element={<Login mode="setup" />} />
      <Route element={<Gate><Layout /></Gate>}>
        <Route path="/" element={<HomePage />} />
        <Route path="/app/:key" element={null} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/apps" element={<LibraryPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary><AppProvider><App /></AppProvider></ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
)


