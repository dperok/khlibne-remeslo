'use client';

import WheatLogo from '../wheat-logo';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Bakery, Product } from '../bakery-site';
import styles from './admin.module.css';
import ThemeToggle from '../theme-toggle';
import { dayNames } from '../../../../backend/src/opening-hours';
import { createCatalogSearch } from '../../../../backend/src/catalog-search';

type EditableProduct = Product & { visible?: boolean };
type PosterStatus = { configured: boolean; lastSuccessAt: string | null; lastError: string | null; summary: { matched: number; changed: number; manual: number; untracked: number } | null };
type Content = { products: EditableProduct[]; bakery: Bakery; bots: { user: string; admin: string }; temporaryPassword: boolean; poster: PosterStatus };
const blank: EditableProduct = { id: '', name: '', category: 'bread', categoryLabel: 'Хліб', image: '/images/bread-hero.jpg', description: '', ingredients: '', allergens: '', tag: '', visible: true, available: true };
const botStates: Record<string, string> = { webhook: 'Webhook увімкнено', disabled: 'Токен не додано', starting: 'Запускається', running: 'Працює', retrying: 'Повторне з’єднання', stopped: 'Зупинений', invalid_token: 'Невірний токен', polling_conflict: 'Вже запущений в іншому процесі', webhook_configured: 'Встановлено webhook', duplicate_tokens: 'Для ботів потрібні різні токени' };
type Day = { day: string; visitors: number; sessions: number; averageActiveMs: number };
type Analytics = { timezone: string; today: Day; days: Day[] };

