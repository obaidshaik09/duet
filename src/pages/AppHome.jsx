import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ListenPage from './ListenPage.jsx';
import TodayPage from './TodayPage.jsx';
import SummaryPage from './SummaryPage.jsx';
import SettingsPage from './SettingsPage.jsx';
import { api, enqueueTurn, flushQueue, openEventStream } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

const TABS = [
  { id: 'listen', label: 'Listen' },
  { id: 'today', label: 'Today' },
  { id: 'summary', label: 'Summary' },
  { id: 'settings', label: 'Settings' },
];

export default function AppHome() {
  const { user, householdId, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState('listen');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [networkError, setNetworkError] = useState('');
  const [lastFailedTurn, setLastFailedTurn] = useState('');
  const [household, setHousehold] = useState(null);
  const [week, setWeek] = useState(1);
  const [caregivers, setCaregivers] = useState([]);
  const [memberId, setMemberId] = useState('');
  const [events, setEvents] = useState([]);
  const [counts, setCounts] = useState({ feeds: 0, naps: 0, diapers: 0 });
  const [openNap, setOpenNap] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [loggedEvents, setLoggedEvents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);

  const applyBootstrap = useCallback((data) => {
    setHousehold(data.household);
    setWeek(data.week);
    setCaregivers(data.caregivers || data.members || []);
    setMemberId(data.memberId);
    setEvents(data.events || []);
    setCounts(data.counts || { feeds: 0, naps: 0, diapers: 0 });
    setOpenNap(data.openNap || null);
  }, []);

  const applyEventsPayload = useCallback((data) => {
    if (data.events) setEvents(data.events);
    if (data.todaysEvents) setEvents(data.todaysEvents);
    if (data.counts) setCounts(data.counts);
    if ('openNap' in data) setOpenNap(data.openNap || null);
    if (data.caregivers) setCaregivers(data.caregivers);
  }, []);

  const load = useCallback(async () => {
    if (!householdId) {
      setLoading(false);
      return;
    }
    try {
      const data = await api.bootstrap();
      applyBootstrap(data);
      setError('');
    } catch (err) {
      setError(
        err.code === 'offline'
          ? 'You’re offline. Duet will load your household automatically when you reconnect.'
          : (err.message || 'Could not load household.'),
      );
    } finally {
      setLoading(false);
    }
  }, [householdId, applyBootstrap]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      nav('/login');
      return;
    }
    if (!householdId) {
      nav('/onboarding');
      return;
    }
    load();
  }, [user, householdId, authLoading, load, nav]);

  useEffect(() => {
    if (!householdId) return undefined;
    const refresh = () => {
      api.events().then(applyEventsPayload).catch(() => {});
    };
    let live = false;
    let ticks = 0;
    const stop = openEventStream(refresh, (v) => { live = v; });
    const poll = setInterval(() => {
      ticks += 1;
      if (!live || ticks % 5 === 0) refresh();
    }, 3000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop();
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [householdId, applyEventsPayload]);

  useEffect(() => {
    const on = () => {
      setOffline(false);
      flushQueue().finally(() => load());
    };
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [load]);

  async function handleTurn(raw) {
    const text = String(raw || '').trim();
    if (!text || busy) return;
    setBusy(true);
    setTranscript(text);
    setLoggedEvents([]);
    setNetworkError('');
    try {
      const data = await api.turn(text);
      setReply(data.reply || '');
      setLoggedEvents(data.events || []);
      applyEventsPayload(data);
      setLastFailedTurn('');
    } catch (err) {
      if (err.code === 'offline' || !navigator.onLine) {
        enqueueTurn(text);
        setNetworkError('Saved offline. Will sync when you reconnect.');
        setReply('Queued that entry for when you’re back online.');
      } else {
        setLastFailedTurn(text);
        setNetworkError(err.message || 'Request failed.');
        setReply('');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleWake() {
    setBusy(true);
    try {
      const data = await api.wakeNap();
      setReply(data.reply || '');
      applyEventsPayload(data);
      setLoggedEvents(data.event ? [data.event] : []);
    } catch (err) {
      setNetworkError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (authLoading || loading) {
    return <div className="app loading">Starting Duet…</div>;
  }

  if (error) {
    return (
      <div className="app error">
        <p>{error}</p>
        <button type="button" className="btn-primary" onClick={load}>Retry</button>
      </div>
    );
  }

  return (
    <div className="app">
      {offline ? <div className="offline-bar">You’re offline — entries will queue.</div> : null}
      <header className="app-header">
        <div className="brand">
          <h1>Duet</h1>
          <p>
            {household?.photoData ? <img className="baby-thumb" src={household.photoData} alt="" /> : null}
            {household?.babyName} · week {week}
          </p>
        </div>
        <button type="button" className="caregiver-pill" onClick={() => setTab('settings')}>
          {(caregivers.find((c) => c.id === memberId) || {}).name || 'You'}
        </button>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'listen' && (
          <ListenPage
            counts={counts}
            openNap={openNap}
            transcript={transcript}
            reply={reply}
            loggedEvents={loggedEvents}
            busy={busy}
            onTurn={handleTurn}
            setTranscript={setTranscript}
            onWake={handleWake}
            networkError={networkError}
            onRetry={() => (lastFailedTurn ? handleTurn(lastFailedTurn) : load())}
          />
        )}
        {tab === 'today' && (
          <TodayPage
            counts={counts}
            events={events}
            caregivers={caregivers}
            openNap={openNap}
            busy={busy}
            onWake={handleWake}
            onEdit={async (id, patch) => {
              setBusy(true);
              try {
                const data = await api.updateEvent(id, patch);
                applyEventsPayload(data);
              } catch (err) {
                setNetworkError(err.message);
              } finally {
                setBusy(false);
              }
            }}
            onDelete={async (id) => {
              if (!window.confirm('Delete this entry?')) return;
              setBusy(true);
              try {
                const data = await api.deleteEvent(id);
                applyEventsPayload(data);
                setReply('Removed that entry.');
              } catch (err) {
                setNetworkError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          />
        )}
        {tab === 'summary' && (
          <SummaryPage initialHint="Tap “Make today's note” for a short recap you can paste to a partner or bring to the pediatrician." />
        )}
        {tab === 'settings' && (
          <SettingsPage
            household={household}
            members={caregivers}
            memberId={memberId}
            onRefresh={load}
          />
        )}
      </main>

      <footer className="app-footer">
        Duet keeps the household in sync. It does not give medical advice.
      </footer>
    </div>
  );
}
