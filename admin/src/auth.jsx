// src/auth.jsx — contexte d'authentification (token en localStorage) + droits effectifs.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { login as apiLogin, me as apiMe } from './api';

const KEY = 'symbtech_admin_token';
const AuthContext = createContext(null);

const RANK = { none: 0, read: 1, write: 2 };

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(KEY));
  const [user, setUser] = useState(null);
  const [perms, setPerms] = useState(null);
  const [loading, setLoading] = useState(!!localStorage.getItem(KEY));

  const refresh = async (tk) => {
    const t = tk || token;
    if (!t) { setPerms(null); setLoading(false); return; }
    setLoading(true);
    try {
      const r = await apiMe(t);
      setUser(r.user || null);
      setPerms(r.perms || null);
    } catch (e) {
      // token invalide/expiré ou compte désactivé
      localStorage.removeItem(KEY);
      setToken(null); setUser(null); setPerms(null);
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); /* au chargement */ }, []);

  const signIn = async (email, password) => {
    const res = await apiLogin(email, password);
    localStorage.setItem(KEY, res.token);
    setToken(res.token);
    setUser(res.user);
    await refresh(res.token);
    return res;
  };

  const signOut = () => {
    localStorage.removeItem(KEY);
    setToken(null);
    setUser(null);
    setPerms(null);
  };

  // Droit sur un élément : 'read' ou 'write' (l'écriture implique la lecture).
  const can = (resource, level = 'read') => {
    if (!perms) return false;
    const have = (perms.permissions || {})[resource] || 'none';
    return (RANK[have] || 0) >= (RANK[level] || 0);
  };
  const isAdmin = !!(perms && perms.isAdmin);
  // Sociétés autorisées (vide + allCompanies = toutes)
  const allowedCompanies = perms && !perms.allCompanies ? (perms.companies || []) : null;

  return (
    <AuthContext.Provider value={{ token, user, perms, loading, signIn, signOut, refresh, can, isAdmin, allowedCompanies }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
