/**
 * Telegram bot handler for Cloudflare Workers.
 * Uses grammY in webhook mode — no long polling.
 *
 * Endpoint: POST /api/telegram-webhook
 * Telegram sends updates here via HTTPS webhook.
 */

import { Bot, InlineKeyboard, webhookCallback } from 'grammy';

// Config is imported statically — properties.json is bundled by wrangler
import config from '../public/properties.json';

const money = (amount) =>
  `${new Intl.NumberFormat('ru-RU').format(amount)} ${config.currencyName}`;

const escapeHtml = (value) =>
  String(value).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/** Build a simple main-menu keyboard. */
const mainMenu = () =>
  new InlineKeyboard()
    .text('🎁 Кейсы', 'menu:cases').row()
    .text('👤 Профиль', 'menu:profile');

/** Build the cases keyboard from config. */
const casesMenu = () => {
  const kb = new InlineKeyboard();
  config.cases.forEach(c => kb.text(`${c.name} · ${money(c.price)}`, `case:${c.id}`).row());
  kb.text('⬅️ Меню', 'menu:home');
  return kb;
};

/**
 * Creates and returns a configured grammY Bot instance.
 * The bot is re-created on each Worker invocation (stateless).
 */
function createBot(token, adminId, webAppUrl, db, getOrCreateAccount, getInventory, addBalance, removeDrop) {
  const bot = new Bot(token);

  // ── Admin-only middleware ─────────────────────────────────────────────────
  bot.use(async (ctx, next) => {
    if (String(ctx.from?.id || '') === adminId) return next();
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: 'ВЫ НЕ АДМИН!', show_alert: true }).catch(() => {});
    } else if (ctx.chat) {
      await ctx.reply('ВЫ НЕ АДМИН!').catch(() => {});
    }
  });

  const playerId = `TG${adminId}`;

  const getAccount = () =>
    getOrCreateAccount(db, playerId, null, 'Admin', config.startingBalance);

  // ── /start ────────────────────────────────────────────────────────────────
  bot.command('start', async (ctx) => {
    const account = await getAccount();

    // Set the Mini App button for this admin chat
    await ctx.api.setChatMenuButton({
      chat_id: ctx.from.id,
      menu_button: { type: 'web_app', text: 'Играть', web_app: { url: webAppUrl } }
    }).catch(e => console.error('setChatMenuButton error:', e.message));

    await ctx.reply(
      `🌌 <b>Добро пожаловать в ${escapeHtml(config.siteName)}!</b>\n\n` +
      `Открывайте кейсы, собирайте брейны и продавайте дропы.\n` +
      `Ваш баланс: <b>${money(account.balance)}</b>`,
      { parse_mode: 'HTML', reply_markup: { remove_keyboard: true } }
    );
    await ctx.reply('Нажмите кнопку ниже, чтобы открыть игру:', {
      reply_markup: new InlineKeyboard().webApp('🎮 ИГРАТЬ', webAppUrl)
    });
  });

  bot.command('help', ctx =>
    ctx.reply('Команды: /start — меню, /cases — список кейсов, /profile — баланс и предметы.')
  );

  bot.command('cases', ctx =>
    ctx.reply('🎁 <b>Выберите кейс:</b>', { parse_mode: 'HTML', reply_markup: casesMenu() })
  );

  bot.command('profile', async (ctx) => {
    const account = await getAccount();
    const inventory = await getInventory(db, playerId);
    await ctx.reply(buildProfileText(account, inventory, ctx.from), {
      parse_mode: 'HTML',
      reply_markup: buildProfileKeyboard(inventory)
    });
  });

  // ── Callbacks ─────────────────────────────────────────────────────────────
  bot.callbackQuery('menu:home', async (ctx) => {
    const account = await getAccount();
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `🌌 <b>${escapeHtml(config.siteName)}</b>\n\nБаланс: <b>${money(account.balance)}</b>\nВыберите действие:`,
      { parse_mode: 'HTML', reply_markup: mainMenu() }
    );
  });

  bot.callbackQuery('menu:cases', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('🎁 <b>Выберите кейс:</b>', { parse_mode: 'HTML', reply_markup: casesMenu() });
  });

  bot.callbackQuery('menu:profile', async (ctx) => {
    const account = await getAccount();
    const inventory = await getInventory(db, playerId);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(buildProfileText(account, inventory, ctx.from), {
      parse_mode: 'HTML', reply_markup: buildProfileKeyboard(inventory)
    });
  });

  bot.callbackQuery(/^sell:(.+)$/, async (ctx) => {
    const dropId = ctx.match[1];
    const inventory = await getInventory(db, playerId);
    const drop = inventory.find(d => d.id === dropId);
    if (!drop) return ctx.answerCallbackQuery({ text: 'Предмет уже продан или не найден.', show_alert: true });

    const item = config.brainrots.find(b => b.id === drop.itemId);
    if (!item) return ctx.answerCallbackQuery({ text: 'Не удалось найти предмет.', show_alert: true });

    const removed = await removeDrop(db, dropId, playerId);
    if (!removed) return ctx.answerCallbackQuery({ text: 'Предмет уже продан.', show_alert: true });

    const newBalance = await addBalance(db, playerId, item.price);
    await ctx.answerCallbackQuery({ text: `Продано за ${money(item.price)}.` });

    const updatedInventory = await getInventory(db, playerId);
    const updatedAccount = { balance: newBalance };
    await ctx.editMessageText(buildProfileText(updatedAccount, updatedInventory, ctx.from), {
      parse_mode: 'HTML', reply_markup: buildProfileKeyboard(updatedInventory)
    });
  });

  bot.callbackQuery(/^case:(.+)$/, async (ctx) => {
    const caseData = config.cases.find(c => c.id === ctx.match[1]);
    if (!caseData) return ctx.answerCallbackQuery({ text: 'Кейс не найден.', show_alert: true });

    const account = await getAccount();
    const prizes = caseData.items.map(id => {
      const item = config.brainrots.find(b => b.id === id);
      if (!item) return null;
      const total = caseData.items.reduce((s, pid) =>
        s + Math.max(0, Number(caseData.dropChances?.[pid] ?? 1)), 0);
      const chance = total ? Math.max(0, Number(caseData.dropChances?.[id] ?? 1)) / total * 100 : 0;
      return `• ${escapeHtml(item.name)} — ${chance.toFixed(2)}%`;
    }).filter(Boolean);

    const kb = new InlineKeyboard()
      .text('🎲 Открыть', `open:${caseData.id}`).row()
      .text('⬅️ Все кейсы', 'menu:cases');

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `📦 <b>${escapeHtml(caseData.name)}</b>\n` +
      `Цена: <b>${money(caseData.price)}</b>\n` +
      `Баланс: ${money(account.balance)}\n\n` +
      `<b>Возможные предметы:</b>\n${prizes.join('\n')}`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  });

  // open:caseId is handled by the web app — bot version kept for parity
  bot.callbackQuery(/^open:(.+)$/, async (ctx) => {
    const caseData = config.cases.find(c => c.id === ctx.match[1]);
    if (!caseData) return ctx.answerCallbackQuery({ text: 'Кейс не найден.', show_alert: true });
    // Redirect to Mini App for full roulette experience
    await ctx.answerCallbackQuery({
      text: 'Используйте Mini App для открытия кейса.',
      show_alert: true
    });
  });

  bot.catch(err => console.error('Bot error:', err));
  return bot;
}

