const TYPES={overview:['Огляд','Фінансова картина','◫'],income:['Надходження','Мої надходження','＋'],expense:['Витрати','Мої витрати','↓'],crypto:['Крипто','Криптопортфель','₿'],capital:['Капітал','Капітал у гривнях','₴'],work:['Інвестиції','Мої інвестиції','◆'],etsy:['Etsy','Etsy','▤'],savings:['Заощадження','Мої заощадження','◇'],decomposition:['Декомпозиція','Декомпозиція доходу','◎'],tasks:['Задачі','Задачі по запуску','✓']};
const CATEGORIES={income:['Продюсування','Послуги','Реклама','E-commerce','Пасивний дохід Botty'],expense:['Продукти','Доставка їжі','Ресторани','Таксі','Оренда житла','Комунальні','Подорожі','Дозвілля','Підписки','Інше'],capital:['А-Банк','Monobank — чорна картка','Monobank — біла картка','Monobank ФОП'],crypto:['Hyperliquid','MetaMask','Phantom Wallet'],work:['У блог'],etsy:[ETSY_SALE,...ETSY_EXPENSES]};
const ICONS={'Продюсування':'＋','Послуги':'＋','Реклама':'＋','E-commerce':'＋','Пасивний дохід Botty':'＋','Продукти':'🛒','Доставка їжі':'🥡','Ресторани':'🍽','Таксі':'🚕','Оренда житла':'⌂','Комунальні':'◈','Подорожі':'✈','Дозвілля':'✦','Підписки':'↻','Інше':'•••','А-Банк':'A','Monobank — чорна картка':'●','Monobank — біла картка':'○','Monobank ФОП':'Ф','Hyperliquid':'H','MetaMask':'M','Phantom Wallet':'P','У блог':'◉'};
let current='overview',period=new Date().toISOString().slice(0,7),records=[],tasks=[],plans=[],ideas=[];
try{records=JSON.parse(localStorage.getItem('finspace-records')||'[]');if(!Array.isArray(records))records=[]}catch{records=[]}
try{tasks=JSON.parse(localStorage.getItem('finspace-tasks')||'[]');if(!Array.isArray(tasks))tasks=[]}catch{tasks=[]}
try{plans=JSON.parse(localStorage.getItem('finspace-income-plans')||'[]');if(!Array.isArray(plans))plans=[]}catch{plans=[]}
try{ideas=JSON.parse(localStorage.getItem('finspace-income-ideas')||'[]');if(!Array.isArray(ideas))ideas=[]}catch{ideas=[]}
let migrated=false;records=records.map(r=>{if(r.type==='capital'&&r.category==='Monobank'){migrated=true;return{...r,category:'Monobank — чорна картка'}}return r});if(migrated)localStorage.setItem('finspace-records',JSON.stringify(records));
const USD_RATE=45,$=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s),fmt=n=>new Intl.NumberFormat('uk-UA',{style:'currency',currency:'UAH',maximumFractionDigits:2}).format(n||0),fmtUSD=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format((n||0)/USD_RATE),fmtUSDT=n=>`${new Intl.NumberFormat('uk-UA',{maximumFractionDigits:2}).format(n||0)} USDT`,money=(type,n)=>type==='crypto'?fmtUSDT(n):fmt(n),esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const save=()=>localStorage.setItem('finspace-records',JSON.stringify(records)),visible=()=>records.filter(r=>!period||r.date.startsWith(period)),sum=t=>visible().filter(r=>r.type===t).reduce((a,r)=>a+Number(r.amount),0);
Object.entries(TYPES).forEach(([k,v])=>{const b=document.createElement('button');b.innerHTML=`${v[2]} &nbsp; ${v[0]}`;b.onclick=()=>render(k);b.dataset.key=k;$('#nav').appendChild(b)});
function row(r) {
  if (isCryptoBuy(r) || r.type === 'work') return investmentRow(r);
  if (r.type === 'crypto') return cryptoMovementRow(r);
  if (r.type === 'etsy') return etsyRow(r);
  const label = r.type === 'income' ? (r.counterparty || r.category || 'Надходження')
    : ((CATEGORIES[r.type] ? r.category : null) || r.name || TYPES[r.type][0]);
  const details = r.type === 'income' ? [r.category, r.purpose, r.name && `джерело: ${r.name}`]
    : [paymentDetails(r), r.note];
  return `<div class="row"><div class="row-icon">${ICONS[r.category] || ICONS[label] || TYPES[r.type][2]}</div>
    <div><b>${esc(label)}</b><small>${esc([cryptoDate(r), ...details.filter(Boolean)].join(' · '))}</small></div>
    <div class="amount">${money(r.type,r.amount)}</div>${recordActions(r)}</div>`;
}
function bindRows() {
  $$('.edit').forEach(button => button.onclick = () => openEntry(records.find(record => record.id === button.dataset.id)));
  $$('.delete').forEach(button => button.onclick = async () => {
    const dialog = $('#confirmDialog');
    dialog.returnValue = '';
    dialog.showModal();
    const confirmed = await new Promise(resolve => dialog.addEventListener('close',
      () => resolve(dialog.returnValue === 'confirm'), { once: true }));
    if (!confirmed) return;
    const updated = records.filter(record => record.id !== button.dataset.id);
    const error = cryptoBalanceError(updated);
    if (error) return alert(error);
    records = updated;
    save();
    render(current);
  });
}
function groups(type,names){return names.map(n=>[n,visible().filter(r=>r.type===type&&r.category===n).reduce((a,r)=>a+Number(r.amount),0)])}
function linkedPaymentDebit(record) {
  const { type, paymentSource: account, amount: rawAmount } = record;
  if (!['expense', 'work', 'etsy'].includes(type) || isCryptoBuy(record)) return null;
  if (type === 'etsy' && isEtsySale(record)) return null;
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (account === ETSY_WALLET) {
    const usdt = type === 'etsy' ? etsyWalletDebit(record) : amountInCents(amount / USD_RATE) / 100;
    return usdt > 0 ? { account, amount: usdt, currency: 'USDT' } : null;
  }
  if (!CATEGORIES.capital.includes(account)) return null;
  const hryvnia = type === 'etsy' && record.currency === 'USD' ? amount * USD_RATE : amount;
  return { account, amount: amountInCents(hryvnia) / 100, currency: 'UAH' };
}

