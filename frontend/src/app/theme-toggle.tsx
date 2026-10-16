'use client';

import { useSyncExternalStore } from 'react';
import styles from './page.module.css';

function subscribe(change: () => void) {
  window.addEventListener('bakery-theme', change);
  window.addEventListener('storage', change);
  return () => { window.removeEventListener('bakery-theme', change); window.removeEventListener('storage', change); };
}
function snapshot() { return document.documentElement.dataset.theme === 'dark'; }

export default function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, snapshot, () => false);
  return <button className={styles.themeToggle} role="switch" aria-checked={dark} aria-label="Темна тема" title={dark ? 'Увімкнути світлу тему' : 'Увімкнути темну тему'} onClick={() => {
    const theme = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('bakery-theme', theme); } catch { /* The toggle still works when storage is blocked. */ }
    window.dispatchEvent(new Event('bakery-theme'));
  }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg><span className={styles.switchTrack} aria-hidden="true"><span className={styles.switchThumb} /></span><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z" /></svg></button>;
}
