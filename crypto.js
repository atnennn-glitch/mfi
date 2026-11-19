const CRYPTO_OPERATIONS = {
  deposit: 'Поповнення балансу',
  withdrawal: 'Списання балансу',
  investment: 'Інвестиція',
};
const HISTORICAL_CRYPTO_PURCHASE = 'Старий запис';
const marketQuotes = new Map();
const marketRequests = new Map();
const tokenNumber = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 12 });
const regularPrice = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 4 });
const formatTokenPrice = value => (Math.abs(value) >= 0.01 ? regularPrice : tokenNumber).format(value);
const tokenPrice = value => `${formatTokenPrice(value)} USDT`;
const pnlPercent = new Intl.NumberFormat('uk-UA', { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 2 });
const isLegacyCryptoBuy = record => record.type === 'work' && record.category === 'У крипто';
const isCryptoBuy = record => isLegacyCryptoBuy(record) ||
  (record.type === 'crypto' && record.cryptoOperation === 'investment');
const cryptoWallet = record => isLegacyCryptoBuy(record) ? record.investmentPortfolio : record.category;
const cryptoTicker = value => String(value ?? '').trim().toUpperCase();
const cryptoDate = record => new Date(record.date + 'T12:00').toLocaleDateString('uk-UA');
const isHistoricalCryptoBuy = record => isCryptoBuy(record) && cryptoWallet(record) === HISTORICAL_CRYPTO_PURCHASE;

function walletCash(entries = records) {
  const balances = new Map(CATEGORIES.crypto.map(wallet => [wallet, 0]));
  for (const record of entries) {
    if (record.type !== 'crypto' || isHistoricalCryptoBuy(record)) continue;
    const wallet = cryptoWallet(record) || 'Портфель не вказано';
    const amount = Number(record.amount);
    if (!Number.isFinite(amount)) continue;
    const isDebit = record.cryptoOperation === 'withdrawal' || isCryptoBuy(record);
    balances.set(wallet, (balances.get(wallet) ?? 0) + (isDebit ? -amount : amount));
  }
  return balances;
}

function cryptoBalanceError(entries) {
  const before = walletCash();
  for (const [wallet, balance] of walletCash(entries)) {
    if (balance < Math.min(0, before.get(wallet) ?? 0) - 1e-9) {
      return `Недостатньо вільних USDT у портфелі «${wallet}». Перевірте його поповнення та списання.`;
    }
  }
  return '';
}

function investmentPositions(purchases = records.filter(isCryptoBuy)) {
  const positions = new Map();
  for (const purchase of purchases) {
    const coin = cryptoTicker(purchase.investmentCoin);
    const amount = Number(purchase.amount);
    const quantity = Number(purchase.investmentQuantity);
    if (!coin || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(amount) || amount < 0) continue;
    if (!positions.has(coin)) positions.set(coin, { coin, amount: 0, quantity: 0, wallets: new Set() });
    const position = positions.get(coin);
    position.amount += amount;
    position.quantity += quantity;
    if (cryptoWallet(purchase)) position.wallets.add(cryptoWallet(purchase));
  }
  return [...positions.values()]
    .map(position => ({ ...position, average: position.amount / position.quantity }))
    .sort((a, b) => b.amount - a.amount);
}

async function marketPrice(coin) {
  const quote = marketQuotes.get(coin);
  if (quote && Date.now() - quote.time < 60_000) return quote.price;
  if (marketRequests.has(coin)) return marketRequests.get(coin);
  const request = (async () => {
    if (!/^[A-Z0-9]{1,20}$/.test(coin) || coin === 'USDT') return;
    try {
      const url = new URL('https://data-api.binance.vision/api/v3/ticker/price');
      url.searchParams.set('symbol', coin + 'USDT');
      const response = await fetch(url, { signal: AbortSignal.timeout(5000), referrerPolicy: 'no-referrer' });
      if (!response.ok) return;
      const price = Number((await response.json()).price);
      if (Number.isFinite(price) && price > 0) {
        marketQuotes.set(coin, { price, time: Date.now() });
        return price;
      }
    } catch { /* Positions remain available when the market feed is down. */ }
  })();
  marketRequests.set(coin, request);
  const result = await request;
  marketRequests.delete(coin);
  return result;
}

