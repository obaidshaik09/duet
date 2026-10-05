export default function Counts({ counts }) {
  const c = counts || { feeds: 0, naps: 0, diapers: 0 };
  return (
    <div className="counts">
      <div className="count"><b>{c.feeds}</b><span>Feeds</span></div>
      <div className="count"><b>{c.naps}</b><span>Naps</span></div>
      <div className="count"><b>{c.diapers}</b><span>Diapers</span></div>
    </div>
  );
}
