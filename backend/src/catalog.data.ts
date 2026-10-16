// Illustrative catalogue; replace with the bakery's approved range before launch.
export const catalog = [
  { id: 'country-bread', name: 'Хліб із насінням', category: 'bread', categoryLabel: 'Хліб', image: '/images/bread-hero.jpg', description: 'Рум’яна скоринка, м’яка середина та щедра жменя насіння. До сніданку, супу або просто зі шматочком масла.', ingredients: 'Борошно, вода, закваска, сіль, насіння соняшника та кунжут.', allergens: 'Глютен, кунжут.', tag: 'До сімейного столу' },
  { id: 'wholegrain', name: 'Цільнозерновий хліб', category: 'bread', categoryLabel: 'Хліб', image: '/images/bread.jpg', description: 'Насичений смак зерна й ніжна м’якушка. Для неспішного сніданку та улюблених бутербродів.', ingredients: 'Цільнозернове пшеничне борошно, вода, закваска, сіль.', allergens: 'Глютен.', tag: 'Зерновий характер' },
  { id: 'butter-croissant', name: 'Вершковий круасан', category: 'pastry', categoryLabel: 'Листкова випічка', image: '/images/croissant.jpg', description: 'Тонкі золотаві шари, легкий хрускіт і вершковий аромат. Маленький привід зробити перерву.', ingredients: 'Пшеничне борошно, вершкове масло, молоко, цукор, дріжджі, яйце, сіль.', allergens: 'Глютен, молоко, яйця.', tag: 'До ранкової кави' },
  { id: 'toast-bread', name: 'Тостовий хліб', category: 'bread', categoryLabel: 'Хліб', image: '/images/sweet.jpg', description: 'Ніжний хліб для сніданків і теплих тостів. На фото — приклад подачі з ягодами та бананом.', ingredients: 'Приклад рецептури: пшеничне борошно, молоко, вершкове масло, дріжджі, цукор, сіль.', allergens: 'Глютен, молоко.', tag: 'Сніданок без поспіху' },
  { id: 'morning-pastry', name: 'Мінікруасани', category: 'pastry', categoryLabel: 'Листкова випічка', image: '/images/baking.jpg', description: 'Маленькі листкові круасани для великого задоволення. До чаю або на затишний сніданок.', ingredients: 'Пшеничне борошно, вершкове масло, молоко, цукор, дріжджі, яйце.', allergens: 'Глютен, молоко, яйця.', tag: 'Маленька радість' },
  { id: 'sweet-bun', name: 'Булочка з корицею', category: 'sweet', categoryLabel: 'До чаю', image: '/images/cinnamon.jpg', description: 'М’яка завитушка з ароматною корицею та цукровою скоринкою. До горнятка чаю й теплої розмови.', ingredients: 'Приклад рецептури: пшеничне борошно, молоко, масло, цукор, яйця, кориця.', allergens: 'Глютен, молоко, яйця.', tag: 'Для солодкої миті' },
];

export const bakery = {
  name: 'Хлібне ремесло',
  city: 'Харків',
  address: 'вул. Шевченка, 167',
  fullAddress: 'вулиця Шевченка, 167, Харків, Харківська область, 61000',
  mapsUrl: 'https://www.google.com/maps?cid=10178684025899548076',
  phone: null,
  instagram: null,
  email: null,
  addressSource: 'Google Maps',
  latitude: 50.0025971,
  longitude: 36.2705935,
};
