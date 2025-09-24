"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { apiLogin, apiMe, apiLogout, setToken, clearToken, getToken } from "./api"

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Helper: schedule auto logout at midnight
  const scheduleMidnightLogout = () => {
    const now = new Date()
    const midnight = new Date(now)
    midnight.setHours(24, 0, 0, 0) // today 24:00 = tomorrow 00:00

    const msUntilMidnight = midnight.getTime() - now.getTime()

    // Clear any existing timer
    if (window._midnightTimer) clearTimeout(window._midnightTimer)

    // Schedule logout
    window._midnightTimer = setTimeout(() => {
      logout()
      // re-schedule for next midnight
      scheduleMidnightLogout()
    }, msUntilMidnight)
  }

  useEffect(() => {
    if (!getToken()) {
      setLoading(false)
      return
    }
    apiMe()
      .then((res) => setUser(res.me))
      .catch(() => {
        clearToken()
        setUser(null)
      })
      .finally(() => setLoading(false))

    // Always schedule auto logout at mount
    scheduleMidnightLogout()

    return () => {
      if (window._midnightTimer) clearTimeout(window._midnightTimer)
    }
  }, [])

  const login = async (identifier, password) => {
    const data = await apiLogin(identifier, password)
    setToken(data.token)
    const me = await apiMe()
    setUser(me.me)
    scheduleMidnightLogout() // reschedule after login
    return me.me
  }

  const logout = async () => {
    try {
      await apiLogout()
    } catch { }
    clearToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
