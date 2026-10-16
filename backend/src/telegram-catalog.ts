import type { Content } from './content.service.js';

const categories = [
  { id: 'bread', title: '🍞 Хліб' },
  { id: 'pastry', title: '🥐 Солона та листкова' },
  { id: 'sweet', title: '🍰 До чаю' },
];
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function telegramCatalog(content: Content, category = 'menu', requestedPage = 0): { text: string; parse_mode: string; reply_markup: { inline_keyboard: { text: string; callback_data: string }[][] } } {
  const all = content.products.filter((product) => product.visible !== false);
  const buttons = categories.map(({ id, title }) => [{ text: `${title} · ${all.filter((p) => p.category === id).length}`, callback_data: `catalog:${id}:0` }]);
  if (category === 'menu') return {
    text: `🌾 <b>Хлібне ремесло</b>\n<i>Трохи тепла до вашого столу</i>\n\nУ вітрині — <b>${all.length}</b> смаків.\nОберіть категорію нижче 👇\n\n📍 ${escape(content.bakery.address)}\n<i>Наявність уточнюйте в пекарні.</i>`,
    parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons },
  };
  const selected = categories.find((item) => item.id === category);
  if (!selected) return telegramCatalog(content);
  const products = all.filter((product) => product.category === category);
  const pages = Math.max(1, Math.ceil(products.length / 8));
  const page = Math.max(0, Math.min(Math.floor(requestedPage), pages - 1));
  const rows = products.slice(page * 8, page * 8 + 8).map((product, i) =>
    `${page * 8 + i + 1}. <b>${escape(product.name)}</b>\n    ${product.price != null ? `${product.price.toLocaleString('uk-UA')} ₴` : 'Ціну уточнюйте в пекарні'}`);
  const navigation = [];
  if (page > 0) navigation.push({ text: '← Назад', callback_data: `catalog:${category}:${page - 1}` });
  if (page + 1 < pages) navigation.push({ text: 'Далі →', callback_data: `catalog:${category}:${page + 1}` });
  return { text: `${selected.title} <b>· Наша вітрина</b>\n\n${rows.join('\n\n') || 'Скоро тут буде щось смачне.'}\n\n<i>Сторінка ${page + 1} з ${pages} · ${products.length} позицій</i>\n📍 Чекаємо на вас у пекарні!`,
    parse_mode: 'HTML', reply_markup: { inline_keyboard: [...(navigation.length ? [navigation] : []), [{ text: '☰ Усі категорії', callback_data: 'catalog:menu:0' }]] } };
}
