export default function MicButton({ listening, onClick }) {
  return (
    <button
      type="button"
      className={`mic${listening ? ' listening' : ''}`}
      aria-label={listening ? 'Stop listening' : 'Start talking'}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11h-2z" />
      </svg>
    </button>
  );
}
