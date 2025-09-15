import React, { createContext, useContext, useState, useEffect } from "react";
import { apiLogin, apiMe } from "./api";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (token) {
      localStorage.setItem("token", token);
      apiMe()
        .then((me) => setUser(me.me || me))
        .catch(() => logout());
    } else {
      localStorage.removeItem("token");
      setUser(null);
    }
  }, [token]);

  const login = async (identifier, password) => {
    const data = await apiLogin(identifier, password);
    console.log("Login response:", data);

    // detect token in response
    const t = data.token || (data.data && data.data.token);
    if (!t) throw new Error("Login response did not include token!");

    setToken(t);

    const me = await apiMe();
    setUser(me.me || me);
    return me.me || me;
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
