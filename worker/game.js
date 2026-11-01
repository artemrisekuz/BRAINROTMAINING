/**
 * Pure game logic — no I/O, no Node.js APIs.
 * Compatible with Cloudflare Workers.
 */

/**
 * Picks a random item from a case using weighted chances.
 * Uses crypto.getRandomValues (available in Workers).
 */
export function pickCaseItem(config, caseData) {
  const entries = caseData.items
    .map(id => ({
      item: config.brainrots.find(b => b.id === id),
      chance: Number(caseData.dropChances?.[id] ?? 1)
    }))
    .filter(e => e.item && Number.isFinite(e.chance) && e.chance > 0);

  if (!entries.length) return null;

  const total = entries.reduce((sum, e) => sum + e.chance, 0);

  // Secure random float in [0, total)
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  let roll = (buf[0] / 0x100000000) * total;

  for (const entry of entries) {
    roll -= entry.chance;
    if (roll < 0) return entry.item;
  }
  return entries[entries.length - 1].item;
}

/**
 * Calculates upgrade success chance (0–75%).
 */
export function upgradeChance(source, target) {
  if (!source || !target || target.price <= source.price) return 0;
  return Math.min(75, (source.price / target.price) * 85);
}

/**
 * Rolls for upgrade success using secure random.
 * Returns true if succeeded.
 */
export function rollUpgrade(chance) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  // chance is 0–75, we need success probability = chance/100
  return (buf[0] / 0x100000000) * 100 < chance;
}

/**
 * Generates a unique drop ID: "<timestamp>-<random>-<itemId>"
 */
export function newDropId(itemId) {
  const ts = Date.now();
  const buf = new Uint8Array(5);
  crypto.getRandomValues(buf);
  const rand = [...buf].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${ts}-${rand}-${itemId}`;
}
