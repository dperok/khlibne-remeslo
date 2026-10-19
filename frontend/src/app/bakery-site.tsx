'use client';

import Image from 'next/image';
import Cart, { useCart } from './cart';
import cartStyles from './cart.module.css';

import VisitTracker from './visit-tracker';
import { useRef, useState } from 'react';
import styles from './page.module.css';
import { createCatalogSearch } from '../../../backend/src/catalog-search';
import ThemeToggle from './theme-toggle';
import { catalogGroups as categories, catalogGroup } from './catalog-groups';
import Wheat from './wheat-logo';
import OpeningSchedule from './opening-schedule';
import type { OpeningHours } from '../../../backend/src/opening-hours';

export type Product = { available?: boolean; availabilityMode?: 'poster' | 'manual'; price?: number; id: string; name: string; category: string; categoryLabel: string; image: string; description: string; ingredients: string; allergens: string; tag: string };
export type Bakery = { name: string; city: string; address: string; fullAddress: string; mapsUrl: string; phone: string | null; instagram: string | null; email: string | null; latitude?: number; longitude?: number; openingHours?: OpeningHours };

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? 'M6 18 18 6M6 6h12v12' : 'M4 12h16m-6-6 6 6-6 6'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function Pin() {
  return <svg width="18" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5"/></svg>;
}