function formattedDebit(debit) {
  return debit.currency === 'USDT' ? tokenPrice(debit.amount) : fmt(debit.amount);
}

function paymentDetails(record) {
  if (!record.paymentSource) return '';
  const debit = linkedPaymentDebit(record);
  return `оплачено з: ${record.paymentSource}${debit ? ` · списано ${formattedDebit(debit)}` : ''}`;
}

function capitalGroups() {
  const balances = new Map(CATEGORIES.capital.map(account => [account, 0]));
  for (const record of records) {
    if (record.type === 'capital' && balances.has(record.category)) {
      balances.set(record.category, balances.get(record.category) + Number(record.amount));
    }
    const debit = linkedPaymentDebit(record);
    if (debit?.currency === 'UAH') {
      balances.set(debit.account, balances.get(debit.account) - debit.amount);
    }
  }
  return [...balances];
}
function currentCapital(){return capitalGroups().reduce((a,x)=>a+x[1],0)}
function bars(items,type){const max=Math.max(...items.map(x=>x[1]),1);return `<div class="bars">${items.map(([n,v])=>`<div><div class="bar-head"><span>${type==='income'?'':`${ICONS[n]||'•'} `}${esc(n)}</span><b>${money(type,v)}</b></div><div class="track"><div class="fill" style="width:${Math.max(0,v/max*100)}%"></div></div></div>`).join('')}</div>`}
function incomeGroups(){return groups('income',CATEGORIES.income)}
function recordList(type,items){if(!CATEGORIES[type])return items.map(row).join('');const known=CATEGORIES[type],extra=[...new Set(items.map(r=>r.category).filter(c=>c&&!known.includes(c)))],names=[...known,...extra];if(items.some(r=>!r.category))names.push('Без категорії');return names.map(name=>{const group=items.filter(r=>(r.category||'Без категорії')===name);if(!group.length)return'';const total=group.reduce((a,r)=>a+Number(r.amount),0);return `<div class="record-group"><div class="record-group-head"><h3>${esc(name)}</h3><b>${money(type,total)}</b></div>${group.map(row).join('')}</div>`}).join('')}
function monthlyAnalytics(type='expense'){const anchor=new Date(`${period||new Date().toISOString().slice(0,7)}-01T12:00:00`),months=[];for(let i=5;i>=0;i--){const d=new Date(anchor.getFullYear(),anchor.getMonth()-i,1),key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,value=records.filter(r=>r.type===type&&r.date.startsWith(key)).reduce((a,r)=>a+Number(r.amount),0);months.push({label:d.toLocaleDateString('uk-UA',{month:'short'}).replace('.',''),value})}const max=Math.max(...months.map(m=>m.value),1);return `<div class="month-chart">${months.map(m=>`<div class="month-col"><b>${m.value?money(type,m.value):'—'}</b><div class="month-track"><span style="height:${Math.max(m.value/max*100,m.value?5:0)}%"></span></div><small>${m.label}</small></div>`).join('')}</div>`}
function saveTasks(){localStorage.setItem('finspace-tasks',JSON.stringify(tasks))}
function taskRows(done){const items=tasks.filter(t=>t.done===done);return items.length?items.map(t=>`<div class="task-row ${done?'done':''}"><button class="task-check" data-task-toggle="${t.id}" aria-label="Позначити задачу">${done?'✓':''}</button><span>${esc(t.title)}</span><button class="task-delete" data-task-delete="${t.id}" aria-label="Видалити">×</button></div>`).join(''):`<div class="task-empty">${done?'Виконаних задач поки немає':'Усі задачі виконано'}</div>`}
function renderTasks(c){$('.toolbar').style.display='none';$('#addBtn').style.display='none';c.innerHTML=`<div class="task-add card"><input id="taskTitle" placeholder="Нова задача по запуску"><button id="taskAddBtn" class="primary">Додати</button></div><div class="task-grid"><div class="card"><div class="section-title"><h2>Активні задачі</h2><span>${tasks.filter(t=>!t.done).length}</span></div>${taskRows(false)}</div><div class="card"><div class="section-title"><h2>Виконані</h2><span>${tasks.filter(t=>t.done).length}</span></div>${taskRows(true)}</div></div>`;const add=()=>{const title=$('#taskTitle').value.trim();if(!title)return;tasks.unshift({id:crypto.randomUUID(),title,done:false,createdAt:new Date().toISOString()});saveTasks();render('tasks')};$('#taskAddBtn').onclick=add;$('#taskTitle').onkeydown=e=>{if(e.key==='Enter')add()};$$('[data-task-toggle]').forEach(b=>b.onclick=()=>{tasks=tasks.map(t=>t.id===b.dataset.taskToggle?{...t,done:!t.done}:t);saveTasks();render('tasks')});$$('[data-task-delete]').forEach(b=>b.onclick=()=>{tasks=tasks.filter(t=>t.id!==b.dataset.taskDelete);saveTasks();render('tasks')})}
function savePlans(){localStorage.setItem('finspace-income-plans',JSON.stringify(plans));localStorage.setItem('finspace-income-ideas',JSON.stringify(ideas))}
function expectedTotal(month=localStorage.getItem('finspace-plan-month')||'2026-12'){return plans.filter(p=>!p.received&&p.month===month).reduce((a,p)=>a+Number(p.amount),0)}
function renderDecomposition(c){$('.toolbar').style.display='none';$('#addBtn').style.display='none';const defaultMonth='2026-12',selected=localStorage.getItem('finspace-plan-month')||defaultMonth,monthPlans=plans.filter(p=>p.month===selected),expected=monthPlans.filter(p=>!p.received).reduce((a,p)=>a+Number(p.amount),0),received=monthPlans.filter(p=>p.received).reduce((a,p)=>a+Number(p.amount),0);c.innerHTML=`<div class="decomp-summary"><div class="card expected-point"><div class="label">Очікується</div><div class="value">${fmt(expected)}</div></div><div class="card"><div class="label">Вже надійшло</div><div class="value accent">${fmt(received)}</div></div><div class="card"><div class="label">Прогноз разом</div><div class="value">${fmt(expected+received)}</div></div></div><div class="card decomp-form"><label>Місяць<input id="planMonth" type="month" value="${selected}"></label><label>Від кого<input id="planClient" placeholder="Клієнт або компанія"></label><label>Платіж / за що<input id="planPurpose" placeholder="Наприклад: реклама"></label><label>Сума, ₴<input id="planAmount" inputmode="decimal" placeholder="0"></label><button id="planAdd" class="primary">Додати платіж</button></div><div class="decomp-grid"><div class="card"><div class="section-title"><h2>Прогнозовані платежі</h2><span>${monthPlans.length}</span></div><div id="planRows">${monthPlans.length?monthPlans.map(p=>`<div class="plan-row ${p.received?'received':''}"><button class="plan-status" data-plan-toggle="${p.id}" title="Позначити отриманим">${p.received?'✓':''}</button><div class="plan-copy"><b>${esc(p.client||'Без імені')}</b><small>${esc(p.purpose||'Очікуваний платіж')}</small></div><div class="plan-amount"><b>${fmt(p.amount)}</b><small>${p.received?'отримано':'очікується'}</small></div><button class="plan-delete" data-plan-delete="${p.id}" title="Видалити">×</button></div>`).join(''):'<div class="task-empty">На цей місяць платежів ще немає</div>'}</div></div><div class="card"><div class="section-title"><h2>Ідеї, де ще взяти дохід</h2><span>${ideas.length}</span></div><div class="idea-add"><input id="ideaTitle" placeholder="Нова ідея"><button id="ideaAdd" class="primary">＋</button></div>${ideas.length?ideas.map(i=>`<div class="idea-row"><span class="idea-dot">◆</span><span>${esc(i.title)}</span><button class="idea-delete" data-idea-delete="${i.id}">×</button></div>`).join(''):'<div class="task-empty">Додайте першу ідею</div>'}</div></div>`;$('#planMonth').onchange=e=>{localStorage.setItem('finspace-plan-month',e.target.value);render('decomposition')};const addPlan=()=>{const raw=$('#planAmount').value.trim().replace(/\s/g,'').replace(',','.'),amount=Number(raw);if(!Number.isFinite(amount)||amount<0)return $('#planAmount').focus();plans.unshift({id:crypto.randomUUID(),month:$('#planMonth').value,client:$('#planClient').value.trim(),purpose:$('#planPurpose').value.trim(),amount,received:false});savePlans();render('decomposition')};$('#planAdd').onclick=addPlan;$$('[data-plan-toggle]').forEach(b=>b.onclick=()=>{plans=plans.map(p=>p.id===b.dataset.planToggle?{...p,received:!p.received}:p);savePlans();render('decomposition')});$$('[data-plan-delete]').forEach(b=>b.onclick=()=>{plans=plans.filter(p=>p.id!==b.dataset.planDelete);savePlans();render('decomposition')});const addIdea=()=>{const title=$('#ideaTitle').value.trim();if(!title)return;ideas.unshift({id:crypto.randomUUID(),title});savePlans();render('decomposition')};$('#ideaAdd').onclick=addIdea;$('#ideaTitle').onkeydown=e=>{if(e.key==='Enter')addIdea()};$$('[data-idea-delete]').forEach(b=>b.onclick=()=>{ideas=ideas.filter(i=>i.id!==b.dataset.ideaDelete);savePlans();render('decomposition')})}
function overviewMoneyCard(label, amount, expense = false) {
  return `<div class="card${expense ? ' expense-summary' : ''}"><div class="label">${label}</div>
    <div class="value${expense ? '' : ' accent'}">${fmt(amount)}</div>
    <div class="usd-value">≈ ${fmtUSD(amount)} · курс ${USD_RATE} ₴/$</div></div>`;
}

