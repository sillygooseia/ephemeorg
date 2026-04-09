const STORAGE_KEY = 'ephemeorg:budget';
const DEFAULT_STATE = {
  incomes: [
    { id: 'income-1', label: 'Net income', amount: 4200 },
  ],
  expenses: [
    { id: 'expense-1', label: 'Rent / mortgage', amount: 1400 },
    { id: 'expense-2', label: 'Utilities & subscriptions', amount: 380 },
  ],
  debts: [
    { id: 'debt-1', name: 'Credit card', type: 'credit-card', balance: 4200, apr: 19.5, minimumPayment: 95, ignore: false },
  ],
  extraCash: 200,
  strategy: 'bestCashFlow',
  hideEmptyDebts: true,
};

const YAML_TEMPLATE = `# Epheme budget plan
# Replace these sample fields with your values.
# Use this template when asking an LLM to generate a plan.

incomes:
  - label: "Net income"
    amount: 4200

expenses:
  - label: "Rent / mortgage"
    amount: 1400
  - label: "Utilities & subscriptions"
    amount: 380

debts:
  - name: "Credit card"
    type: credit-card
    balance: 4200
    apr: 19.5
    minimumPayment: 95
    ignore: false

extraCash: 200
strategy: bestCashFlow
`;

const db = new window.EphemeIdb.IdbDatabase('ephemeorg-budget', 1, [
  { name: 'budget', keyPath: 'id' },
]);
let store;
let state = JSON.parse(JSON.stringify(DEFAULT_STATE));
// Power-user view settings
state.denseMode = state.denseMode ?? true;
state.debtsFull = state.debtsFull ?? false;
state.debtFilter = state.debtFilter ?? '';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function currency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(value) {
  return `${value.toFixed(1)}%`;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueId(prefix) {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function loadState() {
  await db.open();
  store = db.store('budget');
  const saved = await store.get(STORAGE_KEY);
  if (saved && saved.state) {
    state = saved.state;
    state.hideEmptyDebts = state.hideEmptyDebts ?? true;
    state.incomes = Array.isArray(state.incomes) ? state.incomes : [];
    state.expenses = Array.isArray(state.expenses) ? state.expenses : [];
    state.debts = Array.isArray(state.debts) ? state.debts : [];
    state.debts = state.debts.map((debt) => ({ ignore: false, ...debt }));
    state.denseMode = state.denseMode ?? true;
    state.debtsFull = state.debtsFull ?? false;
    state.debtFilter = state.debtFilter ?? '';
  }
}

async function saveState() {
  await store.put({ id: STORAGE_KEY, state });
  const status = document.getElementById('save-status');
  if (status) {
    status.textContent = 'Saved locally with Epheme storage.';
  }
}

function calculateTotals() {
  const totalIncome = state.incomes.reduce((sum, item) => sum + Math.max(0, item.amount), 0);
  const totalExpenses = state.expenses.reduce((sum, item) => sum + Math.max(0, item.amount), 0);
  const totalMinimums = state.debts.reduce((sum, debt) => sum + Math.max(0, debt.minimumPayment), 0);
  const netCashFlow = totalIncome - totalExpenses - totalMinimums;
  const extraCash = Math.max(0, state.extraCash);
  return { totalIncome, totalExpenses, totalMinimums, netCashFlow, extraCash };
}

function strategyLabel(strategy) {
  switch (strategy) {
    case 'highestAPR':
      return 'Highest APR first';
    case 'snowball':
      return 'Smallest balance first';
    default:
      return 'Best cash-flow impact';
  }
}

function buildRecommendation(availableExtra) {
  const debts = state.debts.filter((debt) => debt.balance > 0 && debt.minimumPayment >= 0 && !debt.ignore);
  if (!debts.length) {
    return {
      message: 'Add at least one debt account to see a recommendation.',
      allocation: [],
      totalCashFreed: 0,
    };
  }

  const scored = debts.map((debt) => {
    const ratio = debt.balance ? debt.minimumPayment / debt.balance : 0;
    let score = debt.apr * 1.2 + ratio * 100;

    if (state.strategy === 'highestAPR') {
      score = debt.apr * 1.5 + ratio * 35;
    }
    if (state.strategy === 'snowball') {
      score = 1 / Math.max(debt.balance, 1) * 1200 + ratio * 35;
    }

    return { ...debt, ratio, score };
  });

  scored.sort((left, right) => right.score - left.score);
  let remaining = availableExtra;

  const allocation = scored.map((debt) => {
    const extraPayment = Math.min(remaining, debt.balance);
    remaining -= extraPayment;
    const projectedBalance = Math.max(0, debt.balance - extraPayment);
    const projectedMinPayment = debt.balance
      ? Math.max(0, debt.minimumPayment - debt.minimumPayment * (extraPayment / debt.balance))
      : debt.minimumPayment;
    const monthlyCashFreed = Math.max(0, debt.minimumPayment - projectedMinPayment);
    return {
      ...debt,
      extraPayment,
      projectedBalance,
      projectedMinPayment,
      monthlyCashFreed,
    };
  });

  const totalCashFreed = allocation.reduce((sum, item) => sum + item.monthlyCashFreed, 0);
  const message = availableExtra > 0
    ? `Using ${currency(availableExtra)} in extra cash from the value you entered, this strategy ranks accounts by ${strategyLabel(state.strategy).toLowerCase()}.`
    : 'No extra cash is available for paydown. Enter a positive amount in the extra cash field to see a plan.';

  return { allocation, totalCashFreed, message };
}

function sanitizeText(value) {
  return String(value || '').trim();
}

function parseYamlValue(raw) {
  const value = String(raw || '').trim();
  if (value === '') {
    return '';
  }
  if (/^(true|false)$/i.test(value)) {
    return value.toLowerCase() === 'true';
  }
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return value.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
}

function parseBudgetYaml(content) {
  const lines = content.split(/\r?\n/);
  const result = { incomes: [], expenses: [], debts: [], extraCash: 0, strategy: 'bestCashFlow', hideEmptyDebts: true };
  let currentSection = null;
  let currentItem = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ');
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }
    const indent = line.match(/^ */)[0].length;
    const trimmed = line.trim();

    const sectionMatch = trimmed.match(/^(incomes|expenses|debts):\s*$/);
    if (sectionMatch && indent === 0) {
      currentSection = sectionMatch[1];
      currentItem = null;
      continue;
    }

    const scalarMatch = trimmed.match(/^(extraCash|strategy):\s*(.*)$/);
    if (scalarMatch && indent === 0) {
      const key = scalarMatch[1];
      const value = parseYamlValue(scalarMatch[2]);
      result[key] = value;
      continue;
    }

    if (trimmed.startsWith('- ') && currentSection) {
      const fields = trimmed.slice(2).trim();
      currentItem = {};
      if (fields) {
        const pair = fields.match(/^(\w+):\s*(.*)$/);
        if (pair) {
          currentItem[pair[1]] = parseYamlValue(pair[2]);
        }
      }
      result[currentSection].push(currentItem);
      continue;
    }

    if (currentItem && indent >= 2 && currentSection) {
      const fieldMatch = trimmed.match(/^(\w+):\s*(.*)$/);
      if (fieldMatch) {
        const key = fieldMatch[1];
        currentItem[key] = parseYamlValue(fieldMatch[2]);
      }
    }
  }

  return result;
}

