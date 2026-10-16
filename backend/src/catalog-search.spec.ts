import { describe, expect, it } from 'vitest';
import { createCatalogSearch } from './catalog-search.js';

describe('catalogue search', () => {
  it.each(['булочка ваниль', 'ВАНІЛЬ булочка', '  булочка   «ваніль» ', 'булочка (ванільна)'])('finds a decorated Ukrainian name for %s', (query) => {
    expect(createCatalogSearch(query)('Булочка «Ванільна»')).toBe(true);
  });
  it('ignores apostrophe variants and word order', () => {
    expect(createCatalogSearch("мясо пиріг")('Пиріг «Мʼясо»')).toBe(true);
    expect(createCatalogSearch('мак вишня')('Слойка Мак-Вишня Смаколик')).toBe(true);
  });
  it('requires all query words and keeps short terms at word boundaries', () => {
    expect(createCatalogSearch('булочка ваниль')('Булочка з корицею')).toBe(false);
    expect(createCatalogSearch('рис')('Трубочка Іриска')).toBe(false);
    expect(createCatalogSearch('  ')('Хліб')).toBe(true);
  });
  it.each([
    ['белый хлеб', 'Хліб білий 550'],
    ['хлеб с чесноком', 'Пампушка часник Хліб'],
    ['пирожок картошка грибы', 'Пиріг «Картопля—гриби»'],
    ['пирог с яблоками', 'Пиріг «Яблуко»'],
    ['булка ваниль', 'Булочка «Ванільна»'],
    ['булочка сахарная', 'Булка «Цукрова»'],
    ['булочки', 'Булка «Цукрова»'],
    ['печенье имбирное', 'Печіво імбирне'],
    ['творожная пасха', 'Паска сирна'],
    ['кулич изюм', 'Паска з родзинками'],
    ['пирожное киевское', 'Київське тістечко'],
    ['пирожок курица грибы', 'Пиріг «Курка — гриби»'],
    ['пирог клубника', 'Пиріг «полуниця»'],
    ['хлеб отруби', 'Хліб з висівками'],
    ['слоеная мак', 'Слойка Мак Чарівниця'],
    ['донат крем', 'Пончик з заварним кремом'],
  ])('matches Russian word families: %s', (query, name) => {
    expect(createCatalogSearch(query)(name)).toBe(true);
  });
  it('keeps different products and meaningful restrictions separate', () => {
    expect(createCatalogSearch('пирожное')('Пиріжок з мʼясом')).toBe(false);
    expect(createCatalogSearch('без цукатів')('Паска з цукатами')).toBe(false);
    expect(createCatalogSearch('булка клубника')('Булочка з корицею')).toBe(false);
  });
  it.each([
    ['булчка', 'Булочка «Ванільна»'],
    ['буллочка', 'Булочка «Ванільна»'],
    ['булочкп', 'Булочка «Ванільна»'],
    ['блуочка', 'Булочка «Ванільна»'],
    ['булчка ваниль', 'Булочка «Ванільна»'],
    ['бородинский', 'Хліб Бородинський'],
  ])('tolerates small typos: %s', (query, name) => {
    expect(createCatalogSearch(query)(name)).toBe(true);
  });
  it('does not fuzzy-match short words, quantities, or unrelated words', () => {
    expect(createCatalogSearch('мак')('Манго пир')).toBe(false);
    expect(createCatalogSearch('рис')('Рогалик')).toBe(false);
    expect(createCatalogSearch('550')('Хліб білий 350')).toBe(false);
    expect(createCatalogSearch('булчка ваниль')('Булочка з корицею')).toBe(false);
    expect(createCatalogSearch('абракадабра')('Булочка «Ванільна»')).toBe(false);
  });
});