// ── Profile helpers ───────────────────────────────────────────────────────────

function buildProfileText(account, inventory, from) {
  const lines = inventory.slice(0, 30).map(drop => {
    const item = config.brainrots.find(b => b.id === drop.itemId);
    const caseData = config.cases.find(c => c.id === drop.caseId);
    return item
      ? `• ${escapeHtml(item.name)} — ${money(item.price)}${caseData ? ` (${escapeHtml(caseData.name)})` : ''}`
      : '';
  }).filter(Boolean);

  return [
    `👤 <b>${escapeHtml(from?.first_name || from?.username || 'Игрок')}</b>`,
    `🪙 Баланс: <b>${money(account.balance)}</b>`,
    '',
    '<b>Ваши брейны:</b>',
    ...(lines.length ? lines : ['Пока нет выпавших предметов.']),
    '',
    inventory.length
      ? 'Нажмите кнопку под предметом, чтобы продать его.'
      : 'Откройте кейс, чтобы получить предмет.'
  ].join('\n');
}

function buildProfileKeyboard(inventory) {
  const kb = new InlineKeyboard();
  inventory.slice(0, 12).forEach(drop => {
    const item = config.brainrots.find(b => b.id === drop.itemId);
    if (item) kb.text(`Продать ${item.name} · ${money(item.price)}`, `sell:${drop.id}`).row();
  });
  kb.text('🔄 Обновить', 'menu:profile').row().text('⬅️ Меню', 'menu:home');
  return kb;
}

// ── Webhook handler factory ───────────────────────────────────────────────────

/**
 * Creates a request handler for POST /api/telegram-webhook.
 * Verifies the X-Telegram-Bot-Api-Secret-Token header.
 */
export function createBotHandler(env, db, getOrCreateAccount, getInventory, addBalance, removeDrop) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBAPP_URL, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_ADMIN_ID } = env;

  if (!TELEGRAM_BOT_TOKEN) {
    return async () => new Response('Bot not configured', { status: 503 });
  }

  const bot = createBot(
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_ADMIN_ID || '6987783335',
    TELEGRAM_WEBAPP_URL || '',
    db,
    getOrCreateAccount, getInventory, addBalance, removeDrop
  );

  // grammY webhookCallback for Cloudflare Workers
  const handler = webhookCallback(bot, 'cloudflare-mod');

  return async (request) => {
    // Verify webhook secret
    if (TELEGRAM_WEBHOOK_SECRET) {
      const incoming = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
      if (incoming !== TELEGRAM_WEBHOOK_SECRET) {
        return new Response('Forbidden', { status: 403 });
      }
    }
    return handler(request);
  };
}
