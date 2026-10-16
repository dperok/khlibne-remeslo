import { describe, expect, it } from 'vitest';
import { telegramCatalog } from './telegram-catalog.js';
import { bakery, catalog } from './catalog.data.js';
import type { Content } from './content.service.js';

describe('Telegram catalogue', () => {
  const content: Content = { bakery, demo: false, products: Array.from({ length: 19 }, (_, i) => ({ ...catalog[0], id: String(i), name: `Хліб <${i}>`, category: 'bread', price: 30 + i, visible: i !== 18 })) };
  it('shows category counts and excludes hidden products', () => {
    const view = telegramCatalog(content);
    expect(view.text).toContain('<b>18</b>');
    expect(view.reply_markup.inline_keyboard[0][0]).toEqual({ text: '🍞 Хліб · 18', callback_data: 'catalog:bread:0' });
  });
  it('paginates every product without truncation and escapes HTML', () => {
    const views = [0, 1, 2].map((page) => telegramCatalog(content, 'bread', page));
    expect(views[0].text).toContain('Хліб &lt;0&gt;');
    expect(views[0].text).toContain('30 ₴');
    expect(views[2].text).toContain('Хліб &lt;17&gt;');
    expect(views[2].text).not.toContain('Хліб &lt;18&gt;');
    expect(views[1].reply_markup.inline_keyboard[0]).toHaveLength(2);
    expect(telegramCatalog(content, 'bread', 999).text).toContain('Сторінка 3 з 3');
  });
});
