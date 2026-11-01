(() => {
  if (window.TELEGRAM_ACCESS_BLOCKED) return;
  let properties = window.PROPERTIES;
  const casesList = document.querySelector('#cases-list');
  const dialog = document.querySelector('#case-dialog');
  const details = document.querySelector('#case-details');
  const formatPrice = (price) => `${new Intl.NumberFormat('ru-RU').format(price)} ${properties.currencyName}`;
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const imagePath = (filename) => `images/${encodeURIComponent(filename)}`;
  const propertiesReady = fetch('/api/config').then((response) => response.json()).then((config) => { properties = config; });
  let finishCurrentSpin = null;

  const renderCase = (caseData) => {
    dialog.classList.remove('result-mode');
    const items = caseData.items.map((id) => properties.brainrots.find((item) => item.id === id)).filter(Boolean);
    const chanceTotal = items.reduce((sum, item) => sum + Math.max(0, Number(caseData.dropChances?.[item.id] ?? 1)), 0);
    const chanceLabel = (item) => {
      const chance = chanceTotal ? (Math.max(0, Number(caseData.dropChances?.[item.id] ?? 1)) / chanceTotal) * 100 : 0;
      return `${Number(chance.toFixed(2))}%`;
    };
    const previewItems = Array.from({ length: 12 }, () => items[Math.floor(Math.random() * items.length)]).filter(Boolean);
    details.innerHTML = `
      <div class="roulette-case-head">
        <p class="eyebrow">ОТКРЫТИЕ КЕЙСА</p>
        <h2>${escapeHtml(caseData.name)}</h2>
        <div class="roulette-cover"><img src="${imagePath(caseData.image)}" alt="${escapeHtml(caseData.name)}"></div>
      </div>
      <div class="roulette-stage" aria-label="Рулетка с предметами">
        <span class="roulette-pointer" aria-hidden="true"></span>
        <div class="roulette-window"><div class="roulette-track">${previewItems.map((item) => `<div class="roulette-tile"><img src="${imagePath(item.image)}" alt=""><span>${escapeHtml(item.name)}</span></div>`).join('')}</div></div>
        <div class="roulette-status" aria-live="polite">Кейс готов к открытию</div>
      </div>
      <div class="roulette-result" hidden aria-live="polite"></div>
      <div class="roulette-controls"><span class="roulette-count">x1</span><button class="roulette-skip" type="button" hidden>» Пропустить</button></div>
      <p class="case-error" role="alert"></p>
      <button class="primary-button roulette-open" type="button">Открыть за ${formatPrice(caseData.price)}</button>
      <div class="case-items roulette-items"><strong>ВОЗМОЖНЫЕ ПРИЗЫ · ШАНС ВЫПАДЕНИЯ</strong><div class="prize-grid">${items.map((item) => `
        <div class="prize-card"><img src="${imagePath(item.image)}" alt="${escapeHtml(item.name)}"><strong>${escapeHtml(item.name)}</strong><small class="prize-chance">${chanceLabel(item)}</small><small>🪙 ${formatPrice(item.price)}</small></div>`).join('')}
      </div>
      </div>`;

    const coverImage = details.querySelector('.roulette-cover img');
    coverImage.addEventListener('error', () => coverImage.closest('.roulette-cover').classList.add('is-placeholder'), { once: true });
    details.querySelectorAll('.roulette-track img, .prize-card img').forEach((image) => image.addEventListener('error', () => image.classList.add('roulette-image-missing'), { once: true }));

    const openButton = details.querySelector('.roulette-open');
    const stage = details.querySelector('.roulette-stage');
    const result = details.querySelector('.roulette-result');
    const error = details.querySelector('.case-error');
    const skipButton = details.querySelector('.roulette-skip');
    const track = stage.querySelector('.roulette-track');
    let opening = false;
    let skipRequested = false;
    skipButton.addEventListener('click', () => {
      if (skipButton.hidden || !opening) return;
      if (finishCurrentSpin) finishCurrentSpin(true);
      else skipRequested = true;
    });
    const startOpening = async () => {
      if (opening) return;
      opening = true;
      skipRequested = false;
      finishCurrentSpin = null;
      dialog.classList.remove('result-mode');
      result.hidden = true;
      result.replaceChildren();
      openButton.disabled = true;
      error.textContent = '';
      openButton.textContent = 'Открываем кейс…';
      const rouletteWindow = stage.querySelector('.roulette-window');
      const pool = caseData.items.map((id) => properties.brainrots.find((item) => item.id === id)).filter(Boolean);
      if (!pool.length) {
        opening = false;
        skipButton.hidden = true;
        openButton.disabled = false;
        openButton.textContent = `Открыть за ${formatPrice(caseData.price)}`;
        error.textContent = 'В этом кейсе пока нет предметов.';
        return;
      }

      openButton.hidden = true;
      details.querySelector('.roulette-items').hidden = true;
      stage.hidden = false;
      details.querySelector('.roulette-controls').classList.add('is-spinning');
      stage.querySelector('.roulette-status').textContent = 'Рулетка крутится…';
      skipButton.hidden = false;
      const loopItems = Array.from({ length: 18 }, () => pool[Math.floor(Math.random() * pool.length)]);
      track.innerHTML = [...loopItems, ...loopItems, ...loopItems].map((item) => `
        <div class="roulette-tile"><img src="${imagePath(item.image)}" alt=""><span>${escapeHtml(item.name)}</span></div>`).join('');
      track.style.transition = '';
      track.style.transform = '';
      track.classList.add('is-looping');

      try {
        const response = await fetch('/api/open-case', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ caseId: caseData.id })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Не удалось открыть кейс.');

        const balance = document.querySelector('#balance');
        if (balance) balance.textContent = `🪙 ${new Intl.NumberFormat('ru-RU').format(payload.balance)}`;
        await new Promise((resolve) => window.setTimeout(resolve, 1100));
        track.classList.remove('is-looping');
        const winningIndex = 86;
        const spinItems = Array.from({ length: 100 }, () => pool[Math.floor(Math.random() * pool.length)]);
        spinItems[winningIndex] = payload.item;
        track.innerHTML = spinItems.map((item, index) => `
          <div class="roulette-tile"${index === winningIndex ? ' data-winning-tile' : ''}>
            <img src="${imagePath(item.image)}" alt="">
            <span>${escapeHtml(item.name)}</span>
          </div>`).join('');
        track.querySelectorAll('img').forEach((image) => image.addEventListener('error', () => image.classList.add('roulette-image-missing'), { once: true }));

        const winner = track.querySelector('[data-winning-tile]');
        const centerOffset = winner.offsetLeft + winner.offsetWidth / 2 - rouletteWindow.clientWidth / 2;
        track.style.transition = 'none';
        track.style.transform = 'translateX(0)';
        void track.offsetWidth;
        let finished = false;
        let finishTimer;
        const finishSpin = (skipped = false) => {
          if (finished) return;
          finished = true;
          opening = false;
          dialog.classList.add('result-mode');
          window.clearTimeout(finishTimer);
          finishCurrentSpin = null;
          if (skipped) {
            track.style.transition = 'none';
            track.style.transform = `translateX(-${Math.max(0, centerOffset)}px)`;
          }
          skipButton.hidden = true;
          details.querySelector('.roulette-controls').classList.remove('is-spinning');
          stage.querySelector('.roulette-status').textContent = skipped ? 'Открытие пропущено' : 'Предмет получен';
          result.innerHTML = `<p class="eyebrow">ПОЛУЧЕНО ИЗ КЕЙСА «${escapeHtml(caseData.name)}»</p><img class="reward-result-image" src="${imagePath(payload.item.image)}" alt="${escapeHtml(payload.item.name)}"><strong>${escapeHtml(payload.item.name)}</strong><span class="reward-result-value">🪙 ${formatPrice(payload.item.price)}</span><div class="reward-result-actions"><button class="reward-sell" type="button">Продать · ${formatPrice(payload.item.price)}</button><button class="reward-again" type="button">⟳ Крутить</button></div><p class="reward-sold" aria-live="polite"></p>`;
          for (let particleIndex = 0; particleIndex < 20; particleIndex += 1) {
            const particle = document.createElement('span');
            particle.className = 'reward-confetti';
            particle.style.setProperty('--particle-x', `${Math.random() * 100}%`);
            particle.style.setProperty('--particle-delay', `${Math.random() * 260}ms`);
            particle.style.setProperty('--particle-turn', `${Math.floor(Math.random() * 360)}deg`);
            result.append(particle);
          }
          result.hidden = false;
          result.classList.remove('is-revealing');
          void result.offsetWidth;
          result.classList.add('is-revealing');
          const rewardImage = result.querySelector('.reward-result-image');
          rewardImage.addEventListener('error', () => rewardImage.classList.add('roulette-image-missing'), { once: true });
          result.querySelector('.reward-sell').addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const sellButton = event.currentTarget;
            sellButton.disabled = true;
            sellButton.textContent = 'Продаём…';
            try {
              const sellResponse = await fetch('/api/sell-item', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ dropId: payload.drop.id })
              });
              const sale = await sellResponse.json();
              if (!sellResponse.ok) throw new Error(sale.error || 'Не удалось продать предмет.');
              const balance = document.querySelector('#balance');
              if (balance) balance.textContent = `🪙 ${new Intl.NumberFormat('ru-RU').format(sale.balance)}`;
              sellButton.hidden = true;
              result.querySelector('.reward-sold').textContent = `✓ Продано за ${formatPrice(sale.amount)}`;
            } catch (saleError) {
              sellButton.disabled = false;
              sellButton.textContent = `Продать · ${formatPrice(payload.item.price)}`;
              result.querySelector('.reward-sold').textContent = saleError.message;
            }
          });
          result.querySelector('.reward-again').addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            dialog.classList.remove('result-mode');
            result.hidden = true;
            result.replaceChildren();
            result.classList.remove('is-revealing');
            stage.hidden = false;
            details.querySelector('.roulette-items').hidden = false;
            details.querySelector('.roulette-controls').classList.remove('is-spinning');
            track.style.transition = 'none';
            track.style.transform = 'translateX(0)';
            openButton.textContent = `Открыть за ${formatPrice(caseData.price)}`;
            openButton.hidden = false;
            openButton.disabled = false;
            startOpening();
          });
        };
        finishCurrentSpin = finishSpin;
        track.addEventListener('transitionend', (event) => {
          if (event.propertyName === 'transform') finishSpin();
        }, { once: true });
        if (skipRequested) {
          finishSpin(true);
          return;
        }
        requestAnimationFrame(() => {
          track.style.transition = 'transform 6.4s cubic-bezier(.08,.72,.08,1)';
          track.style.transform = `translateX(-${Math.max(0, centerOffset)}px)`;
        });
        finishTimer = window.setTimeout(finishSpin, 6800);
      } catch (requestError) {
        opening = false;
        finishCurrentSpin = null;
        track.classList.remove('is-looping');
        stage.hidden = true;
        details.querySelector('.roulette-controls').classList.remove('is-spinning');
        skipButton.hidden = true;
        details.querySelector('.roulette-items').hidden = false;
        openButton.hidden = false;
        openButton.disabled = false;
        openButton.textContent = `Открыть за ${formatPrice(caseData.price)}`;
        error.textContent = requestError.message;
      }
    };
    openButton.addEventListener('click', startOpening);
  };

  casesList.addEventListener('click', async (event) => {
    const card = event.target.closest('.card');
    if (!card || !casesList.contains(card)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    await propertiesReady;
    const caseData = properties.cases[[...casesList.children].indexOf(card)];
    if (!caseData) return;
    renderCase(caseData);
    dialog.showModal();
  }, true);
})();
