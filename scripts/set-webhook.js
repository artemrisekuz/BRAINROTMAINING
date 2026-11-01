/**
 * Sets the Telegram webhook to your Cloudflare Workers URL.
 * Run: node scripts/set-webhook.js
 *
 * Requires environment variables:
 *   TELEGRAM_BOT_TOKEN    — your bot token from @BotFather
 *   TELEGRAM_WEBAPP_URL   — your Workers URL, e.g. https://brainrot-mining.workers.dev
 *   TELEGRAM_WEBHOOK_SECRET — a random string (optional but recommended)
 */

const token = process.env.TELEGRAM_BOT_TOKEN;
const baseUrl = process.env.TELEGRAM_WEBAPP_URL;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token || !baseUrl) {
  console.error('Set TELEGRAM_BOT_TOKEN and TELEGRAM_WEBAPP_URL before running this script.');
  process.exit(1);
}

const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/telegram-webhook`;

const body = {
  url: webhookUrl,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: true,
};
if (secret) body.secret_token = secret;

fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
  .then(r => r.json())
  .then(result => {
    if (result.ok) {
      console.log(`✅ Webhook set: ${webhookUrl}`);
    } else {
      console.error('❌ Telegram error:', result.description);
      process.exit(1);
    }
  })
  .catch(e => { console.error('❌ Network error:', e.message); process.exit(1); });