function dumpBudgetYaml(data) {
  const lines = ['# Epheme budget plan', '# Generated from the current form state', ''];
  if (Array.isArray(data.incomes) && data.incomes.length) {
    lines.push('incomes:');
    data.incomes.forEach((item) => {
      lines.push('  - label: "' + sanitizeText(item.label) + '"');
      lines.push('    amount: ' + Number(item.amount));
    });
    lines.push('');
  }
  if (Array.isArray(data.expenses) && data.expenses.length) {
    lines.push('expenses:');
    data.expenses.forEach((item) => {
      lines.push('  - label: "' + sanitizeText(item.label) + '"');
      lines.push('    amount: ' + Number(item.amount));
    });
    lines.push('');
  }
  if (Array.isArray(data.debts) && data.debts.length) {
    lines.push('debts:');
    data.debts.forEach((item) => {
      lines.push('  - name: "' + sanitizeText(item.name) + '"');
      lines.push('    type: ' + sanitizeText(item.type));
      lines.push('    balance: ' + Number(item.balance));
      lines.push('    apr: ' + Number(item.apr));
      lines.push('    minimumPayment: ' + Number(item.minimumPayment));
      if (item.ignore) {
        lines.push('    ignore: true');
      }
    });
    lines.push('');
  }
  lines.push('extraCash: ' + Number(data.extraCash));
  lines.push('strategy: ' + sanitizeText(data.strategy));
  lines.push('');
  return lines.join('\n');
}