function duration(ms: number) {
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)} хв ${seconds % 60} с` : `${seconds} с`;
}

function AnalyticsPanel() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  async function refresh() {
    setLoading(true); setError('');
    try { setData(await api('analytics')); }
    catch (failure) { setError((failure as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    api('analytics').then((result) => { if (active) setData(result); })
      .catch((failure) => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return <section className={styles.panel}>
    <div className={styles.panelHeading}><h2>Відвідуваність</h2><button disabled={loading} onClick={refresh}>{loading ? 'Завантажуємо…' : 'Оновити статистику'}</button></div>
    <p>Сьогодні · часовий пояс Києва. Дані збираються з моменту підключення статистики.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {data && <><div className={styles.metrics}>
      <article><span>ВІДВІДУВАЧІ ЗА ДЕНЬ</span><strong>{data.today.visitors}</strong><small>Унікальні браузери</small></article>
      <article><span>ЗАХОДИ НА САЙТ</span><strong>{data.today.sessions}</strong><small>Повторні відкриття враховуються</small></article>
      <article><span>СЕРЕДНІЙ АКТИВНИЙ ЧАС</span><strong>{duration(data.today.averageActiveMs)}</strong><small>На одне відвідування</small></article>
    </div><div className={styles.analyticsTable}><table><caption>Останні 7 днів</caption><thead><tr><th>Дата</th><th>Відвідувачі</th><th>Заходи</th><th>Сер. активний час</th></tr></thead><tbody>{data.days.map((day) => <tr key={day.day}><td>{new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: '2-digit' }).format(new Date(`${day.day}T12:00:00Z`))}</td><td>{day.visitors}</td><td>{day.sessions}</td><td>{duration(day.averageActiveMs)}</td></tr>)}</tbody></table></div></>}
    <p className={styles.analyticsNote}>Це приблизна аналітика: відвідувач — окремий браузер, а не підтверджена людина. Час рахується лише у видимій активній вкладці та призупиняється після хвилини бездіяльності. Адмін-панель не враховується. Оновлення надходять кожні 15 секунд; блокувальники й закриття браузера можуть впливати на точність.</p>
  </section>;
}

async function api(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`/api/admin/${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.message ?? 'Помилка запиту') as Error & { status: number }; error.status = response.status; throw error; }
  return data;
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<Content | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('products');
  const [draft, setDraft] = useState<EditableProduct>(blank);
  const [productQuery, setProductQuery] = useState('');
  const [contacts, setContacts] = useState<Bakery | null>(null);
  useEffect(() => {
    let active = true;
    api('content').then((data: Content) => { if (active) { setContent(data); setContacts(data.bakery); } })
      .catch((failure) => { if (active && failure.status !== 401) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function action(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); }
    catch (failure) {
      const problem = failure as Error & { status?: number };
      setError(problem.message);
      if (problem.status === 401) setContent(null);
    } finally { setBusy(false); }
  }
  async function refresh(): Promise<Content> { const data = await api('content'); setContent(data); setContacts(data.bakery); return data; }
  const field = (key: keyof EditableProduct, value: string | boolean | number | undefined) => setDraft((previous) => ({ ...previous, [key]: value }));
  const matchesProduct = createCatalogSearch(productQuery);
  const filteredProducts = content?.products.filter((product) => matchesProduct(`${product.name} ${product.description}`) || (productQuery.trim() !== '' && product.id.toLowerCase().includes(productQuery.trim().toLowerCase()))) ?? [];

  return <div className={styles.page}>
    <header className={styles.header}><Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><WheatLogo size={28} />Хлібне ремесло</Link><span>ПАНЕЛЬ АДМІНІСТРАТОРА</span><div className={styles.headerActions}><ThemeToggle />{content && <button disabled={busy} onClick={() => action(async () => { await api('logout', 'POST'); setContent(null); setPassword(''); })}>Вийти ↗</button>}</div></header>
    {loading ? <p className={styles.loading}>Завантажуємо панель…</p> : !content ? <main className={styles.login}>
      <p className={styles.eyebrow}>ВАША ПЕКАРНЯ ПІД КОНТРОЛЕМ</p><h1>Раді бачити <em>знову.</em></h1><p>Увійдіть, щоб керувати вітриною та контактами пекарні.</p>
      <form onSubmit={(event) => { event.preventDefault(); action(async () => { await api('login', 'POST', { password }); setPassword(''); await refresh(); }); }}>
        <label>Пароль<input type="password" name="password" autoComplete="current-password" required maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button className={styles.primary} disabled={busy}>{busy ? 'Входимо…' : 'Увійти до панелі →'}</button>
      </form><p role="alert" className={styles.error}>{error}</p><Link href="/">← Повернутися на сайт</Link>
    </main> : <main className={styles.workspace}>
      <div className={styles.title}><div><p className={styles.eyebrow}>ХЛІБНЕ РЕМЕСЛО</p><h1>Ваша <em>майстерня.</em></h1></div><a href="/" target="_blank" rel="noopener noreferrer">Переглянути сайт ↗</a></div>
      {content.temporaryPassword && <aside className={styles.warning}>Використовується тимчасовий пароль. Змініть <code>ADMIN_PASSWORD</code> у кореневому <code>.env</code> та перезапустіть сервер.</aside>}
      <nav className={styles.tabs} aria-label="Розділи панелі">{[['products', 'Каталог'], ['contacts', 'Контакти й адреса'], ['analytics', 'Відвідуваність'], ['bots', 'Telegram-боти']].map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => { setTab(id); setNotice(''); setError(''); }}>{label}</button>)}</nav>
      <p role="alert" className={styles.error}>{error}</p><p role="status" className={styles.success}>{notice}</p>
      {tab === 'analytics' && <AnalyticsPanel />}
      {tab === 'products' && <section className={styles.panel} style={{ marginBottom: 24 }}>
        <div className={styles.panelHeading}><h2>Наявність із Poster</h2><button disabled={busy || !content.poster.configured} onClick={() => action(async () => {
          const result = await api('poster/sync', 'POST'); const next = await refresh();
          if (draft.id) setDraft(next.products.find(product => product.id === draft.id) ?? { ...blank });
          setNotice(`Poster: оновлено ${result.changed} товарів, перевірено ${result.matched}.`);
        })}>{busy ? 'Оновлюємо…' : 'Оновити з Poster'}</button></div>
        <p>Автоматичне оновлення — щодня вранці. Залишок понад 0 — є в наявності; 0 або менше — немає. Товари без окремого залишку не змінюються. Дані в Poster не редагуються.</p>
        <p>{content.poster.configured ? 'API Poster підключено.' : 'Додайте API-ключ Poster у налаштування сервера.'} Останнє успішне оновлення: {content.poster.lastSuccessAt ? new Intl.DateTimeFormat('uk-UA', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Kyiv' }).format(new Date(content.poster.lastSuccessAt)) : 'ще не виконувалося'}.</p>
        {content.poster.summary && <p>Перевірено: {content.poster.summary.matched}. Без окремого залишку: {content.poster.summary.untracked}. Ручний режим: {content.poster.summary.manual}.</p>}
        {content.poster.lastError && <p role="alert" className={styles.error}>{content.poster.lastError}</p>}
      </section>}
      {tab === 'products' && <div className={styles.columns}>
        <section className={styles.panel}><div className={styles.panelHeading}><h2>Вітрина <small>{content.products.length}</small></h2><button disabled={busy} onClick={() => { setDraft({ ...blank }); setNotice(''); }}>+ Новий товар</button></div>
          <label className={styles.productSearch}>Пошук товарів<input type="search" placeholder="Назва або ID товару" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} /></label>
          <p aria-live="polite">Знайдено: {filteredProducts.length} із {content.products.length}</p>
          <div className={styles.productList}>{filteredProducts.map((product) => <button key={product.id} disabled={busy} className={draft.id === product.id ? styles.selected : ''} onClick={() => { setDraft({ ...product, visible: product.visible !== false }); setNotice(''); }}><span>{product.name}<small>{product.categoryLabel} · {product.visible === false ? 'Прихований' : 'У вітрині'}{product.available === false ? ' · Немає в наявності' : ''}</small></span><span>↗</span></button>)}</div>
          {content.products.length > 0 && filteredProducts.length === 0 && <p>Нічого не знайдено. Спробуйте іншу назву або <button type="button" onClick={() => setProductQuery('')}>очистіть пошук</button>.</p>}
          {!content.products.length && <p>Додайте перший товар до вітрини.</p>}
        </section>
        <section className={styles.panel}><h2>{draft.id ? 'Редагувати товар' : 'Новий товар'}</h2>
          <form onSubmit={(event) => { event.preventDefault(); action(async () => {
            const saved = await api(draft.id ? `products/${draft.id}` : 'products', draft.id ? 'PUT' : 'POST', draft);
            await refresh(); setDraft(saved); setNotice('Товар збережено. Зміни вже доступні на сайті та в ботах.');
          }); }}>
            <label>Назва<input required maxLength={120} value={draft.name} onChange={(event) => field('name', event.target.value)} /></label>
            <div className={styles.formRow}><label>Категорія<select value={draft.category} onChange={(event) => field('category', event.target.value)}><option value="bread">Хліб</option><option value="pastry">Солона та листкова випічка</option><option value="sweet">До чаю</option></select></label><label>Коротка позначка<input maxLength={80} value={draft.tag} onChange={(event) => field('tag', event.target.value)} /></label></div>
            <label>Фото: шлях /images/… або HTTPS-посилання<input required maxLength={500} value={draft.image} onChange={(event) => field('image', event.target.value)} /></label>
            <label>Ціна, ₴<input type="number" min="0" max="100000" step="0.01" value={draft.price ?? ''} onChange={(event) => field('price', event.target.value === '' ? undefined : Number(event.target.value))} /></label>
            <label>Опис<textarea maxLength={1500} rows={4} value={draft.description} onChange={(event) => field('description', event.target.value)} /></label>
            <label>Склад<textarea maxLength={1500} rows={2} value={draft.ingredients} onChange={(event) => field('ingredients', event.target.value)} /></label>
            <label>Алергени<input maxLength={500} value={draft.allergens} onChange={(event) => field('allergens', event.target.value)} /></label>
            <label className={styles.checkbox}><input type="checkbox" checked={draft.visible !== false} onChange={(event) => field('visible', event.target.checked)} />Показувати у вітрині</label>
            <label>Керування наявністю<select value={draft.availabilityMode ?? (draft.id.startsWith('poster-') ? 'poster' : 'manual')} onChange={(event) => field('availabilityMode', event.target.value)}><option value="manual">Вручну</option>{draft.id.startsWith('poster-') && <option value="poster">Автоматично з Poster</option>}</select></label>
            <label className={styles.checkbox}><input type="checkbox" disabled={draft.id.startsWith('poster-') && draft.availabilityMode !== 'manual'} checked={draft.available !== false} onChange={(event) => field('available', event.target.checked)} />Є в наявності</label>
            <p>Для зміни галочки власноруч оберіть режим «Вручну». Техкарти без окремих залишків також можна налаштовувати вручну.</p>
            <div className={styles.actions}><button className={styles.primary} disabled={busy}>{busy ? 'Зберігаємо…' : 'Зберегти товар'}</button>{draft.id && <button type="button" className={styles.danger} disabled={busy} onClick={() => {
              if (window.confirm(`Видалити «${draft.name}» з каталогу?`)) action(async () => { await api(`products/${draft.id}`, 'DELETE'); await refresh(); setDraft({ ...blank }); setNotice('Товар видалено.'); });
            }}>Видалити</button>}</div>
          </form>
        </section>
      </div>}
      {tab === 'contacts' && contacts && <section className={`${styles.panel} ${styles.contactPanel}`}><h2>Контакти й адреса</h2><p>Порожні контакти не показуватимуться відвідувачам. Зміни також з’являться у Telegram-ботах.</p><form onSubmit={(event) => { event.preventDefault(); action(async () => { await api('bakery', 'PUT', contacts); await refresh(); setNotice('Контакти й адресу збережено.'); }); }}>
        <fieldset><legend>Години роботи · Київ</legend><p>Вкажіть графік для кожного дня. Без налаштування графік не відображається.</p>{dayNames.map((day, index) => { const hours = contacts.openingHours?.[index]; return <div key={day} className={styles.scheduleRow}><label><input type="checkbox" checked={!!hours} onChange={event => { const next = [...(contacts.openingHours ?? Array(7).fill(null))]; next[index] = event.target.checked ? { open: '08:00', close: '20:00' } : null; setContacts({ ...contacts, openingHours: next }); }} />{day}</label>{hours && <><label>Відчинення<input type="time" required value={hours.open} onChange={event => { const next = [...contacts.openingHours!]; next[index] = { ...hours, open: event.target.value }; setContacts({ ...contacts, openingHours: next }); }} /></label><label>Зачинення<input type="time" required value={hours.close} onChange={event => { const next = [...contacts.openingHours!]; next[index] = { ...hours, close: event.target.value }; setContacts({ ...contacts, openingHours: next }); }} /></label></>}</div>; })}</fieldset>
        {([['city', 'Місто', 'text'], ['address', 'Адреса на сайті', 'text'], ['fullAddress', 'Повна адреса', 'text'], ['mapsUrl', 'Посилання на карту', 'url'], ['phone', 'Телефон', 'tel'], ['email', 'Електронна пошта', 'email'], ['instagram', 'Instagram: HTTPS-посилання', 'url']] as const).map(([key, label, type]) => <label key={key}>{label}<input type={type} required={['city', 'address', 'fullAddress', 'mapsUrl'].includes(key)} maxLength={key === 'mapsUrl' ? 700 : key === 'fullAddress' ? 400 : key === 'city' ? 100 : key === 'phone' ? 40 : key === 'instagram' ? 300 : 200} value={contacts[key] ?? ''} onChange={(event) => setContacts({ ...contacts, [key]: event.target.value })} /></label>)}
        <div className={styles.formRow}>{(['latitude', 'longitude'] as const).map((key) => <label key={key}>{key === 'latitude' ? 'Широта — локація Telegram' : 'Довгота — локація Telegram'}<input type="number" step="any" min={key === 'latitude' ? -90 : -180} max={key === 'latitude' ? 90 : 180} value={contacts[key] ?? ''} onChange={(event) => setContacts({ ...contacts, [key]: event.target.value === '' ? undefined : Number(event.target.value) })} /></label>)}</div>
        <button className={styles.primary} disabled={busy}>{busy ? 'Зберігаємо…' : 'Зберегти контакти'}</button>
      </form></section>}
      {tab === 'bots' && <section className={styles.panel}><h2>Telegram-боти</h2><p>Додайте різні токени до кореневого <code>.env</code> і перезапустіть сервер. Потрібні два боти, створені через BotFather.</p><div className={styles.botGrid}>
        <article><span>ДЛЯ ВІДВІДУВАЧІВ</span><h3>Бот пекарні</h3><a className={styles.botUsername} href="https://t.me/Khlibne_remeslo_kh_bot" target="_blank" rel="noopener noreferrer">@Khlibne_remeslo_kh_bot ↗</a><strong>{botStates[content.bots.user] ?? content.bots.user}</strong><code>TELEGRAM_USER_BOT_TOKEN</code><p>/start · /contacts · /support · /cancel · /site</p></article>
        <article><span>ДЛЯ КОМАНДИ</span><h3>Адміністративний бот</h3><a className={styles.botUsername} href="https://t.me/iehngtvjmrrbot" target="_blank" rel="noopener noreferrer">@iehngtvjmrrbot ↗</a><strong>{botStates[content.bots.admin] ?? content.bots.admin}</strong><code>TELEGRAM_ADMIN_BOT_TOKEN</code><p>/status · /products · /show · /hide · /contact · /panel</p></article>
      </div><p>Дозволені Telegram ID: <code>470334534</code>, <code>5711475783</code>. Адміністративні команди доступні лише в особистому чаті.</p><p>Перед публічним запуском задайте <code>PUBLIC_SITE_URL</code> — адресу сайту з HTTPS.</p><button disabled={busy} onClick={() => action(async () => { await refresh(); setNotice('Статуси оновлено.'); })}>Оновити статуси</button></section>}
    </main>}
  </div>;
}

