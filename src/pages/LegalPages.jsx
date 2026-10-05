import { Link } from 'react-router-dom';

export function PrivacyPage() {
  return (
    <div className="legal">
      <Link to="/">← Duet</Link>
      <h1>Privacy Policy</h1>
      <p>Last updated: September 24, 2026</p>
      <p>
        Duet helps households log baby care events (feeds, naps, diapers). We collect account details
        (name, email, password hash), household profile data you provide (baby name, birth date, optional photo),
        caregiver memberships, care event logs, and voice transcripts you choose to submit for logging.
      </p>
      <p>
        We use this data only to operate the service, sync across caregivers on your household, and generate
        factual day notes. We do not sell personal data. We do not provide medical advice.
      </p>
      <p>
        Care logs can be exported or deleted from Settings. Deleting a household removes its events, messages,
        and memberships from our primary database. Backups may persist for a limited retention window.
      </p>
      <p>
        <strong>Contact:</strong> Replace this with your real support email before sharing Duet with families
        (currently a placeholder — e.g. your personal or project inbox).
      </p>
    </div>
  );
}

export function TermsPage() {
  return (
    <div className="legal">
      <Link to="/">← Duet</Link>
      <h1>Terms of Service</h1>
      <p>Last updated: September 24, 2026</p>
      <p>
        Duet is a free organizational tool. It is not a medical device and does not diagnose, treat, or give
        medical advice. Always consult a qualified clinician for health concerns.
      </p>
      <p>
        You must be 18+ to create an account. You are responsible for caregivers you invite and for the accuracy
        of entries you log. Duet is free; the service is provided as-is for household coordination.
      </p>
      <p>
        We may suspend accounts that abuse the service. The software is provided “as is” without warranties to
        the extent permitted by law.
      </p>
      <p>
        <strong>Contact:</strong> Replace this with your real support email before sharing Duet with families.
      </p>
    </div>
  );
}