function setYamlInput(text) {
  const yamlInput = document.getElementById('yaml-input');
  if (yamlInput) {
    yamlInput.value = text;
  }
}

function showYamlMessage(message, isError = false) {
  const status = document.getElementById('save-status');
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? '#a8413c' : '#4f594f';
}

function renderTableRows(type, rowsId, template) {
  const container = document.getElementById(rowsId);
  if (!container) return;

  let items = state[type] || [];
  if (type === 'debts') {
    items = items.filter((item) => {
      if (state.hideEmptyDebts && !(item.balance > 0)) return false;
      if (state.debtFilter && state.debtFilter.trim()) {
        const f = state.debtFilter.trim().toLowerCase();
        const name = String(item.name || '').toLowerCase();
        const typeVal = String(item.type || '').toLowerCase();
        return name.includes(f) || typeVal.includes(f) || String(item.balance || '').includes(f);
      }
      return true;
    });
  }

  const rows = items.map((item) => template(item));
  container.innerHTML = rows.join('');
}

function renderSummary() {
  const totals = calculateTotals();
  document.getElementById('total-income').textContent = currency(totals.totalIncome);
  document.getElementById('total-expenses').textContent = currency(totals.totalExpenses);
  document.getElementById('total-minimums').textContent = currency(totals.totalMinimums);

  const cards = state.debts.filter((debt) => debt.type === 'credit-card');
  const loans = state.debts.filter((debt) => debt.type === 'loan');
  const cardBalance = cards.reduce((sum, debt) => sum + Math.max(0, debt.balance), 0);
  const loanBalance = loans.reduce((sum, debt) => sum + Math.max(0, debt.balance), 0);

  document.getElementById('total-cards').textContent = `${cards.length} • ${currency(cardBalance)}`;
  document.getElementById('total-loans').textContent = `${loans.length} • ${currency(loanBalance)}`;

  const netCashNode = document.getElementById('net-cash-flow');
  netCashNode.textContent = currency(totals.netCashFlow);
  netCashNode.className = totals.netCashFlow < 0 ? 'budget-value budget-negative' : 'budget-value budget-positive';

  const recommendation = buildRecommendation(totals.extraCash);

  document.getElementById('recommendation-results').innerHTML = `
    <div class="budget-result">
      <p class="budget-key">Strategy</p>
      <p class="budget-value-large">${strategyLabel(state.strategy)}</p>
    </div>
    <div class="budget-result">
      <p class="budget-key">Estimated monthly cash freed</p>
      <p class="budget-value-large">${currency(recommendation.totalCashFreed)}</p>
      <p class="budget-panel-note">${recommendation.message}</p>
    </div>
  `;

  document.getElementById('extra-cash').value = state.extraCash;
  document.getElementById('strategy').value = state.strategy;

  // Apply view classes
  const app = document.getElementById('budget-app');
  if (app) {
    app.classList.toggle('dense', !!state.denseMode);
    app.classList.toggle('debts-full', !!state.debtsFull);
    if (state.debtsFull) {
      // Ensure YAML panel is hidden if full debts mode
      app.classList.remove('yaml-open');
    }
  }

  const allocationRows = recommendation.allocation.map((debt) => `
    <tr>
      <td>${sanitizeText(debt.name)}</td>
      <td>${debt.type === 'loan' ? 'Loan' : 'Credit card'}</td>
      <td>${currency(debt.balance)}</td>
      <td>${percent(debt.apr)}</td>
      <td>${currency(debt.minimumPayment)}</td>
      <td>${currency(debt.extraPayment)}</td>
      <td>${currency(debt.projectedBalance)}</td>
      <td>${currency(debt.projectedMinPayment)}</td>
    </tr>
  `).join('');

  document.getElementById('allocation-results').innerHTML = recommendation.allocation.length
    ? `
      <table class="budget-results" aria-label="Allocation recommendation table">
        <thead>
          <tr>
            <th>Account</th>
            <th>Type</th>
            <th>Balance</th>
            <th>APR</th>
            <th>Minimum</th>
            <th>Extra payment</th>
            <th>Projected balance</th>
            <th>Projected minimum</th>
          </tr>
        </thead>
        <tbody>
          ${allocationRows}
        </tbody>
      </table>
    `
    : '<p class="budget-panel-note">No allocation available yet.</p>';
}

