// src/auth.jsx — contexte d'authentification, token en localStorage.
import React, { createContext, useContext, useState } from 'react';
import { login as apiLogin } from './api';

const KEY = 'symbtech_admin_token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(KEY));
  const [user, setUser] = useState(null);

  const signIn = async (email, password) => {
    const res = await apiLogin(email, password);
    localStorage.setItem(KEY, res.token);
    setToken(res.token);
    setUser(res.user);
    return res;
  };

  const signOut = () => {
    localStorage.removeItem(KEY);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
