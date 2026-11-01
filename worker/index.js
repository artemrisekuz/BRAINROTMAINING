/**
 * Cloudflare Worker entry point — Brainrot Mining
 *
 * Routes:
 *  GET  /api/config
 *  GET  /api/auth/me
 *  POST /api/auth/telegram-webapp
 *  POST /api/auth/logout
 *  GET  /api/state
 *  GET  /api/live-events
 *  POST /api/sell-item
 *  POST /api/upgrade
 *  POST /api/open-case
 *  POST /api/telegram-webhook   ← Telegram bot webhook
 *  GET  /*                      ← static assets (served by ASSETS binding)
 */

import {
  validateInitData,
  createSessionCookie,
  getSession,
  buildSetCookieHeader,
} from './auth.js';

import {
  getOrCreateAccount,
  deductBalance,
  addBalance,
  incrementCasesOpened,
  getInventory,
  addDrop,
  sellDrop,
  removeDrop,
  getHistory,
  getRecentDrops,
} from './db.js';

import { pickCaseItem, upgradeChance, rollUpgrade, newDropId } from './game.js';
import { createBotHandler } from './bot.js';

// Properties are bundled from public/properties.json at build time
import config from '../public/properties.json';

// ── Helpers ───────────────────────────────────────────────────────────────────

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

const err = (message, status = 400) => json({ error: message }, status);