function render() {
  renderSummary();

  const yamlInput = document.getElementById('yaml-input');
  if (yamlInput && !yamlInput.value.trim()) {
    yamlInput.value = YAML_TEMPLATE;
  }

  const hideEmptyCheckbox = document.getElementById('hide-empty-debts');
  if (hideEmptyCheckbox) {
    hideEmptyCheckbox.checked = Boolean(state.hideEmptyDebts);
  }

  renderTableRows('incomes', 'income-rows', (item) => `
    <tr>
      <td>
        <input
          type="text"
          data-section="incomes"
          data-id="${item.id}"
          data-field="label"
          value="${sanitizeText(item.label)}"
          placeholder="Income source"
        />
      </td>
      <td>
        <input
          type="number"
          inputmode="decimal"
          step="10"
          data-section="incomes"
          data-id="${item.id}"
          data-field="amount"
          value="${item.amount}"
        />
      </td>
      <td>
        <button class="btn btn-ghost remove-row" type="button" data-action="remove" data-target="incomes" data-id="${item.id}">Remove</button>
      </td>
    </tr>
  `);

  renderTableRows('expenses', 'expense-rows', (item) => `
    <tr>
      <td>
        <input
          type="text"
          data-section="expenses"
          data-id="${item.id}"
          data-field="label"
          value="${sanitizeText(item.label)}"
          placeholder="Expense name"
        />
      </td>
      <td>
        <input
          type="number"
          inputmode="decimal"
          step="10"
          data-section="expenses"
          data-id="${item.id}"
          data-field="amount"
          value="${item.amount}"
        />
      </td>
      <td>
        <button class="btn btn-ghost remove-row" type="button" data-action="remove" data-target="expenses" data-id="${item.id}">Remove</button>
      </td>
    </tr>
  `);

  renderTableRows('debts', 'debt-rows', (item) => `
    <tr>
      <td>
        <input
          type="text"
          data-section="debts"
          data-id="${item.id}"
          data-field="name"
          value="${sanitizeText(item.name)}"
          placeholder="Account name"
        />
      </td>
      <td>
        <select data-section="debts" data-id="${item.id}" data-field="type">
          <option value="credit-card" ${item.type === 'credit-card' ? 'selected' : ''}>Credit card</option>
          <option value="loan" ${item.type === 'loan' ? 'selected' : ''}>Loan</option>
        </select>
      </td>
      <td>
        <input
          type="number"
          inputmode="decimal"
          step="50"
          min="0"
          data-section="debts"
          data-id="${item.id}"
          data-field="balance"
          value="${item.balance}"
        />
      </td>
      <td>
        <input
          type="number"
          inputmode="decimal"
          step="0.1"
          min="0"
          max="100"
          data-section="debts"
          data-id="${item.id}"
          data-field="apr"
          value="${item.apr}"
        />
      </td>
      <td>
        <input
          type="number"
          inputmode="decimal"
          step="5"
          min="0"
          data-section="debts"
          data-id="${item.id}"
          data-field="minimumPayment"
          value="${item.minimumPayment}"
        />
      </td>
      <td>
        <label class="budget-checkbox-label">
          <input
            type="checkbox"
            data-section="debts"
            data-id="${item.id}"
            data-field="ignore"
            ${item.ignore ? 'checked' : ''}
          />
          Ignore
        </label>
      </td>
      <td>
        <button class="btn btn-ghost remove-row" type="button" data-action="remove" data-target="debts" data-id="${item.id}">Remove</button>
      </td>
    </tr>
  `);
}

