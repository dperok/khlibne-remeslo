import { BotInteractionsService } from './bot-interactions.service.js';
import type { BotCallback, TelegramCall } from './bot-interactions.service.js';
import { BotCommandsService } from './bot-commands.service.js';
import type { BotMessage } from './bot-commands.service.js';
import type { ContentService } from './content.service.js';
import type { SupportRepository, Ticket } from './support.repository.js';
import { bakery } from './catalog.data.js';

describe('Telegram location and two-bot correspondence', () => {
  const ticket: Ticket = { id: 'a559935b-0e2b-4c12-a11a-e1c5ea45ae55', user_id: '12345', source_message_id: '7', sender_name: 'Олена', message_text: 'Чи є сьогодні круасани?' };
  const user = (text?: string): BotMessage => ({ message_id: 7, from: { id: 12345, first_name: 'Олена' }, chat: { id: 12345, type: 'private' }, text });
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let content: ContentService;
  let service: BotInteractionsService;
  let sent: { token: string; method: string; body: Record<string, unknown> }[];
  let call: TelegramCall;
  let delivered: Set<number>;
  beforeEach(() => {
    vi.stubEnv('TELEGRAM_USER_BOT_TOKEN', 'visitor-token'); vi.stubEnv('TELEGRAM_ADMIN_BOT_TOKEN', 'admin-token');
    vi.stubEnv('TELEGRAM_ADMIN_IDS', '470334534,5711475783');
    delivered = new Set();
    repository = { setMode: vi.fn(), inMode: vi.fn(async () => true), create: vi.fn(async () => ticket),
      pending: vi.fn(async (admin: number) => delivered.has(admin) ? [] : [ticket]),
      delivered: vi.fn(async (_ticket: string, admin: number) => { delivered.add(admin); }),
      countDelivered: vi.fn(async () => delivered.size), ticketForButton: vi.fn(async () => ticket),
      savePrompt: vi.fn(), ticketForPrompt: vi.fn(async () => ticket), replied: vi.fn(async () => false), markReplied: vi.fn(), saveVisitorAnswer: vi.fn(), isVisitorReply: vi.fn(async () => false), cancelPrompts: vi.fn(), pendingReplyStatuses: vi.fn(async () => []), replyStatusNotified: vi.fn() };
    repository.latestReply = vi.fn(async () => ({ admin_id: '5711475783', admin_name: 'Адміністратор (@baker)', message_text: 'Так, круасани є.' }));
    repository.hasReply = vi.fn(async () => false);
    repository.withReplyLock = vi.fn(async (_id: string, work: (store: SupportRepository) => Promise<void>) => { await work(repository as unknown as SupportRepository); return true; });
    repository.saveConfirmation = vi.fn(async () => ({ id: ticket.id }));
    repository.confirmationPrompt = vi.fn(); repository.getConfirmation = vi.fn();
    repository.takeConfirmation = vi.fn(async () => true); repository.ticketById = vi.fn(async () => ticket);
    content = { get: async () => ({ bakery }) } as unknown as ContentService;
    service = new BotInteractionsService(repository as unknown as SupportRepository, new BotCommandsService(content), content);
    sent = [];
    call = vi.fn(async (token: string, method: string, body: Record<string, unknown>) => { sent.push({ token, method, body }); return { message_id: 100 + sent.length }; }) as unknown as TelegramCall;
  });
  afterEach(() => vi.unstubAllEnvs());

  it('does not send venues or catalogues for retired visitor commands', async () => {
    expect(await service.message('user', user('/address'), call)).toBe(false);
    expect(await service.message('user', user('/catalog'), call)).toBe(false);
    expect(sent).toHaveLength(0);
  });
  it('opens and cancels the explicit support mode', async () => {
    await service.message('user', user('/support'), call);
    expect(repository.setMode).toHaveBeenCalledWith(12345, true);
    expect(repository.create).not.toHaveBeenCalled();
    await service.message('user', user('/cancel'), call);
    expect(repository.setMode).toHaveBeenCalledWith(12345, false);
  });
  it('delivers the visitor message to each administrator with reply buttons and avoids resending', async () => {
    await service.message('user', user(ticket.message_text), call);
    const notifications = sent.filter((entry) => entry.token === 'admin-token');
    expect(notifications.map((entry) => entry.body.chat_id).sort()).toEqual([470334534, 5711475783]);
    for (const notification of notifications) {
      expect(notification.body.text).toContain(ticket.message_text);
      expect(notification.body.disable_notification).toBe(false);
      expect(notification.body.reply_markup).toEqual({ inline_keyboard: [[{ text: 'Відповісти', callback_data: `reply:${ticket.id}` }]] });
    }
    await service.retryDeliveries(call);
    expect(sent.filter((entry) => entry.token === 'admin-token')).toHaveLength(2);
  });
  it('sends admin service replies silently while visitor messages keep their notification setting', async () => {
    await service.message('admin', { message_id: 80, text: '/cancel', from: { id: 470334534 }, chat: { id: 470334534, type: 'private' } }, call);
    const adminReply = sent.find(entry => entry.token === 'admin-token' && entry.method === 'sendMessage');
    expect(adminReply?.body.disable_notification).toBe(true);
    await service.message('user', user('/support'), call);
    expect(sent.filter(entry => entry.token === 'visitor-token').at(-1)?.body.disable_notification).toBeUndefined();
  });
  it('closes support after one saved message and requires /support for another', async () => {
    let active = false;
    repository.setMode.mockImplementation(async (_id: number, enabled: boolean) => { active = enabled; });
    repository.inMode.mockImplementation(async () => active);
    await service.message('user', user('/support'), call);
    await service.message('user', user(ticket.message_text), call);
    expect(active).toBe(false);
    expect(sent.at(-1)?.body.text).toContain('Режим зв’язку завершено');
    expect(await service.message('user', { ...user('Ще повідомлення'), message_id: 8 }, call)).toBe(false);
    expect(repository.create).toHaveBeenCalledTimes(1);
    await service.message('user', user('/support'), call);
    expect(active).toBe(true);
  });
  it('keeps the failed recipient pending while delivering to the other admin', async () => {
    const partial = (async (token: string, method: string, body: Record<string, unknown>) => {
      if (body.chat_id === 470334534) throw Object.assign(new Error('blocked'), { code: 403 });
      return call(token, method, body);
    }) as TelegramCall;
    await service.message('user', user(ticket.message_text), partial);
    expect([...delivered]).toEqual([5711475783]);
    await service.retryDeliveries(call);
    expect(delivered.size).toBe(2);
  });
  it('forwards replies to a saved administrator answer without reopening support mode', async () => {
    repository.inMode.mockResolvedValue(false);
    repository.isVisitorReply.mockResolvedValue(true);
    const reply = { ...user('Дякую, а які є начинки?'), message_id: 8, reply_to_message: { message_id: 101 } };
    expect(await service.message('user', reply, call)).toBe(true);
    expect(repository.isVisitorReply).toHaveBeenCalledWith(12345, 101);
    expect(repository.create).toHaveBeenCalledWith(12345, 8, 'Олена', reply.text, [470334534, 5711475783]);
    expect(sent.filter((entry) => entry.token === 'admin-token')).toHaveLength(2);
    expect(repository.setMode).not.toHaveBeenCalledWith(12345, true);
  });
  it('does not forward replies to unrelated bot messages or other visitors answers', async () => {
    repository.inMode.mockResolvedValue(false);
    repository.isVisitorReply.mockResolvedValue(false);
    expect(await service.message('user', { ...user('Текст'), reply_to_message: { message_id: 101 } }, call)).toBe(false);
    expect(repository.create).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });
  it('accepts older administrator answers only when Telegram identifies this visitor bot as sender', async () => {
    repository.inMode.mockResolvedValue(false);
    const legacyCall = (async (token, method, body) => method === 'getMe' ? { id: 456 } : call(token, method, body)) as TelegramCall;
    const reply = { ...user('Продовження'), message_id: 8, reply_to_message: { message_id: 101, from: { id: 999, is_bot: true }, text: 'Відповідь пекарні:\n\nТак' } };
    expect(await service.message('user', reply, legacyCall)).toBe(false);
    expect(repository.create).not.toHaveBeenCalled();
    reply.reply_to_message.from.id = 456;
    expect(await service.message('user', reply, legacyCall)).toBe(true);
    expect(repository.create).toHaveBeenCalledTimes(1);
  });
  function callback(admin: number): BotCallback { return { id: 'callback-id', data: `reply:${ticket.id}`, from: { id: admin }, message: { message_id: 99, chat: { id: admin, type: 'private' } } }; }
  it('binds a reply prompt to the correct administrator and sends their reply through the visitor bot', async () => {
    await service.callback(callback(5711475783), call);
    expect(repository.ticketForButton).toHaveBeenCalledWith(ticket.id, 5711475783, 99);
    expect(sent.some((entry) => entry.method === 'answerCallbackQuery')).toBe(true);
    const prompt = sent.find((entry) => entry.body.reply_markup)!;
    expect(prompt.body.reply_markup).toMatchObject({ force_reply: true });
    expect(repository.savePrompt).toHaveBeenCalledWith(5711475783, expect.any(Number), ticket.id);
    await service.message('admin', { message_id: 200, from: { id: 5711475783 }, chat: { id: 5711475783, type: 'private' }, reply_to_message: { message_id: 102 }, text: 'Так, чекаємо на вас!' }, call);
    expect(repository.ticketForPrompt).toHaveBeenCalledWith(5711475783, 102);
    expect(sent).toContainEqual(expect.objectContaining({ token: 'visitor-token', body: expect.objectContaining({ chat_id: '12345', text: 'Відповідь пекарні:\n\nТак, чекаємо на вас!', reply_parameters: { message_id: 7, allow_sending_without_reply: true } }) }));
    expect(repository.markReplied).toHaveBeenCalledWith(5711475783, 200, ticket.id, 'Так, чекаємо на вас!', expect.any(String));
    expect(repository.saveVisitorAnswer).toHaveBeenCalledWith(ticket.id, expect.any(Number));
    expect(repository.cancelPrompts).toHaveBeenCalledWith(5711475783);
    expect(sent.at(-1)?.body.text).toContain('Режим відповіді завершено');
  });
  it('requires explicit confirmation for any further answer, including an old prompt opened before another admin replied', async () => {
    repository.hasReply.mockResolvedValue(true);
    const message: BotMessage = { message_id: 200, from: { id: 470334534 }, chat: { id: 470334534, type: 'private' }, reply_to_message: { message_id: 102 }, text: 'Додаткова відповідь' };
    await service.message('admin', message, call);
    expect(sent.filter(entry => entry.token === 'visitor-token')).toHaveLength(0);
    const context = sent.find(entry => String(entry.body.text).startsWith('Остання відповідь'))!;
    expect(context.body.text).toContain('Адміністратор (@baker) · ID 5711475783');
    expect(context.body.text).toContain('Так, круасани є.');
    expect(context.body.disable_notification).toBe(true);
    const prompt = sent.find(entry => String(entry.body.text).includes('Надіслати ще одну'))!;
    expect(prompt.body.reply_markup).toMatchObject({ inline_keyboard: [[{ text: 'Підтвердити', callback_data: `confirm:${ticket.id}` }, { text: 'Скасувати', callback_data: `discard:${ticket.id}` }]] });
    expect(repository.markReplied).not.toHaveBeenCalled();
    repository.getConfirmation.mockResolvedValue({ id: ticket.id, ticket_id: ticket.id, source_message_id: '200', message_text: message.text });
    const confirm = { ...callback(470334534), data: `confirm:${ticket.id}`, message: { message_id: repository.confirmationPrompt.mock.calls[0][1], chat: { id: 470334534, type: 'private' } } };
    await service.callback(confirm, call);
    expect(sent.filter(entry => entry.token === 'visitor-token')).toHaveLength(1);
    expect(repository.markReplied).toHaveBeenCalledWith(470334534, 200, ticket.id, message.text, expect.any(String));
    repository.takeConfirmation.mockResolvedValue(false);
    await service.callback(confirm, call);
    expect(sent.filter(entry => entry.token === 'visitor-token')).toHaveLength(1);
  });
  it('shows the author and an explicit fallback when an older reply has no saved text', async () => {
    repository.hasReply.mockResolvedValue(true); repository.latestReply.mockResolvedValue({ admin_id: '470334534', admin_name: null, message_text: null });
    await service.message('admin', { message_id: 202, from: { id: 5711475783 }, chat: { id: 5711475783, type: 'private' }, reply_to_message: { message_id: 102 }, text: 'Нова відповідь' }, call);
    const context = sent.find(entry => String(entry.body.text).startsWith('Остання відповідь'))!;
    expect(context.body.text).toContain('Telegram ID 470334534'); expect(context.body.text).toContain('Текст давньої відповіді не збережено.');
    expect(sent.filter(entry => entry.token === 'visitor-token')).toHaveLength(0);
  });
  it('shows all of a long previous answer in chunks before the confirmation button', async () => {
    repository.hasReply.mockResolvedValue(true); repository.latestReply.mockResolvedValue({ admin_id: '470334534', admin_name: 'Пекар', message_text: 'А'.repeat(5000) });
    await service.message('admin', { message_id: 203, from: { id: 5711475783 }, chat: { id: 5711475783, type: 'private' }, reply_to_message: { message_id: 102 }, text: 'Нова відповідь' }, call);
    const messages = sent.filter(entry => entry.method === 'sendMessage');
    expect(messages.slice(0,-1).map(entry => entry.body.text).join('')).toContain('А'.repeat(5000));
    expect(messages.every(entry => String(entry.body.text).length <= 4096)).toBe(true);
    expect(messages.at(-1)?.body.reply_markup).toBeDefined();
  });
  it('does not send expired, cancelled, or another admins confirmation', async () => {
    await service.callback({ ...callback(5711475783), data: `confirm:${ticket.id}` }, call);
    expect(repository.getConfirmation).toHaveBeenCalledWith(ticket.id, 5711475783, 99);
    expect(sent.filter(entry => entry.token === 'visitor-token')).toHaveLength(0);
    repository.getConfirmation.mockResolvedValue({ id: ticket.id });
    await service.callback({ ...callback(470334534), data: `discard:${ticket.id}` }, call);
    expect(repository.takeConfirmation).toHaveBeenCalledWith(ticket.id, 470334534);
    expect(sent.filter(entry => entry.token === 'visitor-token')).toHaveLength(0);
  });
  it('does not send a second concurrent answer while another admin holds the ticket lock', async () => {
    repository.withReplyLock.mockResolvedValue(false);
    await service.message('admin', { message_id: 200, from: { id: 470334534 }, chat: { id: 470334534, type: 'private' }, reply_to_message: { message_id: 102 }, text: 'Відповідь' }, call);
    expect(sent.filter(entry => entry.token === 'visitor-token')).toHaveLength(0);
    expect(repository.markReplied).not.toHaveBeenCalled();
  });
  it('does not reuse a reply prompt after a successful answer', async () => {
    let active = true;
    repository.ticketForPrompt.mockImplementation(async () => active ? ticket : undefined);
    repository.cancelPrompts.mockImplementation(async () => { active = false; });
    const message: BotMessage = { message_id: 200, from: { id: 470334534 }, chat: { id: 470334534, type: 'private' }, reply_to_message: { message_id: 102 }, text: 'Відповідь' };
    await service.message('admin', message, call);
    await service.message('admin', { ...message, message_id: 201, text: 'Друге повідомлення' }, call);
    expect(sent.filter((entry) => entry.token === 'visitor-token')).toHaveLength(1);
    expect(repository.markReplied).toHaveBeenCalledTimes(1);
  });
  it('keeps the reply prompt active if delivery to the visitor fails', async () => {
    const failing = (async (token, method, body) => {
      if (token === 'visitor-token') throw new Error('Delivery failed');
      return call(token, method, body);
    }) as TelegramCall;
    await service.message('admin', { message_id: 200, from: { id: 470334534 }, chat: { id: 470334534, type: 'private' }, reply_to_message: { message_id: 102 }, text: 'Відповідь' }, failing);
    expect(repository.cancelPrompts).not.toHaveBeenCalled();
    expect(repository.markReplied).not.toHaveBeenCalled();
  });
  it('marks both support messages but sends the proactive reply notice only to the opted-in admin', async () => {
    repository.pendingReplyStatuses.mockResolvedValue([470334534, 5711475783].map((id) => ({ ticket_id: ticket.id, admin_id: String(id), message_id: '99', answered_by: '470334534' })));
    await service.message('admin', { message_id: 200, from: { id: 470334534 }, chat: { id: 470334534, type: 'private' }, reply_to_message: { message_id: 102 }, text: 'Відповідь' }, call);
    expect(sent.filter((entry) => entry.method === 'editMessageReplyMarkup')).toHaveLength(2);
    for (const admin of ['470334534', '5711475783']) {
      if (admin === '5711475783') expect(sent).toContainEqual(expect.objectContaining({ token: 'admin-token', body: expect.objectContaining({ chat_id: admin, text: expect.stringContaining('вже відповів адміністратор 470334534'), reply_parameters: { message_id: 99, allow_sending_without_reply: true } }) }));
      else expect(sent.some(entry => entry.body.chat_id === admin && String(entry.body.text).includes('вже відповів'))).toBe(false);
      expect(repository.replyStatusNotified).toHaveBeenCalledWith(ticket.id, admin);
    }
  });
  it('silently rejects unauthorized messages, spoofed callbacks and group callbacks before accessing data', async () => {
    expect(await service.message('admin', user('hello'), call)).toBe(true);
    await service.callback(callback(9999), call);
    const spoofed = callback(470334534); spoofed.message!.chat.id = 5711475783;
    await service.callback(spoofed, call);
    const group = callback(470334534); group.message!.chat.type = 'group';
    await service.callback(group, call);
    expect(sent).toEqual([]); expect(repository.ticketForButton).not.toHaveBeenCalled();
  });
  it('does not forward messages outside support mode or accept a reply from an unrelated prompt', async () => {
    repository.inMode.mockResolvedValue(false);
    expect(await service.message('user', user('hello'), call)).toBe(false);
    expect(repository.create).not.toHaveBeenCalled();
    repository.ticketForPrompt.mockResolvedValue(undefined);
    await service.message('admin', { message_id: 200, from: { id: 470334534 }, chat: { id: 470334534, type: 'private' }, reply_to_message: { message_id: 111 }, text: 'reply' }, call);
    expect(sent.every((entry) => entry.token === 'admin-token')).toBe(true);
  });
  it('clears reply prompts when an administrator cancels', async () => {
    await service.message('admin', { ...user('/cancel'), from: { id: 470334534 }, chat: { id: 470334534, type: 'private' } }, call);
    expect(repository.cancelPrompts).toHaveBeenCalledWith(470334534);
  });
});