/** Reads and size-limits a JSON request body. Returns parsed object or null. */
async function readJson(request, maxBytes = 20_000) {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return null;
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/** Sanitise a display name: strip < > and truncate. */
const safeName = (value, maxLen = 80) =>
  String(value || '').replace(/[<>]/g, '').slice(0, maxLen);

// ── Main fetch handler ────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname, method } = { pathname: url.pathname, method: request.method };
    const db = env.DB;
    const adminId = env.TELEGRAM_ADMIN_ID || '6987783335';
    const SESSION_SECRET = env.SESSION_SECRET || '';
    const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN || '';
    const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

    // ── /api/config ────────────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/api/config') {
      return json(config);
    }

    // ── /api/auth/me ────────────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/api/auth/me') {
      const session = await getSession(request, SESSION_SECRET);
      if (!session) return json({ authenticated: false });
      return json({
        authenticated: true,
        telegramId: session.sub.slice(2),
        username: session.username || null,
        name: session.name || 'Telegram user',
      });
    }

    // ── POST /api/auth/telegram-webapp ─────────────────────────────────────
    if (method === 'POST' && pathname === '/api/auth/telegram-webapp') {
      const body = await readJson(request);
      if (!body) return err('Некорректный запрос.', 400);

      const telegramUser = await validateInitData(body.initData, BOT_TOKEN);
      if (!telegramUser) {
        return err('Не удалось проверить запуск Telegram Mini App. Откройте приложение через кнопку бота.', 401);
      }

      // Admin-only check
      if (String(telegramUser.id) !== adminId) {
        return err('ВЫ НЕ АДМИН!', 403);
      }

      const username = String(telegramUser.username || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32);
      const name = safeName(
        [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ') || 'Telegram user'
      );

      const sessionData = {
        sub: `TG${telegramUser.id}`,
        username,
        name,
        source: 'miniapp',
        exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
      };

      const cookieValue = await createSessionCookie(sessionData, SESSION_SECRET);
      const setCookie = buildSetCookieHeader(cookieValue, SESSION_MAX_AGE, request);

      return json(
        { authenticated: true, username: username || null, name },
        200,
        { 'set-cookie': setCookie }
      );
    }

    // ── POST /api/auth/logout ───────────────────────────────────────────────
    if (method === 'POST' && pathname === '/api/auth/logout') {
      const setCookie = buildSetCookieHeader('', 0, request);
      return json({ authenticated: false }, 200, { 'set-cookie': setCookie });
    }

    // ── All remaining /api/* require a valid session ────────────────────────
    const session = await getSession(request, SESSION_SECRET);

    // ── GET /api/state ──────────────────────────────────────────────────────
    if (method === 'GET' && pathname === '/api/state') {
      if (!session) return err('Откройте игру через Telegram.', 401);
      const playerId = session.sub;

      const account = await getOrCreateAccount(
        db, playerId, session.username, session.name, config.startingBalance
      );
      const inventory = await getInventory(db, playerId);
      const history = await getHistory(db, playerId, 30);

      return json({
        balance: account.balance,
        inventory,
        history,
        telegramId: playerId.slice(2),
        username: session.username || null,
        name: session.name || 'Telegram user',
        stats: {
          casesOpened: account.cases_opened || 0,
          inventoryCount: inventory.length,
        },
      });
    }

    // ── GET /api/live-events ────────────────────────────────────────────────
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

    // ── POST /api/sell-item ─────────────────────────────────────────────────
    if (method === 'POST' && pathname === '/api/sell-item') {
      if (!session) return err('Откройте игру через Telegram.', 401);
      const body = await readJson(request, 10_000);
      if (!body || typeof body.dropId !== 'string') return err('Некорректный запрос.');

      const playerId = session.sub;

      // Find item price (need to look up item before deleting the drop)
      const inventory = await getInventory(db, playerId);
      const drop = inventory.find(d => d.id === body.dropId);
      if (!drop) return err('Предмет не найден в вашем профиле.', 404);

      const item = config.brainrots.find(b => b.id === drop.itemId);
      if (!item) return err('Данные предмета не найдены.', 404);

      const result = await sellDrop(db, body.dropId, playerId, item.price);
      if (!result) return err('Предмет не найден в вашем профиле.', 404);

      return json({ balance: result.newBalance, soldDropId: body.dropId, amount: item.price });
    }

    // ── POST /api/upgrade ───────────────────────────────────────────────────
    if (method === 'POST' && pathname === '/api/upgrade') {
      if (!session) return err('Откройте игру через Telegram.', 401);
      const body = await readJson(request, 10_000);
      if (!body || typeof body.dropId !== 'string' || typeof body.targetId !== 'string') {
        return err('Некорректный запрос апгрейда.');
      }

      const playerId = session.sub;

      // Verify ownership
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

      // Remove source drop regardless of outcome
      const removed = await removeDrop(db, body.dropId, playerId);
      if (!removed) return err('Предмет уже был использован.', 409);

      let awardedDrop = null;
      if (success) {
        const account = await getOrCreateAccount(db, playerId, session.username, session.name, config.startingBalance);
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

    // ── POST /api/open-case ─────────────────────────────────────────────────
    if (method === 'POST' && pathname === '/api/open-case') {
      if (!session) return err('Откройте игру через Telegram.', 401);
      const body = await readJson(request, 10_000);
      if (!body || typeof body.caseId !== 'string') return err('Некорректный запрос.');

      const caseData = config.cases.find(c => c.id === body.caseId);
      if (!caseData) return err('Кейс не найден.', 404);

      const playerId = session.sub;

      // Atomically deduct balance — prevents race conditions
      const newBalance = await deductBalance(db, playerId, caseData.price);
      if (newBalance === null) {
        // Try to ensure account exists, then retry
        await getOrCreateAccount(db, playerId, session.username, session.name, config.startingBalance);
        const retryBalance = await deductBalance(db, playerId, caseData.price);
        if (retryBalance === null) return err('Недостаточно монет.', 400);
      }

      const item = pickCaseItem(config, caseData);
      if (!item) {
        // Refund and bail
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

      const finalBalance = newBalance !== null ? newBalance : (await getOrCreateAccount(db, playerId, session.username, session.name, config.startingBalance)).balance;

      return json({ balance: finalBalance, item, drop });
    }

    // ── POST /api/telegram-webhook ─────────────────────────────────────────
    if (method === 'POST' && pathname === '/api/telegram-webhook') {
      const handler = createBotHandler(
        env, db,
        getOrCreateAccount, getInventory, addBalance, removeDrop
      );
      return handler(request);
    }

    // ── Static assets ──────────────────────────────────────────────────────
    // ASSETS binding (Cloudflare Pages / Workers Static Assets) serves
    // everything in the /public directory automatically.
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};
