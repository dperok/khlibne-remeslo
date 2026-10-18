export type RecipeIngredient = { ingredient_id: string; ingredient_name: string; structure_type: string; structure_netto?: number | string };
export type PosterRecipe = { product_id: string; ingredients?: RecipeIngredient[] };
const translations: Record<string,string> = {
  'борошно': 'борошно', 'борошно ржане': 'борошно житнє', 'масло растительное, кг': 'олія рослинна', 'молоко агромол, кг': 'молоко', 'сировотка': 'сироватка',
  'солод жидкий экстракт, кг': 'солодовий екстракт', 'кориандр зерно': 'коріандр у зернах', 'коріандр мелений': 'коріандр мелений', 'альфа бейс': 'поліпшувач «Альфа Бейс»', 'балтійський мікс 20кг': 'суміш «Балтійський Мікс»',
  'нордікс супер нью': 'поліпшувач «Нордікс Супер Нью»', 'смесь гречневая темная , кг': 'гречана суміш «Темна»', 'повидло яблучне кг': 'повидло яблучне', 'солод "ротор", кг': 'солод «Ротор»', 'насіння соняшника ядро': 'ядра насіння соняшника',
  'суміші чіабата, кг хлібний дім': 'суміш «Чіабата» («Хлібний дім»)', 'смесь панетон верона, кг': 'суміш «Панетон Верона»', 'глазур ( помадка цитрус італійська)': 'цитрусова глазур «Італійська»', 'суміш vanilla cake tm оптіма': 'суміш Vanilla Cake ТМ «Оптіма»', 'цукати апельсин': 'апельсинові цукати',
};
export function recipeDetails(product: PosterRecipe, prepacks: PosterRecipe[]) {
  const byId = new Map(prepacks.map(recipe => [String(recipe.product_id), recipe]));
  const names: string[] = []; const unresolved: string[] = [];
  function expand(items: RecipeIngredient[], path: string[]) {
    for (const item of items) {
      if (item.structure_netto !== undefined) {
        const amount = Number(item.structure_netto);
        if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid recipe quantity');
        if (amount === 0) continue;
      }
      const raw = item.ingredient_name?.trim().replace(/\s+/g, ' ');
      if (!raw) throw new Error('Missing ingredient name');
      if (String(item.structure_type) === '2') {
        const id = String(item.ingredient_id);
        if (path.includes(id)) throw new Error('Circular prepack recipe');
        const nested = byId.get(id)?.ingredients;
        if (nested?.length) { expand(nested, [...path,id]); continue; }
        unresolved.push(raw);
      }
      names.push(translations[raw.toLowerCase()] ?? raw.toLocaleLowerCase('uk-UA'));
    }
  }
  expand(product.ingredients ?? [], []);
  const ingredients = [...new Set(names)];
  const joined = ingredients.join('; ');
  const allergens: string[] = [];
  if (/житн|пшенич|клейковин|ячмін|овес|вівсян|спельт/i.test(joined)) allergens.push('злаки з глютеном');
  if (/молок|сироват|вершков|сметан|творог|(?:^|; )сир(?:\s|;|$)/i.test(joined)) allergens.push('молоко');
  if (/яйц|яєч/i.test(joined)) allergens.push('яйця');
  if (/кунжут/i.test(joined)) allergens.push('кунжут');
  if (/арахіс/i.test(joined)) allergens.push('арахіс');
  if (/мигдал|фундук|волоськ|кеш.?ю|фісташ|пекан/i.test(joined)) allergens.push('горіхи');
  if (/соє|соя/i.test(joined)) allergens.push('соя');
  const flourUnspecified = /(?:^|; )борошно(?:;|$)|висівки/.test(joined);
  return { ingredients, allergens, flourUnspecified, unresolved };
}
