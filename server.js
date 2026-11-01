require('dotenv').config();

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const root = __dirname;
const configPath = path.join(root, 'properties.json');
const statePath = process.env.STATE_PATH || path.join(root, 'state.json');
const port = Number(process.env.PORT) || 3000;
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
const telegramAdminId = '6987783335';
const mime = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const config = () => JSON.parse(fs.readFileSync(configPath, 'utf8'));
const initialState = () => ({ balance: config().startingBalance, inventory: [], history: [] });
const state = () => fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : initialState();
const save = (value) => fs.writeFileSync(statePath, JSON.stringify(value, null, 2));
const profileFor = (current, clientId) => {
  current.accounts ||= {};
  const key = clientId || 'LOCAL';
  if (!current.accounts[key]) {
    if (Object.keys(current.accounts).length === 0 && key !== 'LOCAL') {
      current.inventory.filter((drop) => !drop.playerId).forEach((drop) => { drop.playerId = key; drop.player = `Гость ${key}`; });
      current.history.filter((drop) => !drop.playerId).forEach((drop) => { drop.playerId = key; drop.player = `Гость ${key}`; });
    }
    const hasPreviousDrops = current.history.some((drop) => drop.playerId === key);
    current.accounts[key] = {
      balance: hasPreviousDrops ? current.balance : config().startingBalance,
      inventory: current.inventory.filter((drop) => drop.playerId === key).map((drop) => drop.id)
    };
  }
  return current.accounts[key];
};
const sign = (value) => crypto.createHmac('sha256', telegramBotToken).update(value).digest('base64url');
const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};
const sessionFor = (request) => {
  if (!telegramBotToken) return null;
  const cookie = (request.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('vv_tg='));
  if (!cookie) return null;
  const [payload, signature] = cookie.slice('vv_tg='.length).split('.');
  if (!payload || !signature || !safeEqual(sign(payload), signature)) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return user.source === 'miniapp' && user.sub === `TG${telegramAdminId}` && user.exp > Math.floor(Date.now() / 1000) ? user : null;
  } catch { return null; }
};
const cookieOptions = (request, value, maxAge) => {
  const secure = request.socket.encrypted || request.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `vv_tg=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
};
const telegramWebAppAuthValid = (initData) => {
  if (!telegramBotToken || typeof initData !== 'string' || !initData) return null;
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  const now = Math.floor(Date.now() / 1000);
  if (!receivedHash || !Number.isInteger(authDate) || authDate > now + 30 || now - authDate > 86400) return null;
  const checkString = [...params.entries()].filter(([key]) => key !== 'hash').sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(telegramBotToken).digest();
  const expected = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  if (!safeEqual(expected, receivedHash.toLowerCase())) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !/^\d+$/.test(String(user.id || ''))) return null;
    return user;
  } catch { return null; }
};
const pickCaseItem = (game, caseData) => {
  const entries = caseData.items.map((id) => ({
    item: game.brainrots.find((brainrot) => brainrot.id === id),
    chance: Number(caseData.dropChances?.[id] ?? 1)
  })).filter((entry) => entry.item && Number.isFinite(entry.chance) && entry.chance > 0);
  const total = entries.reduce((sum, entry) => sum + entry.chance, 0);
  if (!total) return null;
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.chance;
    if (roll < 0) return entry.item;
  }
  return entries[entries.length - 1].item;
};
const json = (response, status, data) => { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(data)); };

http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (request.method === 'GET' && url.pathname === '/api/config') return json(response, 200, config());
  if (request.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = sessionFor(request);
    return json(response, 200, user ? { authenticated: true, telegramId: user.sub.slice(2), username: user.username || null, name: user.name || 'Telegram user' } : { authenticated: false });
  }
  if (request.method === 'POST' && url.pathname === '/api/auth/telegram-webapp') {
    let body = '';
    request.on('data', (chunk) => { body += chunk; if (body.length > 20000) request.destroy(); });
    return request.on('end', () => {
      try {
        const telegramUser = telegramWebAppAuthValid(JSON.parse(body || '{}').initData);
        if (!telegramUser) return json(response, 401, { error: 'Не удалось проверить запуск Telegram Mini App. Откройте приложение через кнопку бота.' });
        if (String(telegramUser.id) !== telegramAdminId) return json(response, 403, { error: 'ВЫ НЕ АДМИН!' });
        const username = String(telegramUser.username || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);
        const name = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).map((part) => String(part).replace(/[<>]/g, '').slice(0, 40)).join(' ').slice(0, 80) || 'Telegram user';
        const sessionData = { sub: `TG${telegramUser.id}`, username, name, source: 'miniapp', exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 };
        const payload = Buffer.from(JSON.stringify(sessionData)).toString('base64url');
        response.setHeader('Set-Cookie', cookieOptions(request, `${payload}.${sign(payload)}`, 60 * 60 * 24 * 30));
        return json(response, 200, { authenticated: true, username: username || null, name });
      } catch { return json(response, 400, { error: 'Некорректный запуск Telegram Mini App.' }); }
    });
  }
  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    response.setHeader('Set-Cookie', cookieOptions(request, '', 0));
    return json(response, 200, { authenticated: false });
  }
  if (request.method === 'GET' && url.pathname === '/api/state') {
    const user = sessionFor(request);
    if (!user) return json(response, 401, { error: 'Откройте игру через Telegram.' });
    const current = state();
    const clientId = user.sub;
    const profile = profileFor(current, clientId);
    const inventory = current.inventory.filter((drop) => drop.playerId === clientId);
    const history = current.history.filter((drop) => drop.playerId === clientId);
    save(current);
    return json(response, 200, {
      balance: profile.balance,
      inventory,
      history,
      telegramId: clientId.slice(2),
      username: user.username || null,
      name: user.name || 'Telegram user',
      stats: { casesOpened: history.filter((drop) => drop.caseId).length, inventoryCount: inventory.length }
    });
  }
  if (request.method === 'GET' && url.pathname === '/api/live-events') {
    if (!sessionFor(request)) return json(response, 401, { error: 'Откройте игру через Telegram.' });
    const game = config();
    const events = state().history.slice(0, 30).map((drop) => {
      const item = game.brainrots.find((entry) => entry.id === drop.itemId);
      const caseData = game.cases.find((entry) => entry.id === drop.caseId);
      return item && caseData ? {
        id: drop.id,
        openedAt: drop.openedAt,
        playerId: drop.playerId || null,
        player: drop.player || 'Гость',
        item,
        caseData
      } : null;
    }).filter(Boolean);
    return json(response, 200, { events });
  }
  if (request.method === 'POST' && url.pathname === '/api/sell-item') {
    let body = '';
    request.on('data', (chunk) => { body += chunk; if (body.length > 10000) request.destroy(); });
    return request.on('end', () => {
      try {
        const requestData = JSON.parse(body || '{}');
        const user = sessionFor(request);
        if (!user) return json(response, 401, { error: 'Откройте игру через Telegram.' });
        const clientId = user.sub;
        const current = state();
        const profile = profileFor(current, clientId);
        const index = current.inventory.findIndex((drop) => drop.id === requestData.dropId && drop.playerId === clientId);
        if (index < 0) return json(response, 404, { error: 'Предмет не найден в вашем профиле.' });
        const drop = current.inventory[index];
        const item = config().brainrots.find((entry) => entry.id === drop.itemId);
        if (!item) return json(response, 404, { error: 'Данные предмета не найдены.' });
        current.inventory.splice(index, 1);
        profile.balance += item.price;
        save(current);
        return json(response, 200, { balance: profile.balance, soldDropId: drop.id, amount: item.price });
      } catch { return json(response, 400, { error: 'Некорректный запрос.' }); }
    });
  }
  if (request.method === 'POST' && url.pathname === '/api/upgrade') {
    let body = '';
    request.on('data', (chunk) => { body += chunk; if (body.length > 10000) request.destroy(); });
    return request.on('end', () => {
      try {
        const requestData = JSON.parse(body || '{}');
        const user = sessionFor(request);
        if (!user) return json(response, 401, { error: 'Откройте игру через Telegram.' });
        const current = state();
        const profile = profileFor(current, user.sub);
        const sourceIndex = current.inventory.findIndex((drop) => drop.id === requestData.dropId && drop.playerId === user.sub);
        if (sourceIndex < 0) return json(response, 404, { error: 'Предмет не найден в вашем профиле.' });
        const sourceDrop = current.inventory[sourceIndex];
        const source = config().brainrots.find((item) => item.id === sourceDrop.itemId);
        const target = config().brainrots.find((item) => item.id === requestData.targetId);
        if (!source || !target || target.price <= source.price) return json(response, 400, { error: 'Цель должна быть дороже выбранного предмета.' });
        const chance = Math.min(75, (source.price / target.price) * 85);
        const success = crypto.randomInt(0, 1000000) < Math.round(chance * 10000);
        current.inventory.splice(sourceIndex, 1);
        profile.inventory = (profile.inventory || []).filter((dropId) => dropId !== sourceDrop.id);
        let awardedDrop = null;
        if (success) {
          awardedDrop = {
            id: `${Date.now()}-${crypto.randomUUID()}-${target.id}`,
            itemId: target.id,
            kind: 'upgrade',
            sourceItemId: source.id,
            openedAt: new Date().toISOString(),
            playerId: user.sub,
            player: user.username ? `@${user.username}` : user.name || 'Telegram'
          };
          current.inventory.unshift(awardedDrop);
          profile.inventory.unshift(awardedDrop.id);
          current.history.unshift(awardedDrop);
          current.history = current.history.slice(0, 30);
        }
        save(current);
        return json(response, 200, { success, chance: Number(chance.toFixed(2)), source, target: success ? target : null, balance: profile.balance, awardedDrop });
      } catch { return json(response, 400, { error: 'Некорректный запрос апгрейда.' }); }
    });
  }
  if (request.method === 'POST' && url.pathname === '/api/open-case') {
    let body = '';
    request.on('data', (chunk) => { body += chunk; if (body.length > 10000) request.destroy(); });
    return request.on('end', () => {
      try {
        const requestData = JSON.parse(body || '{}');
        const requested = requestData.caseId;
        const user = sessionFor(request);
        if (!user) return json(response, 401, { error: 'Откройте игру через Telegram.' });
        const clientId = user.sub;
        const game = config();
        const caseData = game.cases.find((entry) => entry.id === requested);
        if (!caseData) return json(response, 404, { error: 'Кейс не найден.' });
        const current = state();
        const profile = profileFor(current, clientId);
        if (profile.balance < caseData.price) return json(response, 400, { error: 'Недостаточно монет.' });
        const item = pickCaseItem(game, caseData);
        if (!item) return json(response, 500, { error: 'Не найден предмет для этого кейса.' });
        profile.balance -= caseData.price;
        const drop = { id: `${Date.now()}-${item.id}`, itemId: item.id, caseId: caseData.id, openedAt: new Date().toISOString(), playerId: clientId, player: user.username ? `@${user.username}` : user.name || 'Telegram' };
        current.inventory.unshift(drop); current.history.unshift(drop); current.history = current.history.slice(0, 30); save(current);
        return json(response, 200, { balance: profile.balance, item, drop });
      } catch { return json(response, 400, { error: 'Некорректный запрос.' }); }
    });
  }
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.resolve(root, `.${requested}`);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404); return response.end('Not found'); }
  response.writeHead(200, { 'content-type': `${mime[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
  fs.createReadStream(file).pipe(response);
}).listen(port, () => console.log(`Violet Vault: http://localhost:${port}`));
