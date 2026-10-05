import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Capacitor } from '@capacitor/core';

export function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function browserSpeechSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Unified speech helper: Capacitor native plugin on Android when available,
 * otherwise Web Speech API.
 *
 * Native UX: tap mic to start, tap again to stop — last partial becomes final
 * (plugin stop() returns void when partialResults is true).
 */
export async function startListening({ onPartial, onFinal, onError }) {
  if (isNativeApp()) {
    try {
      const available = await SpeechRecognition.available();
      if (!available?.available) {
        onError?.('Speech recognition is not available on this device. Type below instead.');
        return { stop: async () => {} };
      }
      try {
        await SpeechRecognition.requestPermissions();
      } catch { /* continue; start will fail if denied */ }

      let lastText = '';
      await SpeechRecognition.removeAllListeners();
      await SpeechRecognition.addListener('partialResults', (ev) => {
        const text = (ev.matches && ev.matches[0]) || '';
        if (text) {
          lastText = text;
          onPartial?.(text);
        }
      });
      await SpeechRecognition.start({
        language: 'en-US',
        maxResults: 3,
        partialResults: true,
        popup: false,
      });

      const stop = async () => {
        try {
          await SpeechRecognition.stop();
        } catch { /* ignore */ }
        try { await SpeechRecognition.removeAllListeners(); } catch { /* ignore */ }
        const text = lastText.trim();
        if (text) onFinal?.(text);
        else onError?.("I didn't catch that. Try again, or type below.");
      };
      return { stop, native: true };
    } catch (err) {
      onError?.(err?.message || 'Native speech failed. Type below instead.');
      return { stop: async () => {} };
    }
  }

  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) {
    onError?.('Voice needs Chrome or Edge, or type below.');
    return { stop: async () => {} };
  }
  const rec = new Ctor();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 3;
  rec.onresult = (event) => {
    const bits = [...event.results].map((r) => r[0].transcript).join(' ').trim();
    onPartial?.(bits);
    if (event.results[event.results.length - 1].isFinal) {
      if (!bits) onError?.("I didn't catch that. Try again, or type below.");
      else {
        const confidence = event.results[event.results.length - 1][0]?.confidence;
        onFinal?.(bits, { confidence });
      }
    }
  };
  rec.onerror = (event) => {
    const map = {
      'not-allowed': 'Microphone permission denied. Allow the mic, or type below.',
      'no-speech': 'No speech detected. Try again, or type below.',
      'audio-capture': 'No microphone found. Type below instead.',
      network: 'Speech service network error. Type below for now.',
      aborted: '',
    };
    const msg = map[event.error];
    if (msg) onError?.(msg);
  };
  try {
    rec.start();
  } catch {
    onError?.('Mic is busy. Try again, or type below.');
  }
  return {
    native: false,
    stop: async () => {
      try { rec.stop(); } catch { /* ignore */ }
    },
  };
}
