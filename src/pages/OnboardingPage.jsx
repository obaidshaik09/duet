import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setHouseholdId } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

const STEPS = ['household', 'invite', 'first'];

export default function OnboardingPage() {
  const { user, selectHousehold, refresh } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState('create');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [household, setHousehold] = useState(null);
  const [form, setForm] = useState({
    babyName: '',
    birthDate: '',
    displayName: user?.name || '',
    role: 'Parent',
    joinCode: '',
    joinRole: 'Partner',
  });
  const [firstLog, setFirstLog] = useState('Just gave her a 3 ounce bottle.');

  async function createHousehold(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api.createHousehold({
        babyName: form.babyName,
        birthDate: form.birthDate,
        displayName: form.displayName || user?.name,
        role: form.role,
      });
      setHouseholdId(data.household.id);
      selectHousehold(data.household.id);
      setHousehold(data.household);
      setInviteCode(data.household.inviteCode);
      await refresh();
      setStep(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function join(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api.joinInvite({
        code: form.joinCode,
        displayName: form.displayName || user?.name,
        role: form.joinRole,
      });
      setHouseholdId(data.household.id);
      selectHousehold(data.household.id);
      setHousehold(data.household);
      await refresh();
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function logFirst(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.turn(firstLog);
      nav('/app');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card wide">
        <p className="eyebrow">Setup · step {step + 1} of {STEPS.length}</p>
        <h1>
          {step === 0 && 'Create or join a household'}
          {step === 1 && 'Invite your caregivers'}
          {step === 2 && 'Log the first entry'}
        </h1>
        {error ? <div className="banner error">{error}</div> : null}

        {step === 0 && (
          <>
            <div className="chips">
              <button type="button" className={`chip ${mode === 'create' ? 'active' : ''}`} onClick={() => setMode('create')}>Create household</button>
              <button type="button" className={`chip ${mode === 'join' ? 'active' : ''}`} onClick={() => setMode('join')}>I have an invite code</button>
            </div>
            {mode === 'create' ? (
              <form className="stack" onSubmit={createHousehold}>
                <label>Baby’s name<input value={form.babyName} onChange={(e) => setForm({ ...form, babyName: e.target.value })} required /></label>
                <label>Birth date<input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} required /></label>
                <label>Your display name<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required /></label>
                <label>Your role
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option>Parent</option>
                    <option>Partner</option>
                    <option>Grandparent</option>
                    <option>Night nurse</option>
                    <option>Caregiver</option>
                  </select>
                </label>
                <button className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create household'}</button>
              </form>
            ) : (
              <form className="stack" onSubmit={join}>
                <label>Invite code<input value={form.joinCode} onChange={(e) => setForm({ ...form, joinCode: e.target.value.toUpperCase() })} required /></label>
                <label>Your display name<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required /></label>
                <label>Your role
                  <select value={form.joinRole} onChange={(e) => setForm({ ...form, joinRole: e.target.value })}>
                    <option>Partner</option>
                    <option>Grandparent</option>
                    <option>Night nurse</option>
                    <option>Caregiver</option>
                    <option>Parent</option>
                  </select>
                </label>
                <button className="btn-primary" disabled={busy}>{busy ? 'Joining…' : 'Join household'}</button>
              </form>
            )}
          </>
        )}

        {step === 1 && (
          <div className="stack">
            <p>Share this code with a partner, grandparent, or night nurse. They sign up and join from their own phone.</p>
            <div className="invite-code">{inviteCode || household?.inviteCode}</div>
            <button type="button" className="btn-primary" onClick={() => setStep(2)}>Continue</button>
            <button type="button" className="btn-ghost" onClick={() => nav('/app')}>Skip for now</button>
          </div>
        )}

        {step === 2 && (
          <form className="stack" onSubmit={logFirst}>
            <p>Try a natural sentence — this is what Duet hears and logs.</p>
            <input value={firstLog} onChange={(e) => setFirstLog(e.target.value)} />
            <button className="btn-primary" disabled={busy}>{busy ? 'Logging…' : 'Log first entry'}</button>
            <button type="button" className="btn-ghost" onClick={() => nav('/app')}>Skip</button>
          </form>
        )}
      </div>
    </div>
  );
}
