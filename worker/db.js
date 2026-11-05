/**
 * D1 database helpers for Brainrot Mining.
 * All functions accept a D1Database binding (env.DB).
 */

// ── Account ──────────────────────────────────────────────────────────────────

export async function getOrCreateAccount(db, playerId, username, name, startingBalance) {
  const existing = await db
    .prepare('SELECT player_id, username, name, balance, cases_opened FROM accounts WHERE player_id = ?')
    .bind(playerId)
    .first();
  if (existing) return existing;
  await db
    .prepare('INSERT INTO accounts (player_id, username, name, balance) VALUES (?, ?, ?, ?)')
    .bind(playerId, username || null, name || 'Telegram user', startingBalance)
    .run();
  return { player_id: playerId, username: username || null, name: name || 'Telegram user', balance: startingBalance, cases_opened: 0 };
}

export async function deductBalance(db, playerId, amount) {
  const result = await db
    .prepare('UPDATE accounts SET balance = balance - ? WHERE player_id = ? AND balance >= ? RETURNING balance')
    .bind(amount, playerId, amount)
    .first();
  return result ? result.balance : null;
}

export async function addBalance(db, playerId, amount) {
  const result = await db
    .prepare('UPDATE accounts SET balance = balance + ? WHERE player_id = ? RETURNING balance')
    .bind(amount, playerId)
    .first();
  return result ? result.balance : null;
}

export async function setBalance(db, playerId, amount) {
  const result = await db
    .prepare('UPDATE accounts SET balance = ? WHERE player_id = ? RETURNING balance')
    .bind(amount, playerId)
    .first();
  return result ? result.balance : null;
}

export async function incrementCasesOpened(db, playerId) {
  await db
    .prepare('UPDATE accounts SET cases_opened = cases_opened + 1 WHERE player_id = ?')
    .bind(playerId)
    .run();
}

export async function getAllAccounts(db) {
  const result = await db
    .prepare('SELECT player_id, username, name, balance, cases_opened, created_at FROM accounts ORDER BY balance DESC')
    .all();
  return result.results || [];
}

// ── Inventory ────────────────────────────────────────────────────────────────

export async function getInventory(db, playerId) {
  const result = await db
    .prepare(`
      SELECT drop_id AS id, item_id AS itemId, case_id AS caseId,
             kind, source_item_id AS sourceItemId, opened_at AS openedAt,
             player_name AS player, player_id AS playerId
      FROM inventory WHERE player_id = ? ORDER BY opened_at DESC
    `)
    .bind(playerId)
    .all();
  return result.results || [];
}

