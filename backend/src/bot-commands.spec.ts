import { BotCommandsService } from './bot-commands.service.js';
import type { ContentService } from './content.service.js';
import { bakery, catalog } from './catalog.data.js';

describe('Telegram access and commands', () => {
  const store = { get: vi.fn(async () => ({ products: catalog, bakery, demo: true })), setVisibility: vi.fn(), setContact: vi.fn() };
  const commands = new BotCommandsService(store as unknown as ContentService);
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('TELEGRAM_ADMIN_IDS', '470334534,5711475783'); });
  afterEach(() => vi.unstubAllEnvs());
  const message = (id: number, text: string, type = 'private') => ({ from: { id }, chat: { id, type }, text });

  it.each([470334534, 5711475783])('allows the full numeric Telegram ID %s', async (id) => {
    expect(await commands.handle('admin', message(id, '/status'))).toContain('Товарів: 6');
  });
  it('rejects unauthorized senders and groups before accessing or changing content', async () => {
    expect(await commands.handle('admin', message(99999, '/hide country-bread'))).toBeNull();
    expect(await commands.handle('admin', message(470334534, '/hide country-bread', 'group'))).toBeNull();
    expect(await commands.handle('admin', { from: { id: 99999 }, chat: { id: 470334534, type: 'private' }, text: '/status' })).toBeNull();
    expect(store.get).not.toHaveBeenCalled(); expect(store.setVisibility).not.toHaveBeenCalled();
  });
  it('does not allow an ordinary user bot to run admin commands', async () => {
    await commands.handle('user', message(470334534, '/hide country-bread'));
    expect(store.setVisibility).not.toHaveBeenCalled();
  });
  it('routes authorized visibility and contact commands to shared content', async () => {
    await commands.handle('admin', message(5711475783, '/hide country-bread'));
    expect(store.setVisibility).toHaveBeenCalledWith('country-bread', false);
    await commands.handle('admin', message(470334534, '/contact email bakery@example.com'));
    expect(store.setContact).toHaveBeenCalledWith('email', 'bakery@example.com');
  });
  it('supports visitor keyboard buttons and returns the current address', async () => {
    expect(await commands.handle('user', message(99, '🥐 Випічка'))).toContain('Хліб із насінням');
    expect(await commands.handle('user', message(99, '📍 Адреса'))).toContain('Шевченка, 167');
    expect(await commands.handle('user', message(99, '☎️ Контакти'))).toContain('Контакти додамо');
  });
});
