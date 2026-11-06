require('dotenv').config();

const { Bot, InlineKeyboard } = require('grammy');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token || /PASTE|YOUR_|HERE/i.test(token)) {
  console.error('Укажите TELEGRAM_BOT_TOKEN в окружении. Создайте бота через @BotFather и вставьте токен только в локальный .env.');
  process.exit(1);
}

// ── Конфиг ──────────────────────────────────────────────────────────────────
// Telegram ID владельца (owner). Только он имеет доступ к admin-командам бота.
// В Mini App администраторы управляются через /api/admin/admins (D1).
const OWNER_ID = '6987783335';

const webAppUrl = process.env.TELEGRAM_WEBAPP_URL;
try {
  const parsedUrl = new URL(webAppUrl);
  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname.endsWith('.example') || ['localhost', '127.0.0.1'].includes(parsedUrl.hostname)) throw new Error('URL must be a public HTTPS URL');
} catch {
  console.error('Укажите публичный HTTPS-адрес сайта в TELEGRAM_WEBAPP_URL в файле .env. Telegram Mini App не открывает localhost или обычный HTTP.');
  process.exit(1);
}

const root = __dirname;
const config = JSON.parse(fs.readFileSync(path.join(root, 'properties.json'), 'utf8'));
const statePath = process.env.STATE_PATH || path.join(root, 'state.json');

const bot = new Bot(token);

// ── Хелперы ──────────────────────────────────────────────────────────────────
const money = (amount) => `${new Intl.NumberFormat('ru-RU').format(amount)} ${config.currencyName}`;
const escapeHtml = (value) => String(value).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
const userKey = (id) => `TG${id}`;
const initialState = () => ({ balance: config.startingBalance, inventory: [], history: [], accounts: {} });
const readState = () => fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : initialState();
const writeState = (value) => fs.writeFileSync(statePath, JSON.stringify(value, null, 2));

const accountFor = (current, user) => {
  current.accounts ||= {};
  const key = userKey(user.id);
  if (!current.accounts[key]) {
    current.accounts[key] = {
      balance: config.startingBalance,
      inventory: current.inventory.filter((drop) => drop.playerId === key).map((drop) => drop.id)
    };
  }
  return { key, account: current.accounts[key] };
};

const itemFor = (drop) => config.brainrots.find((item) => item.id === drop.itemId);
const caseFor = (drop) => config.cases.find((entry) => entry.id === drop.caseId);

const mainMenu = () => new InlineKeyboard()
  .webApp('🎮 ИГРАТЬ', webAppUrl).row()
  .text('🎁 Кейсы', 'menu:cases').row()
  .text('👤 Профиль', 'menu:profile');

const casesMenu = () => {
  const keyboard = new InlineKeyboard();
  config.cases.forEach((caseData) => keyboard.text(`${caseData.name} · ${money(caseData.price)}`, `case:${caseData.id}`).row());
  keyboard.text('⬅️ Назад', 'menu:home');
  return keyboard;
};

const profileKeyboard = (current, user) => {
  const keyboard = new InlineKeyboard();
  const drops = current.inventory.filter((drop) => drop.playerId === userKey(user.id)).slice(0, 12);
  drops.forEach((drop) => {
    const item = itemFor(drop);
    if (item) keyboard.text(`Продать ${item.name} · ${money(item.price)}`, `sell:${drop.id}`).row();
  });
  keyboard.text('🔄 Обновить', 'menu:profile').row().text('⬅️ Меню', 'menu:home');
  return keyboard;
};

const pickItem = (caseData) => {
  const entries = caseData.items.map((id) => ({
    item: config.brainrots.find((brainrot) => brainrot.id === id),
    weight: Number(caseData.dropChances?.[id] ?? 1)
  })).filter((entry) => entry.item && Number.isFinite(entry.weight) && entry.weight > 0);
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (!total) return null;
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll < 0) return entry.item;
  }
  return entries.at(-1)?.item || null;
};