function updateStateItem(section, id, field, value) {
  const list = state[section];
  if (!Array.isArray(list)) {
    return;
  }
  const item = list.find((entry) => entry.id === id);
  if (!item) {
    return;
  }
  if (field === 'label' || field === 'name') {
    item[field] = sanitizeText(value);
    return;
  }
  if (field === 'type') {
    item[field] = value;
    return;
  }
  if (field === 'ignore') {
    item.ignore = Boolean(value);
    return;
  }
  item[field] = toNumber(value);
}

function addRow(section) {
  const item = {
    id: uniqueId(section),
    label: 'New item',
    amount: 0,
    name: 'New account',
    type: 'credit-card',
    balance: 0,
    apr: 18,
    minimumPayment: 0,
  };
  if (section === 'incomes') {
    state.incomes.push({ id: item.id, label: 'New income', amount: 0 });
  } else if (section === 'expenses') {
    state.expenses.push({ id: item.id, label: 'New expense', amount: 0 });
  } else if (section === 'debts') {
    state.debts.push({ id: item.id, name: 'New account', type: 'credit-card', balance: 0, apr: 18, minimumPayment: 0, ignore: false });
  }
}

function removeRow(section, id) {
  if (!Array.isArray(state[section])) {
    return;
  }
  state[section] = state[section].filter((entry) => entry.id !== id);
}

function handleInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    return;
  }
  const section = target.dataset.section;
  const id = target.dataset.id;
  const field = target.dataset.field;
  if (section && id && field) {
    const value = target.type === 'checkbox' ? target.checked : target.value;
    updateStateItem(section, id, field, value);
    renderSummary();
    saveState();
    return;
  }

  if (target.id === 'hide-empty-debts') {
    state.hideEmptyDebts = target.checked;
    render();
    saveState();
    return;
  }

  if (target.id === 'extra-cash') {
    state.extraCash = toNumber(target.value);
    renderSummary();
    saveState();
    return;
  }
  if (target.id === 'strategy') {
    state.strategy = target.value;
    renderSummary();
    saveState();
    return;
  }

  if (target.id === 'debts-filter') {
    state.debtFilter = String(target.value || '');
    renderTableRows('debts', 'debt-rows', (item) => `
    <tr>
      <td>
        <input type="text" data-section="debts" data-id="${item.id}" data-field="name" value="${sanitizeText(item.name)}" placeholder="Account name" />
      </td>
      <td>
        <select data-section="debts" data-id="${item.id}" data-field="type">
          <option value="credit-card" ${item.type === 'credit-card' ? 'selected' : ''}>Credit card</option>
          <option value="loan" ${item.type === 'loan' ? 'selected' : ''}>Loan</option>
        </select>
      </td>
      <td>
        <input type="number" inputmode="decimal" step="50" min="0" data-section="debts" data-id="${item.id}" data-field="balance" value="${item.balance}" />
      </td>
      <td>
        <input type="number" inputmode="decimal" step="0.1" min="0" max="100" data-section="debts" data-id="${item.id}" data-field="apr" value="${item.apr}" />
      </td>
      <td>
        <input type="number" inputmode="decimal" step="5" min="0" data-section="debts" data-id="${item.id}" data-field="minimumPayment" value="${item.minimumPayment}" />
      </td>
      <td>
        <label class="budget-checkbox-label">
          <input type="checkbox" data-section="debts" data-id="${item.id}" data-field="ignore" ${item.ignore ? 'checked' : ''} />
          Ignore
        </label>
      </td>
      <td>
        <button class="btn btn-ghost remove-row" type="button" data-action="remove" data-target="debts" data-id="${item.id}">Remove</button>
      </td>
    </tr>`);
    saveState();
    return;
  }
}

function handleClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const action = target.dataset.action;
  const section = target.dataset.target;
  const id = target.dataset.id;
  if (action === 'add' && section) {
    addRow(section);
    render();
    saveState();
    return;
  }
  if (action === 'remove' && section && id) {
    removeRow(section, id);
    render();
    saveState();
    return;
  }
  if (target.id === 'load-yaml') {
    const yamlInput = document.getElementById('yaml-input');
    if (!yamlInput) return;
    try {
      const imported = parseBudgetYaml(yamlInput.value);
      state = {
        incomes: Array.isArray(imported.incomes) ? imported.incomes.map((item, index) => ({
          id: item.id || uniqueId(`income-${index + 1}`),
          label: item.label || 'Income',
          amount: toNumber(item.amount),
        })) : [],
        expenses: Array.isArray(imported.expenses) ? imported.expenses.map((item, index) => ({
          id: item.id || uniqueId(`expense-${index + 1}`),
          label: item.label || 'Expense',
          amount: toNumber(item.amount),
        })) : [],
        debts: Array.isArray(imported.debts) ? imported.debts.map((item, index) => ({
          id: item.id || uniqueId(`debt-${index + 1}`),
          name: item.name || 'Account',
          type: item.type === 'loan' ? 'loan' : 'credit-card',
          balance: toNumber(item.balance),
          apr: toNumber(item.apr),
          minimumPayment: toNumber(item.minimumPayment),
        })) : [],
        extraCash: toNumber(imported.extraCash),
        strategy: ['bestCashFlow', 'highestAPR', 'snowball'].includes(imported.strategy) ? imported.strategy : 'bestCashFlow',
      };
      render();
      saveState();
      showYamlMessage('YAML loaded successfully.');
    } catch (error) {
      showYamlMessage('Error parsing YAML. Check the template and try again.', true);
      console.error(error);
    }
    return;
  }
  if (target.id === 'copy-template') {
    const yamlInput = document.getElementById('yaml-input');
    if (yamlInput) {
      yamlInput.value = YAML_TEMPLATE;
      yamlInput.focus();
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(YAML_TEMPLATE).catch(() => {});
      }
    }
    showYamlMessage('Template loaded into the editor and copied to clipboard.');
    return;
  }
  if (target.id === 'export-yaml') {
    const yamlInput = document.getElementById('yaml-input');
    if (yamlInput) {
      yamlInput.value = dumpBudgetYaml(state);
    }
    showYamlMessage('Current plan exported to YAML.');
    return;
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  render();
  document.getElementById('budget-app')?.addEventListener('input', handleInput);
  document.getElementById('budget-app')?.addEventListener('click', handleClick);
  document.getElementById('yaml-input')?.addEventListener('focus', (event) => {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement && !target.value.trim()) {
      target.value = YAML_TEMPLATE;
    }
  });

  // YAML toggle for compact view
  const app = document.getElementById('budget-app');
  const toggleYaml = document.getElementById('toggle-yaml');
  if (toggleYaml && app) {
    const setLabel = () => {
      const open = app.classList.contains('yaml-open');
      toggleYaml.textContent = open ? 'Hide YAML' : 'Show YAML';
      toggleYaml.setAttribute('aria-expanded', String(open));
    };
    toggleYaml.addEventListener('click', () => {
      app.classList.toggle('yaml-open');
      setLabel();
    });
    setLabel();
  }

  // Dense mode toggle
  const toggleDense = document.getElementById('toggle-dense');
  if (toggleDense && app) {
    const setDense = () => { toggleDense.textContent = state.denseMode ? 'Dense ✓' : 'Dense'; };
    toggleDense.addEventListener('click', () => { state.denseMode = !state.denseMode; app.classList.toggle('dense', !!state.denseMode); setDense(); saveState(); });
    app.classList.toggle('dense', !!state.denseMode);
    setDense();
  }

  // Debts full toggle
  const toggleDebtsFull = document.getElementById('toggle-debts-full');
  if (toggleDebtsFull && app) {
    const setDebtsFull = () => { toggleDebtsFull.textContent = state.debtsFull ? 'Debts Full ✓' : 'Debts Full'; };
    toggleDebtsFull.addEventListener('click', () => { state.debtsFull = !state.debtsFull; app.classList.toggle('debts-full', !!state.debtsFull); setDebtsFull(); saveState(); render(); });
    app.classList.toggle('debts-full', !!state.debtsFull);
    setDebtsFull();
  }

  // Debts filter input
  const debtsFilter = document.getElementById('debts-filter');
  if (debtsFilter) {
    debtsFilter.value = state.debtFilter || '';
    debtsFilter.addEventListener('input', (e) => {
      state.debtFilter = String(e.target.value || '');
      renderTableRows('debts', 'debt-rows', (item) => `
    <tr>
      <td>
        <input type="text" data-section="debts" data-id="${item.id}" data-field="name" value="${sanitizeText(item.name)}" placeholder="Account name" />
      </td>
      <td>
        <select data-section="debts" data-id="${item.id}" data-field="type">
          <option value="credit-card" ${item.type === 'credit-card' ? 'selected' : ''}>Credit card</option>
          <option value="loan" ${item.type === 'loan' ? 'selected' : ''}>Loan</option>
        </select>
      </td>
      <td>
        <input type="number" inputmode="decimal" step="50" min="0" data-section="debts" data-id="${item.id}" data-field="balance" value="${item.balance}" />
      </td>
      <td>
        <input type="number" inputmode="decimal" step="0.1" min="0" max="100" data-section="debts" data-id="${item.id}" data-field="apr" value="${item.apr}" />
      </td>
      <td>
        <input type="number" inputmode="decimal" step="5" min="0" data-section="debts" data-id="${item.id}" data-field="minimumPayment" value="${item.minimumPayment}" />
      </td>
      <td>
        <label class="budget-checkbox-label">
          <input type="checkbox" data-section="debts" data-id="${item.id}" data-field="ignore" ${item.ignore ? 'checked' : ''} />
          Ignore
        </label>
      </td>
      <td>
        <button class="btn btn-ghost remove-row" type="button" data-action="remove" data-target="debts" data-id="${item.id}">Remove</button>
      </td>
    </tr>`);
      saveState();
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (ev) => {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return; // ignore typing
    if (ev.key === 'd') { // dense
      state.denseMode = !state.denseMode; app.classList.toggle('dense', !!state.denseMode); saveState();
    }
    if (ev.key === 'f') { // debts full
      state.debtsFull = !state.debtsFull; app.classList.toggle('debts-full', !!state.debtsFull); saveState(); render();
    }
    if (ev.key === 'y') { // yaml
      document.getElementById('toggle-yaml')?.click();
    }
  });
});
