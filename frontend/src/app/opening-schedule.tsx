'use client';
import { useEffect, useState } from 'react';
import { dayNames, isBakeryOpen, type OpeningHours } from '../../../backend/src/opening-hours';
import styles from './page.module.css';
export default function OpeningSchedule({ hours }: { hours?: OpeningHours }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { const update = () => setNow(new Date()); update(); const timer = setInterval(update, 30000); return () => clearInterval(timer); }, []);
  if (!hours?.length) return null;
  const open = now ? isBakeryOpen(hours, now) : null;
  const daily = hours.length === 7 && hours[0] && hours.every(day => day?.open === hours[0]?.open && day?.close === hours[0]?.close) ? hours[0] : null;
  return <div className={styles.openingHours}><h3>Години роботи</h3>{open !== null && <p className={styles.openStatus} data-open={open}>{open ? 'Зараз відчинено' : 'Зараз зачинено'}</p>}<>{daily ? <p>Щодня {daily.open}–{daily.close}</p> : <dl>{hours.map((hours, index) => <div key={index}><dt>{dayNames[index]}</dt><dd>{hours ? `${hours.open}–${hours.close}` : 'Вихідний'}</dd></div>)}</dl>}</></div>;
}
