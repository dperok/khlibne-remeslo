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
  return <button className={styles.themeToggle} aria-label={dark ? 'Увімкнути світлу тему' : 'Увімкнути темну тему'} title={dark ? 'Світла тема' : 'Темна тема'} onClick={() => {
    const theme = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('bakery-theme', theme); } catch { /* The toggle still works when storage is blocked. */ }
    window.dispatchEvent(new Event('bakery-theme'));
  }}><span aria-hidden="true">{dark ? '☀' : '☾'}</span><span>{dark ? 'Світла тема' : 'Темна тема'}</span></button>;
}