const profileText = (current, user) => {
  const drops = current.inventory.filter((drop) => drop.playerId === userKey(user.id));
  const lines = drops.slice(0, 30).map((drop) => {
    const item = itemFor(drop);
    const sourceCase = caseFor(drop);
    return item ? `• ${escapeHtml(item.name)} — ${money(item.price)}${sourceCase ? ` (${escapeHtml(sourceCase.name)})` : ''}` : '';
  }).filter(Boolean);
  return [
    `👤 <b>${escapeHtml(user.first_name || user.username || 'Игрок')}</b>`,
    `🪙 Баланс: <b>${money(current.accounts[userKey(user.id)].balance)}</b>`,
    '',
    '<b>Ваши брейны:</b>',
    ...(lines.length ? lines : ['Пока нет выпавших предметов.']),
    '',
    drops.length ? 'Нажмите кнопку под предметом, чтобы продать его.' : 'Откройте кейс, чтобы получить предмет.'
  ].join('\n');
};

// ── Команды (доступны ВСЕМ пользователям) ───────────────────────────────────

bot.command('start', async (ctx) => {
  const current = readState();
  const { account } = accountFor(current, ctx.from);
  writeState(current);

  // Устанавливаем кнопку Mini App для этого конкретного чата
  await ctx.api.setChatMenuButton({
    chat_id: ctx.from.id,
    menu_button: { type: 'web_app', text: '🎮 Играть', web_app: { url: webAppUrl } }
  }).catch((err) => console.error('setChatMenuButton:', err.message));

  await ctx.reply(
    `🌌 <b>Добро пожаловать в ${escapeHtml(config.siteName)}!</b>\n\n` +
    `Открывайте кейсы, собирайте брейны и продавайте дропы.\n` +
    `Ваш баланс: <b>${money(account.balance)}</b>`,
    { parse_mode: 'HTML' }
  );

  await ctx.reply('Нажмите кнопку ниже, чтобы открыть игру:', {
    reply_markup: new InlineKeyboard().webApp('🎮 ИГРАТЬ', webAppUrl)
  });
});

bot.command('help', (ctx) => ctx.reply(
  '📋 <b>Команды:</b>\n' +
  '/start — приветствие и кнопка игры\n' +
  '/balance — текущий баланс\n' +
  '/myid — ваш Telegram ID\n' +
  '/cases — список кейсов\n' +
  '/profile — инвентарь',
  { parse_mode: 'HTML' }
));

