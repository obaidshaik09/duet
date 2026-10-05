import Timeline from '../components/Timeline.jsx';
import NapBanner from '../components/NapBanner.jsx';

export default function TodayPage({
  counts,
  events,
  caregivers,
  openNap,
  onEdit,
  onDelete,
  onWake,
  busy,
}) {
  return (
    <section className="panel">
      {openNap ? <NapBanner openNap={openNap} onWake={onWake} busy={busy} /> : null}
      <Timeline
        counts={counts}
        events={events}
        caregivers={caregivers}
        onEdit={onEdit}
        onDelete={onDelete}
        busy={busy}
      />
    </section>
  );
}
