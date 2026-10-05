import { useEffect, useState } from 'react';
import { formatDuration, relTime } from '../utils/format.js';

export default function NapBanner({ openNap, onWake, busy }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!openNap) return null;
  const elapsed = now - new Date(openNap.occurredAt).getTime();

  return (
    <div className="nap-banner">
      <div>
        <strong>Nap in progress</strong>
        <p>Down since {relTime(openNap.occurredAt)} · {formatDuration(elapsed)}</p>
      </div>
      <button type="button" className="primary" disabled={busy} onClick={onWake}>
        She woke up
      </button>
    </div>
  );
}