function render(key='overview'){
current=key;document.body.dataset.section=key;$$('nav button').forEach(b=>b.classList.toggle('active',b.dataset.key===key));$('#eyebrow').textContent=TYPES[key][0].toUpperCase();$('#title').textContent=TYPES[key][1];const data=visible(),c=$('#content');
if(key==='tasks'){renderTasks(c);return}if(key==='decomposition'){renderDecomposition(c);return}
$('.toolbar').style.display='flex';$('#addBtn').style.display='';
if (['work', 'crypto', 'etsy'].includes(key)) {
  if (key === 'work') renderInvestments(c, data);
  else if (key === 'crypto') renderCrypto(c, data);
  else renderEtsy(c, data);
  bindRows();
  return;
}
if(key==='overview'){
const positions = investmentPositions(), wallets = walletCash();
const cryptoTotals = cryptoSummary(wallets, positions);
c.innerHTML=`<div class="stats">${overviewMoneyCard('Капітал у гривнях', currentCapital() + sum('savings'))}${overviewMoneyCard('Надходження', sum('income'))}${overviewMoneyCard('Витрати', sum('expense'), true)}<div class="card"><div class="label">Крипто</div><div class="value" id="overviewCryptoTotal">${fmtUSDT(cryptoTotals.total)}</div><small id="overviewCryptoBasis" class="crypto-note">${cryptoTotals.basis}</small></div></div><div class="split"><div class="card income-panel"><div class="section-title"><h2>Напрями надходжень</h2></div>${bars(groups('income',CATEGORIES.income),'income')}</div><div class="card"><div class="section-title"><h2>Капітал у банках</h2></div>${bars(capitalGroups(),'capital')}</div></div><div class="card expense-panel"><div class="section-title"><h2>Витрати за категоріями</h2></div>${bars(groups('expense',CATEGORIES.expense),'expense')}</div><div class="card breakdown income-panel"><div class="section-title"><h2>Надходження за останні 6 місяців</h2></div>${monthlyAnalytics('income')}</div><div class="card breakdown expense-panel"><div class="section-title"><h2>Витрати за останні 6 місяців</h2></div>${monthlyAnalytics('expense')}</div><div class="card page-table"><div class="section-title"><h2>Останні записи</h2></div>${data.length?[...data].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6).map(row).join(''):'<div class="empty">За цей період записів немає</div>'}</div>`
const total = $('#overviewCryptoTotal'), basis = $('#overviewCryptoBasis');
loadMarketPrices(total, positions, () => {
  const updated = cryptoSummary(wallets, positions);
  total.textContent = fmtUSDT(updated.total);
  basis.textContent = updated.basis;
});
}else{
const rr=data.filter(r=>r.type===key).sort((a,b)=>b.date.localeCompare(a.date)),breakdown=CATEGORIES[key]?`<div class="card breakdown"><div class="section-title"><h2>${key==='income'?'Напрями надходжень':'Розподіл'}</h2></div>${key==='capital'?bars(capitalGroups(),'capital'):bars(groups(key,CATEGORIES[key]),key)}</div>`:'',timeline=key==='income'?`<div class="card breakdown"><div class="section-title"><h2>Надходження за останні 6 місяців</h2></div>${monthlyAnalytics('income')}</div>`:'',displayTotal=key==='capital'?currentCapital():sum(key),expected=key==='income'?`<div class="card expected-point"><div class="label">Очікуються надходження</div><div class="value">${fmt(expectedTotal())}</div><div class="usd-value">Заплановано в декомпозиції</div></div>`:'';
c.innerHTML=`<div class="stats"><div class="card"><div class="label">Загальна сума</div><div class="value accent">${money(key,displayTotal)}</div>${key==='crypto'?'':`<div class="usd-value">≈ ${fmtUSD(displayTotal)} · курс ${USD_RATE} ₴/$</div>`}</div><div class="card"><div class="label">Кількість записів</div><div class="value">${rr.length}</div></div>${expected}</div>${breakdown}${timeline}<div class="card page-table"><div class="section-title"><h2>Усі записи</h2></div>${rr.length?recordList(key,rr):'<div class="empty">За цей період записів немає</div>'}</div>`
}bindRows()}
const dlg=$('#entryDialog'),form=$('#entryForm'),type=$('#type');
const entryCategory = $('#category'), entryOperation = $('#cryptoOperation'), paymentSource = $('#paymentSource');
const parseEntryNumber = field => Number($(field).value.trim().replace(/\s/g, '').replace(',', '.'));
let editingRecord = null;

