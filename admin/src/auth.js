"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { apiLogin, apiMe, apiLogout, setToken, clearToken, getToken } from "./api"

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

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
      }) // make sure we reset user too
      .finally(() => setLoading(false))
  }, [])

  const login = async (identifier, password) => {
    const data = await apiLogin(identifier, password)
    setToken(data.token)
    const me = await apiMe()
    setUser(me.me)
    return me.me
  }

  const logout = async () => {
    try {
      await apiLogout()
    } catch {}
    clearToken()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
}
