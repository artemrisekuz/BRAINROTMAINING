require('dotenv').config();

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const children = new Set();
let stopping = false;

const launch = (label, file) => {
  const child = spawn(process.execPath, [file], { stdio: 'inherit', env: process.env });
  children.add(child);
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (label === 'Сайт' && !stopping) {
      console.error(`Сервер сайта остановился (${signal || code}).`);
      stop(code || 1);
    }
    if (label === 'Telegram-бот' && !stopping && code) {
      console.error(`Telegram-бот остановился с кодом ${code}; сайт продолжает работать.`);
    }
  });
  child.once('error', (error) => console.error(`${label}: ${error.message}`));
  return child;
};

const stop = (exitCode = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  const forceExit = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL');
  }, 4000);
  forceExit.unref();
  process.exitCode = exitCode;
};

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

launch('Сайт', 'server.js');
let validWebAppUrl = false;
try {
  const parsedUrl = new URL(process.env.TELEGRAM_WEBAPP_URL);
  validWebAppUrl = parsedUrl.protocol === 'https:' && !parsedUrl.hostname.endsWith('.example') && !['localhost', '127.0.0.1'].includes(parsedUrl.hostname);
} catch {}
const tokenConfigured = process.env.TELEGRAM_BOT_TOKEN && !/PASTE|YOUR_|HERE/i.test(process.env.TELEGRAM_BOT_TOKEN);
if (tokenConfigured && validWebAppUrl) {
  launch('Telegram-бот', 'bot.js');
} else {
  const missing = [];
  if (!tokenConfigured) missing.push('реальный TELEGRAM_BOT_TOKEN');
  if (!validWebAppUrl) missing.push('публичный HTTPS TELEGRAM_WEBAPP_URL');
  const envHint = fs.existsSync(path.join(__dirname, '.env')) ? '' : ' Файл .env не найден: скопируйте .env.example в .env.';
  console.warn(`Сайт запущен. Бот не стартовал: настройте ${missing.join(' и ')}.${envHint}`);
}