bot.command('myid', (ctx) =>
  ctx.reply(`🪪 Ваш Telegram ID: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' })
);

bot.command('balance', (ctx) => {
  const current = readState();
  const { account } = accountFor(current, ctx.from);
  writeState(current);
  return ctx.reply(`🪙 Ваш баланс: <b>${money(account.balance)}</b>`, { parse_mode: 'HTML' });
});

bot.command('cases', (ctx) => ctx.reply('🎁 <b>Выберите кейс:</b>', { parse_mode: 'HTML', reply_markup: casesMenu() }));

bot.command('profile', (ctx) => {
  const current = readState();
  accountFor(current, ctx.from);
  writeState(current);
  return ctx.reply(profileText(current, ctx.from), { parse_mode: 'HTML', reply_markup: profileKeyboard(current, ctx.from) });
});

// ── Callback-обработчики (доступны ВСЕМ пользователям) ──────────────────────

bot.callbackQuery('menu:home', async (ctx) => {
  const current = readState();
  const { account } = accountFor(current, ctx.from);
  writeState(current);
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
  const current = readState();
  accountFor(current, ctx.from);
  writeState(current);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(profileText(current, ctx.from), { parse_mode: 'HTML', reply_markup: profileKeyboard(current, ctx.from) });
});

bot.callbackQuery(/^sell:(.+)$/, async (ctx) => {
  const current = readState();
  const { key, account } = accountFor(current, ctx.from);
  const index = current.inventory.findIndex((drop) => drop.id === ctx.match[1] && drop.playerId === key);
  if (index < 0) return ctx.answerCallbackQuery({ text: 'Предмет уже продан или не найден.', show_alert: true });
  const [drop] = current.inventory.splice(index, 1);
  const item = itemFor(drop);
  if (!item) return ctx.answerCallbackQuery({ text: 'Не удалось найти предмет.', show_alert: true });
  account.inventory = (account.inventory || []).filter((dropId) => dropId !== drop.id);
  account.balance += item.price;
  writeState(current);
  await ctx.answerCallbackQuery({ text: `✅ Продано за ${money(item.price)}.` });
  await ctx.editMessageText(profileText(current, ctx.from), { parse_mode: 'HTML', reply_markup: profileKeyboard(current, ctx.from) });
});

bot.callbackQuery(/^case:(.+)$/, async (ctx) => {
  const caseData = config.cases.find((entry) => entry.id === ctx.match[1]);
  if (!caseData) return ctx.answerCallbackQuery({ text: 'Кейс не найден.', show_alert: true });
  const current = readState();
  const { account } = accountFor(current, ctx.from);
  writeState(current);
  const prizes = caseData.items.map((id) => {
    const item = config.brainrots.find((entry) => entry.id === id);
    if (!item) return null;
    const total = caseData.items.reduce((sum, prizeId) => sum + Math.max(0, Number(caseData.dropChances?.[prizeId] ?? 1)), 0);
    const chance = total ? Math.max(0, Number(caseData.dropChances?.[id] ?? 1)) / total * 100 : 0;
    return `• ${item.name} — ${chance.toFixed(2)}%`;
  }).filter(Boolean);
  const keyboard = new InlineKeyboard()
    .text('🎲 Открыть', `open:${caseData.id}`).row()
    .text('⬅️ Все кейсы', 'menu:cases');
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `📦 <b>${escapeHtml(caseData.name)}</b>\nЦена: <b>${money(caseData.price)}</b>\nБаланс: ${money(account.balance)}\n\n<b>Возможные предметы:</b>\n${prizes.join('\n')}`,
    { parse_mode: 'HTML', reply_markup: keyboard }
  );
});

bot.callbackQuery(/^open:(.+)$/, async (ctx) => {
  const caseData = config.cases.find((entry) => entry.id === ctx.match[1]);
  if (!caseData) return ctx.answerCallbackQuery({ text: 'Кейс не найден.', show_alert: true });
  const current = readState();
  const { key, account } = accountFor(current, ctx.from);
  if (account.balance < caseData.price) return ctx.answerCallbackQuery({ text: 'Недостаточно монет.', show_alert: true });
  const item = pickItem(caseData);
  if (!item) return ctx.answerCallbackQuery({ text: 'В кейсе нет настроенных предметов.', show_alert: true });
  account.balance -= caseData.price;
  const drop = {
    id: `${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${item.id}`,
    itemId: item.id,
    caseId: caseData.id,
    openedAt: new Date().toISOString(),
    playerId: key,
    player: ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || 'Telegram'
  };
  account.inventory ||= [];
  account.inventory.unshift(drop.id);
  current.inventory.unshift(drop);
  current.history.unshift(drop);
  current.history = current.history.slice(0, 30);
  writeState(current);
  const again = new InlineKeyboard()
    .text('🔄 Открыть ещё', `case:${caseData.id}`).row()
    .text('👤 Профиль', 'menu:profile')
    .text('🎁 Все кейсы', 'menu:cases');
  await ctx.answerCallbackQuery({ text: 'Кейс открыт!' });
  await ctx.editMessageText(
    `✨ <b>ВЫПАЛ ПРЕДМЕТ!</b>\n\n📦 ${escapeHtml(caseData.name)}\n🎉 <b>${escapeHtml(item.name)}</b>\n💰 Цена: <b>${money(item.price)}</b>\n🪙 Баланс: <b>${money(account.balance)}</b>`,
    { parse_mode: 'HTML', reply_markup: again }
  );
});

// ── Запуск ───────────────────────────────────────────────────────────────────

bot.catch((error) => console.error('Telegram bot error:', error));

bot.start({
  // drop_pending_updates: true — не обрабатываем накопившиеся апдейты при старте,
  // именно это вызывало повторную отправку приветствий при каждом перезапуске бота.
  drop_pending_updates: true,
  onStart: async (botInfo) => {
    console.log(`@${botInfo.username} запущен. ID владельца: ${OWNER_ID}`);
    // Сбрасываем глобальную кнопку (не Override для всех)
    await bot.api.setChatMenuButton({ menu_button: { type: 'default' } }).catch((err) => {
      console.error('Не удалось сбросить глобальную кнопку:', err.message);
    });
  }
});