function needsExplicitEtsyDebit(record) {
  return isEtsyWalletExpense(record) && !etsyWalletDebit(record);
}

function syncEtsyDebitField() {
  const linked = type.value === 'etsy' && entryCategory.value !== ETSY_SALE && paymentSource.value === ETSY_WALLET;
  $('#etsyDebitLabel').hidden = !linked;
  if (!linked) return;
  const previous = needsExplicitEtsyDebit(editingRecord);
  $('#etsyDebit').placeholder = previous ? 'Не списувати' : 'Дорівнює сумі в USD';
  $('#etsyDebitHint').textContent = previous
    ? 'Вкажіть суму USDT, якщо це списання ще потрібно відобразити.'
    : 'За замовчуванням сума в USDT дорівнює сумі в USD. За потреби введіть фактичну суму списання.';
}

function syncPaymentPreview() {
  const hint = $('#paymentDebitHint');
  const section = type.value;
  const amount = parseEntryNumber('#amount');
  const originalCurrency = editingRecord && isLegacyEtsyAmount(editingRecord) &&
    amount === etsyAmountInCents(editingRecord) / 100;
  const debit = linkedPaymentDebit({
    type: section,
    category: entryCategory.value,
    paymentSource: $('#paymentSourceLabel').hidden ? '' : paymentSource.value,
    amount: section === 'etsy' && originalCurrency ? editingRecord.amount : amount,
    currency: originalCurrency ? 'UAH' : 'USD',
  });
  hint.hidden = !debit;
  if (!debit) return;
  const converted = debit.currency === 'USDT' || (section === 'etsy' && !originalCurrency);
  hint.textContent = `Списання в обліку — ${formattedDebit(debit)}${converted ? ` за курсом ${USD_RATE} ₴/$` : ''}.`;
}