export async function addDrop(db, drop) {
  const { id, playerId, playerName, itemId, caseId = null, kind = 'case', sourceItemId = null, openedAt } = drop;
  await db.batch([
    db.prepare('INSERT INTO inventory (drop_id, player_id, item_id, case_id, kind, source_item_id, opened_at, player_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, playerId, itemId, caseId, kind, sourceItemId, openedAt, playerName),
    db.prepare('INSERT INTO history (drop_id, player_id, player_name, item_id, case_id, kind, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, playerId, playerName, itemId, caseId, kind, openedAt),
  ]);
}

export async function sellDrop(db, dropId, playerId, itemPrice) {
  const selectResult = await db
    .prepare('SELECT drop_id FROM inventory WHERE drop_id = ? AND player_id = ?')
    .bind(dropId, playerId).first();
  if (!selectResult) return null;
  const results = await db.batch([
    db.prepare('DELETE FROM inventory WHERE drop_id = ? AND player_id = ?').bind(dropId, playerId),
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE player_id = ? RETURNING balance').bind(itemPrice, playerId),
  ]);
  const newBalance = results[1]?.results?.[0]?.balance;
  if (newBalance === undefined) return null;
  return { newBalance, amount: itemPrice };
}

export async function removeDrop(db, dropId, playerId) {
  const result = await db
    .prepare('DELETE FROM inventory WHERE drop_id = ? AND player_id = ?')
    .bind(dropId, playerId).run();
  return (result.meta?.changes || 0) > 0;
}

// ── History ──────────────────────────────────────────────────────────────────

export async function getHistory(db, playerId, limit = 30) {
  const result = await db
    .prepare(`SELECT drop_id AS id, player_id AS playerId, player_name AS player,
             item_id AS itemId, case_id AS caseId, kind, opened_at AS openedAt
      FROM history WHERE player_id = ? ORDER BY opened_at DESC LIMIT ?`)
    .bind(playerId, limit).all();
  return result.results || [];
}

export async function getRecentDrops(db, limit = 30) {
  const result = await db
    .prepare(`SELECT drop_id AS id, player_id AS playerId, player_name AS player,
             item_id AS itemId, case_id AS caseId, kind, opened_at AS openedAt
      FROM history ORDER BY opened_at DESC LIMIT ?`)
    .bind(limit).all();
  return result.results || [];
}

// ── Admins ───────────────────────────────────────────────────────────────────

export async function isAdmin(db, playerId) {
  const row = await db
    .prepare('SELECT player_id FROM admins WHERE player_id = ?')
    .bind(playerId).first();
  return !!row;
}

export async function getAdmins(db) {
  const result = await db.prepare('SELECT player_id, added_at FROM admins ORDER BY added_at').all();
  return result.results || [];
}

export async function addAdmin(db, playerId) {
  await db.prepare('INSERT OR IGNORE INTO admins (player_id) VALUES (?)').bind(playerId).run();
}

export async function removeAdmin(db, playerId) {
  await db.prepare('DELETE FROM admins WHERE player_id = ?').bind(playerId).run();
}

// ── Promo codes ──────────────────────────────────────────────────────────────

export async function createPromo(db, { code, type, value, caseId, usesLeft, expiresAt, createdBy }) {
  await db.prepare(
    'INSERT INTO promo_codes (code, type, value, case_id, uses_left, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    code.toUpperCase(), type, value || 0, caseId || null,
    usesLeft ?? 1, expiresAt || null, createdBy
  ).run();
}

export async function getPromo(db, code) {
  return db.prepare('SELECT * FROM promo_codes WHERE code = ?').bind(code.toUpperCase()).first();
}

export async function getAllPromos(db) {
  const result = await db.prepare('SELECT * FROM promo_codes ORDER BY created_at DESC').all();
  return result.results || [];
}

export async function deletePromo(db, code) {
  await db.prepare('DELETE FROM promo_codes WHERE code = ?').bind(code.toUpperCase()).run();
}

/** Returns true if player already used this promo. */
export async function hasUsedPromo(db, code, playerId) {
  const row = await db
    .prepare('SELECT 1 FROM promo_uses WHERE code = ? AND player_id = ?')
    .bind(code.toUpperCase(), playerId).first();
  return !!row;
}

/**
 * Atomically redeems a promo code for a player.
 * Returns { ok: true, promo } on success or { ok: false, error } on failure.
 */
export async function redeemPromo(db, code, playerId) {
  const promo = await getPromo(db, code);
  if (!promo) return { ok: false, error: 'Промокод не найден.' };

  // Check expiry
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    return { ok: false, error: 'Промокод истёк.' };
  }

  // Check uses
  if (promo.uses_left === 0) return { ok: false, error: 'Промокод уже использован максимальное количество раз.' };

  // Check if player already used it
  if (await hasUsedPromo(db, code, playerId)) return { ok: false, error: 'Вы уже использовали этот промокод.' };

  // Record use + decrement (atomic batch)
  const stmts = [
    db.prepare('INSERT INTO promo_uses (code, player_id) VALUES (?, ?)').bind(code.toUpperCase(), playerId),
  ];
  if (promo.uses_left > 0) {
    stmts.push(
      db.prepare('UPDATE promo_codes SET uses_left = uses_left - 1 WHERE code = ? AND uses_left > 0')
        .bind(code.toUpperCase())
    );
  }
  await db.batch(stmts);

  return { ok: true, promo };
}
