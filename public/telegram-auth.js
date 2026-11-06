(() => {
  const userLabel = document.querySelector('#telegram-user');
  const deny = (message) => {
    window.TELEGRAM_ACCESS_BLOCKED = true;
    document.body.innerHTML = `<main class="telegram-gate"><div class="telegram-gate-mark">✦</div><h1>${message}</h1><p>Откройте игру кнопкой «ИГРАТЬ» в Telegram-боте.</p></main>`;
    return false;
  };

  const webApp = window.Telegram?.WebApp;
  if (!webApp?.initData) {
    window.telegramReady = Promise.resolve(deny('Доступ только через Telegram'));
    return;
  }

  webApp.ready();
  webApp.expand();
  webApp.setHeaderColor?.('#100d14');
  webApp.setBackgroundColor?.('#100d14');
  document.body.classList.add('telegram-mini-app');
  document.documentElement.style.setProperty(
    '--telegram-viewport-height',
    `${webApp.viewportStableHeight || window.innerHeight}px`
  );
  webApp.onEvent?.('viewportChanged', () =>
    document.documentElement.style.setProperty(
      '--telegram-viewport-height',
      `${webApp.viewportStableHeight || window.innerHeight}px`
    )
  );

  window.telegramReady = (async () => {
    try {
      const response = await fetch('/api/auth/telegram-webapp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData: webApp.initData }),
      });

      // Try to parse JSON — server might return HTML on 5xx
      let result;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        result = await response.json();
      } else {
        const text = await response.text();
        // Show first 120 chars of unexpected response for debugging
        return deny(`Ошибка сервера (${response.status}): ${text.slice(0, 120)}`);
      }

      if (response.status === 403) return deny('ВЫ НЕ АДМИН!');
      if (!response.ok) return deny(result.error || `Ошибка авторизации (${response.status})`);

      if (userLabel) {
        userLabel.textContent = result.username ? `@${result.username}` : result.name || 'Telegram';
        userLabel.hidden = false;
      }

      window.dispatchEvent(new CustomEvent('telegram:auth-changed', { detail: result }));
      return result;
    } catch (e) {
      // Network error — show actual message
      return deny(`Не удалось подключиться к игре: ${e.message}`);
    }
  })();
})();
