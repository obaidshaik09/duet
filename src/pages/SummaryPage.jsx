import { useState } from 'react';
import { api } from '../services/api.js';

export default function SummaryPage({ initialHint }) {
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy');
  const [error, setError] = useState('');

  async function makeNote() {
    setBusy(true);
    setError('');
    try {
      const data = await api.summary();
      setSummary(data.summary || '');
    } catch (err) {
      setError(err.message || "Could not build today's note.");
    } finally {
      setBusy(false);
    }
  }

  async function copyNote() {
    const text = summary || (await api.summary().then((d) => d.summary).catch(() => ''));
    if (!text) return;
    setSummary(text);
    try {
      await navigator.clipboard.writeText(text);
      setCopyLabel('Copied');
      setTimeout(() => setCopyLabel('Copy'), 1400);
    } catch {
      setCopyLabel('Select text');
      setTimeout(() => setCopyLabel('Copy'), 1600);
    }
  }

  return (
    <section className="panel">
      {error ? (
        <div className="banner error">
          {error}
          <button type="button" onClick={makeNote}>Retry</button>
        </div>
      ) : null}
      <div className="summary-card">
        {summary || initialHint || "Tap “Make today's note” for a short recap."}
      </div>
      <div className="row">
        <button className="primary" type="button" onClick={makeNote} disabled={busy}>
          {busy ? 'Making…' : "Make today's note"}
        </button>
        <button className="ghost" type="button" onClick={copyNote} disabled={busy}>
          {copyLabel}
        </button>
      </div>
    </section>
  );
}
