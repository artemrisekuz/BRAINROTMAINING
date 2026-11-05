/**
 * admin.js — Admin panel logic
 * Only renders/activates when gameState.isAdmin === true
 */
(() => {
  if (window.TELEGRAM_ACCESS_BLOCKED) return;

  window.addEventListener('caseapp:ready', () => {
    // Check admin status from state
    fetch('/api/state', { cache: 'no-store' })
      .then(r => r.json())
      .then(state => { if (state.isAdmin) initAdminPanel(state); })
      .catch(() => {});
  });

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function fmt(n) { return new Intl.NumberFormat('ru-RU').format(n); }

  function setStatus(id, msg, ok) {
    const el = document.querySelector(`#${id}`);
    if (!el) return;
    el.textContent = msg;
    el.className = 'bonus-promo-status ' + (ok ? 'bonus-status-success' : 'bonus-status-error');
    if (msg) setTimeout(() => { el.textContent = ''; el.className = 'bonus-promo-status'; }, 4000);
  }

  async function api(method, path, body) {
    const opts = { method, headers: { 'content-type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Ошибка сервера');
    return data;
  }

  function initAdminPanel(initialState) {
    // Show admin section in nav (already done by app.js, but double-check)
    const adminLink = document.querySelector('#admin-nav-link');
    if (adminLink) adminLink.hidden = false;

    // ── Tab switching ────────────────────────────────────────────────────
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.admin-panel').forEach(p => { p.hidden = true; });
        tab.classList.add('active');
        const panel = document.querySelector(`#admin-panel-${tab.dataset.adminTab}`);
        if (panel) panel.hidden = false;
      });
    });

    // ── COINS: give coins ────────────────────────────────────────────────
    document.querySelector('#admin-coins-btn')?.addEventListener('click', async () => {
      const id = document.querySelector('#admin-coins-id')?.value.trim();
      const amount = Number(document.querySelector('#admin-coins-amount')?.value);
      if (!id || isNaN(amount) || amount === 0) { setStatus('admin-coins-status', 'Заполните ID и сумму.', false); return; }
      try {
        const r = await api('POST', '/api/admin/give-coins', { telegramId: id, amount });
        setStatus('admin-coins-status', `✅ Готово. Новый баланс: ${fmt(r.newBalance)} монет`, true);
        document.querySelector('#admin-coins-id').value = '';
        document.querySelector('#admin-coins-amount').value = '';
      } catch (e) { setStatus('admin-coins-status', `❌ ${e.message}`, false); }
    });

    // ── COINS: set balance ────────────────────────────────────────────────
    document.querySelector('#admin-setbal-btn')?.addEventListener('click', async () => {
      const id = document.querySelector('#admin-setbal-id')?.value.trim();
      const amount = Number(document.querySelector('#admin-setbal-amount')?.value);
      if (!id || isNaN(amount) || amount < 0) { setStatus('admin-setbal-status', 'Заполните ID и сумму.', false); return; }
      try {
        const r = await api('POST', '/api/admin/set-balance', { telegramId: id, amount });
        setStatus('admin-setbal-status', `✅ Баланс установлен: ${fmt(r.newBalance)} монет`, true);
        document.querySelector('#admin-setbal-id').value = '';
        document.querySelector('#admin-setbal-amount').value = '';
      } catch (e) { setStatus('admin-setbal-status', `❌ ${e.message}`, false); }
    });

    // ── COINS: load players ───────────────────────────────────────────────
    document.querySelector('#admin-players-load')?.addEventListener('click', async () => {
      const wrap = document.querySelector('#admin-players-list');
      wrap.innerHTML = '<p class="admin-loading">Загрузка…</p>';
      try {
        const { accounts } = await api('GET', '/api/admin/players');
        if (!accounts.length) { wrap.innerHTML = '<p class="admin-empty">Нет игроков.</p>'; return; }
        wrap.innerHTML = `<table class="admin-table">
          <thead><tr><th>Player ID</th><th>Имя</th><th>Баланс</th><th>Кейсов</th><th>Зарегистрирован</th></tr></thead>
          <tbody>${accounts.map(a => `
            <tr>
              <td class="admin-td-id">${esc(a.player_id)}</td>
              <td>${esc(a.name)}${a.username ? ` <small>@${esc(a.username)}</small>` : ''}</td>
              <td class="admin-td-bal">🪙 ${fmt(a.balance)}</td>
              <td>${a.cases_opened}</td>
              <td><small>${esc(a.created_at?.slice(0, 16) || '—')}</small></td>
            </tr>`).join('')}
          </tbody>
        </table>`;
      } catch (e) { wrap.innerHTML = `<p class="admin-error">❌ ${esc(e.message)}</p>`; }
    });

    // ── PROMOS: type switch ───────────────────────────────────────────────
    const promoTypeSelect = document.querySelector('#admin-promo-type');
    const coinsRow = document.querySelector('#admin-promo-coins-row');
    const caseRow = document.querySelector('#admin-promo-case-row');
    const caseSelect = document.querySelector('#admin-promo-caseid');

    // Populate case options from config
    if (caseSelect && window.PROPERTIES?.cases) {
      window.PROPERTIES.cases.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} (${fmt(c.price)} монет)`;
        caseSelect.append(opt);
      });
    } else {
      // Fetch config if PROPERTIES not available yet
      fetch('/api/config').then(r => r.json()).then(cfg => {
        if (!caseSelect) return;
        cfg.cases?.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = `${c.name} (${fmt(c.price)} монет)`;
          caseSelect.append(opt);
        });
      }).catch(() => {});
    }

    promoTypeSelect?.addEventListener('change', () => {
      const isCoins = promoTypeSelect.value === 'coins';
      if (coinsRow) coinsRow.hidden = !isCoins;
      if (caseRow) caseRow.hidden = isCoins;
    });

    // ── PROMOS: create ─────────────────────────────────────────────────────
    document.querySelector('#admin-promo-create')?.addEventListener('click', async () => {
      const code = document.querySelector('#admin-promo-code')?.value.trim().toUpperCase();
      const type = document.querySelector('#admin-promo-type')?.value;
      const value = Number(document.querySelector('#admin-promo-value')?.value);
      const caseId = document.querySelector('#admin-promo-caseid')?.value;
      const usesLeft = Number(document.querySelector('#admin-promo-uses')?.value ?? 1);
      const expiresAt = document.querySelector('#admin-promo-expires')?.value || null;

      if (!code) { setStatus('admin-promo-status', 'Введите код промокода.', false); return; }
      if (type === 'coins' && (!value || value <= 0)) { setStatus('admin-promo-status', 'Укажите количество монет > 0.', false); return; }
      if (type === 'case' && !caseId) { setStatus('admin-promo-status', 'Выберите кейс.', false); return; }

      try {
        await api('POST', '/api/admin/promos', { code, type, value, caseId, usesLeft, expiresAt });
        setStatus('admin-promo-status', `✅ Промокод ${code} создан!`, true);
        document.querySelector('#admin-promo-code').value = '';
        document.querySelector('#admin-promo-value').value = '';
        document.querySelector('#admin-promo-expires').value = '';
        document.querySelector('#admin-promo-uses').value = '1';
        // Reload list if visible
        loadPromos();
      } catch (e) { setStatus('admin-promo-status', `❌ ${e.message}`, false); }
    });

    // ── PROMOS: load list ─────────────────────────────────────────────────
    async function loadPromos() {
      const wrap = document.querySelector('#admin-promos-list');
      if (!wrap) return;
      wrap.innerHTML = '<p class="admin-loading">Загрузка…</p>';
      try {
        const { promos } = await api('GET', '/api/admin/promos');
        if (!promos.length) { wrap.innerHTML = '<p class="admin-empty">Промокодов нет.</p>'; return; }
        wrap.innerHTML = `<table class="admin-table">
          <thead><tr><th>Код</th><th>Тип</th><th>Значение</th><th>Осталось</th><th>Истекает</th><th></th></tr></thead>
          <tbody>${promos.map(p => `
            <tr data-promo-code="${esc(p.code)}">
              <td><b>${esc(p.code)}</b></td>
              <td>${p.type === 'coins' ? '💰 Монеты' : '📦 Кейс'}</td>
              <td>${p.type === 'coins' ? `${fmt(p.value)} монет` : esc(p.case_id || '—')}</td>
              <td>${p.uses_left < 0 ? '∞' : p.uses_left}</td>
              <td><small>${p.expires_at ? esc(p.expires_at.slice(0, 16)) : '—'}</small></td>
              <td><button class="admin-delete-promo" data-code="${esc(p.code)}" type="button">✕</button></td>
            </tr>`).join('')}
          </tbody>
        </table>`;

        // Delete buttons
        wrap.querySelectorAll('.admin-delete-promo').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm(`Удалить промокод ${btn.dataset.code}?`)) return;
            try {
              await api('DELETE', '/api/admin/promos', { code: btn.dataset.code });
              loadPromos();
            } catch (e) { alert(e.message); }
          });
        });
      } catch (e) { wrap.innerHTML = `<p class="admin-error">❌ ${esc(e.message)}</p>`; }
    }

    document.querySelector('#admin-promos-load')?.addEventListener('click', loadPromos);

    // ── ADMINS: add ─────────────────────────────────────────────────────────
    document.querySelector('#admin-add-btn')?.addEventListener('click', async () => {
      const id = document.querySelector('#admin-add-id')?.value.trim();
      if (!id) { setStatus('admin-add-status', 'Введите Telegram ID.', false); return; }
      try {
        await api('POST', '/api/admin/admins', { telegramId: id });
        setStatus('admin-add-status', `✅ Администратор TG${id} добавлен.`, true);
        document.querySelector('#admin-add-id').value = '';
        loadAdmins();
      } catch (e) { setStatus('admin-add-status', `❌ ${e.message}`, false); }
    });

    // ── ADMINS: load list ───────────────────────────────────────────────────
    async function loadAdmins() {
      const wrap = document.querySelector('#admin-admins-list');
      if (!wrap) return;
      wrap.innerHTML = '<p class="admin-loading">Загрузка…</p>';
      try {
        const { admins } = await api('GET', '/api/admin/admins');
        if (!admins.length) { wrap.innerHTML = '<p class="admin-empty">Нет администраторов.</p>'; return; }
        wrap.innerHTML = `<table class="admin-table">
          <thead><tr><th>Player ID</th><th>Добавлен</th><th></th></tr></thead>
          <tbody>${admins.map(a => `
            <tr>
              <td><b>${esc(a.player_id)}</b></td>
              <td><small>${esc(a.added_at?.slice(0, 16) || '—')}</small></td>
              <td><button class="admin-delete-promo" data-id="${esc(a.player_id)}" type="button">✕</button></td>
            </tr>`).join('')}
          </tbody>
        </table>`;

        wrap.querySelectorAll('.admin-delete-promo').forEach(btn => {
          btn.addEventListener('click', async () => {
            const rawId = btn.dataset.id.replace(/^TG/, '');
            if (!confirm(`Удалить администратора ${btn.dataset.id}?`)) return;
            try {
              await api('DELETE', '/api/admin/admins', { telegramId: rawId });
              loadAdmins();
            } catch (e) { alert(e.message); }
          });
        });
      } catch (e) { wrap.innerHTML = `<p class="admin-error">❌ ${esc(e.message)}</p>`; }
    }

    document.querySelector('#admin-admins-load')?.addEventListener('click', loadAdmins);
  }
})();
