import { TelegramService } from './telegram.service.js';
import type { BotCommandsService } from './bot-commands.service.js';
import type { BotInteractionsService } from './bot-interactions.service.js';
const interactions = { message: async () => false, callback: async () => {}, retryDeliveries: async () => {} } as unknown as BotInteractionsService;

describe('Telegram polling transport', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it('never starts background polling on Vercel', async () => {
    vi.stubEnv('VERCEL', '1'); vi.stubEnv('TELEGRAM_USER_BOT_TOKEN', 'test-token'); vi.stubEnv('TELEGRAM_ADMIN_BOT_TOKEN', '');
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const service = new TelegramService({} as BotCommandsService, interactions);
    service.onModuleInit();
    expect(service.status().user).toBe('webhook'); expect(fetchMock).not.toHaveBeenCalled();
    await service.onApplicationShutdown();
  });
  it('does not contact Telegram with blank tokens', async () => {
    vi.stubEnv('TELEGRAM_USER_BOT_TOKEN', ''); vi.stubEnv('TELEGRAM_ADMIN_BOT_TOKEN', '');
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const service = new TelegramService({} as BotCommandsService, interactions);
    service.onModuleInit();
    expect(service.status()).toEqual({ user: 'disabled', admin: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled(); await service.onApplicationShutdown();
  });
  it.each([{ role: 'user' as const, reply: 'Вітаємо!' }, { role: 'admin' as const, reply: null }])('processes $role messages, sends only non-null replies, and advances the offset', async ({ role, reply }) => {
    vi.stubEnv('TELEGRAM_USER_BOT_TOKEN', role === 'user' ? 'test-token' : ''); vi.stubEnv('TELEGRAM_ADMIN_BOT_TOKEN', role === 'admin' ? 'test-token' : '');
    let polls = 0;
    const fetchMock = vi.fn(async (url: string, options: RequestInit) => {
      let result: unknown = {};
      if (url.endsWith('getWebhookInfo')) result = { url: '' };
      if (url.endsWith('getUpdates')) {
        if (polls++ === 0) result = [{ update_id: 45, message: { text: '/start', chat: { id: 777, type: 'private' }, from: { id: 777 } } }];
        else return new Promise<Response>((_, reject) => { options.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); if (options.signal!.aborted) reject(new Error('aborted')); });
      }
      return new Response(JSON.stringify({ ok: true, result }), { headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const commands = { handle: vi.fn(async () => reply) };
    const service = new TelegramService(commands as unknown as BotCommandsService, interactions);
    service.onModuleInit();
    await vi.waitFor(() => expect(polls).toBe(2));
    const sends = fetchMock.mock.calls.filter(([url]) => url.endsWith('sendMessage'));
    expect(sends).toHaveLength(reply === null ? 0 : 1);
    if (reply !== null) expect(JSON.parse(sends[0][1].body as string)).toMatchObject({ chat_id: 777, text: 'Вітаємо!' });
    const lastPoll = fetchMock.mock.calls.filter(([url]) => url.endsWith('getUpdates')).at(-1)!;
    expect(JSON.parse(lastPoll[1].body as string).offset).toBe(46);
    await service.onApplicationShutdown(); expect(service.status()[role]).toBe('stopped');
  });
  it('silences command responses in the admin bot webhook transport', async () => {
    vi.stubEnv('TELEGRAM_ADMIN_BOT_TOKEN', 'test-admin-token'); vi.stubEnv('TELEGRAM_MODE', 'webhook');
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: {} }))); vi.stubGlobal('fetch', fetcher);
    const commands = { handle: vi.fn(async () => 'Статус оновлено') } as unknown as BotCommandsService;
    const service = new TelegramService(commands, interactions); service.onModuleInit();
    await service.handleUpdate('admin', { update_id: 1, message: { text: '/status', from: { id: 470334534 }, chat: { id: 470334534, type: 'private' } } });
    expect(JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).disable_notification).toBe(true);
    await service.onApplicationShutdown();
  });
  it('preserves an existing webhook rather than silently deleting it', async () => {
    vi.stubEnv('TELEGRAM_USER_BOT_TOKEN', 'test-token'); vi.stubEnv('TELEGRAM_ADMIN_BOT_TOKEN', '');
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({ ok: true, result: url.endsWith('getWebhookInfo') ? { url: 'https://example.com/webhook' } : {} })));
    vi.stubGlobal('fetch', fetchMock);
    const service = new TelegramService({} as BotCommandsService, interactions);
    service.onModuleInit(); await vi.waitFor(() => expect(service.status().user).toBe('webhook_configured'));
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('deleteWebhook') || url.endsWith('getUpdates'))).toBe(false);
    await service.onApplicationShutdown();
  });
});

