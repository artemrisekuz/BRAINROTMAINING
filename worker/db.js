/**
 * D1 database helpers for Brainrot Mining.
 * All functions accept a D1Database binding (env.DB).
 */

// ── Account ──────────────────────────────────────────────────────────────────

/**
 * Fetches or creates an account row.
 * Returns { player_id, username, name, balance, cases_opened }
 */
export async function getOrCreateAccount(db, playerId, username, name, startingBalance) {
  const existing = await db
    .prepare('SELECT player_id, username, name, balance, cases_opened FROM accounts WHERE player_id = ?')
    .bind(playerId)
    .first();

  if (existing) return existing;

  // New account
  await db
    .prepare('INSERT INTO accounts (player_id, username, name, balance) VALUES (?, ?, ?, ?)')
    .bind(playerId, username || null, name || 'Telegram user', startingBalance)
    .run();

  return { player_id: playerId, username: username || null, name: name || 'Telegram user', balance: startingBalance, cases_opened: 0 };
}

/**
 * Atomically deducts `amount` from balance.
 * Returns updated balance, or null if insufficient.
 */
export async function deductBalance(db, playerId, amount) {
  const result = await db
    .prepare(`
      UPDATE accounts
      SET balance = balance - ?
      WHERE player_id = ? AND balance >= ?
      RETURNING balance
    `)
    .bind(amount, playerId, amount)
    .first();

  return result ? result.balance : null;
}

/**
 * Adds `amount` to balance (e.g. selling an item).
 * Returns updated balance.
 */
export async function addBalance(db, playerId, amount) {
  const result = await db
    .prepare(`
      UPDATE accounts
      SET balance = balance + ?
      WHERE player_id = ?
      RETURNING balance
    `)
    .bind(amount, playerId)
    .first();

  return result ? result.balance : null;
}

/**
 * Increments cases_opened counter.
 */
export async function incrementCasesOpened(db, playerId) {
  await db
    .prepare('UPDATE accounts SET cases_opened = cases_opened + 1 WHERE player_id = ?')
    .bind(playerId)
    .run();
}

// ── Inventory ────────────────────────────────────────────────────────────────

/**
 * Returns all inventory drops for a player (newest first).
 */
export async function getInventory(db, playerId) {
  const result = await db
    .prepare(`
      SELECT drop_id AS id, item_id AS itemId, case_id AS caseId,
             kind, source_item_id AS sourceItemId, opened_at AS openedAt,
             player_name AS player, player_id AS playerId
      FROM inventory
      WHERE player_id = ?
      ORDER BY opened_at DESC
    `)
    .bind(playerId)
    .all();
  return result.results || [];
}

/**
 * Inserts a new drop into inventory + history.
 * Runs both inserts in a batch for atomicity.
 */
export async function addDrop(db, drop) {
  const {
    id, playerId, playerName, itemId, caseId = null,
    kind = 'case', sourceItemId = null, openedAt
  } = drop;

  await db.batch([
    db.prepare(`
      INSERT INTO inventory (drop_id, player_id, item_id, case_id, kind, source_item_id, opened_at, player_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, playerId, itemId, caseId, kind, sourceItemId, openedAt, playerName),

    db.prepare(`
      INSERT INTO history (drop_id, player_id, player_name, item_id, case_id, kind, opened_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, playerId, playerName, itemId, caseId, kind, openedAt),
  ]);
}

/**
 * Removes a drop from inventory and credits balance atomically.
 * Returns { newBalance, amount } or null if drop not found / wrong owner.
 */
export async function sellDrop(db, dropId, playerId, itemPrice) {
  // D1 doesn't support multi-statement transactions in a single .run(),
  // but .batch() runs all statements in a single transaction.
  const selectResult = await db
    .prepare('SELECT drop_id FROM inventory WHERE drop_id = ? AND player_id = ?')
    .bind(dropId, playerId)
    .first();

  if (!selectResult) return null;

  const results = await db.batch([
    db.prepare('DELETE FROM inventory WHERE drop_id = ? AND player_id = ?')
      .bind(dropId, playerId),
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE player_id = ? RETURNING balance')
      .bind(itemPrice, playerId),
  ]);

  // results[1] is the UPDATE RETURNING result
  const newBalance = results[1]?.results?.[0]?.balance;
  if (newBalance === undefined) return null;
  return { newBalance, amount: itemPrice };
}

/**
 * Removes a drop from inventory (for upgrades — source item is consumed).
 * Returns true if deleted, false if not found.
 */
export async function removeDrop(db, dropId, playerId) {
  const result = await db
    .prepare('DELETE FROM inventory WHERE drop_id = ? AND player_id = ?')
    .bind(dropId, playerId)
    .run();
  return (result.meta?.changes || 0) > 0;
}

// ── History ──────────────────────────────────────────────────────────────────

/**
 * Returns recent history for a player (newest first, up to `limit`).
 */
export async function getHistory(db, playerId, limit = 30) {
  const result = await db
    .prepare(`
      SELECT drop_id AS id, player_id AS playerId, player_name AS player,
             item_id AS itemId, case_id AS caseId, kind, opened_at AS openedAt
      FROM history
      WHERE player_id = ?
      ORDER BY opened_at DESC
      LIMIT ?
    `)
    .bind(playerId, limit)
    .all();
  return result.results || [];
}

/**
 * Returns the most recent sitewide drops (for live feed).
 */
export async function getRecentDrops(db, limit = 30) {
  const result = await db
    .prepare(`
      SELECT drop_id AS id, player_id AS playerId, player_name AS player,
             item_id AS itemId, case_id AS caseId, kind, opened_at AS openedAt
      FROM history
      ORDER BY opened_at DESC
      LIMIT ?
    `)
    .bind(limit)
    .all();
  return result.results || [];
}
