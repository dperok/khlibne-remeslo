'use client';

import QuantityInput from './quantity-input';
import { useEffect, useRef, useState } from 'react';
import type { Bakery, Product } from './bakery-site';
import type { Order } from '../../../backend/src/orders.service';
import styles from './cart.module.css';

type Line = { id: string; quantity: number };
type Receipt = { order: Order; token: string };
type Checkout = { id: string; token: string; customerName: string; phone: string; items: Line[] };
const KEY = 'bakery-cart-v1';
export const money = (kopecks: number) => `${(kopecks / 100).toLocaleString('uk-UA', { maximumFractionDigits: 2 })} ₴`;
const labels: Record<string, string> = { new: 'Нове', preparing: 'Готуємо', ready: 'Готове до отримання', completed: 'Виконано', cancelled: 'Скасовано' };
export function useCart(maxQuantity = 99) {
  const [lines, setLines] = useState<Line[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [pending, setPending] = useState<Checkout | null>(null);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
        if (!active) return;
        if (Array.isArray(saved.lines)) setLines(saved.lines.filter((line: Line) => typeof line?.id === 'string' && Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= 9999).slice(0, 50).map((line: Line) => ({ ...line, quantity: Math.min(maxQuantity, line.quantity) })));
        if (Array.isArray(saved.receipts)) setReceipts(saved.receipts.filter((r: Receipt) => r?.order?.id && typeof r.token === 'string').slice(0, 10));
        if (saved.pending?.id && saved.pending?.token && Array.isArray(saved.pending.items)) setPending(saved.pending);
      } catch { if (active) setStorageError('Дозвольте збереження даних у браузері, щоб оформити та скасувати замовлення.'); }
      if (active) setReady(true);
    });
    return () => { active = false; };
  }, [maxQuantity]);
  function save(nextLines = lines, nextReceipts = receipts, nextPending = pending) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ lines: nextLines, receipts: nextReceipts, pending: nextPending }));
      setLines(nextLines); setReceipts(nextReceipts); setPending(nextPending); setStorageError('');
      return true;
    } catch { setStorageError('Не вдалося зберегти кошик. Дозвольте збереження даних у браузері.'); return false; }
  }
  function quantity(id: string, amount: number) {
    if (pending || !ready) return;
    save(amount <= 0 ? lines.filter(line => line.id !== id) : lines.some(line => line.id === id) ? lines.map(line => line.id === id ? { id, quantity: Math.min(maxQuantity, amount) } : line) : [...lines, { id, quantity: Math.min(maxQuantity, amount) }].slice(0, 50));
  }
  return { lines, receipts, pending, ready, maxQuantity, storageError, save, quantity, count: lines.reduce((sum, line) => sum + line.quantity, 0) };
}