function updateInvestmentPrice() {
  const amount = parseEntryNumber('#amount');
  const quantity = parseEntryNumber('#investmentQuantity');
  const price = amount / quantity;
  $('#investmentPrice').value = Number.isFinite(price) && price > 0 ? formatTokenPrice(price) : '';
}

function syncForm(selectedCategory) {
  const section = type.value;
  const isCrypto = section === 'crypto';
  const isIncome = section === 'income';
  const isBlog = section === 'work';
  const isEtsy = section === 'etsy';
  const categories = CATEGORIES[section];
  $('#categoryLabel').hidden = !categories;
  $('#cryptoOperationLabel').hidden = !isCrypto;
  entryCategory.required = isCrypto;
  entryCategory.replaceChildren();
  if (categories) {
    const choices = isCrypto ? [...categories, HISTORICAL_CRYPTO_PURCHASE] : categories;
    if (isCrypto && selectedCategory && !choices.includes(selectedCategory)) choices.push(selectedCategory);
    if (isCrypto) entryCategory.add(new Option('Виберіть портфель', ''));
    for (const label of choices) entryCategory.add(new Option(label, label));
    if (choices.includes(selectedCategory)) entryCategory.value = selectedCategory;
  }
  $('#categoryCaption').textContent = isCrypto ? 'Криптопортфель' : isIncome ? 'Напрям' : isBlog ? 'Тип інвестиції' : 'Категорія';
  $('#nameLabel').hidden = !!categories && !isIncome && !isBlog && !isEtsy;
  $('#nameCaption').textContent = isIncome ? 'Джерело (необов’язково)' : isBlog ? 'Назва блогу / проєкту' : 'Назва / де знаходиться';
  $('#name').placeholder = isIncome ? 'Instagram, рекомендація, сайт' : isBlog ? 'Наприклад: особистий блог' : 'Наприклад: депозит';
  $('#counterpartyLabel').hidden = !isIncome;
  $('#purposeLabel').hidden = !isIncome;
  syncCryptoFields();
  syncEntryCategoryFields();
}

