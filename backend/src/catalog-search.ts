// Keep the browser catalogue and API search consistent.
function words(value: string): string[] {
  return value.normalize('NFKC').toLocaleLowerCase('uk')
    .replace(/[іїы]/g, 'и').replace(/[ёэ]/g, 'е').replace(/ь/g, '')
    .replace(/['’ʼ`]/g, '')
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

// Search-only word families. Product names and database records stay untouched.
// Explicit roots avoid merging unrelated words through approximate spelling.
const families: RegExp[] = [
  /^(булк|булок|булоч)/, /^(хлеб|хлиб)/, /^(пирог|пирож(?!н)|пириг|пириж)/,
  /^(печен[еяию]|печив)/, /^(пирожн|тистеч)/,
  /^(сырник|сирник)/, /^(творо[гж]|сыр|сир)/,
  /^(яблок|яблоч|яблук|яблуч)/, /^(клубник|полуниц|полунич)/,
  /^(черник|чорниц|чорнич)/, /^(клюкв|журавлин)/, /^(изюм|родзин)/,
  /^(орех|ореш|горих|гориш)/, /^(грецк|волоск)/,
  /^(картоф|картош|картоп)/, /^(куриц|курин|курк|куряч)/, /^(печенк|печинк)/,
  /^(ветчин|шинк)/, /^(лук|цибул)/, /^(чесно|часни)/,
  /^(тыкв|гарбуз)/, /^(морков|моркв)/, /^(яиц|яйц|яич|яеч)/,
  /^(чернослив|чорнослив)/, /^(семеч|семен|насин)/, /^(подсолн|соняш)/,
  /^(отруб|висив)/, /^(гречнев|гречан)/, /^(сыворот|сироват)/,
  /^(цельнозерн|цилнозерн)/, /^(зернов|зерн)/,
  /^(бел|бил)/, /^(темн|т[ео]мн)/, /^(черн|чорн)/,
  /^(слад|солод)/, /^(сахар|цукров)/, /^(солен|солон)/,
  /^(жарен|смажен)/, /^(сливоч|вершк)/, /^(заварн|заварен)/,
  /^(слоен|листков|слойк)/, /^(песоч|писоч)/,
  /^(снеж|сниж)/, /^(ягод|ягид)/, /^(весенн|веснян)/,
  /^(домашн)/, /^(семейн|симейн)/, /^(молочн)/,
  /^(медов)/, /^(шоколад|шок$)/, /^(ванил)/, /^(кориц)/,
  /^(маков|мак$)/, /^(лимон)/, /^(апельсин)/, /^(имбир)/,
  /^(груш)/, /^(малин)/, /^(вишн)/, /^(смородин)/, /^(абрикос)/,
  /^(персик)/, /^(гриб)/, /^(капуст)/, /^(горох|горош)/,
  /^(рулет)/, /^(рогал)/, /^(пончик|донат)/, /^(эклер|еклер)/,
  /^(пицц|пиц)/, /^(кулич|паск|пасх)/, /^(панеттон|панетон|panetton)/,
  /^(киев|киив)/, /^(украин)/, /^(бородин)/, /^(рижск|ризк)/,
];
const stopWords = new Set(['с', 'со', 'з', 'из', 'изо', 'на', 'в', 'во', 'у', 'и', 'та']);

function family(word: string): number {
  return families.findIndex((pattern) => pattern.test(word));
}

// Bounded Damerau–Levenshtein: insertion, deletion, replacement, transposition.
// Short words and numbers must stay exact to avoid noisy catalogue results.
function hasSmallTypo(query: string, candidate: string): boolean {
  if (query.length < 4 || candidate.length < 4 || /\d/.test(query + candidate)) return false;
  const limit = query.length >= 8 && candidate.length >= 8 ? 2 : 1;
  if (Math.abs(query.length - candidate.length) > limit) return false;
  const rows = Array.from({ length: query.length + 1 }, (_, i) => [i]);
  rows[0] = Array.from({ length: candidate.length + 1 }, (_, i) => i);
  for (let i = 1; i <= query.length; i++) {
    for (let j = 1; j <= candidate.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (query[i - 1] === candidate[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && query[i - 1] === candidate[j - 2] && query[i - 2] === candidate[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[query.length][candidate.length] <= limit;
}

export function createCatalogSearch(query: string): (text: string) => boolean {
  const tokens = words(query);
  const meaningful = tokens.filter((word) => !stopWords.has(word));
  const terms = (meaningful.length ? meaningful : tokens).map((word) => ({ word, family: family(word) }));
  return (text) => {
    const candidates = words(text).map((word) => ({ word, family: family(word) }));
    return terms.every((term) => candidates.some((candidate) =>
      candidate.word.startsWith(term.word) || (term.family >= 0 && term.family === candidate.family) ||
      hasSmallTypo(term.word, candidate.word),
    ));
  };
}
