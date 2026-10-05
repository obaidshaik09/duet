import { useEffect, useRef, useState } from 'react';
import Counts from '../components/Counts.jsx';
import MicButton from '../components/MicButton.jsx';
import NapBanner from '../components/NapBanner.jsx';
import { labelEvent } from '../utils/format.js';
import { startListening, browserSpeechSupported, isNativeApp } from '../services/speech.js';

const SUGGESTIONS = [
  { label: '3 oz bottle', say: 'Just gave her a 3 ounce bottle.' },
  { label: 'Down for a nap', say: "She's down for a nap." },
  { label: 'Wet diaper', say: 'Changed a wet diaper.' },
  { label: 'Last feed?', say: 'When did she last eat?' },
];

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function ListenPage({
  counts,
  openNap,
  transcript,
  reply,
  loggedEvents,
  busy,
  onTurn,
  setTranscript,
  onWake,
  networkError,
  onRetry,
}) {
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const sessionRef = useRef(null);
  const noSpeechTimer = useRef(null);

  useEffect(() => () => {
    clearTimeout(noSpeechTimer.current);
    sessionRef.current?.stop?.();
  }, []);

  function clearNoSpeech() {
    clearTimeout(noSpeechTimer.current);
  }

  function armNoSpeech() {
    clearNoSpeech();
    noSpeechTimer.current = setTimeout(async () => {
      setListening(false);
      setVoiceStatus('No speech detected. Try again, or type below.');
      try { await sessionRef.current?.stop?.(); } catch { /* ignore */ }
    }, 10000);
  }

  async function toggleMic() {
    if (listening) {
      clearNoSpeech();
      setListening(false);
      await sessionRef.current?.stop?.();
      return;
    }

    if (!isNativeApp() && !browserSpeechSupported()) {
      setVoiceStatus(
        isIOS()
          ? 'On iPhone Safari, type for now — or Add to Home Screen and try Chrome if available.'
          : 'Voice needs Chrome/Edge or the Android app. Type below for now.',
      );
      return;
    }

    setPendingConfirm(null);
    setVoiceStatus('Listening…');
    setListening(true);
    armNoSpeech();

    sessionRef.current = await startListening({
      onPartial: (bits) => {
        clearNoSpeech();
        armNoSpeech();
        setTranscript(bits);
        setVoiceStatus('Hearing you…');
      },
      onFinal: (bits, meta = {}) => {
        clearNoSpeech();
        setListening(false);
        setTranscript(bits);
        if (!bits) {
          setVoiceStatus("I didn't catch that. Tap the mic to try again, or type below.");
          return;
        }
        const confidence = meta.confidence;
        const low = typeof confidence === 'number' && confidence > 0 && confidence < 0.55;
        if (low) {
          setPendingConfirm({ text: bits });
          setVoiceStatus('I might have misheard — confirm before logging.');
        } else {
          setVoiceStatus('');
          onTurn(bits);
        }
      },
      onError: (msg) => {
        clearNoSpeech();
        setListening(false);
        if (msg) setVoiceStatus(msg);
      },
    });

    // Native plugin: user taps again to stop and finalize
    if (sessionRef.current?.native) {
      setVoiceStatus('Listening… tap the mic again when you finish speaking.');
    }
  }

  function submitText(e) {
    e.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setText('');
    setPendingConfirm(null);
    onTurn(value);
  }

  const hint = listening
    ? (sessionRef.current?.native
      ? 'Listening… tap again when you are done.'
      : 'Listening… speak clearly, then pause.')
    : 'Tap the mic and talk naturally — a feed, a nap, a diaper change.';

  return (
    <section className="panel">
      <Counts counts={counts} />
      {openNap ? <NapBanner openNap={openNap} onWake={onWake} busy={busy} /> : null}
      {networkError ? (
        <div className="banner error">
          {networkError}
          <button type="button" onClick={onRetry}>Retry</button>
        </div>
      ) : null}
      <div className="listen-stage">
        <MicButton listening={listening} onClick={toggleMic} />
        <p className="hint">{hint}</p>
        {voiceStatus ? <p className="hint"><strong>{voiceStatus}</strong></p> : null}
        {transcript ? <div className="transcript">“{transcript}”</div> : null}
        {pendingConfirm ? (
          <div className="confirm-box">
            <p>Log this? “{pendingConfirm.text}”</p>
            <div className="row">
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => {
                  const t = pendingConfirm.text;
                  setPendingConfirm(null);
                  onTurn(t);
                }}
              >
                Yes, log it
              </button>
              <button type="button" className="ghost" onClick={() => setPendingConfirm(null)}>Discard</button>
            </div>
          </div>
        ) : null}
        {reply ? <div className="reply">{reply}</div> : null}
        {loggedEvents?.length ? (
          <div className="chips">
            {loggedEvents.map((ev) => (
              <span className="logged" key={ev.id || `${ev.type}-${ev.occurredAt}`}>
                {labelEvent(ev)}
              </span>
            ))}
          </div>
        ) : null}
        <div className="chips">
          {SUGGESTIONS.map((s) => (
            <button key={s.label} type="button" className="chip" disabled={busy} onClick={() => onTurn(s.say)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <form className="fallback" onSubmit={submitText}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Or type if you can't talk right now"
          disabled={busy}
        />
        <button type="submit" disabled={busy}>Send</button>
      </form>
    </section>
  );
}
