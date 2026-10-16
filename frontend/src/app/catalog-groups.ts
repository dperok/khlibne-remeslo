export const catalogGroups = [
  { id: 'all', name: 'Уся випічка' },
  { id: 'bread', name: 'Хліб та багети' },
  { id: 'buns', name: 'Булочки' },
  { id: 'pies', name: 'Пироги та пиріжки' },
  { id: 'savory', name: 'Піца та солона випічка' },
  { id: 'puff', name: 'Листкова випічка' },
  { id: 'rolls', name: 'Рулети та рогалики' },
  { id: 'cakes', name: 'Торти' },
  { id: 'pastries', name: 'Тістечка та еклери' },
  { id: 'cookies', name: 'Печиво та кекси' },
  { id: 'doughnuts', name: 'Пончики' },
];

export function catalogGroup(product: { name: string; category: string }) {
  const name = product.name.toLocaleLowerCase('uk');
  if (/булоч|булка|бублик|віночок/.test(name)) return 'buns';
  if (product.category === 'bread') return 'bread';
  if (/^слойка|круасан/.test(name)) return 'puff';
  if (/рулет|рогалик|завиванець|веселка/.test(name)) return 'rolls';
  if (/пончик|донат/.test(name)) return 'doughnuts';
  if (/пиріг|пиріж|^пир /.test(name)) return 'pies';
  if (product.category === 'pastry') return 'savory';
  if (/^торт|медовик|пінчер|шоколадниця/.test(name)) return 'cakes';
  if (/печ[иі]во|кекс|горіш|пахлава/.test(name)) return 'cookies';
  return 'pastries';
}