function cryptoValuation(positions) {
  let value = 0;
  let missing = 0;
  for (const position of positions) {
    const quote = marketQuotes.get(position.coin);
    if (quote && Date.now() - quote.time < 60_000) value += quote.price * position.quantity;
    else {
      value += position.amount;
      missing++;
    }
  }
  return { value, missing };
}

function cryptoSummary(wallets, positions) {
  const { value, missing } = cryptoValuation(positions);
  const cash = [...wallets.values()].reduce((total, amount) => total + amount, 0);
  return {
    cash, value, total: cash + value,
    basis: missing ? 'Позиції без курсу враховано за ціною закупівлі' : positions.length ? 'Оцінка за курсом Binance' : '',
  };
}

function quoteMetrics(index) {
  return `<div><span>Курс Binance</span><b data-quote="${index}">Завантаження…</b></div>
    <div><span>Поточна вартість</span><b data-market-value="${index}">—</b></div>
    <div><span>Нереалізований результат</span><b data-pnl="${index}">—</b></div>`;
}

function writeUnrealizedPnl(element, value, cost) {
  const pnl = value - cost;
  const percent = cost > 0 ? ` (${pnlPercent.format(pnl / cost)})` : '';
  element.textContent = `${pnl > 0 ? '+' : ''}${fmtUSDT(pnl)}${percent}`;
  element.dataset.pnlTone = pnl > 0 ? 'gain' : pnl < 0 ? 'loss' : 'flat';
}

async function loadMarketPrices(scope, positions, onQuote) {
  const purchaseRows = new Map();
  for (const result of scope.querySelectorAll('[data-purchase-coin]')) {
    const coin = result.dataset.purchaseCoin;
    if (!purchaseRows.has(coin)) purchaseRows.set(coin, []);
    purchaseRows.get(coin).push(result);
  }
  await Promise.all(positions.map(async (position, index) => {
    const price = await marketPrice(position.coin);
    if (!scope.isConnected) return;
    const quote = scope.querySelector(`[data-quote="${index}"]`);
    if (quote) {
      quote.textContent = price === undefined ? 'Недоступний' : tokenPrice(price);
      if (price !== undefined) {
        const value = price * position.quantity;
        scope.querySelector(`[data-market-value="${index}"]`).textContent = fmtUSDT(value);
        writeUnrealizedPnl(scope.querySelector(`[data-pnl="${index}"]`), value, position.amount);
      }
    }
    for (const result of purchaseRows.get(position.coin) || []) {
      const quantity = Number(result.dataset.quantity), cost = Number(result.dataset.cost);
      if (price !== undefined && Number.isFinite(quantity) && quantity > 0 && Number.isFinite(cost) && cost >= 0) {
        writeUnrealizedPnl(result, price * quantity, cost);
      }
    }
    onQuote?.();
  }));
}

function cryptoMovementRow(record) {
  const withdrawal = record.cryptoOperation === 'withdrawal';
  const operation = withdrawal ? CRYPTO_OPERATIONS.withdrawal : CRYPTO_OPERATIONS.deposit;
  const details = [cryptoDate(record), cryptoWallet(record), record.note].filter(Boolean).join(' · ');
  return `<div class="row"><div class="row-icon">${withdrawal ? '−' : '+'}</div>
    <div><b>${operation}</b><small>${esc(details)}</small></div>
    <div class="amount">${withdrawal ? '−' : '+'}${fmtUSDT(record.amount)}</div>${recordActions(record)}</div>`;
}

