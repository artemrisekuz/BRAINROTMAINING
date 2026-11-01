(() => {
  if (window.TELEGRAM_ACCESS_BLOCKED) return;
  const properties = window.PROPERTIES;
  const feed = document.querySelector('#live-feed');
  const feature = document.querySelector('.top-drop');
  if (!properties || !feed) return;

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const formatPrice = (price) => new Intl.NumberFormat('ru-RU').format(price);
  let telegramId = '';
  const updateAge = (label) => {
    if (!label) return;
    const seconds = Number(label.dataset.seconds || 0);
    label.textContent = seconds < 60 ? `${seconds} сек. назад` : `${Math.floor(seconds / 60)} мин. назад`;
  };
  const rowFor = (event) => {
    const row = document.createElement('article');
    row.className = 'live-item';
    const mine = event.playerId === `TG${telegramId}`;
    const player = mine ? 'Вы' : event.player || 'Игрок';
    const avatar = player === 'Вы' ? 'В' : (player.match(/[\p{L}\p{N}]/u)?.[0] || 'Г').toUpperCase();
    const accent = `hsl(${[...player].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360} 56% 45%)`;
    const age = Math.max(0, Math.floor((Date.now() - new Date(event.openedAt).getTime()) / 1000));
    row.dataset.eventId = event.id;
    row.innerHTML = `
      <span class="live-avatar" style="--avatar-color:${accent}">${escapeHtml(avatar)}</span>
      <span class="live-copy"><strong>${escapeHtml(player)}${mine ? ' · ВЫ' : ''}</strong><span class="live-item-name">${escapeHtml(event.item.name)}</span><small>${escapeHtml(event.caseData.name)} · <span data-age data-seconds="${age}"></span></small></span>
      <span class="live-value">🪙 ${formatPrice(event.item.price)}</span>`;
    if (mine) row.classList.add('is-verified');
    updateAge(row.querySelector('[data-age]'));
    return row;
  };

  const initializeLiveFeed = async () => {
    feed.replaceChildren();
    try {
      const sessionResponse = await fetch('/api/auth/me', { cache: 'no-store' });
      const session = await sessionResponse.json();
      telegramId = session.telegramId || '';
    } catch { telegramId = ''; }
    if (feature) {
      const featureBody = feature.querySelector('strong');
      const featureValue = feature.querySelector('span');
      if (featureBody) featureBody.textContent = 'Ожидаем первый дроп';
      if (featureValue) featureValue.textContent = '—';
    }

    const updateTopDrop = (events) => {
      const today = new Date().toDateString();
      const best = events.filter((event) => new Date(event.openedAt).toDateString() === today).sort((a, b) => b.item.price - a.item.price)[0];
      if (!best || !feature) return;
      const featureBody = feature.querySelector('strong');
      const featureValue = feature.querySelector('span');
      if (featureBody) featureBody.textContent = best.item.name;
      if (featureValue) featureValue.textContent = `🪙 ${formatPrice(best.item.price)}`;
    };
    const sync = async (initial = false) => {
      try {
        const response = await fetch('/api/live-events', { cache: 'no-store' });
        if (!response.ok) return;
        const { events } = await response.json();
        if (initial) {
          feed.replaceChildren();
          if (!events.length) {
            const empty = document.createElement('p');
            empty.className = 'live-empty';
            empty.textContent = 'Пока нет открытий — станьте первым';
            feed.append(empty);
          }
          events.slice().reverse().forEach((event) => feed.append(rowFor(event)));
        } else {
          const known = new Set([...feed.querySelectorAll('[data-event-id]')].map((row) => row.dataset.eventId));
          events.filter((event) => !known.has(event.id)).reverse().forEach((event) => {
            const row = rowFor(event);
            row.classList.add('is-new');
            feed.prepend(row);
          });
          while (feed.querySelectorAll('[data-event-id]').length > 9) feed.lastElementChild.remove();
          feed.querySelector('.live-empty')?.remove();
        }
        updateTopDrop(events);
      } catch { /* Leave the last confirmed events visible while offline. */ }
    };
    const updateAges = () => feed.querySelectorAll('[data-age]').forEach((label) => {
      label.dataset.seconds = String(Number(label.dataset.seconds || 0) + 1);
      updateAge(label);
    });
    feed.closest('.live-sidebar')?.classList.add('live-ready');
    sync(true);
    window.setInterval(() => sync(false), 2500);
    window.setInterval(updateAges, 1000);
  };
  window.addEventListener('caseapp:ready', initializeLiveFeed, { once: true });
})();
