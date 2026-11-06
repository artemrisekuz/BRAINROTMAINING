/**
 * Telegram bot handler — Cloudflare Workers webhook mode
 * Any user can talk to the bot. The Mini App handles auth/admin separately.
 */

import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import config from '../public/properties.json';

const money = (n) => `${new Intl.NumberFormat('ru-RU').format(n)} ${config.currencyName}`;
const esc = (v) => String(v ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function createBot(token, webAppUrl, db, getOrCreateAccount, getInventory, addBalance, removeDrop) {
  const bot = new Bot(token);

  const pid = (ctx) => `TG${ctx.from.id}`;
  const uname = (ctx) => ctx.from.username || null;
  const uname_display = (ctx) => ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || 'Игрок';

  const getAccount = (ctx) =>
    getOrCreateAccount(db, pid(ctx), uname(ctx), esc(ctx.from.first_name || 'Игрок'), config.startingBalance);

  // ── /start ────────────────────────────────────────────────────────────────
  bot.command('start', async (ctx) => {
    const account = await getAccount(ctx);

    if (webAppUrl) {
      await ctx.api.setChatMenuButton({
        chat_id: ctx.from.id,
        menu_button: { type: 'web_app', text: '🎮 Играть', web_app: { url: webAppUrl } }
      }).catch(() => {});
    }

    await ctx.reply(
      `🌌 <b>Добро пожаловать в ${esc(config.siteName)}!</b>\n\n` +
      `Открывайте кейсы, собирайте брейны и продавайте дропы.\n` +
      `Ваш баланс: <b>${money(account.balance)}</b>`,
      { parse_mode: 'HTML' }
    );

    if (webAppUrl) {
      await ctx.reply('Нажмите кнопку, чтобы открыть игру 👇', {
        reply_markup: new InlineKeyboard().webApp('🎮 ИГРАТЬ', webAppUrl)
      });
    }
  });

  bot.command('help', ctx =>
    ctx.reply(
      '📋 <b>Команды:</b>\n' +
      '/start — приветствие и кнопка игры\n' +
      '/balance — ваш баланс\n' +
      '/myid — ваш Telegram ID\n' +
      '/profile — инвентарь',
      { parse_mode: 'HTML' }
    )
  );

  bot.command('myid', ctx =>
    ctx.reply(`🪪 Ваш Telegram ID: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' })
  );

  bot.command('balance', async (ctx) => {
    const account = await getAccount(ctx);
    await ctx.reply(`🪙 Ваш баланс: <b>${money(account.balance)}</b>`, { parse_mode: 'HTML' });
  });

  bot.command('profile', async (ctx) => {
    const account = await getAccount(ctx);
    const inventory = await getInventory(db, pid(ctx));
    await ctx.reply(buildProfileText(account, inventory, ctx.from), {
      parse_mode: 'HTML',
      reply_markup: buildProfileKeyboard(inventory)
    });
  });

  // ── Sell callback ─────────────────────────────────────────────────────────
  bot.callbackQuery(/^sell:(.+)$/, async (ctx) => {
    const dropId = ctx.match[1];
    const inventory = await getInventory(db, pid(ctx));
    const drop = inventory.find(d => d.id === dropId);
    if (!drop) return ctx.answerCallbackQuery({ text: 'Предмет уже продан.', show_alert: true });

    const item = config.brainrots.find(b => b.id === drop.itemId);
    if (!item) return ctx.answerCallbackQuery({ text: 'Предмет не найден.', show_alert: true });

    const removed = await removeDrop(db, dropId, pid(ctx));
    if (!removed) return ctx.answerCallbackQuery({ text: 'Предмет уже продан.', show_alert: true });

    const newBal = await addBalance(db, pid(ctx), item.price);
    await ctx.answerCallbackQuery({ text: `✅ Продано за ${money(item.price)}` });

    const newInv = await getInventory(db, pid(ctx));
    await ctx.editMessageText(buildProfileText({ balance: newBal }, newInv, ctx.from), {
      parse_mode: 'HTML', reply_markup: buildProfileKeyboard(newInv)
    });
  });

  bot.catch(err => console.error('Bot error:', err.message));
  return bot;
}

function buildProfileText(account, inventory, from) {
  const lines = inventory.slice(0, 20).map(drop => {
    const item = config.brainrots.find(b => b.id === drop.itemId);
    const c = config.cases.find(c => c.id === drop.caseId);
    return item ? `• ${esc(item.name)} — ${money(item.price)}${c ? ` (${esc(c.name)})` : ''}` : '';
  }).filter(Boolean);

  return [
    `👤 <b>${esc(from?.first_name || from?.username || 'Игрок')}</b>`,
    `🪙 Баланс: <b>${money(account.balance)}</b>`,
    '',
    '<b>Инвентарь:</b>',
    ...(lines.length ? lines : ['Пусто — откройте кейс!']),
    '',
    inventory.length ? 'Нажмите кнопку под предметом, чтобы продать.' : ''
  ].join('\n');
}

function buildProfileKeyboard(inventory) {
  const kb = new InlineKeyboard();
  inventory.slice(0, 8).forEach(drop => {
    const item = config.brainrots.find(b => b.id === drop.itemId);
    if (item) kb.text(`💰 Продать ${item.name} · ${money(item.price)}`, `sell:${drop.id}`).row();
  });
  kb.text('🔄 Обновить', 'menu:profile');
  return kb;
}

export function createBotHandler(env, db, getOrCreateAccount, getInventory, addBalance, removeDrop) {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBAPP_URL, TELEGRAM_WEBHOOK_SECRET } = env;

  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.startsWith('YOUR_')) {
    return async () => new Response('Bot not configured', { status: 503 });
  }

  const bot = createBot(TELEGRAM_BOT_TOKEN, TELEGRAM_WEBAPP_URL || '', db,
    getOrCreateAccount, getInventory, addBalance, removeDrop);

  const handler = webhookCallback(bot, 'cloudflare-mod');

  return async (request) => {
    if (TELEGRAM_WEBHOOK_SECRET) {
      const incoming = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
      if (incoming !== TELEGRAM_WEBHOOK_SECRET) {
        return new Response('Forbidden', { status: 403 });
      }
    }
    return handler(request);
  };
}