function investmentRow(record, showPurchasePnl = false) {
  const purchase = isCryptoBuy(record);
  const coin = cryptoTicker(record.investmentCoin) || 'Крипто';
  const title = purchase ? coin : (record.name || 'Інвестиція у блог');
  const details = purchase
    ? [cryptoWallet(record), record.investmentPrice && `курс ${tokenPrice(record.investmentPrice)}`,
       record.investmentQuantity && `${tokenNumber.format(record.investmentQuantity)} ${coin}`, record.note]
    : [record.paymentSource && `оплачено з: ${record.paymentSource}`, record.note];
  const isSol = purchase && coin === 'SOL';
  const icon = isSol ? '<img class="solana-mark" src="solana-mark.svg" alt="" width="20" height="16">'
    : purchase ? '₿' : '◉';
  const pnl = purchase && showPurchasePnl
    ? `<small class="purchase-pnl">Нереалізовано <span data-purchase-coin="${esc(coin)}" data-quantity="${esc(record.investmentQuantity)}" data-cost="${esc(record.amount)}">—</span></small>`
    : '';
  return `<div class="row investment-row${isSol ? ' sol-purchase' : ''}"><div class="row-icon">${icon}</div>
    <div><b>${esc(title)}</b><small>${esc([cryptoDate(record), ...details.filter(Boolean)].join(' · '))}</small></div>
    <div class="amount">${purchase ? fmtUSDT(record.amount) : fmt(record.amount)}${pnl}</div>${recordActions(record)}</div>`;
}

function recordActions(record) {
  return `<div class="row-actions"><button class="edit" data-id="${esc(record.id)}" title="Редагувати">✎</button>
    <button class="delete" data-id="${esc(record.id)}" title="Видалити">×</button></div>`;
}

function positionMetrics(position, index) {
  return `<div class="position-metrics"><div><span>Кількість</span><b>${tokenNumber.format(position.quantity)} ${esc(position.coin)}</b></div>
    <div><span>Середня ціна закупівлі</span><b>${position.quantity ? tokenPrice(position.average) : '—'}</b></div>
    <div><span>Вкладено</span><b>${fmtUSDT(position.amount)}</b></div>
    ${position.quantity ? quoteMetrics(index) : ''}</div>`;
}

function renderCrypto(content, visibleRecords) {
  const purchases = records.filter(isCryptoBuy);
  const positions = investmentPositions(purchases);
  const solPurchases = purchases.filter(record => cryptoTicker(record.investmentCoin) === 'SOL')
    .sort((a, b) => b.date.localeCompare(a.date));
  const sol = positions.find(position => position.coin === 'SOL') || { coin: 'SOL', amount: 0, quantity: 0 };
  const wallets = walletCash();
  const totals = cryptoSummary(wallets, positions);
  const movements = visibleRecords.filter(record => record.type === 'crypto' && !isCryptoBuy(record))
    .sort((a, b) => b.date.localeCompare(a.date));
  const walletPositions = new Map();
  for (const purchase of purchases) {
    if (isHistoricalCryptoBuy(purchase)) continue;
    const wallet = cryptoWallet(purchase) || 'Портфель не вказано';
    if (!wallets.has(wallet)) wallets.set(wallet, 0);
    if (!walletPositions.has(wallet)) walletPositions.set(wallet, []);
    walletPositions.get(wallet).push(purchase);
  }
  content.innerHTML = `<div class="stats investment-summary">
    <div class="card"><div class="label">Загальний криптобаланс</div><div class="value accent" id="cryptoTotal">${fmtUSDT(totals.total)}</div><small id="cryptoBasis" class="crypto-note">${totals.basis}</small></div>
    <div class="card"><div class="label">Вільний баланс</div><div class="value">${fmtUSDT(totals.cash)}</div></div>
    <div class="card"><div class="label">Вартість інвестицій</div><div class="value" id="cryptoInvestedValue">${fmtUSDT(totals.value)}</div></div>
    </div>
    <div class="card breakdown">
      <div class="section-title"><h2>Баланси портфелів</h2></div>
      <div class="crypto-wallets">${[...wallets].map(([wallet, cash]) => {
        const assets = investmentPositions(walletPositions.get(wallet) || []);
        const cashLabel = wallet === 'Hyperliquid' ? 'USDC BOTTY' : wallet === 'Phantom Wallet' ? 'SOL' : 'Вільні кошти';
        return `<div class="crypto-wallet"><h3>${esc(wallet)}</h3>
          <div><span>${cashLabel}</span><b>${fmtUSDT(cash)}</b></div>
          ${assets.length ? `<small>${assets.map(asset => `${tokenNumber.format(asset.quantity)} ${esc(asset.coin)}`).join(' · ')}</small>` : ''}
          </div>`;
      }).join('')}</div>
    </div>
    <div class="card breakdown">
      <div class="section-title"><h2>Рух USDT</h2></div>
      ${movements.length ? movements.map(cryptoMovementRow).join('') : '<div class="empty">За цей період поповнень і списань немає</div>'}
    </div>
    <div class="card breakdown" id="solPosition">
      <div class="section-title"><h2>SOL</h2><button id="addSolPurchase" class="ghost">Додати покупку SOL</button></div>
      ${positionMetrics(sol, positions.indexOf(sol))}
      <h3 class="sol-history-title">Покупки SOL</h3>
      ${solPurchases.length ? solPurchases.map(record => investmentRow(record, true)).join('') : '<div class="empty">Покупок SOL ще немає</div>'}
    </div>
    <button class="ghost" id="allCryptoInvestments">Усі криптоінвестиції</button>`;
  $('#allCryptoInvestments').onclick = () => render('work');
  $('#addSolPurchase').onclick = () => openEntry(null, 'investment', 'SOL');
  const total = $('#cryptoTotal'), value = $('#cryptoInvestedValue'), basis = $('#cryptoBasis');
  loadMarketPrices($('#solPosition'), positions, () => {
    const updated = cryptoSummary(wallets, positions);
    total.textContent = fmtUSDT(updated.total);
    value.textContent = fmtUSDT(updated.value);
    basis.textContent = updated.basis;
  });
}

