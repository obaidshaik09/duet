export function ozFromMl(ml) {
  if (!ml) return '';
  const oz = ml / 30;
  return Number.isInteger(oz) ? `${oz} oz` : `${oz.toFixed(1)} oz`;
}

export function labelEvent(event) {
  if (event.type === 'feed') {
    if (event.subtype === 'breast_left') {
      return event.durationMin ? `Left breast, ${event.durationMin} min` : 'Left breast';
    }
    if (event.subtype === 'breast_right') {
      return event.durationMin ? `Right breast, ${event.durationMin} min` : 'Right breast';
    }
    return event.amountMl ? `Bottle, ${ozFromMl(event.amountMl)}` : 'Bottle';
  }
  if (event.type === 'nap') {
    if (event.subtype === 'nap_start') return 'Nap started';
    return event.durationMin ? `Nap ended, ${event.durationMin} min` : 'Nap ended';
  }
  if (event.subtype === 'dirty') return 'Dirty diaper';
  if (event.subtype === 'both') return 'Wet and dirty diaper';
  return 'Wet diaper';
}

export function iconFor(event) {
  if (event.type === 'feed') return '🍼';
  if (event.type === 'nap') return '🌙';
  return '🧷';
}

export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function relTime(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m ago` : `${h}h ago`;
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
