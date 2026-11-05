/**
 * bonus.js — Bonus page: promo code redemption
 */
(() => {
  if (window.TELEGRAM_ACCESS_BLOCKED) return;

  // Wait for app to be ready
  window.addEventListener('caseapp:ready', () => {
    initBonusPage();
  });

  function initBonusPage() {
    // ── Bonus tab switching ──────────────────────────────────────────────
    document.querySelectorAll('.bonus-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.bonus-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.bonus-tab-panel').forEach(p => p.hidden = true);
        tab.classList.add('active');
        const panel = document.querySelector(`#bonus-panel-${tab.dataset.bonusTab}`);
        if (panel) panel.hidden = false;
      });
    });

    // ── Promo code form ──────────────────────────────────────────────────
    const input = document.querySelector('#promo-input');
    const btn = document.querySelector('#promo-submit');
    const status = document.querySelector('#promo-status');

    if (!input || !btn || !status) return;

    // Auto-uppercase while typing
    input.addEventListener('input', () => {
      const pos = input.selectionStart;
      input.value = input.value.toUpperCase();
      input.setSelectionRange(pos, pos);
    });

    btn.addEventListener('click', () => submitPromo());
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submitPromo(); });

    async function submitPromo() {
      const code = input.value.trim().toUpperCase();
      if (!code) { showStatus('Введите промокод.', 'error'); return; }

      btn.disabled = true;
      btn.textContent = 'Проверяем…';
      showStatus('', '');

      try {
        const response = await fetch('/api/bonus/redeem', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const result = await response.json();

        if (!response.ok) {
          showStatus(result.error || 'Не удалось применить промокод.', 'error');
          return;
        }

        // Update balance in header
        if (result.balance !== undefined) {
          const balEl = document.querySelector('#balance');
          if (balEl) balEl.textContent = `🪙 ${new Intl.NumberFormat('ru-RU').format(result.balance)}`;
        }

        if (result.type === 'coins') {
          showStatus(`✅ Получено ${new Intl.NumberFormat('ru-RU').format(result.value)} монет!`, 'success');
        } else if (result.type === 'case') {
          showStatus(
            `✅ Открыт кейс «${result.caseName}» — получен ${result.item?.name || 'предмет'}!`,
            'success'
          );
        }

        input.value = '';

        // Reload state to reflect new balance/inventory
        window.dispatchEvent(new Event('bonus:redeemed'));
        await fetch('/api/state', { cache: 'no-store' })
          .then(r => r.json())
          .then(state => window.dispatchEvent(new CustomEvent('state:updated', { detail: state })))
          .catch(() => {});

      } catch (e) {
        showStatus('Ошибка соединения. Попробуйте снова.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Применить';
      }
    }

    function showStatus(msg, type) {
      status.textContent = msg;
      status.className = 'bonus-promo-status' + (type ? ` bonus-status-${type}` : '');
    }
  }

  // Listen for state:updated to refresh balance in profile
  window.addEventListener('state:updated', (e) => {
    const state = e.detail;
    if (!state) return;
    const balEl = document.querySelector('#balance');
    if (balEl) balEl.textContent = `🪙 ${new Intl.NumberFormat('ru-RU').format(state.balance)}`;
  });
})();
