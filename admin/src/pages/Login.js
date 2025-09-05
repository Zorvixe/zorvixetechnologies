import React, { useState } from 'react'
import { useAuth } from '../auth'

import ZorvixeLogo from '../assets/zorvixe_logo.png';


import "./Login.css"

export default function Login({ onSuccess }) {
  const { login } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(identifier.trim(), password)
      onSuccess?.()
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="centerlogin">
      <div className="card" style={{ width: 420 }}>
        <div className='login_logo_container'>
          <img
            src={ZorvixeLogo}
            alt="Zorvixe Logo"
            className="zorvixe_login_logo"
          />
        </div>
        <form onSubmit={submit}>
          <div style={{ marginTop: 12 }}>
            <label>Email or Username</label>
            <input className="input" value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="admin@zorvixetechnologies.com or username" required />
          </div>
          <div style={{ marginTop: 12 }}>
            <label>Password</label>
            <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="********" required />
          </div>
          {error && <div style={{ marginTop: 12 }} className="small" role="alert">{error}</div>}
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button className="button primary" disabled={loading} type="submit">{loading ? 'Signing in…' : 'Login'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
