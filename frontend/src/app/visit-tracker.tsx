'use client';

import { useEffect } from 'react';

function currentDay() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export default function VisitTracker() {
  useEffect(() => {
    let visitorId: string;
    try {
      visitorId = localStorage.getItem('bakery-visitor') ?? crypto.randomUUID();
      localStorage.setItem('bakery-visitor', visitorId);
    } catch { visitorId = crypto.randomUUID(); }
    const sessionId = crypto.randomUUID();
    let day = currentDay();
    let activeMs = 0;
    let lastTick = performance.now();
    let lastActivity = lastTick;
    let active = document.visibilityState === 'visible' && document.hasFocus();

    const send = () => {
      const payload = JSON.stringify({ visitorId, sessionId, day, activeMs: Math.round(activeMs) });
      // Beacon works during tab hiding/navigation and does not block the visitor.
      if (!navigator.sendBeacon('/api/analytics', new Blob([payload], { type: 'application/json' }))) {
        void fetch('/api/analytics', { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
      }
    };
    const accumulate = () => {
      const now = performance.now();
      if (active) activeMs += Math.max(0, Math.min(now, lastActivity + 60000) - lastTick);
      lastTick = now;
      const nextDay = currentDay();
      if (day !== nextDay) { send(); day = nextDay; activeMs = 0; }
    };
    const flush = () => { accumulate(); send(); };
    const activity = () => { accumulate(); lastActivity = performance.now(); };
    const visibility = () => {
      accumulate();
      active = document.visibilityState === 'visible' && document.hasFocus();
      if (active) lastActivity = performance.now();
      send();
    };
    send();
    const timer = window.setInterval(flush, 15000);
    const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'] as const;
    for (const event of events) window.addEventListener(event, activity, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', visibility);
    window.addEventListener('blur', visibility);
    return () => {
      flush(); clearInterval(timer);
      for (const event of events) window.removeEventListener(event, activity);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', visibility);
      window.removeEventListener('blur', visibility);
    };
  }, []);
  return null;
}