async function request(path: string, method: string, token?: string, body?: Checkout): Promise<Order> {
  const response = await fetch(`/api/orders${path}`, { method, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(token ? { 'x-order-token': token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.message ?? 'Не вдалося виконати запит'), { status: response.status });
  return data;
}

export default function Cart({ cart, products, bakery, open, onClose }: { cart: ReturnType<typeof useCart>; products: Product[]; bakery: Bakery; open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const lock = useRef(false);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  const lines = cart.lines.map(line => ({ ...line, product: products.find(p => p.id === line.id) }));
  const invalid = lines.some(line => !line.product || line.product.available === false || line.product.price == null);
  const total = lines.reduce((sum, line) => sum + Math.round((line.product?.price ?? 0) * 100) * line.quantity, 0);
  async function checkout() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    const pending = cart.pending ?? { id: crypto.randomUUID(), token: (crypto.randomUUID() + crypto.randomUUID()).replaceAll('-', ''), customerName: name.trim(), phone, items: cart.lines };
    try {
      if (!cart.save(cart.lines, cart.receipts, pending)) return;
      const order = await request('', 'POST', undefined, pending);
      cart.save([], [{ order, token: pending.token }, ...cart.receipts.filter(r => r.order.id !== order.id)].slice(0, 10), null);
      setNotice('Замовлення створено. Оплата при отриманні.'); setName(''); setPhone('');
    } catch (failure) {
      const problem = failure as Error & { status?: number };
      setError(problem.message);
      // A definite validation rejection did not create an order. Network failures keep the request for safe retry.
      if (problem.status && [400, 404, 409, 429].includes(problem.status)) cart.save(cart.lines, cart.receipts, null);
    } finally { lock.current = false; setBusy(false); }
  }
  async function update(receipt: Receipt, cancel = false) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const order = await request(`/${receipt.order.id}`, cancel ? 'DELETE' : 'GET', receipt.token);
      cart.save(cart.lines, cart.receipts.map(r => r.order.id === order.id ? { ...r, order } : r));
      setConfirmCancel(null); if (cancel) setNotice(`Замовлення №${order.number} скасовано.`);
    } catch (failure) { setError((failure as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className={styles.dialog} onClose={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="cart-title">
    <div className={styles.heading}><h2 id="cart-title">Ваш кошик</h2><button type="button" onClick={onClose} aria-label="Закрити кошик">×</button></div>
    <p role="alert">{error || cart.storageError}</p><p role="status">{notice}</p>
    {lines.length === 0 ? <p>Кошик поки порожній. Оберіть щось смачне у вітрині.</p> : <>
      <ul className={styles.lines}>{lines.map(line => <li key={line.id}><div><strong>{line.product?.name ?? 'Товар видалено'}</strong><small>{line.product?.price != null && money(Math.round(line.product.price * 100))}{(!line.product || line.product.available === false) && ' · Немає в наявності'}</small></div><div className={styles.quantity}><button disabled={busy || !!cart.pending} onClick={() => cart.quantity(line.id, line.quantity - 1)} aria-label={`Зменшити кількість: ${line.product?.name}`}>−</button><QuantityInput value={line.quantity} digits={String(cart.maxQuantity).length} disabled={busy || !!cart.pending} label={`Кількість: ${line.product?.name}`} className={styles.quantityInput} onChange={amount => cart.quantity(line.id, amount)} /><button disabled={busy || !!cart.pending || line.quantity >= cart.maxQuantity} onClick={() => cart.quantity(line.id, line.quantity + 1)} aria-label={`Збільшити кількість: ${line.product?.name}`}>+</button></div><strong>{money(Math.round((line.product?.price ?? 0) * 100) * line.quantity)}</strong><button disabled={busy || !!cart.pending} onClick={() => cart.quantity(line.id, 0)} aria-label={`Видалити: ${line.product?.name}`}>×</button></li>)}</ul>
      <p className={styles.total}>Разом <strong>{money(total)}</strong></p>
      <form onSubmit={event => { event.preventDefault(); void checkout(); }}>
        <label>Ваше ім’я<input name="customerName" autoComplete="given-name" required={!cart.pending} maxLength={80} disabled={busy || !!cart.pending} value={name} onChange={event => setName(event.target.value)} /></label>
        <label>Телефон<input name="phone" type="tel" autoComplete="tel" required={!cart.pending} maxLength={24} disabled={busy || !!cart.pending} value={phone} onChange={event => setPhone(event.target.value)} placeholder="066 123 45 67" /></label>
        <p>Самовивіз: {bakery.fullAddress}.</p><p>Оплата при отриманні. Онлайн кошти не списуються.</p>
        {invalid && <p role="alert">Видаліть недоступні товари або оновіть сторінку.</p>}
        {cart.pending && <p>Перевіряємо попереднє оформлення. Повторний запит не створить ще одне замовлення.</p>}
        <button className={styles.primary} disabled={busy || !cart.ready || (!cart.pending && invalid)}>{busy ? 'Оформлюємо…' : cart.pending ? 'Перевірити оформлення' : 'Оплатити'}</button>
      </form>
    </>}
    {cart.receipts.length > 0 && <section className={styles.orders}><h3>Мої замовлення</h3><p>Збережені в цьому браузері. Тут можна перевірити статус або скасувати замовлення.</p>{cart.receipts.map(receipt => <article key={receipt.order.id}><strong>Замовлення №{receipt.order.number} · {money(receipt.order.totalKopecks)}</strong><p>{labels[receipt.order.status]} · Не оплачено</p><ul>{receipt.order.items.map(item => <li key={item.id}>{item.name} × {item.quantity}</li>)}</ul><p>Самовивіз: {receipt.order.pickupAddress}</p><div className={styles.actions}><button disabled={busy} onClick={() => update(receipt)}>Оновити статус</button>{!['completed','cancelled'].includes(receipt.order.status) && <button disabled={busy} onClick={() => setConfirmCancel(receipt.order.id)}>Скасувати замовлення</button>}</div>{confirmCancel === receipt.order.id && <div className={styles.confirm}><p>Скасувати замовлення №{receipt.order.number}?</p><button disabled={busy} onClick={() => update(receipt, true)}>Так, скасувати</button><button disabled={busy} onClick={() => setConfirmCancel(null)}>Залишити замовлення</button></div>}</article>)}</section>}
  </dialog>;
}

