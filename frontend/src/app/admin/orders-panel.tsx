'use client';
import { useEffect, useState } from 'react';
import type { Order } from '../../../../backend/src/orders.service';
import styles from './admin.module.css';
const labels: Record<string, string> = { new: 'Нове', preparing: 'Готуємо', ready: 'Готове до отримання', completed: 'Виконано', cancelled: 'Скасовано' };
const money = (n: number) => `${(n / 100).toLocaleString('uk-UA')} ₴`;
async function api(id = '', status?: string): Promise<Order[]> {
  const response = await fetch(`/api/admin/orders${id ? `/${id}` : ''}`, { method: status ? 'PUT' : 'GET', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: status ? JSON.stringify({ status }) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message ?? 'Не вдалося завантажити замовлення');
  return result;
}
export default function OrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  async function refresh(id = '', status?: string) {
    setBusy(true); setError('');
    try { if (id && status) await api(id, status); setOrders(await api()); setConfirm(null); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    const load = () => api().then(data => { if (active) setOrders(data); }).catch(failure => { if (active) setError(failure.message); }).finally(() => { if (active) setBusy(false); });
    void load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  return <section className={styles.panel}><div className={styles.panelHeading}><h2>Замовлення</h2><button disabled={busy} onClick={() => refresh()}>Оновити</button></div><p>Останні 200 замовлень. Скасовані приховані. Автоматичне оновлення кожні 15 секунд.</p><p role="alert" className={styles.error}>{error}</p>{!busy && !orders.length && <p>Замовлень поки немає.</p>}{orders.map(order => <article key={order.id} style={{ borderTop: '1px solid var(--line)', padding: '24px 0' }}><h3>№{order.number} · {labels[order.status]} · {money(order.totalKopecks)}</h3><p>{new Intl.DateTimeFormat('uk-UA', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Kyiv' }).format(new Date(order.createdAt))} · {order.customerName} · <a href={`tel:${order.phone}`}>{order.phone}</a></p><ul>{order.items.map(item => <li key={item.id}>{item.name} × {item.quantity} · {money(item.unitKopecks * item.quantity)}</li>)}</ul><p>Самовивіз: {order.pickupAddress}</p><p>Не оплачено · оплата при отриманні</p>{order.status !== 'completed' && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{['preparing','ready','completed'].filter(status => status !== order.status).map(status => <button key={status} disabled={busy} onClick={() => refresh(order.id, status)}>{labels[status]}</button>)}<button disabled={busy} onClick={() => setConfirm(order.id)}>Скасувати</button></div>}{confirm === order.id && <p>Скасувати замовлення? <button disabled={busy} onClick={() => refresh(order.id, 'cancelled')}>Так, скасувати</button> <button onClick={() => setConfirm(null)}>Ні</button></p>}</article>)}</section>;
}
