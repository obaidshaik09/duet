import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { relTime } from '../utils/format.js';

export default function SettingsPage({ household, members, memberId, onRefresh }) {
  const { logout, user } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({
    babyName: household?.babyName || '',
    birthDate: household?.birthDate || '',
    photoData: household?.photoData || '',
  });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm({
      babyName: household?.babyName || '',
      birthDate: household?.birthDate || '',
      photoData: household?.photoData || '',
    });
  }, [household]);

  async function saveBaby(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.updateHousehold(form);
      setMsg('Baby settings saved.');
      onRefresh?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 900000) {
      setError('Photo must be under ~900KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, photoData: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  async function rotate() {
    setBusy(true);
    try {
      await api.rotateInvite();
      setMsg('Invite code rotated.');
      onRefresh?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function exportData() {
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `duet-${household?.babyName || 'export'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  async function destroy() {
    if (!window.confirm('Delete this household and all care logs permanently?')) return;
    setBusy(true);
    try {
      await api.deleteHousehold();
      await logout();
      nav('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <section className="panel settings">
      <div className="settings-head">
        <h2>Settings</h2>
        <Link to="/app">Back</Link>
      </div>
      {msg ? <div className="banner ok">{msg}</div> : null}
      {error ? <div className="banner error">{error}</div> : null}

      <form className="stack cardish" onSubmit={saveBaby}>
        <h3>Baby</h3>
        {form.photoData ? <img className="baby-photo" src={form.photoData} alt="" /> : null}
        <label>Photo<input type="file" accept="image/*" onChange={onPhoto} /></label>
        <label>Name<input value={form.babyName} onChange={(e) => setForm({ ...form, babyName: e.target.value })} /></label>
        <label>Birth date<input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></label>
        <button className="btn-primary" disabled={busy}>Save</button>
      </form>

      <div className="stack cardish">
        <h3>Invite caregivers</h3>
        <div className="invite-code">{household?.inviteCode}</div>
        <p className="muted">They create an account, then join with this code on their phone.</p>
        <button type="button" className="btn-ghost" onClick={rotate} disabled={busy}>Rotate code</button>
      </div>

      <div className="stack cardish">
        <h3>Caregivers</h3>
        <ul className="member-list">
          {(members || []).map((m) => (
            <li key={m.id}>
              <span>
                {m.name} · {m.role}{m.id === memberId ? ' (you)' : ''}
              </span>
              <span className="muted">
                {m.lastLoggedAt ? `Last log ${relTime(m.lastLoggedAt)}` : 'No logs yet'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="stack cardish">
        <h3>Your data</h3>
        <button type="button" className="btn-ghost" onClick={exportData}>Export household JSON</button>
        <button type="button" className="btn-ghost danger" onClick={destroy} disabled={busy}>Delete household</button>
        <p className="muted">Signed in as {user?.email}</p>
        <button
          type="button"
          className="btn-ghost"
          onClick={async () => {
            await logout();
            nav('/');
          }}
        >
          Sign out
        </button>
      </div>

      <p className="muted center">
        <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link>
      </p>
    </section>
  );
}
