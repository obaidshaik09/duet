import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getHouseholdId, setHouseholdId, setToken, getToken } from '../services/api.js';

const AuthContext = createContext(null);
const CACHE_KEY = 'duet_me_cache';

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; }
}

function writeCache(data) {
  if (data) localStorage.setItem(CACHE_KEY, JSON.stringify({ user: data.user, households: data.households || [] }));
  else localStorage.removeItem(CACHE_KEY);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [households, setHouseholds] = useState([]);
  const [householdId, setHouseholdIdState] = useState(getHouseholdId());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setHouseholds([]);
      setLoading(false);
      return null;
    }
    try {
      const data = await api.me();
      setUser(data.user);
      setHouseholds(data.households || []);
      writeCache(data);
      const current = getHouseholdId();
      const stillMember = data.households?.some((h) => h.id === current);
      if ((!current || !stillMember) && data.households?.[0]) {
        setHouseholdId(data.households[0].id);
        setHouseholdIdState(data.households[0].id);
      } else if (current && !stillMember) {
        setHouseholdId('');
        setHouseholdIdState('');
      }
      return data;
    } catch (err) {
      const cached = readCache();
      if (err.status !== 401 && cached?.user) {
        // Offline launch: stay signed in with the last known profile.
        setUser(cached.user);
        setHouseholds(cached.households);
        return cached;
      }
      setToken('');
      writeCache(null);
      setUser(null);
      setHouseholds([]);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({
    user,
    households,
    householdId,
    loading,
    async signup(form) {
      const data = await api.signup(form);
      setToken(data.token);
      writeCache(data);
      setUser(data.user);
      setHouseholds(data.households || []);
      return data;
    },
    async login(form) {
      const data = await api.login(form);
      setToken(data.token);
      writeCache(data);
      setUser(data.user);
      setHouseholds(data.households || []);
      if (data.households?.[0]) {
        setHouseholdId(data.households[0].id);
        setHouseholdIdState(data.households[0].id);
      }
      return data;
    },
    async logout() {
      try { await api.logout(); } catch { /* ignore */ }
      setToken('');
      writeCache(null);
      setHouseholdId('');
      setHouseholdIdState('');
      setUser(null);
      setHouseholds([]);
    },
    selectHousehold(id) {
      setHouseholdId(id);
      setHouseholdIdState(id);
    },
    refresh,
  }), [user, households, householdId, loading, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
