import React from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App.jsx';
import './styles/app.css';
import './styles/marketing.css';

try {
  if (Capacitor.isNativePlatform()) {
    document.body.classList.add('native-shell');
  }
} catch { /* browser */ }

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
