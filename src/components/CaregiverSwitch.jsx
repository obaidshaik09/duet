export default function CaregiverSwitch({ caregivers, value, onChange }) {
  return (
    <select
      className="caregiver-select"
      aria-label="Who is caring right now"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {(caregivers || []).map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} · {c.role}
        </option>
      ))}
    </select>
  );
}
