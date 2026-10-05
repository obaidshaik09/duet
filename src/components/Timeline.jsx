import { useState } from 'react';
import Counts from './Counts.jsx';
import { labelEvent, iconFor, fmtTime, relTime } from '../utils/format.js';

function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function Timeline({
  events,
  caregivers,
  counts,
  onEdit,
  onDelete,
  busy,
}) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});
  const byId = Object.fromEntries((caregivers || []).map((c) => [c.id, c]));

  if (!events?.length) {
    return (
      <>
        <Counts counts={counts} />
        <p className="empty">Nothing logged yet today. Talk from Listen and the household will see it here.</p>
      </>
    );
  }

  const sorted = [...events].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));

  return (
    <>
      <Counts counts={counts} />
      <div className="scroll">
        {sorted.map((event) => {
          const who = byId[event.memberId || event.caregiverId] || { name: 'Someone', role: '' };
          const isEdit = editing === event.id;
          return (
            <article className="event" key={event.id}>
              <div className="badge">{iconFor(event)}</div>
              <div>
                {isEdit ? (
                  <div className="edit-form">
                    <select
                      value={draft.subtype}
                      onChange={(e) => setDraft({ ...draft, subtype: e.target.value })}
                    >
                      {event.type === 'feed' && (
                        <>
                          <option value="bottle">Bottle</option>
                          <option value="breast_left">Left breast</option>
                          <option value="breast_right">Right breast</option>
                        </>
                      )}
                      {event.type === 'nap' && (
                        <>
                          <option value="nap_start">Nap started</option>
                          <option value="nap_end">Nap ended</option>
                        </>
                      )}
                      {event.type === 'diaper' && (
                        <>
                          <option value="wet">Wet</option>
                          <option value="dirty">Dirty</option>
                          <option value="both">Both</option>
                        </>
                      )}
                    </select>
                    {event.type === 'feed' ? (
                      <label className="edit-label">
                        Amount (ml)
                        <input
                          type="number"
                          min="0"
                          placeholder="e.g. 90"
                          value={draft.amountMl ?? ''}
                          onChange={(e) => setDraft({
                            ...draft,
                            amountMl: e.target.value === '' ? null : Number(e.target.value),
                          })}
                        />
                      </label>
                    ) : null}
                    {(event.type === 'nap' || event.type === 'feed') ? (
                      <label className="edit-label">
                        Duration (min)
                        <input
                          type="number"
                          min="0"
                          placeholder="minutes"
                          value={draft.durationMin ?? ''}
                          onChange={(e) => setDraft({
                            ...draft,
                            durationMin: e.target.value === '' ? null : Number(e.target.value),
                          })}
                        />
                      </label>
                    ) : null}
                    <label className="edit-label">
                      When
                      <input
                        type="datetime-local"
                        value={draft.occurredLocal || ''}
                        onChange={(e) => setDraft({ ...draft, occurredLocal: e.target.value })}
                      />
                    </label>
                    <label className="edit-label">
                      Notes
                      <input
                        type="text"
                        placeholder="Optional note"
                        value={draft.notes || ''}
                        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                      />
                    </label>
                    <div className="row tight">
                      <button
                        type="button"
                        className="primary"
                        disabled={busy}
                        onClick={async () => {
                          const patch = {
                            subtype: draft.subtype,
                            amountMl: draft.amountMl,
                            durationMin: draft.durationMin,
                            notes: draft.notes || null,
                            occurredAt: fromLocalInputValue(draft.occurredLocal) || event.occurredAt,
                          };
                          await onEdit(event.id, patch);
                          setEditing(null);
                        }}
                      >
                        Save
                      </button>
                      <button type="button" className="ghost" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h3>{labelEvent(event)}</h3>
                    <p>{who.name}{who.role ? ` · ${who.role}` : ''}</p>
                    {event.notes ? <p className="muted">{event.notes}</p> : null}
                    <div className="event-actions">
                      <button
                        type="button"
                        className="linkish"
                        disabled={busy}
                        onClick={() => {
                          setEditing(event.id);
                          setDraft({
                            subtype: event.subtype,
                            amountMl: event.amountMl,
                            durationMin: event.durationMin,
                            notes: event.notes || '',
                            occurredLocal: toLocalInputValue(event.occurredAt),
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="linkish danger"
                        disabled={busy}
                        onClick={() => onDelete(event.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="when">
                {fmtTime(event.occurredAt)}
                <br />
                {relTime(event.occurredAt)}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