function syncEntryCategoryFields() {
  const isEtsy = type.value === 'etsy';
  const etsySale = isEtsy && entryCategory.value === ETSY_SALE;
  $('#paymentSourceLabel').hidden = !(type.value === 'expense' || type.value === 'work' || (isEtsy && !etsySale));
  syncEtsyDebitField();
  syncPaymentPreview();
  if (!isEtsy) return;
  $('#nameCaption').textContent = etsySale ? 'Товар або № замовлення' : 'Назва витрати';
  $('#name').placeholder = etsySale ? 'Наприклад: замовлення №102' : 'Наприклад: комісія Etsy';
}

function syncCryptoFields() {
  const isCrypto = type.value === 'crypto';
  const buy = isCrypto && entryOperation.value === 'investment';
  $('#amountCaption').textContent = buy ? 'Сума покупки, USDT'
    : isCrypto ? 'Сума, USDT' : type.value === 'etsy' ? 'Сума, $ (USD)'
    : type.value === 'work' ? 'Сума інвестиції, ₴' : 'Сума, ₴';
  $('#cryptoInvestmentFields').hidden = !buy;
  const historicalOption = [...entryCategory.options].find(option => option.value === HISTORICAL_CRYPTO_PURCHASE);
  if (historicalOption) {
    if (!buy && historicalOption.selected) entryCategory.value = '';
    historicalOption.hidden = !buy;
    historicalOption.disabled = !buy;
  }
  for (const field of ['#investmentCoin', '#investmentQuantity']) $(field).required = buy;
  if (buy) updateInvestmentPrice();
}

