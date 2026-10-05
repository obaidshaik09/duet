import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div className="marketing">
      <header className="marketing-nav">
        <Link to="/" className="logo">Duet</Link>
        <div className="nav-actions">
          <Link to="/login">Sign in</Link>
          <Link className="btn-primary" to="/signup">Get started</Link>
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">For the first weeks, when everyone’s exhausted</p>
        <h1>Talk. Log. Stay in sync.</h1>
        <p className="lede">
          Duet is the voice-first baby log for households with more than one caregiver.
          Speak while you feed or walk — partners, grandparents, and night nurses see the same live timeline.
        </p>
        <div className="cta-row">
          <Link className="btn-primary" to="/signup">Create your household — free</Link>
          <a className="btn-ghost" href="#compare">Why not Huckleberry?</a>
        </div>
      </section>

      <section className="band">
        <h2>Built for real nights</h2>
        <div className="feature-grid">
          <article>
            <h3>Voice-first</h3>
            <p>Hands-free logging for feeds, naps, and diapers. Type only when you have to.</p>
          </article>
          <article>
            <h3>Multi-caregiver sync</h3>
            <p>Invite your household with a code. Everyone writes to one shared day — on their own phones.</p>
          </article>
          <article>
            <h3>Pediatrician-ready notes</h3>
            <p>End-of-day recaps that stick to facts. No diagnosis. No “is this normal?” guessing.</p>
          </article>
        </div>
      </section>

      <section className="band" id="compare">
        <h2>Different from the usual trackers</h2>
        <p className="lede narrow">
          Huckleberry, Baby Tracker, and Glow Baby are strong for charts and sleep coaching.
          Duet’s wedge is quieter: speak naturally, keep every caregiver aligned, and never pretend to be a clinician.
        </p>
        <ul className="compare">
          <li><strong>Voice in, calm reply out</strong> — not a form-heavy dashboard first.</li>
          <li><strong>Household memory</strong> — “when did she last eat?” answered from the shared log.</li>
          <li><strong>Hard medical refusal</strong> — symptoms and medicine questions redirect to your pediatrician.</li>
        </ul>
      </section>

      <section className="band price">
        <h2>Free for your household</h2>
        <p>Unlimited caregivers on one baby’s log. No credit card. Just create a household and invite your people.</p>
        <Link className="btn-primary" to="/signup">Get started</Link>
      </section>

      <footer className="marketing-footer">
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <span>Duet does not give medical advice.</span>
      </footer>
    </div>
  );
}
