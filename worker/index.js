/**
 * Cloudflare Worker entry point — Brainrot Mining
 */

import { validateInitData, createSessionCookie, getSession, buildSetCookieHeader } from './auth.js';
import {
  getOrCreateAccount, deductBalance, addBalance, setBalance,
  incrementCasesOpened, getInventory, addDrop, sellDrop, removeDrop,
  getHistory, getRecentDrops,
  isAdmin, getAdmins, addAdmin, removeAdmin, getAllAccounts,
  createPromo, getPromo, getAllPromos, deletePromo, redeemPromo,
} from './db.js';
import { pickCaseItem, upgradeChance, rollUpgrade, newDropId } from './game.js';
import { createBotHandler } from './bot.js';
import config from '../public/properties.json';

// ── Helpers ───────────────────────────────────────────────────────────────────

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

const err = (message, status = 400) => json({ error: message }, status);

async function readJson(request, maxBytes = 20_000) {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return null;
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try { return JSON.parse(text); } catch { return null; }
}

const safeName = (value, maxLen = 80) =>
  String(value || '').replace(/[<>]/g, '').slice(0, maxLen);

// ── Main fetch handler ────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;
    const db = env.DB;
    const SESSION_SECRET = env.SESSION_SECRET || '';
    const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN || '';
    const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

    // ── GET /api/config ──────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/api/config') return json(config);

    // ── GET /api/debug — temporary diagnostic endpoint ───────────────────
    if (method === 'GET' && pathname === '/api/debug') {
      return json({
        ok: true,
        hasToken: !!(BOT_TOKEN && !BOT_TOKEN.startsWith('YOUR_')),
        hasSession: !!(SESSION_SECRET && !SESSION_SECRET.startsWith('YOUR_')),
        hasDB: !!db,
        adminId: env.TELEGRAM_ADMIN_ID || 'not set',
      });
    }

    // ── GET /api/auth/me ─────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/api/auth/me') {
      const session = await getSession(request, SESSION_SECRET);
      if (!session) return json({ authenticated: false });
      const admin = db ? await isAdmin(db, session.sub) : false;
      return json({
        authenticated: true,
        telegramId: session.sub.slice(2),
        username: session.username || null,
        name: session.name || 'Telegram user',
        isAdmin: admin,
      });
    }

    // ── POST /api/auth/telegram-webapp ───────────────────────────────────
    if (method === 'POST' && pathname === '/api/auth/telegram-webapp') {
      const body = await readJson(request);
      if (!body) return err('Некорректный запрос.', 400);

      // Guard: SESSION_SECRET must be configured
      if (!SESSION_SECRET || SESSION_SECRET.startsWith('YOUR_')) {
        return err('Сервер не настроен: отсутствует SESSION_SECRET. Добавьте секрет через wrangler secret put SESSION_SECRET.', 503);
      }

      // Guard: BOT_TOKEN must be configured
      if (!BOT_TOKEN || BOT_TOKEN.startsWith('YOUR_')) {
        return err('Сервер не настроен: отсутствует TELEGRAM_BOT_TOKEN. Добавьте токен через wrangler secret put TELEGRAM_BOT_TOKEN.', 503);
      }

      const telegramUser = await validateInitData(body.initData, BOT_TOKEN);
      if (!telegramUser) {
        return err('Не удалось проверить запуск Telegram Mini App. Откройте приложение через кнопку бота.', 401);
      }

      const username = String(telegramUser.username || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);
      const name = safeName(
        [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ') || 'Telegram user'
      );
      const playerId = `TG${telegramUser.id}`;

      // Ensure account exists
      if (db) await getOrCreateAccount(db, playerId, username, name, config.startingBalance);
      const admin = db ? await isAdmin(db, playerId) : false;

      const sessionData = {
        sub: playerId,
        username,
        name,
        source: 'miniapp',
        exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
      };

      const cookieValue = await createSessionCookie(sessionData, SESSION_SECRET);
      const setCookie = buildSetCookieHeader(cookieValue, SESSION_MAX_AGE, request);

      return json(
        { authenticated: true, username: username || null, name, isAdmin: admin },
        200,
        { 'set-cookie': setCookie }
      );
    }

    // ── POST /api/auth/logout ────────────────────────────────────────────
    if (method === 'POST' && pathname === '/api/auth/logout') {
      return json({ authenticated: false }, 200, {
        'set-cookie': buildSetCookieHeader('', 0, request),
      });
    }

    // ── Require session for all remaining routes ──────────────────────────
    const session = await getSession(request, SESSION_SECRET);

    // ── GET /api/state ───────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/api/state') {
      if (!session) return err('Откройте игру через Telegram.', 401);
      const playerId = session.sub;
      const account = await getOrCreateAccount(db, playerId, session.username, session.name, config.startingBalance);
      const inventory = await getInventory(db, playerId);
      const history = await getHistory(db, playerId, 30);
      const admin = await isAdmin(db, playerId);
      return json({
        balance: account.balance,
        inventory,
        history,
        telegramId: playerId.slice(2),
        username: session.username || null,
        name: session.name || 'Telegram user',
        isAdmin: admin,
        stats: { casesOpened: account.cases_opened || 0, inventoryCount: inventory.length },
      });
    }

    // ── GET /api/live-events ─────────────────────────────────────────────
    if (method === 'GET' && pathname === '/api/live-events') {
      if (!session) return err('Откройте игру через Telegram.', 401);
      const drops = await getRecentDrops(db, 30);
      const events = drops.map(drop => {
        const item = config.brainrots.find(b => b.id === drop.itemId);
        const caseData = config.cases.find(c => c.id === drop.caseId);
        return item ? { ...drop, item, caseData: caseData || null } : null;
      }).filter(Boolean);
      return json({ events });
    }

    // ── POST /api/sell-item ──────────────────────────────────────────────
    if (method === 'POST' && pathname === '/api/sell-item') {
      if (!session) return err('Откройте игру через Telegram.', 401);
      const body = await readJson(request, 10_000);
      if (!body || typeof body.dropId !== 'string') return err('Некорректный запрос.');
      const playerId = session.sub;
      const inventory = await getInventory(db, playerId);
      const drop = inventory.find(d => d.id === body.dropId);
      if (!drop) return err('Предмет не найден в вашем профиле.', 404);
      const item = config.brainrots.find(b => b.id === drop.itemId);
      if (!item) return err('Данные предмета не найдены.', 404);
      const result = await sellDrop(db, body.dropId, playerId, item.price);
      if (!result) return err('Предмет не найден в вашем профиле.', 404);
      return json({ balance: result.newBalance, soldDropId: body.dropId, amount: item.price });
    }

    // ── POST /api/upgrade ────────────────────────────────────────────────
    if (method === 'POST' && pathname === '/api/upgrade') {
      if (!session) return err('Откройте игру через Telegram.', 401);
      const body = await readJson(request, 10_000);
      if (!body || typeof body.dropId !== 'string' || typeof body.targetId !== 'string') {
        return err('Некорректный запрос апгрейда.');
      }
      const playerId = session.sub;
      const inventory = await getInventory(db, playerId);
      const sourceDrop = inventory.find(d => d.id === body.dropId);
      if (!sourceDrop) return err('Предмет не найден в вашем профиле.', 404);
      const source = config.brainrots.find(b => b.id === sourceDrop.itemId);
      const target = config.brainrots.find(b => b.id === body.targetId);
      if (!source || !target || target.price <= source.price) {
        return err('Цель должна быть дороже выбранного предмета.', 400);
      }
      const chance = upgradeChance(source, target);
      const success = rollUpgrade(chance);
      const removed = await removeDrop(db, body.dropId, playerId);
      if (!removed) return err('Предмет уже был использован.', 409);
      let awardedDrop = null;
      if (success) {
        const playerName = session.username ? `@${session.username}` : session.name || 'Telegram';
        awardedDrop = {
          id: newDropId(target.id),
          playerId,
          playerName,
          itemId: target.id,
          caseId: null,
          kind: 'upgrade',
          sourceItemId: source.id,
          openedAt: new Date().toISOString(),
        };
        await addDrop(db, awardedDrop);
      }
      const account = await getOrCreateAccount(db, playerId, session.username, session.name, config.startingBalance);
      return json({
        success,
        chance: Number(chance.toFixed(2)),
        source,
        target: success ? target : null,
        balance: account.balance,
        awardedDrop: awardedDrop || null,
      });
    }

    // ── POST /api/open-case ──────────────────────────────────────────────
    if (method === 'POST' && pathname === '/api/open-case') {
      if (!session) return err('Откройте игру через Telegram.', 401);
      const body = await readJson(request, 10_000);
      if (!body || typeof body.caseId !== 'string') return err('Некорректный запрос.');
      const caseData = config.cases.find(c => c.id === body.caseId);
      if (!caseData) return err('Кейс не найден.', 404);
      const playerId = session.sub;
      let newBalance = await deductBalance(db, playerId, caseData.price);
      if (newBalance === null) {
        await getOrCreateAccount(db, playerId, session.username, session.name, config.startingBalance);
        newBalance = await deductBalance(db, playerId, caseData.price);
        if (newBalance === null) return err('Недостаточно монет.', 400);
      }
      const item = pickCaseItem(config, caseData);
      if (!item) {
        await addBalance(db, playerId, caseData.price);
        return err('Не найден предмет для этого кейса.', 500);
      }
      await incrementCasesOpened(db, playerId);
      const playerName = session.username ? `@${session.username}` : session.name || 'Telegram';
      const drop = {
        id: newDropId(item.id),
        playerId,
        playerName,
        itemId: item.id,
        caseId: caseData.id,
        kind: 'case',
        openedAt: new Date().toISOString(),
      };
      await addDrop(db, drop);
      return json({ balance: newBalance, item, drop });
    }

    // ════════════════════════════════════════════════════════════════════
    // ── BONUS: POST /api/bonus/redeem ────────────────────────────────────
    // ════════════════════════════════════════════════════════════════════
    if (method === 'POST' && pathname === '/api/bonus/redeem') {
      if (!session) return err('Откройте игру через Telegram.', 401);
      const body = await readJson(request, 2_000);
      if (!body || typeof body.code !== 'string') return err('Укажите промокод.');
      const code = body.code.trim().toUpperCase();
      if (!code) return err('Пустой промокод.');

      const playerId = session.sub;
      const result = await redeemPromo(db, code, playerId);
      if (!result.ok) return err(result.error, 400);

      const promo = result.promo;

      if (promo.type === 'coins') {
        const newBalance = await addBalance(db, playerId, promo.value);
        return json({ type: 'coins', value: promo.value, balance: newBalance });
      }

      if (promo.type === 'case') {
        const caseData = config.cases.find(c => c.id === promo.case_id);
        if (!caseData) return err('Кейс из промокода не найден.');
        const item = pickCaseItem(config, caseData);
        if (!item) return err('Не найден предмет для кейса.');
        const playerName = session.username ? `@${session.username}` : session.name || 'Telegram';
        const drop = {
          id: newDropId(item.id),
          playerId,
          playerName,
          itemId: item.id,
          caseId: caseData.id,
          kind: 'case',
          openedAt: new Date().toISOString(),
        };
        await addDrop(db, drop);
        const account = await getOrCreateAccount(db, playerId, session.username, session.name, config.startingBalance);
        return json({ type: 'case', caseName: caseData.name, item, drop, balance: account.balance });
      }

      return err('Неизвестный тип промокода.');
    }

    // ════════════════════════════════════════════════════════════════════
    // ── ADMIN routes (all require isAdmin check) ──────────────────────────
    // ════════════════════════════════════════════════════════════════════
    if (pathname.startsWith('/api/admin/')) {
      if (!session) return err('Требуется авторизация.', 401);
      const adminCheck = await isAdmin(db, session.sub);
      if (!adminCheck) return err('Нет доступа.', 403);

      // GET /api/admin/players — list all accounts
      if (method === 'GET' && pathname === '/api/admin/players') {
        const accounts = await getAllAccounts(db);
        return json({ accounts });
      }

      // POST /api/admin/give-coins — give coins to player by telegramId
      if (method === 'POST' && pathname === '/api/admin/give-coins') {
        const body = await readJson(request, 2_000);
        if (!body || !body.telegramId || !body.amount) return err('Укажите telegramId и amount.');
        const targetId = `TG${String(body.telegramId).replace(/\D/g, '')}`;
        const amount = Number(body.amount);
        if (!targetId || isNaN(amount) || amount === 0) return err('Некорректные данные.');
        const existing = await getOrCreateAccount(db, targetId, null, 'Игрок', config.startingBalance);
        const newBalance = amount > 0
          ? await addBalance(db, targetId, amount)
          : await deductBalance(db, targetId, Math.abs(amount));
        return json({ ok: true, playerId: targetId, oldBalance: existing.balance, newBalance });
      }

      // POST /api/admin/set-balance — set exact balance
      if (method === 'POST' && pathname === '/api/admin/set-balance') {
        const body = await readJson(request, 2_000);
        if (!body || !body.telegramId || body.amount === undefined) return err('Укажите telegramId и amount.');
        const targetId = `TG${String(body.telegramId).replace(/\D/g, '')}`;
        const amount = Number(body.amount);
        if (!targetId || isNaN(amount) || amount < 0) return err('Некорректные данные.');
        await getOrCreateAccount(db, targetId, null, 'Игрок', config.startingBalance);
        const newBalance = await setBalance(db, targetId, amount);
        return json({ ok: true, playerId: targetId, newBalance });
      }

      // GET /api/admin/promos — list all promo codes
      if (method === 'GET' && pathname === '/api/admin/promos') {
        const promos = await getAllPromos(db);
        return json({ promos });
      }

      // POST /api/admin/promos — create promo code
      if (method === 'POST' && pathname === '/api/admin/promos') {
        const body = await readJson(request, 2_000);
        if (!body || !body.code || !body.type) return err('Укажите code и type (coins|case).');
        const code = String(body.code).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        if (!code) return err('Некорректный код промокода.');
        if (!['coins', 'case'].includes(body.type)) return err('type должен быть coins или case.');
        if (body.type === 'coins' && (!body.value || Number(body.value) <= 0)) return err('Для монет укажите value > 0.');
        if (body.type === 'case' && !body.caseId) return err('Для кейса укажите caseId.');
        if (body.type === 'case') {
          const caseData = config.cases.find(c => c.id === body.caseId);
          if (!caseData) return err('Кейс не найден.');
        }
        const existing = await getPromo(db, code);
        if (existing) return err('Промокод с таким кодом уже существует.');
        await createPromo(db, {
          code,
          type: body.type,
          value: body.type === 'coins' ? Number(body.value) : 0,
          caseId: body.type === 'case' ? body.caseId : null,
          usesLeft: body.usesLeft !== undefined ? Number(body.usesLeft) : 1,
          expiresAt: body.expiresAt || null,
          createdBy: session.sub,
        });
        return json({ ok: true, code });
      }

      // DELETE /api/admin/promos — delete promo code
      if (method === 'DELETE' && pathname === '/api/admin/promos') {
        const body = await readJson(request, 1_000);
        if (!body || !body.code) return err('Укажите code.');
        await deletePromo(db, body.code);
        return json({ ok: true });
      }

      // GET /api/admin/admins — list admins
      if (method === 'GET' && pathname === '/api/admin/admins') {
        const admins = await getAdmins(db);
        return json({ admins });
      }

      // POST /api/admin/admins — add admin
      if (method === 'POST' && pathname === '/api/admin/admins') {
        const body = await readJson(request, 1_000);
        if (!body || !body.telegramId) return err('Укажите telegramId.');
        const targetId = `TG${String(body.telegramId).replace(/\D/g, '')}`;
        await addAdmin(db, targetId);
        return json({ ok: true, playerId: targetId });
      }

      // DELETE /api/admin/admins — remove admin
      if (method === 'DELETE' && pathname === '/api/admin/admins') {
        const body = await readJson(request, 1_000);
        if (!body || !body.telegramId) return err('Укажите telegramId.');
        const targetId = `TG${String(body.telegramId).replace(/\D/g, '')}`;
        if (targetId === session.sub) return err('Нельзя удалить самого себя из админов.', 400);
        await removeAdmin(db, targetId);
        return json({ ok: true, playerId: targetId });
      }

      return err('Маршрут не найден.', 404);
    }

    // ── POST /api/telegram-webhook ───────────────────────────────────────
    if (method === 'POST' && pathname === '/api/telegram-webhook') {
      const handler = createBotHandler(env, db, getOrCreateAccount, getInventory, addBalance, removeDrop);
      return handler(request);
    }

    // ── Static assets ────────────────────────────────────────────────────
    // Only serve static files for GET/HEAD on non-API paths
    if ((method === 'GET' || method === 'HEAD') && !pathname.startsWith('/api/')) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
    }
    return new Response('Not found', { status: 404 });
  },
};