function openEntry(record = null, operation = 'deposit', defaultCoin = '', defaultCategory = '') {
  editingRecord = record;
  const legacyBuy = record && isLegacyCryptoBuy(record);
  const section = legacyBuy || (!record && operation === 'investment') ? 'crypto'
    : record?.type || (['overview', 'decomposition', 'tasks'].includes(current) ? 'expense' : current);
  const category = legacyBuy ? cryptoWallet(record) : (record?.category ?? defaultCategory);
  form.reset();
  $('#editId').value = record?.id || '';
  $('#dialogEyebrow').textContent = record ? 'РЕДАГУВАННЯ' : 'НОВИЙ ЗАПИС';
  $('#dialogTitle').textContent = record ? 'Змінити запис' : 'Додати до фінансів';
  type.value = section;
  entryOperation.value = legacyBuy ? 'investment' : (record?.cryptoOperation || operation);
  syncForm(category);
  $('#amount').value = record && isLegacyEtsyAmount(record) ? etsyAmountInCents(record) / 100 : (record?.amount ?? '');
  $('#date').value = record?.date || new Date().toLocaleDateString('sv-SE');
  paymentSource.value = record?.paymentSource || '';
  const debit = etsyWalletDebit(record);
  $('#etsyDebit').value = debit && record.metaMaskDebitOverride ? debit : '';
  syncEtsyDebitField();
  syncPaymentPreview();
  $('#investmentCoin').value = record?.investmentCoin || defaultCoin;
  $('#investmentQuantity').value = record?.investmentQuantity || '';
  updateInvestmentPrice();
  $('#name').value = record?.name || '';
  $('#counterparty').value = record?.counterparty || '';
  $('#purpose').value = record?.purpose || '';
  $('#note').value = record?.note || '';
  dlg.showModal();
  $('#amount').focus();
}
type.onchange = () => syncForm();
entryOperation.onchange = syncCryptoFields;
entryCategory.onchange = syncEntryCategoryFields;
paymentSource.onchange = () => {
  syncEtsyDebitField();
  syncPaymentPreview();
};
$('#amount').addEventListener('input', updateInvestmentPrice);
$('#amount').addEventListener('input', syncPaymentPreview);
$('#investmentQuantity').addEventListener('input', updateInvestmentPrice);
$('#addBtn').onclick = () => openEntry();

