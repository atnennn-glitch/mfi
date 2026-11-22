const ETSY_SALE = 'Продаж';
const ETSY_EXPENSES = ['Витрати на навчання', 'Витрати на магазин', 'Витрати на товар'];
const isEtsySale = record => record.category === ETSY_SALE;
const amountInCents = amount => Math.round(Number(amount) * 100);
const etsyMoney = cents => fmt(cents / 100);
const etsyNetTone = cents => cents > 0 ? ' accent' : cents < 0 ? ' etsy-loss' : '';

function etsyStats(entries) {
  const stats = { sales: 0, revenue: 0, expenses: 0, net: 0 };
  for (const entry of entries) {
    const cents = amountInCents(entry.amount);
    if (!Number.isSafeInteger(cents) || cents <= 0) continue;
    if (isEtsySale(entry)) {
      stats.sales++;
      stats.revenue += cents;
    } else {
      stats.expenses += cents;
    }
  }
  stats.net = stats.revenue - stats.expenses;
  return stats;
}

function etsyRow(record) {
  const sale = isEtsySale(record);
  const details = [cryptoDate(record), record.name && record.category,
    record.paymentSource && `оплачено з: ${record.paymentSource}`, record.note];
  return `<div class="row etsy-row">
    <div class="row-icon" aria-hidden="true">${sale ? '+' : '−'}</div>
    <div><b>${esc(record.name || record.category)}</b><small>${esc(details.filter(Boolean).join(' · '))}</small></div>
    <div class="amount${sale ? ' accent' : ' etsy-loss'}">${sale ? '+' : '−'}${fmt(record.amount)}</div>
    ${recordActions(record)}
  </div>`;
}

function etsyExpenseBreakdown(expenses) {
  const categories = new Map(ETSY_EXPENSES.map(category => [category, 0]));
  const sources = new Map();
  for (const expense of expenses) {
    const cents = amountInCents(expense.amount);
    if (!Number.isSafeInteger(cents) || cents <= 0) continue;
    const category = expense.category || 'Без категорії';
    const source = expense.paymentSource || 'Не вказано';
    categories.set(category, (categories.get(category) ?? 0) + cents);
    sources.set(source, (sources.get(source) ?? 0) + cents);
  }
  const list = entries => `<dl class="etsy-breakdown-list">${[...entries].map(([label, cents]) =>
    `<div><dt>${esc(label)}</dt><dd>${etsyMoney(cents)}</dd></div>`).join('')}</dl>`;
  return `<div class="card"><div class="section-title"><h2>Витрати за категоріями</h2></div>${list(categories)}</div>
    <div class="card"><div class="section-title"><h2>Звідки оплачено</h2></div>
      ${sources.size ? list(sources) : '<div class="empty">За цей період витрат немає</div>'}</div>`;
}

function etsyMonthTable(entries) {
  const anchorKey = period || new Date().toLocaleDateString('sv-SE').slice(0, 7);
  const [year, month] = anchorKey.split('-').map(Number);
  const monthKeys = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(year, month - 6 + index, 1, 12);
    return { key: date.toLocaleDateString('sv-SE').slice(0, 7),
      label: date.toLocaleDateString('uk-UA', { month: 'short', year: 'numeric' }) };
  });
  const byMonth = new Map(monthKeys.map(({ key }) => [key, []]));
  for (const record of entries) byMonth.get(record.date.slice(0, 7))?.push(record);
  return `<div class="card breakdown"><div class="section-title"><h2>Статистика за 6 місяців</h2></div>
    <div class="etsy-table-scroll"><table class="etsy-table">
      <thead><tr><th scope="col">Місяць</th><th scope="col">Продажів</th><th scope="col">Виторг</th>
        <th scope="col">Витрати</th><th scope="col">Чистий дохід</th></tr></thead>
      <tbody>${monthKeys.map(({ key, label }) => {
        const { sales, revenue, expenses, net } = etsyStats(byMonth.get(key));
        return `<tr><th scope="row">${esc(label)}</th><td>${sales}</td><td>${etsyMoney(revenue)}</td>
          <td>${etsyMoney(expenses)}</td><td class="${etsyNetTone(net).trim()}">${etsyMoney(net)}</td></tr>`;
      }).join('')}</tbody>
    </table></div></div>`;
}

function renderEtsy(content, visibleRecords) {
  const entries = visibleRecords.filter(record => record.type === 'etsy')
    .sort((a, b) => b.date.localeCompare(a.date));
  const sales = entries.filter(isEtsySale);
  const expenses = entries.filter(record => !isEtsySale(record));
  const stats = etsyStats(entries);
  content.innerHTML = `<div class="stats etsy-stats">
    <div class="card"><div class="label">Сума продажів</div><div class="value accent" data-etsy-total="revenue">${etsyMoney(stats.revenue)}</div></div>
    <div class="card"><div class="label">Витрати</div><div class="value etsy-loss" data-etsy-total="expenses">${etsyMoney(stats.expenses)}</div></div>
    <div class="card"><div class="label">Чистий дохід</div><div class="value${etsyNetTone(stats.net)}" data-etsy-total="net">${etsyMoney(stats.net)}</div></div>
    <div class="card"><div class="label">Кількість продажів</div><div class="value" data-etsy-total="sales">${stats.sales}</div></div>
  </div>
  <div class="etsy-grid" aria-label="Розбивка витрат">${etsyExpenseBreakdown(expenses)}</div>
  ${etsyMonthTable(records.filter(record => record.type === 'etsy'))}
  <div class="etsy-grid">
    <div class="card"><div class="section-title"><h2>Продажі</h2><button class="ghost" id="addEtsySale">Додати продаж</button></div>
      ${sales.length ? sales.map(etsyRow).join('') : '<div class="empty">За цей період продажів немає</div>'}</div>
    <div class="card"><div class="section-title"><h2>Витрати</h2><button class="ghost" id="addEtsyExpense">Додати витрату</button></div>
      ${expenses.length ? expenses.map(etsyRow).join('') : '<div class="empty">За цей період витрат немає</div>'}</div>
  </div>`;
  $('#addEtsySale').onclick = () => openEntry(null, 'deposit', '', ETSY_SALE);
  $('#addEtsyExpense').onclick = () => openEntry(null, 'deposit', '', ETSY_EXPENSES[0]);
}
