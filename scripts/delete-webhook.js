/**
 * Removes the Telegram webhook (useful when switching back to polling).
 * Run: node scripts/delete-webhook.js
 */

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error('Set TELEGRAM_BOT_TOKEN.'); process.exit(1); }

fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`)
  .then(r => r.json())
  .then(r => console.log(r.ok ? '✅ Webhook deleted.' : '❌ ' + r.description))
  .catch(e => console.error('❌', e.message));
