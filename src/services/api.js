import { apiUrl } from '../config.js';

const TOKEN_KEY = 'duet_token';
const HOUSEHOLD_KEY = 'duet_household_id';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getHouseholdId() {
  return localStorage.getItem(HOUSEHOLD_KEY) || '';
}

export function setHouseholdId(id) {
  if (id) localStorage.setItem(HOUSEHOLD_KEY, id);
  else localStorage.removeItem(HOUSEHOLD_KEY);
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const householdId = options.householdId || getHouseholdId();
  if (householdId) headers['X-Household-Id'] = householdId;

  let res;
  try {
    res = await fetch(apiUrl(path), { ...options, headers, credentials: 'include' });
  } catch {
    const err = new Error('You appear to be offline. Your entry was saved locally and will retry.');
    err.code = 'offline';
    throw err;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.error?.code || data?.code;
    err.payload = data;
    throw err;
  }
  return data;
}

export const api = {
  health: () => request('/api/health'),
  signup: (body) => request('/api/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request('/api/auth/logout', { method: 'POST', body: '{}' }),
  me: () => request('/api/auth/me'),
  createHousehold: (body) => request('/api/households', { method: 'POST', body: JSON.stringify(body) }),
  joinInvite: (body) => request('/api/invites/join', { method: 'POST', body: JSON.stringify(body) }),
  bootstrap: () => request('/api/bootstrap'),
  events: () => request('/api/events'),
  turn: (transcript) => request('/api/turn', { method: 'POST', body: JSON.stringify({ transcript }) }),
  summary: () => request('/api/summary', { method: 'POST', body: '{}' }),
  updateEvent: (id, body) => request(`/api/events/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteEvent: (id) => request(`/api/events/${id}`, { method: 'DELETE' }),
  wakeNap: () => request('/api/naps/wake', { method: 'POST', body: '{}' }),
  updateHousehold: (body) => request('/api/household', { method: 'PATCH', body: JSON.stringify(body) }),
  rotateInvite: () => request('/api/household/invite/rotate', { method: 'POST', body: '{}' }),
  updateMember: (id, body) => request(`/api/members/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  removeMember: (id) => request(`/api/members/${id}`, { method: 'DELETE' }),
  exportData: () => request('/api/export'),
  deleteHousehold: () => request('/api/household', { method: 'DELETE' }),
};

const QUEUE_KEY = 'duet_offline_queue';

export function enqueueTurn(transcript) {
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  q.push({ transcript, at: Date.now() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export async function flushQueue() {
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  if (!q.length) return [];
  const remaining = [];
  const results = [];
  for (const item of q) {
    try {
      results.push(await api.turn(item.transcript));
    } catch {
      remaining.push(item);
    }
  }
  localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  return results;
}

/**
 * Authenticated SSE with automatic reconnect after drops (phone lock, network blip).
 * onLive(true) fires once messages actually arrive; some proxies accept the stream but never deliver it.
 */
export function openEventStream(onMessage, onLive = () => {}) {
  const token = getToken();
  const householdId = getHouseholdId();
  if (!token || !householdId) return () => {};

  let stopped = false;
  let controller = null;
  let retryTimer = null;
  let delay = 1000;

  async function connect() {
    if (stopped) return;
    controller = new AbortController();
    try {
      const res = await fetch(apiUrl(`/api/stream?householdId=${encodeURIComponent(householdId)}`), {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Household-Id': householdId,
        },
        signal: controller.signal,
        credentials: 'include',
      });
      if (!res.ok || !res.body) throw new Error('stream failed');
      delay = 1000;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          onLive(true);
          try {
            onMessage(JSON.parse(line.slice(6)));
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      if (stopped || err?.name === 'AbortError') return;
    }
    onLive(false);
    if (!stopped) {
      retryTimer = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 15000);
    }
  }

  connect();

  return () => {
    stopped = true;
    clearTimeout(retryTimer);
    try { controller?.abort(); } catch { /* ignore */ }
  };
}