form.onsubmit = event => {
  if (event.submitter?.value === 'cancel') return;
  const invalid = (field, message) => {
    event.preventDefault();
    field.setCustomValidity(message);
    field.reportValidity();
    field.setCustomValidity('');
  };
  const amount = parseEntryNumber('#amount');
  const isCrypto = type.value === 'crypto';
  const operation = entryOperation.value;
  const buy = isCrypto && operation === 'investment';
  const coin = cryptoTicker($('#investmentCoin').value);
  const quantity = parseEntryNumber('#investmentQuantity');
  const price = amount / quantity;
  if (!Number.isFinite(amount) || amount < 0 || (isCrypto && amount === 0)) {
    return invalid($('#amount'), isCrypto ? 'Введіть суму більше нуля' : 'Введіть коректну суму');
  }
  if (type.value === 'etsy') {
    const cents = amountInCents(amount);
    if (!Number.isSafeInteger(cents) || cents <= 0 || Math.abs(amount - cents / 100) > 1e-8) {
      return invalid($('#amount'), 'Введіть суму більше нуля, до двох знаків після коми');
    }
  }
  if (buy) {
    if (!/^[A-Z0-9]{1,20}$/.test(coin)) return invalid($('#investmentCoin'), 'Введіть тикер монети, наприклад SOL');
    if (!Number.isFinite(quantity) || quantity <= 0) return invalid($('#investmentQuantity'), 'Введіть кількість більше нуля');
    if (!Number.isFinite(price) || price <= 0) return invalid($('#investmentQuantity'), 'Не вдалося розрахувати ціну за монету');
  }

  const id = $('#editId').value;
  const original = records.find(record => record.id === id);
  const legacyBuy = buy && original && isLegacyCryptoBuy(original);
  const item = {
    id: id || crypto.randomUUID(),
    type: legacyBuy ? 'work' : type.value,
    category: legacyBuy ? 'У крипто' : entryCategory.value,
    amount,
    date: $('#date').value,
    paymentSource: $('#paymentSourceLabel').hidden ? '' : paymentSource.value,
    name: $('#name').value.trim(),
    counterparty: $('#counterparty').value.trim(),
    purpose: $('#purpose').value.trim(),
    note: $('#note').value.trim(),
  };
  if (item.type === 'etsy') {
    item.currency = 'USD';
    const preserveLegacy = original && isLegacyEtsyAmount(original) &&
      amount === etsyAmountInCents(original) / 100 &&
      (!isEtsyWalletExpense(item) || (needsExplicitEtsyDebit(original) && $('#etsyDebit').value.trim() === ''));
    if (preserveLegacy) {
      item.currency = 'UAH';
      item.amount = original.amount;
    }
  }
  if (isEtsyWalletExpense(item)) {
    const explicitDebit = $('#etsyDebit').value.trim() !== '';
    const debit = explicitDebit ? parseEntryNumber('#etsyDebit') : needsExplicitEtsyDebit(original) ? 0 : amount;
    if (explicitDebit && (!Number.isFinite(debit) || debit <= 0)) {
      return invalid($('#etsyDebit'), 'Введіть суму списання в USDT більше нуля');
    }
    if (debit) item.metaMaskDebit = debit;
    if (explicitDebit) item.metaMaskDebitOverride = true;
  }
  if (isCrypto && !legacyBuy) item.cryptoOperation = operation;
  if (buy) {
    item.investmentCoin = coin;
    item.investmentPrice = price;
    item.investmentQuantity = quantity;
    if (legacyBuy) item.investmentPortfolio = entryCategory.value;
  }
  const updated = id ? records.map(record => record.id === id ? item : record) : [...records, item];
  const balanceError = cryptoBalanceError(updated);
  if (balanceError) return invalid(etsyWalletDebit(item) ? $('#etsyDebit') : $('#amount'), balanceError);
  records = updated;
  save();
  const nextView = buy ? 'crypto' : item.type;
  setTimeout(() => render(nextView), 0);
};
const mf=$('#monthFilter');mf.value=period;mf.onchange=()=>{period=mf.value;render(current)};$('#allTimeBtn').onclick=()=>{period='';mf.value='';render(current)};
$('#exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify({app:'mfi',version:3,exportedAt:new Date().toISOString(),records,tasks,plans,ideas},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`mfi-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)};
const file=$('#importFile');$('#importBtn').onclick=()=>file.click();file.onchange=async()=>{try{const parsed=JSON.parse(await file.files[0].text()),incoming=Array.isArray(parsed)?parsed:parsed.records;if(!Array.isArray(incoming))throw 0;if(!confirm(`Відновити ${incoming.length} записів? Поточні дані буде замінено.`))return;records=incoming;if(Array.isArray(parsed.tasks))tasks=parsed.tasks;if(Array.isArray(parsed.plans))plans=parsed.plans;if(Array.isArray(parsed.ideas))ideas=parsed.ideas;save();saveTasks();savePlans();render(current);alert('Резервну копію відновлено')}catch{alert('Не вдалося прочитати резервну копію')}finally{file.value=''}};
render();