export default function BakerySite({ products, bakery, demo = false }: { products: Product[]; bakery: Bakery; demo?: boolean }) {
  const cart = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const [added, setAdded] = useState('');
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const matches = createCatalogSearch(query);
  const visible = products.filter((product) => (!availableOnly || product.available !== false) && (category === 'all' || catalogGroup(product) === category) && matches(`${product.name} ${product.description}`))
    .sort((first, second) => Number(first.available === false) - Number(second.available === false));
  const pageCount = Math.max(1, Math.ceil(visible.length / 18));
  const currentPage = Math.min(page, pageCount);
  function changePage(next: number) {
    setPage(next);
    document.getElementById('catalog')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  function cannotAdd(product: Product) {
    return !cart.ready || !!cart.pending || demo || product.available === false || product.price == null ||
      (cart.lines.find(line => line.id === product.id)?.quantity ?? 0) >= 99 ||
      (cart.lines.length >= 50 && !cart.lines.some(line => line.id === product.id));
  }
  function addProduct(product: Product) {
    if (cannotAdd(product)) return;
    cart.quantity(product.id, (cart.lines.find(line => line.id === product.id)?.quantity ?? 0) + 1);
    setAdded(`Додано до кошика: ${product.name}`);
  }
  function openProduct(product: Product) { setAdded(''); setSelected(product); dialog.current?.showModal(); }

  return <>
    <VisitTracker />
    <Cart cart={cart} products={products} bakery={bakery} open={cartOpen} onClose={() => setCartOpen(false)} />
    <a href="#catalog" className="skip-link">Перейти до каталогу</a>
    <div className={styles.topline}><div className={styles.toplineLinks}><a href="https://t.me/Khlibne_remeslo_kh_bot" target="_blank" rel="noopener noreferrer"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.7 3.3a1 1 0 0 0-1.1-.2L2.9 10c-1 .4-1 1.1-.2 1.4l4.6 1.4 1.8 5.5c.2.6.5.8.9.8.3 0 .6-.2.9-.5l2.6-2.5 4.7 3.5c.9.5 1.5.2 1.7-.8l2.7-13.8c.2-.8 0-1.4-.9-1.7ZM8.1 12.5l10.5-6.6c.5-.3.9-.1.5.2l-8.7 7.8-.3 3.6-2-5Z" /></svg>Telegram</a><a href={bakery.mapsUrl} target="_blank" rel="noopener noreferrer"><Pin />{bakery.city}, {bakery.address}</a><ThemeToggle /></div><button className={cartStyles.trigger} onClick={() => setCartOpen(true)} aria-label={`Кошик: ${cart.count} товарів`}><svg width="29" height="29" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3h2l3 12h11l3-9H6M9 20h.01M18 20h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg><span>{cart.count}</span></button></div>
    <p role="status" className={styles.cartAnnouncement}>{selected ? '' : added}</p>
    <header className={styles.header}>
      <a href="#home" className={styles.brand} aria-label="Хлібне ремесло — на початок"><Wheat /><span>Хлібне ремесло<small>ПЕКАРНЯ З ХАРАКТЕРОМ</small></span></a>
      <nav aria-label="Головна навігація"><a href="#catalog">Наша випічка</a><a href="#about">Про пекарню</a><a href="#contacts">Контакти</a></nav>
      <a href={bakery.mapsUrl} className={styles.headerLocation} target="_blank" rel="noopener noreferrer"><Pin /><span>Де ми знаходимося</span><Arrow diagonal /></a>
    </header>
    <main id="home">
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span />ХЛІБНЕ РЕМЕСЛО · ХАРКІВ</p>
          <h1 id="hero-title">Щастя —<br />у простих<br /><em>речах.</em></h1>
          <p className={styles.heroDescription}>У хрусткій скоринці. В ароматі випічки.<br />У хлібі, який хочеться розділити з близькими.</p>
          <div className={styles.heroActions}>
            <a href="#catalog" className={styles.primary}>Зазирнути до вітрини <Arrow /></a>
            <a href="#contacts" className={styles.secondary}>Зв’язатися з нами <Arrow /></a>
          </div>
          <div className={styles.heroFoot}><span className={styles.smallSun}>✳</span><p>Трохи тепла<br /><strong>для вашого щодня</strong></p><a href="#location"><Pin />{bakery.address}</a></div>
        </div>
        <div className={styles.heroVisual}>
          <div className={styles.heroPhoto}><Image src="/images/bread-hero.jpg" alt="Рум’яні хлібини з насінням і колоссям на дерев’яному столі" fill priority sizes="(max-width: 760px) 100vw, 52vw" /></div>
          <div className={styles.heroStamp}><span>ПРОСТО ХЛІБ.</span><Wheat /><span>БАГАТО ЛЮБОВІ.</span></div>
          <div className={styles.photoCaption}><span>Хліб, навколо якого збираються.</span><span>01 / РЕМЕСЛО</span></div>
        </div>
      </section>
      <div className={styles.ribbon} aria-hidden="true"><span>ХЛІБ, ЩО ОБ’ЄДНУЄ</span><span>✳</span><span>ТЕПЛО В КОЖНІЙ СКОРИНЦІ</span><span>✳</span><span>ПРОСТІ РЕЧІ — ОСОБЛИВИЙ СМАК</span><span>✳</span><span>ХЛІБНЕ РЕМЕСЛО</span><span>✳</span></div>
      <section id="contacts" className={styles.contacts}><span className={styles.contactSun}>✳</span><div><p className={styles.eyebrow}>ЗАЛИШАЄМОСЯ НА ЗВ’ЯЗКУ</p>
        <h2>{bakery.phone || bakery.email || bakery.instagram ? <>Будьмо <em>на зв’язку.</em></> : <>Тут скоро будуть <em>наші контакти.</em></>}</h2>
        {bakery.phone || bakery.email || bakery.instagram ? <div className={styles.contactLinks}>
          {bakery.phone && <a href={`tel:${bakery.phone.replace(/[^+\d]/g, '')}`} aria-label={`Зателефонувати: ${bakery.phone}`}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="m7 3 3 5-2 2a15 15 0 0 0 6 6l2-2 5 3-1 4C11 22 2 13 3 4l4-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>{bakery.phone}</a>}
          {bakery.email && <a href={`mailto:${bakery.email}`}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 8 }}><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="m4 6 8 7 8-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>{bakery.email}</a>}
          {bakery.instagram && <a href={bakery.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram пекарні" title="Instagram"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ verticalAlign: 'middle' }}><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" /><circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" /></svg></a>}
          <a href="https://t.me/Khlibne_remeslo_kh_bot" target="_blank" rel="noopener noreferrer" aria-label="Telegram: @Khlibne_remeslo_kh_bot"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M21.7 3.3a1 1 0 0 0-1.1-.2L2.9 10c-1 .4-1 1.1-.2 1.4l4.6 1.4 1.8 5.5c.2.6.5.8.9.8.3 0 .6-.2.9-.5l2.6-2.5 4.7 3.5c.9.5 1.5.2 1.7-.8l2.7-13.8c.2-.8 0-1.4-.9-1.7ZM8.1 12.5l10.5-6.6c.5-.3.9-.1.5.2l-8.7 7.8-.3 3.6-2-5Z" /></svg></a>
        </div> : <p>Телефон та посилання на соцмережі додамо згодом.<br />А поки — чекаємо на знайомство в пекарні.</p>}
      <OpeningSchedule hours={bakery.openingHours} /></div><a href={bakery.mapsUrl} target="_blank" rel="noopener noreferrer" aria-label="Відкрити адресу пекарні в Google Maps"><Arrow diagonal /></a></section>
      <section id="catalog" className={styles.catalog} aria-labelledby="catalog-title">
        <div className={styles.sectionTop}><div><h2 id="catalog-title">Наша вітрина</h2></div><p className={styles.sectionIntro}>Хліб для щодня, круасан для настрою.<br />Знайдіть свій маленький привід для радості.</p></div>
        <div className={styles.catalogTools}>
          <div className={styles.tabs} role="group" aria-label="Категорії випічки">{categories.map((item) => <button key={item.id} aria-pressed={category === item.id} className={category === item.id ? styles.activeTab : ''} onClick={() => { setCategory(item.id); setPage(1); }}>{item.name}<span title="Товарів у наявності">{products.filter((product) => product.available !== false && (item.id === 'all' || catalogGroup(product) === item.id)).length}</span></button>)}</div>
          <label className={styles.availabilityFilter}><input type="checkbox" checked={availableOnly} onChange={event => { setAvailableOnly(event.target.checked); setPage(1); }} />Тільки в наявності</label>
          <label className={styles.search}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5"/><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.5"/></svg><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} type="search" aria-label="Пошук випічки" placeholder="Знайти щось смачне" /></label>
        </div>
        <p className={styles.demoNote}>{demo ? 'Знайомство з майбутнім каталогом: фото й позиції наведені для прикладу.' : 'Асортимент і ціни з нашої вітрини. Наявність уточнюйте в пекарні.'}</p>
        <div className={styles.products} aria-live="polite">{visible.slice((currentPage - 1) * 18, currentPage * 18).map((product, index) => <article key={product.id} className={`${styles.product} ${product.available === false ? styles.unavailableProduct : ''}`}>
          <button className={styles.productImage} onClick={() => openProduct(product)} aria-label={`Детальніше: ${product.name}`}><Image unoptimized={product.image.startsWith('https://')} src={product.image} alt={product.name} fill sizes="(max-width: 440px) 100vw, (max-width: 760px) 50vw, 33vw" />{product.tag && <span className={styles.productTag}>{product.tag}</span>}<span className={styles.imageIndex}>{((currentPage - 1) * 18 + index + 1).toString().padStart(2, '0')}</span></button>
          <div className={styles.productMeta}><span>{product.categoryLabel}</span><span className={styles.price}>{product.price != null ? `${product.price.toLocaleString('uk-UA')} ₴` : demo ? 'Приклад асортименту' : ''}</span></div>
          <div className={styles.productHeading}><button className={styles.productTitle} onClick={() => openProduct(product)}><h3>{product.name}</h3><span><Arrow diagonal /></span></button><button className={styles.quickAdd} disabled={cannotAdd(product)} onClick={() => addProduct(product)} aria-label={`Додати до кошика: ${product.name}`} title={product.available === false ? 'Немає в наявності' : 'Додати до кошика'}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></button></div>
          {product.available === false && <p className={styles.stockStatus}>Немає в наявності</p>}
          <p className={styles.productDescription}>{product.description}</p>
        </article>)}</div>
        {pageCount > 1 && <nav className={styles.pagination} aria-label="Сторінки каталогу"><button disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}>← Назад</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button key={number} aria-label={`Сторінка ${number}`} aria-current={currentPage === number ? 'page' : undefined} onClick={() => changePage(number)}>{number}</button>)}<button disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)}>Далі →</button></nav>}
        {visible.length === 0 && <div className={styles.empty}><h3>Цього смаку поки немає у вітрині</h3><p>Спробуйте іншу назву або категорію.</p><button onClick={() => { setQuery(''); setCategory('all'); setAvailableOnly(false); setPage(1); }}>Показати всю випічку <Arrow /></button></div>}
        <div className={styles.catalogBottom}><span>Смак краще знайомиться наживо.</span><a href="#location">Завітайте до пекарні <Arrow diagonal /></a></div>
      </section>
      <section id="about" className={styles.about} aria-labelledby="about-title">
        <div className={styles.aboutPhoto}><Image src="/images/baking.jpg" alt="Кошик золотавих круасанів — демонстраційна фотографія випічки" fill sizes="(max-width: 760px) 100vw, 45vw" /><span>МАЛЕНЬКІ РИТУАЛИ. ВЕЛИКЕ ЗАДОВОЛЕННЯ.</span></div>
        <div className={styles.aboutCopy}><p className={styles.eyebrow}>БІЛЬШЕ, НІЖ ПРОСТО ВИПІЧКА</p><h2 id="about-title">У кожного хліба —<br /><em>своя історія.</em></h2><p>А у кожного з нас — свій улюблений шматочок. Хтось обирає скоринку, хтось — ніжну середину. Хтось починає з хліба ранок, а хтось збирає навколо нього всю родину.</p><p>«Хлібне ремесло» — пекарня у Харкові. Запрошуємо познайомитися, обрати щось до свого столу й зробити звичайний день трохи смачнішим.</p><div className={styles.aboutSignature}><Wheat /><span>Прості радощі.<br /><em>Справжнє тепло.</em></span></div></div>
      </section>
      <section id="location" className={styles.location} aria-labelledby="location-title">
        <div className={styles.locationCopy}><p className={styles.eyebrow}>ЗУСТРІНЕМОСЯ ЗА ХЛІБОМ</p><h2 id="location-title">Ми <em>поруч.</em></h2><p>Завітайте за улюбленою випічкою.<br />Будемо раді бачити вас у пекарні.</p><address><Pin /><div>{bakery.city}<strong>{bakery.address}</strong></div></address><a className={styles.primary} href={bakery.mapsUrl} target="_blank" rel="noopener noreferrer">Де ми знаходимося <Arrow diagonal /></a></div>
        <div className={styles.mapWrap}><iframe title={`${bakery.name} на Google Maps — ${bakery.fullAddress}`} src={`https://maps.google.com/maps?q=${encodeURIComponent(`${bakery.name} ${bakery.fullAddress}`)}&output=embed&hl=uk&z=16`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /><a href={bakery.mapsUrl} target="_blank" rel="noopener noreferrer" className={styles.mapCard}><span className={styles.mapIcon}><Wheat /></span><span><strong>Хлібне ремесло</strong><small>{bakery.city}, {bakery.address}</small></span><Arrow diagonal /></a></div>
      </section>

    </main>
    <footer className={styles.footer}><a href="#home" className={styles.brand}><Wheat /><span>Хлібне ремесло<small>ПЕКАРНЯ З ХАРАКТЕРОМ</small></span></a><span>Харків · {bakery.address}</span><span>© 2026 Хлібне ремесло</span><a href="#home">Нагору ↑</a></footer>
    <dialog ref={dialog} className={styles.dialog} onClose={() => setSelected(null)} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }} aria-labelledby="product-dialog-title">
      {selected && <><button className={styles.closeDialog} onClick={() => dialog.current?.close()} aria-label="Закрити опис">×</button><div className={styles.dialogImage}><Image unoptimized={selected.image.startsWith('https://')} src={selected.image} alt={selected.name} fill sizes="(max-width: 700px) 90vw, 420px" /></div><div className={styles.dialogCopy}><p className={styles.eyebrow}>{selected.categoryLabel}</p><h2 id="product-dialog-title">{selected.name}</h2>{selected.available === false && <p className={styles.stockStatus}>Немає в наявності</p>}<p>{selected.description}</p><p className={styles.dialogPrice}>{selected.price != null ? `${selected.price.toLocaleString('uk-UA')} ₴` : ''}</p>{selected.ingredients && <><h3>Склад</h3><p>{selected.ingredients}</p></>}{selected.allergens && <><h3>Можливі алергени</h3><p>{selected.allergens}</p></>}{demo && <p className={styles.dialogNote}>Демонстраційна позиція.</p>}<div className={cartStyles.productActions}><button className={cartStyles.add} disabled={cannotAdd(selected)} onClick={() => addProduct(selected)}>Додати до кошика <span aria-hidden="true">+</span></button><button className={cartStyles.add} onClick={() => { dialog.current?.close(); setCartOpen(true); }}>Відкрити кошик</button></div><p role="status" className={cartStyles.addedNotice}>{added}</p></div></>}
    </dialog>
  </>;
}

