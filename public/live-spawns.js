/**
 * live-spawns.js — Live drop feed ticker
 * Polls /api/live-events every 5 seconds and populates #live-feed
 */
(() => {
  if (window.TELEGRAM_ACCESS_BLOCKED) return;

  const feed = document.querySelector('#live-feed');
  if (!feed) return;

  let lastSeenId = null;

  const imagePath = (name) => `images/${encodeURIComponent(name)}`;
  const escapeHtml = (v) =>
    String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/live-events', { cache: 'no-store' });
      if (!response.ok) return;
      const { events } = await response.json();
      if (!events?.length) return;

      events.forEach((event) => {
        if (event.id === lastSeenId) return;
        const el = document.createElement('div');
        el.className = 'live-item is-new';
        el.dataset.dropId = event.id;
        const initial = (event.player || 'G').slice(0, 1).toUpperCase();
        el.innerHTML = `
          <span class="live-avatar" style="--avatar-color:#8b5cf6">${escapeHtml(initial)}</span>
          <div class="live-copy">
            <strong>${escapeHtml(event.player || 'Гость')}</strong>
            <span class="live-item-name">${escapeHtml(event.item?.name || '')}</span>
            <small>${escapeHtml(event.caseData?.name || 'Кейс')}</small>
          </div>
          <span class="live-value">🪙 ${new Intl.NumberFormat('ru-RU').format(event.item?.price || 0)}</span>`;
        feed.prepend(el);
      });

      lastSeenId = events[0]?.id || lastSeenId;

      // Keep feed trimmed to 20 items
      while (feed.children.length > 20) feed.lastElementChild.remove();
    } catch {
      // Silently ignore network errors for live feed
    }
  };

  // Start polling after app is ready
  window.addEventListener('caseapp:ready', () => {
    fetchEvents();
    setInterval(fetchEvents, 5000);
  });
})();