function renderInvestments(content, visibleRecords) {
  const positions = investmentPositions();
  const blogTotal = records.filter(record => record.type === 'work' && !isCryptoBuy(record))
    .reduce((total, record) => total + Number(record.amount), 0);
  const purchases = visibleRecords.filter(isCryptoBuy).sort((a, b) => b.date.localeCompare(a.date));
  const blog = visibleRecords.filter(record => record.type === 'work' && !isCryptoBuy(record))
    .sort((a, b) => b.date.localeCompare(a.date));
  content.innerHTML = `<div id="investmentView"><div class="stats investment-summary">
    <div class="card"><div class="label">У блог</div><div class="value accent">${fmt(blogTotal)}</div></div>
    <div class="card"><div class="label">Вкладено в крипто</div><div class="value">${fmtUSDT(positions.reduce((total, p) => total + p.amount, 0))}</div></div>
    <div class="card"><div class="label">Криптопозицій</div><div class="value">${positions.length}</div></div>
    </div>
    <div class="section-title"><h2>Криптопозиції</h2><button id="addCryptoInvestment" class="ghost">Додати криптоінвестицію</button></div>
    <div class="position-grid" id="positionGrid">${positions.map((p, index) => `<div class="card position-card">
      <div class="position-head"><div><div class="coin-symbol">${esc(p.coin)}</div><small class="position-wallets">${esc([...p.wallets].join(' · '))}</small></div></div>
      ${positionMetrics(p, index)}</div>`).join('')}</div>
    <div class="card breakdown"><div class="section-title"><h2>Історія криптопокупок</h2></div>
      ${purchases.length ? purchases.map(record => investmentRow(record, true)).join('') : '<div class="empty">За цей період покупок немає</div>'}</div>
    <div class="card breakdown"><div class="section-title"><h2>Вкладення у блог</h2></div>
      ${blog.length ? blog.map(record => investmentRow(record)).join('') : '<div class="empty">За цей період записів немає</div>'}</div></div>`;
  $('#addCryptoInvestment').onclick = () => openEntry(null, 'investment');
  loadMarketPrices($('#investmentView'), positions);
}
