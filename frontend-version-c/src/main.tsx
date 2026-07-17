import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Global research automation catchers
(window as any).consoleLogs = [];
(window as any).jsErrors = [];
(window as any).apiMetrics = [];

const originalLog = console.log;
console.log = (...args) => {
  (window as any).consoleLogs.push({ type: 'log', message: args.join(' '), timestamp: Date.now() });
  originalLog.apply(console, args);
};

const originalError = console.error;
console.error = (...args) => {
  (window as any).consoleLogs.push({ type: 'error', message: args.join(' '), timestamp: Date.now() });
  originalError.apply(console, args);
};

window.addEventListener('error', (event) => {
  (window as any).jsErrors.push({
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    timestamp: Date.now()
  });
});

window.addEventListener('unhandledrejection', (event) => {
  (window as any).jsErrors.push({
    message: event.reason?.message || String(event.reason),
    filename: 'promise_rejection',
    timestamp: Date.now()
  });
});

// Listener to capture local API metrics
window.addEventListener('api-metric-added', (e: Event) => {
  const customEvent = e as CustomEvent;
  (window as any).apiMetrics.push(customEvent.detail);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
