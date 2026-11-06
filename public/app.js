(() => {
  if (window.TELEGRAM_ACCESS_BLOCKED) return;
  let properties; let gameState; let byId;
  const imagePath = (name) => `images/${name}`;
  const casesList = document.querySelector('#cases-list'); const liveFeed = document.querySelector('#live-feed');
  const dialog = document.querySelector('#case-dialog'); const details = document.querySelector('#case-details');
  const profileDialog = document.querySelector('#profile-dialog'); const profileInventory = document.querySelector('#profile-inventory');
  let upgradeSourceId = null; let upgradeTargetId = null; let upgradeBusy = false;
  let resultDialog = document.querySelector('#result-dialog');
  if (!resultDialog) { resultDialog = document.createElement('dialog'); resultDialog.id = 'result-dialog'; resultDialog.innerHTML = '<div id="result-details"></div><button class="primary-button result-close" type="button">Забрать предмет</button>'; document.body.append(resultDialog); }
  let balanceElement = document.querySelector('#balance');
  if (!balanceElement) { balanceElement = document.querySelector('.account > span'); balanceElement.id = 'balance'; }
  const formatPrice = (price) => `${new Intl.NumberFormat('ru-RU').format(price)} ${properties.currencyName}`;
  const image = (name, alt, className) => { const element = document.createElement('img'); element.className = className; element.src = imagePath(name); element.alt = alt; element.onerror = () => element.replaceWith(Object.assign(document.createElement('div'), { className: `${className} placeholder`, textContent: `Добавьте images/${name}` })); return element; };
  const renderBalance = () => { balanceElement.textContent = `🪙 ${new Intl.NumberFormat('ru-RU').format(gameState.balance)}`; };
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const renderInventory = () => {
    if (!profileInventory) return;
    const sellAllButton = document.querySelector('#profile-sell-all');
    if (sellAllButton) sellAllButton.hidden = !gameState.inventory.length;
    if (!gameState.inventory.length) { profileInventory.innerHTML = '<div class="profile-empty"><span>✦</span><strong>Коллекция пока пуста</strong><small>Откройте кейс, чтобы получить первый брейн.</small></div>'; return; }
    profileInventory.innerHTML = gameState.inventory.map((drop) => {
      const item = properties.brainrots.find((brainrot) => brainrot.id === drop.itemId);
      if (!item) return '';
      return `<article class="profile-item"><img src="${imagePath(item.image)}" alt="${escapeHtml(item.name)}"><div class="profile-item-info"><strong>${escapeHtml(item.name)}</strong><small>Выпал из кейса · ${new Date(drop.openedAt).toLocaleString('ru-RU')}</small><b>🪙 ${new Intl.NumberFormat('ru-RU').format(item.price)}</b></div><button class="sell-item" data-drop-id="${escapeHtml(drop.id)}" type="button">Продать</button></article>`;
    }).join('');
    profileInventory.querySelectorAll('.profile-item img').forEach((photo) => photo.addEventListener('error', () => photo.classList.add('item-image-missing'), { once: true }));
  };
  const renderProfile = () => {
    if (!document.querySelector('#profile-name')) return;
    document.querySelector('#profile-name').textContent = gameState.name || 'Telegram';
    document.querySelector('#profile-telegram-id').textContent = `Telegram ID · ${gameState.telegramId || '—'}`;
    document.querySelector('#profile-avatar').textContent = (gameState.name || 'T').trim().slice(0, 1).toUpperCase();
    document.querySelector('#profile-balance').textContent = new Intl.NumberFormat('ru-RU').format(gameState.balance);
    document.querySelector('#profile-cases-count').textContent = gameState.stats?.casesOpened || 0;
    document.querySelector('#profile-items-count').textContent = gameState.inventory.length;
    const bestDrop = gameState.history.map((drop) => ({ drop, item: properties.brainrots.find((item) => item.id === drop.itemId), caseData: properties.cases.find((entry) => entry.id === drop.caseId) })).filter((entry) => entry.item).sort((left, right) => right.item.price - left.item.price)[0];
    const bestCard = document.querySelector('#profile-best-drop');
    bestCard.hidden = !bestDrop;
    if (bestDrop) {
      const photo = document.querySelector('#profile-best-image');
      photo.src = imagePath(bestDrop.item.image);
      photo.alt = bestDrop.item.name;
      photo.onerror = () => { photo.hidden = true; };
      document.querySelector('#profile-best-name').textContent = bestDrop.item.name;
      document.querySelector('#profile-best-source').textContent = bestDrop.caseData?.name || (bestDrop.drop.kind === 'upgrade' ? 'Апгрейдер' : 'Кейс');
      document.querySelector('#profile-best-price').textContent = `🪙 ${new Intl.NumberFormat('ru-RU').format(bestDrop.item.price)}`;
    }
    const caseCounts = gameState.history.reduce((counts, drop) => { if (drop.caseId) counts[drop.caseId] = (counts[drop.caseId] || 0) + 1; return counts; }, {});
    const favoriteId = Object.keys(caseCounts).sort((left, right) => caseCounts[right] - caseCounts[left])[0];
    const favoriteCase = properties.cases.find((caseData) => caseData.id === favoriteId);
    const favoriteCard = document.querySelector('#profile-favorite-case');
    favoriteCard.hidden = !favoriteCase;
    if (favoriteCase) {
      const photo = document.querySelector('#profile-favorite-image');
      photo.src = imagePath(favoriteCase.image);
      photo.alt = favoriteCase.name;
      photo.onerror = () => { photo.hidden = true; };
      document.querySelector('#profile-favorite-name').textContent = favoriteCase.name;
      document.querySelector('#profile-favorite-count').textContent = `${caseCounts[favoriteId]} открытий`;
    }
    const historyList = document.querySelector('#profile-history-list');
    historyList.innerHTML = gameState.history.length ? gameState.history.slice(0, 12).map((drop) => {
      const item = properties.brainrots.find((brainrot) => brainrot.id === drop.itemId);
      const sourceCase = properties.cases.find((caseData) => caseData.id === drop.caseId);
      return item ? `<div class="profile-history-row"><span>${escapeHtml(item.name)}</span><small>${escapeHtml(sourceCase?.name || (drop.kind === 'upgrade' ? 'Апгрейдер' : 'Кейс'))} · ${new Date(drop.openedAt).toLocaleString('ru-RU')}</small><strong>🪙 ${new Intl.NumberFormat('ru-RU').format(item.price)}</strong></div>` : '';
    }).join('') : '<p class="profile-history-empty">Открытий пока нет.</p>';
  };
  const selectedUpgradeDrop = () => gameState?.inventory.find((drop) => drop.id === upgradeSourceId);
  const selectedUpgradeSource = () => {
    const drop = selectedUpgradeDrop();
    return drop ? properties.brainrots.find((item) => item.id === drop.itemId) : null;
  };
  const selectedUpgradeTarget = () => properties.brainrots.find((item) => item.id === upgradeTargetId) || null;
  // ── Upgrade wheel (canvas) ──────────────────────────────────────────
  const WHEEL_SIZE = 220;
  const WHEEL_R = 102;         // outer radius
  const WHEEL_INNER = 58;      // inner hole radius
  const WIN_COLOR  = '#2fe88a';
  const LOSE_COLOR = '#e84f4f';
  const WIN_GLOW   = '#1aff8080';
  const LOSE_GLOW  = '#ff1a3080';

  let wheelChance = 0;          // 0–100, current displayed chance
  let wheelSpinRAF = null;      // requestAnimationFrame handle
  let wheelAngle   = 0;         // current needle angle in radians (0 = top)

  const drawWheel = (chance, angle) => {
    const canvas = document.querySelector('#upgrade-wheel-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = WHEEL_SIZE / 2, cy = WHEEL_SIZE / 2;
    ctx.clearRect(0, 0, WHEEL_SIZE, WHEEL_SIZE);

    // fraction of green (win) sector, starting from top (−π/2)
    const winFrac  = Math.max(0, Math.min(1, chance / 100));
    const winEnd   = -Math.PI / 2 + winFrac * 2 * Math.PI;
    const startAngle = -Math.PI / 2;

    // draw win arc
    if (winFrac > 0) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, WHEEL_R, startAngle, winEnd);
      ctx.closePath();
      ctx.fillStyle = WIN_COLOR;
      ctx.fill();
    }
    // draw lose arc
    if (winFrac < 1) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, WHEEL_R, winEnd, startAngle + 2 * Math.PI);
      ctx.closePath();
      ctx.fillStyle = LOSE_COLOR;
      ctx.fill();
    }

    // thin divider lines
    if (winFrac > 0 && winFrac < 1) {
      const drawLine = (a) => {
        ctx.beginPath();
        ctx.moveTo(cx + WHEEL_INNER * Math.cos(a), cy + WHEEL_INNER * Math.sin(a));
        ctx.lineTo(cx + WHEEL_R    * Math.cos(a), cy + WHEEL_R    * Math.sin(a));
        ctx.strokeStyle = '#000a';
        ctx.lineWidth = 2;
        ctx.stroke();
      };
      drawLine(startAngle);
      drawLine(winEnd);
    }

    // ring border
    ctx.beginPath();
    ctx.arc(cx, cy, WHEEL_R, 0, 2 * Math.PI);
    ctx.strokeStyle = '#ffffff22';
    ctx.lineWidth = 2;
    ctx.stroke();

    // inner hole (dark circle)
    ctx.beginPath();
    ctx.arc(cx, cy, WHEEL_INNER, 0, 2 * Math.PI);
    ctx.fillStyle = '#17121b';
    ctx.fill();
    ctx.strokeStyle = '#ffffff18';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // outer glow ring (split colour)
    const gradGlow = ctx.createConicGradient(startAngle, cx, cy);
    gradGlow.addColorStop(0,        WIN_GLOW);
    gradGlow.addColorStop(winFrac,  WIN_GLOW);
    gradGlow.addColorStop(winFrac,  LOSE_GLOW);
    gradGlow.addColorStop(1,        LOSE_GLOW);
    ctx.beginPath();
    ctx.arc(cx, cy, WHEEL_R + 5, 0, 2 * Math.PI);
    ctx.arc(cx, cy, WHEEL_R + 1, 0, 2 * Math.PI, true);
    ctx.fillStyle = gradGlow;
    ctx.fill();

    // палочка — радиальная палка от внутреннего круга до внешнего кольца,
    // ровно лежит на круге и крутится внутри по всему периметру
    const needleAngle = -Math.PI / 2 + angle;
    const stickInner = WHEEL_INNER + 2;
    const stickOuter = WHEEL_R - 2;
    const sx1 = cx + stickInner * Math.cos(needleAngle);
    const sy1 = cy + stickInner * Math.sin(needleAngle);
    const sx2 = cx + stickOuter * Math.cos(needleAngle);
    const sy2 = cy + stickOuter * Math.sin(needleAngle);
    // glow underlay
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.strokeStyle = '#ff8b0066';
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.stroke();
    // stick body
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.strokeStyle = '#ffe08a';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#ff8b00';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // bright tip marker sitting on the ring
    ctx.beginPath();
    ctx.arc(sx2, sy2, 6.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff2c4';
    ctx.shadowColor = '#ff8b00';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
  };

  const setWheelChance = (chance) => {
    wheelChance = chance;
    drawWheel(chance, wheelAngle);
    const chanceEl = document.querySelector('#upgrade-chance');
    if (chanceEl) chanceEl.textContent = `${chance.toFixed(1)}%`;
  };

  // spin the needle continuously (during API call)
  const startWheelSpin = () => {
    if (wheelSpinRAF) return;
    let last = null;
    const tick = (ts) => {
      if (!last) last = ts;
      const dt = ts - last;
      last = ts;
      wheelAngle = (wheelAngle + (dt / 1000) * 2 * Math.PI * 1.4) % (2 * Math.PI);
      drawWheel(wheelChance, wheelAngle);
      wheelSpinRAF = requestAnimationFrame(tick);
    };
    wheelSpinRAF = requestAnimationFrame(tick);
  };

  const stopWheelSpin = (landOnWin) => {
    if (wheelSpinRAF) { cancelAnimationFrame(wheelSpinRAF); wheelSpinRAF = null; }
    // animate needle glide to winning (green) or losing (red) zone
    const winFrac = Math.max(0, Math.min(1, wheelChance / 100));
    // target angle offset from top (−π/2 is top, wheel starts from there)
    let targetAngle;
    if (landOnWin) {
      // random point inside the green sector
      const range = winFrac * 2 * Math.PI;
      targetAngle = range > 0 ? Math.random() * range * 0.8 + range * 0.1 : 0;
    } else {
      // random point inside the red sector
      const redStart = winFrac * 2 * Math.PI;
      const redRange = (1 - winFrac) * 2 * Math.PI;
      targetAngle = redRange > 0 ? redStart + Math.random() * redRange * 0.8 + redRange * 0.1 : redStart;
    }

    // glide from current angle to target over ~0.9s
    const startA = wheelAngle % (2 * Math.PI);
    // ensure we travel forward (not backwards) — add full rotation if needed
    let diff = targetAngle - startA;
    if (diff < 0) diff += 2 * Math.PI;
    diff += 2 * Math.PI; // one extra spin for drama

    const duration = 900;
    const startTime = performance.now();
    const glide = (ts) => {
      const t = Math.min(1, (ts - startTime) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      wheelAngle = startA + diff * ease;
      drawWheel(wheelChance, wheelAngle % (2 * Math.PI));
      if (t < 1) requestAnimationFrame(glide);
    };
    requestAnimationFrame(glide);
  };

  // ── renderUpgrade ────────────────────────────────────────────────────
  const renderUpgrade = () => {
    if (!gameState || !properties) return;
    if (!selectedUpgradeDrop()) { upgradeSourceId = null; upgradeTargetId = null; }
    const sourceList = document.querySelector('#upgrade-source-list');
    const targetList = document.querySelector('#upgrade-target-list');
    if (!sourceList || !targetList) return;
    const source = selectedUpgradeSource();
    const target = selectedUpgradeTarget();
    sourceList.innerHTML = gameState.inventory.length ? gameState.inventory.map((drop) => {
      const item = properties.brainrots.find((entry) => entry.id === drop.itemId);
      if (!item) return '';
      return `<button class="upgrade-item ${drop.id === upgradeSourceId ? 'selected' : ''}" data-upgrade-drop="${escapeHtml(drop.id)}" type="button"><img src="${imagePath(item.image)}" alt=""><span>${escapeHtml(item.name)}</span><b>🪙 ${new Intl.NumberFormat('ru-RU').format(item.price)}</b></button>`;
    }).join('') : '<p class="upgrade-empty">В инвентаре пока нет предметов.</p>';
    const targets = source ? properties.brainrots.filter((item) => item.price > source.price).sort((left, right) => left.price - right.price) : [];
    targetList.innerHTML = source ? targets.length ? targets.map((item) => `<button class="upgrade-item ${item.id === upgradeTargetId ? 'selected' : ''}" data-upgrade-target="${escapeHtml(item.id)}" type="button"><img src="${imagePath(item.image)}" alt=""><span>${escapeHtml(item.name)}</span><b>🪙 ${new Intl.NumberFormat('ru-RU').format(item.price)}</b></button>`).join('') : '<p class="upgrade-empty">Нет целей дороже выбранного предмета.</p>' : '<p class="upgrade-empty">Сначала выберите свой брейн.</p>';
    sourceList.querySelectorAll('img').forEach((photo) => photo.addEventListener('error', () => photo.classList.add('item-image-missing'), { once: true }));
    targetList.querySelectorAll('img').forEach((photo) => photo.addEventListener('error', () => photo.classList.add('item-image-missing'), { once: true }));
    document.querySelector('#upgrade-source-value').textContent = source ? `${source.name} · ${formatPrice(source.price)}` : 'Выберите предмет';
    document.querySelector('#upgrade-target-value').textContent = target ? `${target.name} · ${formatPrice(target.price)}` : 'Выберите цель';
    const chance = source && target ? Math.min(90, Math.max(5, (source.price / target.price) * 100)) : 0;
    setWheelChance(chance);
    const button = document.querySelector('#upgrade-button');
    button.disabled = !source || !target || upgradeBusy;
    button.textContent = upgradeBusy ? 'Крутим…' : `Улучшить · ${chance.toFixed(1)}%`;
  };
  const upgradeSourceList = document.querySelector('#upgrade-source-list');
  const upgradeTargetList = document.querySelector('#upgrade-target-list');
  if (upgradeSourceList) upgradeSourceList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-upgrade-drop]');
    if (!button || upgradeBusy) return;
    upgradeSourceId = button.dataset.upgradeDrop;
    upgradeTargetId = null;
    document.querySelector('#upgrade-status').textContent = '';
    renderUpgrade();
  });
  if (upgradeTargetList) upgradeTargetList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-upgrade-target]');
    if (!button || upgradeBusy) return;
    upgradeTargetId = button.dataset.upgradeTarget;
    document.querySelector('#upgrade-status').textContent = '';
    renderUpgrade();
  });
  const upgradeButton = document.querySelector('#upgrade-button'); if (upgradeButton) upgradeButton.addEventListener('click', async () => {
    const sourceDrop = selectedUpgradeDrop();
    const source = selectedUpgradeSource();
    const target = selectedUpgradeTarget();
    if (!sourceDrop || !source || !target || upgradeBusy) return;
    upgradeBusy = true;
    const status = document.querySelector('#upgrade-status');
    status.textContent = 'Крутим…';
    renderUpgrade(); // disables button
    const chance = Math.min(90, Math.max(5, (source.price / target.price) * 100));
    setWheelChance(chance);
    startWheelSpin();

    // fire API while wheel spins
    let result = null;
    let apiError = null;
    try {
      const response = await fetch('/api/upgrade', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dropId: sourceDrop.id, targetId: target.id })
      });
      result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Апгрейд не выполнен.');
    } catch (error) {
      apiError = error;
    }

    // spin for at least 1.5 s
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
    stopWheelSpin(apiError ? false : result.success);

    // wait for needle glide
    await new Promise((resolve) => window.setTimeout(resolve, 1000));

    if (apiError) {
      status.textContent = apiError.message;
    } else {
      status.textContent = result.success
        ? `🎉 Успех! Получен ${result.target.name}`
        : `💥 ${source.name} сгорел. Попробуйте ещё раз.`;
    }
    upgradeSourceId = null;
    upgradeTargetId = null;
    upgradeBusy = false;
    await loadInventory();
  });
  const loadInventory = async () => {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (!response.ok) throw new Error('Не удалось загрузить инвентарь.');
    gameState = await response.json();
    renderBalance();
    renderInventory();
    renderProfile();
    renderUpgrade();
  };
  window.addEventListener('telegram:auth-changed', () => loadInventory().catch(() => {}));
  const setActivePage = (page) => {
    document.body.classList.toggle('upgrader-active', page === 'upgrader');
    document.querySelectorAll('[data-page-link]').forEach((link) => link.classList.toggle('active', link.dataset.pageLink === page));
    document.querySelectorAll('[data-miniapp-tab]').forEach((tab) => tab.classList.toggle('active', tab.dataset.miniappTab === page));
    if (page === 'upgrader' || page === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
    else document.querySelector('#cases')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  // Multi-page design: header nav links use real hrefs (no preventDefault).
  const upgradeBack = document.querySelector('#upgrade-back');
  if (upgradeBack) upgradeBack.addEventListener('click', () => { location.href = '/cases.html'; });
  let profileReturnPage = 'cases';
  const openProfile = async () => {
    profileReturnPage = document.body.classList.contains('upgrader-active') ? 'upgrader' : 'cases';
    setActivePage('profile');
    profileInventory.innerHTML = '<div class="profile-empty">Загружаем инвентарь…</div>';
    profileDialog.showModal();
    try { await loadInventory(); } catch (error) { profileInventory.innerHTML = `<p class="profile-error">${escapeHtml(error.message)}</p>`; }
  };
  const profileButtonEl = document.querySelector('#profile-button'); if (profileButtonEl) profileButtonEl.addEventListener('click', openProfile);
  document.querySelectorAll('[data-miniapp-tab]').forEach((tab) => tab.addEventListener('click', () => {
    if (tab.dataset.miniappTab === 'profile') openProfile();
    else setActivePage(tab.dataset.miniappTab);
    if (tab.dataset.miniappTab !== 'profile' && profileDialog && profileDialog.open) profileDialog.close();
  }));
  const tabProfileBtn = document.querySelector('#tab-profile');
  if (tabProfileBtn) tabProfileBtn.addEventListener('click', openProfile);
  if (profileDialog) profileDialog.querySelector('.profile-close').addEventListener('click', () => { profileDialog.close(); setActivePage(profileReturnPage); });
  if (profileDialog) profileDialog.addEventListener('click', (event) => { if (event.target === profileDialog) { profileDialog.close(); setActivePage(profileReturnPage); } });
  if (profileInventory) profileInventory.addEventListener('click', async (event) => {
    const button = event.target.closest('.sell-item');
    if (!button) return;
    button.disabled = true;
    button.textContent = 'Продаём…';
    try {
      const response = await fetch('/api/sell-item', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dropId: button.dataset.dropId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не удалось продать предмет.');
      gameState.balance = result.balance;
      const card = button.closest('.profile-item');
      card.classList.add('is-sold');
      card.innerHTML = '<div class="sold-message">✓ Продано — монеты зачислены</div>';
      renderBalance();
      window.setTimeout(() => loadInventory().catch(() => {}), 650);
    } catch (error) { button.disabled = false; button.textContent = 'Продать'; window.alert(error.message); }
  });
  const sellAllButtonEl = document.querySelector('#profile-sell-all'); if (sellAllButtonEl) sellAllButtonEl.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const drops = [...gameState.inventory];
    if (!drops.length || button.disabled) return;
    button.disabled = true;
    button.textContent = 'Продаём…';
    let sold = 0;
    let total = 0;
    try {
      for (const drop of drops) {
        const response = await fetch('/api/sell-item', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dropId: drop.id }) });
        const result = await response.json();
        if (!response.ok) continue;
        sold += 1;
        total += result.amount;
        gameState.balance = result.balance;
      }
      await loadInventory();
      document.querySelector('#profile-sale-status').textContent = sold ? `Продано ${sold} · +${new Intl.NumberFormat('ru-RU').format(total)} монет` : 'Не удалось продать предметы.';
    } catch (error) {
      document.querySelector('#profile-sale-status').textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = 'Продать всё';
    }
  });
  const renderCases = () => { if (!casesList) return; casesList.replaceChildren(); properties.cases.forEach((caseData) => { const card = document.createElement('article'); card.className = 'card'; card.append(image(caseData.image, caseData.name, 'card-image')); card.insertAdjacentHTML('beforeend', `<h3>${caseData.name}</h3><span class="price">${formatPrice(caseData.price)}</span><div class="card-bottom"><span>${caseData.items.length} предмета</span><button class="inspect" type="button">Открыть →</button></div>`); casesList.append(card); }); };
  const renderBrainrots = () => { brainrotsList.replaceChildren(); properties.brainrots.forEach((brainrot) => { const card = document.createElement('article'); card.className = 'card'; card.append(image(brainrot.image, brainrot.name, 'card-image')); card.insertAdjacentHTML('beforeend', `<h3>${brainrot.name}</h3><span class="price">${formatPrice(brainrot.price)}</span><div class="card-bottom"><span class="status ${brainrot.withdrawable ? '' : 'no'}">${brainrot.withdrawable ? 'Можно вывести' : 'Не выводится'}</span></div>`); brainrotsList.append(card); }); };
  const renderLive = () => { if (liveFeed) liveFeed.replaceChildren(); };
  const showCase = (caseData) => { const items = caseData.items.map((id) => { const item = byId.get(id); return item ? `<div class="case-item"><img src="${imagePath(item.image)}" alt="${item.name}"><div><strong>${item.name}</strong><small>${formatPrice(item.price)} · ${item.withdrawable ? 'можно вывести' : 'не выводится'}</small></div></div>` : ''; }).join(''); details.innerHTML = `<div class="case-open-layout"><img class="case-open-image" src="${imagePath(caseData.image)}" alt="${caseData.name}"><div><p class="eyebrow">ОТКРЫТИЕ КЕЙСА</p><h2>${caseData.name}</h2><p class="price">Стоимость: ${formatPrice(caseData.price)}</p><p class="case-error" id="case-error"></p><button class="primary-button" id="open-case-button" type="button">Открыть за ${formatPrice(caseData.price)}</button><div class="case-items"><strong>Возможные предметы</strong>${items}</div></div></div>`; dialog.showModal(); document.querySelector('#open-case-button').addEventListener('click', () => openCase(caseData)); };
  const openCase = async (caseData) => { const button = document.querySelector('#open-case-button'); button.disabled = true; button.textContent = 'Открываем…'; try { const response = await fetch('/api/open-case', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ caseId: caseData.id }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); gameState.balance = payload.balance; renderBalance(); dialog.close(); document.querySelector('#result-details').innerHTML = `<p class="eyebrow">НОВЫЙ ПРЕДМЕТ</p><h2>Тебе выпало</h2><img class="result-image" src="${imagePath(payload.item.image)}" alt="${payload.item.name}"><h3>${payload.item.name}</h3><p class="price">${formatPrice(payload.item.price)}</p><span class="status ${payload.item.withdrawable ? '' : 'no'}">${payload.item.withdrawable ? 'Можно вывести' : 'Не выводится'}</span>`; resultDialog.showModal(); } catch (error) { button.disabled = false; button.textContent = `Открыть за ${formatPrice(caseData.price)}`; document.querySelector('#case-error').textContent = error.message; } };
  const start = async () => { try {
    const telegramUser = await window.telegramReady;
    if (!telegramUser?.authenticated) return;
    [properties, gameState] = await Promise.all([fetch('/api/config').then((response) => response.json()), fetch('/api/state', { cache: 'no-store' }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Сессия Telegram не найдена.'); return data; })]);
    byId = new Map(properties.brainrots.map((brainrot) => [brainrot.id, brainrot]));
    document.title = properties.siteName;
    document.querySelectorAll('[data-site-name]').forEach((element) => { element.textContent = properties.siteName; });
    const taglineEl = document.querySelector('[data-tagline]'); if (taglineEl) taglineEl.textContent = properties.tagline;
    const supportEl = document.querySelector('[data-support]'); if (supportEl) supportEl.textContent = properties.supportHandle;
    if (gameState.isAdmin) { const adminLink = document.querySelector('#admin-nav-link'); if (adminLink) adminLink.hidden = false; }
    renderBalance(); renderCases(); renderLive(); renderInventory(); renderProfile(); renderUpgrade();
    window.dispatchEvent(new Event('caseapp:ready'));
  } catch (error) {
    document.body.innerHTML = `<main class="telegram-gate"><h1>Не удалось загрузить игру</h1><p>${escapeHtml(error.message)}</p><p>Закройте Mini App и откройте его снова через бота.</p></main>`;
  } };
  if (dialog) { const caseCloseBtn = dialog.querySelector('.close'); if (caseCloseBtn) caseCloseBtn.addEventListener('click', () => dialog.close()); dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }); } const resultCloseBtn = document.querySelector('.result-close'); if (resultCloseBtn) resultCloseBtn.addEventListener('click', () => resultDialog.close()); start();
})();
