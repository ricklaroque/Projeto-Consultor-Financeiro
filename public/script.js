const form = document.querySelector("#financeForm");
const expensesList = document.querySelector("#expensesList");
const addExpenseButton = document.querySelector("#addExpense");
const submitButton = document.querySelector("#submitButton");
const formError = document.querySelector("#formError");
const answer = document.querySelector("#answer");
const answerPlaceholder = document.querySelector("#answerPlaceholder");
const resultStatus = document.querySelector("#resultStatus");
const consultingTab = document.querySelector("#consultingTab");
const dashboardTab = document.querySelector("#dashboardTab");
const consultingPanel = document.querySelector("#consultingPanel");
const dashboardPanel = document.querySelector("#dashboardPanel");
const consultingChart = document.querySelector("#consultingChart");
const chartLegend = document.querySelector("#chartLegend");
const chartHint = document.querySelector("#chartHint");
const dashboardIncome = document.querySelector("#dashboardIncome");
const dashboardExpenses = document.querySelector("#dashboardExpenses");
const dashboardBalance = document.querySelector("#dashboardBalance");
const dashboardRate = document.querySelector("#dashboardRate");
const goalDetailsInput = form.elements.goalDetails;
const importSelect = document.querySelector("#importSelect");
const importSummary = document.querySelector("#importSummary");
const expenseCount = document.querySelector("#expenseCount");
const goalInputs = [...form.querySelectorAll('input[name="goal"]')];
let savedImports = [];
let savedTransactions = [];
let savedExpenseCategories = [];
let savedCategories = [];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const FINANCIAL_DIAGNOSIS_PROMPT = `
Analise meu momento financeiro com base apenas nos dados abaixo.

Idade: {age} anos
Renda mensal: {income}
Reserva atual: {reserve}
Dividas mensais: {monthlyDebt}
Estabilidade da renda: {stability}
Perfil de investimento: {riskProfile}
Total de gastos: {totalExpenses}
Saldo mensal: {monthlyBalance}
Taxa de gastos: {spendingRate}%
Reserva cobre: {emergencyMonths} meses

Gastos por categoria:
{expenseLines}

Objetivos principais selecionados: {goals}
Detalhe do objetivo: {goalDetails}

Adapte as dicas financeiras ao conjunto de objetivos selecionados e ao perfil do usuario.
Quando houver objetivos simultaneos, organize prioridades e explique o que vem antes, o que pode andar em paralelo e o que deve esperar.

Inclua uma secao chamada Caminhos de investimento personalizados.
Nessa secao, indique tipos de investimento ou referencias brasileiras que combinam com o perfil e o objetivo, como Tesouro Direto, CDB, LCI/LCA, fundos DI, fundos/ETFs ligados ao Ibovespa, FIIs, previdencia privada ou acoes, quando fizer sentido.
Explique por que cada caminho combina ou nao combina com a situacao, sem prometer rentabilidade e sem tratar como ordem de compra.
Se houver saldo negativo, reserva baixa ou dividas altas, priorize quitar dividas e formar reserva antes de sugerir renda variavel.

Responda em Markdown padronizado, com estes titulos exatos: ## Diagnostico, ## Pontos de atencao, ## Caminhos de investimento personalizados, ## Plano de acao, ## Proximos passos.
Em Caminhos de investimento personalizados, use uma tabela com as colunas: Classe de investimento | Por que combina (ou nao) | Uso recomendado na sua situacao.
Em Plano de acao, use uma tabela com as colunas: Etapa | Acao | Prazo. Em Pontos de atencao e Proximos passos, use topicos curtos.
Nao escreva linhas soltas ou quebradas como | 1 |, | 2 | ou pipes sem cabecalho. Toda tabela deve ter cabecalho completo.
Nao inclua frases finais de aviso legal ou disclaimer profissional.
`.trim();

async function loadImportedStatements() {
  try {
    const [importsResponse, transactionsResponse, categoriesResponse] = await Promise.all([
      fetch("/api/imports"),
      fetch("/api/transactions"),
      fetch("/api/categories"),
    ]);
    const importsData = await importsResponse.json();
    const transactionsData = await transactionsResponse.json();
    const categoriesData = await categoriesResponse.json();
    if (!importsResponse.ok) throw new Error(importsData.erro || "Nao foi possivel carregar as importacoes.");
    if (!transactionsResponse.ok) throw new Error(transactionsData.erro || "Nao foi possivel carregar as transacoes.");
    if (!categoriesResponse.ok) throw new Error(categoriesData.erro || "Nao foi possivel carregar as categorias.");

    savedImports = importsData;
    savedTransactions = transactionsData;
    savedCategories = categoriesData;
    savedExpenseCategories = buildExpenseCategories(categoriesData, transactionsData);
    renderImportOptions();
    refreshExpenseCategoryDropdowns();
    updateExpenseCount();
    const financialData = collectFinancialData();
    renderDashboardMetrics(financialData);
    renderConsultingChart(financialData);
  } catch (error) {
    importSelect.innerHTML = '<option value="">Importacoes indisponiveis</option>';
    importSelect.disabled = true;
    importSummary.textContent = error.message || "Nao foi possivel carregar as importacoes.";
  }
}

function setActiveWorkspaceTab(tabName) {
  const showDashboard = tabName === "dashboard";
  consultingTab.classList.toggle("active", !showDashboard);
  dashboardTab.classList.toggle("active", showDashboard);
  consultingTab.setAttribute("aria-selected", String(!showDashboard));
  dashboardTab.setAttribute("aria-selected", String(showDashboard));
  consultingPanel.hidden = showDashboard;
  dashboardPanel.hidden = !showDashboard;
  consultingPanel.classList.toggle("active", !showDashboard);
  dashboardPanel.classList.toggle("active", showDashboard);
  if (showDashboard) {
    renderDashboardMetrics(collectFinancialData());
    renderConsultingChart(collectFinancialData());
  }
}

function buildExpenseCategories(categories, transactions) {
  const names = new Set();
  categories
    .filter((item) => item.type === "expense")
    .forEach((item) => names.add(item.name));
  transactions
    .filter((item) => item.type === "expense" && item.category)
    .forEach((item) => names.add(item.category));
  return [...names].sort((first, second) => first.localeCompare(second, "pt-BR"));
}

function renderImportOptions() {
  importSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = savedImports.length ? "Preencher manualmente" : "Nenhuma importacao encontrada";
  importSelect.appendChild(placeholder);

  savedImports.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.fileName;
    importSelect.appendChild(option);
  });

  importSelect.disabled = !savedImports.length;
  importSummary.textContent = savedImports.length
    ? "Selecione uma fatura para preencher salario, dividas e reserva."
    : "Confirme uma importacao na pagina Importacoes para usar este preenchimento.";
}

function setMoneyValue(name, value) {
  form.elements[name].value = Math.max(value, 0).toFixed(2);
}

function replaceExpenses(expensesByCategory) {
  expensesList.innerHTML = "";
  if (!expensesByCategory.length) {
    addExpenseRow("", 0, {});
    updateExpenseCount();
    return;
  }

  expensesByCategory.forEach((item) => addExpenseRow(item.category, item.value, item));
  updateExpenseCount();
}

function updateExpenseCount() {
  if (!expenseCount) return;
  const count = expensesList.querySelectorAll(".expense-row").length;
  expenseCount.textContent = `${count} gasto${count === 1 ? "" : "s"} exibido${count === 1 ? "" : "s"}`;
}

function createExpenseCategoryDropdown(selectedCategory = "") {
  const select = document.createElement("select");
  select.dataset.category = "";
  select.setAttribute("aria-label", "Categoria da despesa");
  select.required = true;

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = savedExpenseCategories.length ? "Selecione uma categoria" : "Nenhuma categoria cadastrada";
  select.appendChild(placeholder);

  if (selectedCategory && !savedExpenseCategories.includes(selectedCategory)) {
    const option = document.createElement("option");
    option.value = selectedCategory;
    option.textContent = selectedCategory;
    select.appendChild(option);
  }

  savedExpenseCategories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  });

  select.value = selectedCategory;
  select.disabled = !savedExpenseCategories.length && !selectedCategory;
  return select;
}

function refreshExpenseCategoryDropdowns() {
  expensesList.querySelectorAll(".expense-row").forEach((row) => {
    const currentField = row.querySelector("[data-category]");
    if (!currentField) return;
    const selectedCategory = currentField?.value || "";
    const dropdown = createExpenseCategoryDropdown(selectedCategory);
    currentField.replaceWith(dropdown);
  });
}

function applyImportedStatement(importId) {
  const selectedImport = savedImports.find((item) => item.id === importId);
  if (!selectedImport) {
    importSummary.textContent = savedImports.length
      ? "Selecione uma fatura para preencher salario, dividas e reserva."
      : "Confirme uma importacao na pagina Importacoes para usar este preenchimento.";
    return;
  }

  const transactions = savedTransactions.filter((item) => item.importId === selectedImport.id);
  const income = transactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const expenses = transactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const expenseTransactions = transactions
    .filter((item) => item.type === "expense")
    .sort((first, second) => {
      const firstDate = String(first.date || "").split("/").reverse().join("-");
      const secondDate = String(second.date || "").split("/").reverse().join("-");
      return firstDate.localeCompare(secondDate) || String(first.description || "").localeCompare(String(second.description || ""), "pt-BR");
    })
    .map((item) => ({
      category: item.category || "Sem categoria",
      value: Number(item.amount),
      description: item.description,
      date: item.date,
    }));

  setMoneyValue("income", income);
  setMoneyValue("monthlyDebt", expenses);
  setMoneyValue("reserve", income - expenses);
  replaceExpenses(expenseTransactions);
  importSummary.textContent = `${selectedImport.fileName}: ${expenseTransactions.length} transacoes de saida, entradas ${currencyFormatter.format(income)}, saidas ${currencyFormatter.format(expenses)}, sobra ${currencyFormatter.format(income - expenses)}.`;
  const financialData = collectFinancialData();
  renderDashboardMetrics(financialData);
  renderConsultingChart(financialData);
}

function addExpenseRow(category = "", value = 0, details = {}) {
  const row = document.createElement("div");
  row.className = "expense-row";
  const categoryDropdown = createExpenseCategoryDropdown(category);
  const categoryCell = document.createElement("div");
  categoryCell.className = "expense-category-cell";
  categoryCell.appendChild(categoryDropdown);
  if (details.description || details.date) {
    const meta = document.createElement("small");
    meta.textContent = [details.date, details.description].filter(Boolean).join(" - ");
    meta.title = meta.textContent;
    categoryCell.appendChild(meta);
  }
  const moneyField = document.createElement("span");
  moneyField.className = "money-field";
  moneyField.innerHTML = `
    <small>R$</small>
    <input data-value type="number" min="0" step="0.01" value="0" aria-label="Valor da despesa" required />`;
  row.append(categoryCell, moneyField);
  expensesList.appendChild(row);
  if (category) {
    row.querySelector("[data-value]").value = Number(value || 0).toFixed(2);
  }
  updateExpenseCount();
  if (details.focus) row.querySelector("[data-category]").focus();
}

function collectFinancialData() {
  const formData = new FormData(form);
  const expenses = [...expensesList.querySelectorAll(".expense-row")].map((row) => ({
    category: row.querySelector("[data-category]").value.trim(),
    value: Number(row.querySelector("[data-value]").value || 0),
  })).filter((item) => item.category);
  const goals = formData.getAll("goal").map((goal) => String(goal).trim()).filter(Boolean);

  const income = Number(formData.get("income"));
  const reserve = Number(formData.get("reserve"));
  const monthlyDebt = Number(formData.get("monthlyDebt"));
  const totalExpenses = expenses.reduce((sum, item) => sum + item.value, 0);
  const monthlyBalance = income - totalExpenses;
  const spendingRate = income > 0 ? totalExpenses / income * 100 : 0;
  const emergencyMonths = totalExpenses > 0 ? reserve / totalExpenses : 0;

  return {
    income,
    reserve,
    age: Number(formData.get("age")),
    monthlyDebt,
    stability: formData.get("stability"),
    riskProfile: formData.get("riskProfile"),
    goals,
    goalDetails: String(formData.get("goalDetails") || "").trim(),
    expenses,
    totalExpenses,
    monthlyBalance,
    spendingRate,
    emergencyMonths,
  };
}

function truncatePromptField(text, maxLength) {
  const value = String(text || "");
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function buildPrompt(data) {
  const expenseLines = data.expenses.map((item) => `- ${item.category}: ${currencyFormatter.format(item.value)}`).join("\n");
  const prompt = FINANCIAL_DIAGNOSIS_PROMPT
    .replace("{age}", data.age)
    .replace("{income}", currencyFormatter.format(data.income))
    .replace("{reserve}", currencyFormatter.format(data.reserve))
    .replace("{monthlyDebt}", currencyFormatter.format(data.monthlyDebt))
    .replace("{stability}", data.stability)
    .replace("{riskProfile}", data.riskProfile)
    .replace("{totalExpenses}", currencyFormatter.format(data.totalExpenses))
    .replace("{monthlyBalance}", currencyFormatter.format(data.monthlyBalance))
    .replace("{spendingRate}", data.spendingRate.toFixed(1))
    .replace("{emergencyMonths}", data.emergencyMonths.toFixed(1))
    .replace("{expenseLines}", truncatePromptField(expenseLines || "- Nenhuma despesa informada", 360))
    .replace("{goals}", truncatePromptField(data.goals.join("; ") || "nenhum", 220))
    .replace("{goalDetails}", truncatePromptField(data.goalDetails || "nao informado", 260));

  return prompt.slice(0, 2000);
}

function removeAiDisclaimer(text) {
  return String(text)
    .replace(/\*?Esta analise nao substitui a consultoria de um profissional de financas\. Avalie sempre suas condicoes especificas antes de tomar decisoes\.\*?/gi, "")
    .replace(/\*?Esta análise não substitui a consultoria de um profissional de finanças\. Avalie sempre suas condições específicas antes de tomar decisões\.\*?/gi, "")
    .trim();
}

function renderMetrics(data) {
  renderDashboardMetrics(data);
  renderConsultingChart(data);
}

function removeProfessionalDisclaimer(text) {
  const disclaimer = "esta analise nao substitui a consultoria de um profissional de financas";
  return String(text)
    .split(/\r?\n/)
    .filter((line) => !line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(disclaimer))
    .join("\n")
    .trim();
}

function renderDashboardMetrics(data) {
  dashboardIncome.textContent = currencyFormatter.format(data.income);
  dashboardExpenses.textContent = currencyFormatter.format(data.totalExpenses);
  dashboardBalance.textContent = currencyFormatter.format(data.monthlyBalance);
  dashboardRate.textContent = `${data.spendingRate.toFixed(1)}%`;
  dashboardBalance.classList.toggle("negative", data.monthlyBalance < 0);
}

function transactionMonth(transaction) {
  if (transaction.statementMonth) return transaction.statementMonth;
  const [day, month, year] = String(transaction.date || "").split("/").map(Number);
  if (!day || !month || !year) return "";
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthLabel(monthKey) {
  if (!monthKey) return "";
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}

function categoryColor(name, index = 0) {
  const saved = savedCategories.find((item) => item.name === name);
  const fallback = ["#6d5dfc", "#00a878", "#7b61ff", "#ef3e8b", "#0ea5e9", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#f97316"];
  return saved?.color || fallback[index % fallback.length];
}

function setupChartCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const parentWidth = consultingChart.parentElement?.clientWidth || 640;
  const width = consultingChart.clientWidth || parentWidth;
  const height = 420;
  consultingChart.width = width * ratio;
  consultingChart.height = height * ratio;
  consultingChart.style.height = `${height}px`;
  const context = consultingChart.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.font = "12px Arial";
  context.lineCap = "round";
  context.lineJoin = "round";
  return { context, width, height };
}

function niceMax(value) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(value, 1)));
  return Math.ceil(value / magnitude * 1.15) * magnitude;
}

function drawChartGrid(context, bounds, max) {
  const { left, right, top, areaH, width } = bounds;
  context.strokeStyle = "#e8e3d8";
  context.fillStyle = "#607169";
  context.lineWidth = 1;
  context.setLineDash([4, 5]);
  context.textAlign = "right";
  for (let index = 0; index <= 4; index += 1) {
    const value = max - max * index / 4;
    const y = top + areaH * index / 4;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(width - right, y);
    context.stroke();
    context.fillText(currencyFormatter.format(value), left - 10, y + 4);
  }
  context.setLineDash([]);
  context.strokeStyle = "#d8d2c4";
  context.beginPath();
  context.moveTo(left, top + areaH);
  context.lineTo(width - right, top + areaH);
  context.stroke();
}

function drawSmoothLine(context, points) {
  if (!points.length) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  if (points.length === 1) context.lineTo(points[0].x + 0.01, points[0].y);
  else {
    for (let index = 0; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      const midX = (current.x + next.x) / 2;
      context.bezierCurveTo(midX, current.y, midX, next.y, next.x, next.y);
    }
  }
  context.stroke();
}

function renderLegend(series) {
  chartLegend.innerHTML = "";
  series.forEach((item) => {
    const label = document.createElement("span");
    label.innerHTML = `<i style="background:${item.color}"></i>${item.name}`;
    chartLegend.appendChild(label);
  });
}

function renderLineChart(series, months) {
  const { context, width, height } = setupChartCanvas();
  const bounds = { left: 74, right: 30, top: 30, areaH: 332, width };
  const areaW = Math.max(width - bounds.left - bounds.right, 1);
  const max = niceMax(Math.max(...series.flatMap((item) => item.values), 1));
  drawChartGrid(context, bounds, max);

  series.forEach((item) => {
    const points = item.values.map((value, index) => ({
      x: bounds.left + (months.length === 1 ? areaW / 2 : index * areaW / (months.length - 1)),
      y: bounds.top + bounds.areaH - value / max * bounds.areaH,
    }));
    context.strokeStyle = item.color;
    context.lineWidth = 3;
    drawSmoothLine(context, points);
    points.forEach((point) => {
      context.beginPath();
      context.fillStyle = "#fffdf8";
      context.strokeStyle = item.color;
      context.lineWidth = 2;
      context.arc(point.x, point.y, 4, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    });
  });

  months.forEach((month, index) => {
    const x = bounds.left + (months.length === 1 ? areaW / 2 : index * areaW / (months.length - 1));
    context.fillStyle = "#607169";
    context.textAlign = "center";
    context.fillText(monthLabel(month), x, height - 20);
  });
  renderLegend(series);
}

function renderBarChart(expenses) {
  const { context, width, height } = setupChartCanvas();
  const bounds = { left: 74, right: 30, top: 30, areaH: 332, width };
  const areaW = Math.max(width - bounds.left - bounds.right, 1);
  const items = expenses.filter((item) => item.value > 0).slice(0, 10).map((item, index) => ({ ...item, name: item.category, color: categoryColor(item.category, index) }));
  const max = niceMax(Math.max(...items.map((item) => item.value), 1));
  drawChartGrid(context, bounds, max);

  const gap = Math.max(12, Math.min(22, areaW / Math.max(items.length, 1) * .16));
  const barW = Math.max(20, (areaW - gap * Math.max(items.length - 1, 0)) / Math.max(items.length, 1));
  items.forEach((item, index) => {
    const h = item.value / max * bounds.areaH;
    const x = bounds.left + index * (barW + gap);
    const y = bounds.top + bounds.areaH - h;
    context.fillStyle = item.color;
    context.beginPath();
    context.roundRect(x, y, barW, h, 8);
    context.fill();
    context.fillStyle = "#607169";
    context.textAlign = "center";
    context.fillText(item.name.length > 10 ? `${item.name.slice(0, 9)}...` : item.name, x + barW / 2, height - 20);
  });
  renderLegend(items);
}

function renderConsultingChart(financialData) {
  if (!consultingChart) return;
  const expenseTransactions = savedTransactions.filter((item) => item.type === "expense");
  if (expenseTransactions.length) {
    const months = [...new Set(expenseTransactions.map(transactionMonth).filter(Boolean))].sort();
    const names = [...new Set(expenseTransactions.map((item) => item.category || "Outros"))];
    const series = names.map((name, index) => {
      const values = months.map((month) => expenseTransactions
        .filter((item) => (item.category || "Outros") === name && transactionMonth(item) === month)
        .reduce((sum, item) => sum + Number(item.amount), 0));
      return { name, color: categoryColor(name, index), values, total: values.reduce((sum, value) => sum + value, 0) };
    }).filter((item) => item.total > 0).sort((first, second) => second.total - first.total).slice(0, 10);
    chartHint.textContent = `Calculado com ${months.length} mes${months.length === 1 ? "" : "es"} importado${months.length === 1 ? "" : "s"}.`;
    renderLineChart(series, months);
    return;
  }

  chartHint.textContent = "Grafico gerado a partir dos gastos preenchidos no formulario.";
  renderBarChart(financialData.expenses);
}

function appendInlineText(parent, text) {
  const parts = normalizeAnswerText(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  parts.forEach((part) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = part.slice(2, -2);
      parent.appendChild(strong);
      return;
    }
    parent.append(document.createTextNode(part));
  });
}

function normalizeAnswerText(text) {
  return String(text).replace(/([0-9])\ufe0f?\u20e3/g, "$1");
}

function normalizeColumnKey(text) {
  return normalizeAnswerText(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function createAnswerSection(title) {
  const section = document.createElement("section");
  section.className = "answer-section";
  const heading = document.createElement("h3");
  const cleanTitle = title.replace(/^#+\s*/, "").replace(/^\*\*|\*\*$/g, "").replace(/:$/, "");
  heading.textContent = cleanTitle;
  section.dataset.title = cleanTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  section.appendChild(heading);
  answer.appendChild(section);
  return section;
}

function ensureAnswerSection(currentSection) {
  return currentSection || createAnswerSection("Analise financeira");
}

function appendParagraph(section, text) {
  const paragraph = document.createElement("p");
  appendInlineText(paragraph, cleanAnswerLine(text));
  section.appendChild(paragraph);
}

function cleanAnswerLine(line) {
  return line
    .replace(/^>\s*/, "")
    .replace(/^[-–—]{2,}$/, "")
    .trim();
}

function isActionSection(section) {
  const title = section?.dataset.title || "";
  return title.includes("plano") || title.includes("proximos");
}

function parsePipedActionLine(line) {
  const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()).filter(Boolean);
  if (!/^\d+[.)]?$/.test(cells[0] || "") || cells.length < 2) return null;

  const titleParts = cells[1].split(/\s+-\s+/);
  const details = [titleParts.slice(1).join(" - "), ...cells.slice(2)].join(" ").replace(/^[-–—]\s*/, "").trim();
  return {
    step: cells[0].replace(/[.)]/g, ""),
    title: titleParts[0].replace(/^\*\*|\*\*$/g, "").trim(),
    details,
  };
}

function actionDetailParts(line) {
  const cleanLine = line.replace(/^[-*]\s*/, "").replace(/^\|/, "").replace(/\|$/, "").trim();
  const cells = cleanLine.split("|").map((cell) => cell.trim()).filter(Boolean);
  return {
    detail: cells[0] || cleanLine,
    meta: cells.slice(1).join(" | "),
  };
}

function appendActionDetail(section, text) {
  const card = section.querySelector(".answer-action-card:last-child");
  if (!card) {
    appendParagraph(section, text);
    return;
  }

  const { detail, meta } = actionDetailParts(text);
  if (detail) {
    const paragraph = document.createElement("p");
    appendInlineText(paragraph, detail);
    card.appendChild(paragraph);
  }
  if (meta) {
    const badge = document.createElement("span");
    badge.className = "answer-action-meta";
    appendInlineText(badge, meta);
    card.appendChild(badge);
  }
}

function appendActionCard(section, action) {
  let list = section.lastElementChild;
  if (!list || !list.classList.contains("answer-action-list")) {
    list = document.createElement("div");
    list.className = "answer-action-list";
    section.appendChild(list);
  }

  const card = document.createElement("article");
  card.className = "answer-action-card";
  const header = document.createElement("div");
  header.className = "answer-action-head";
  const number = document.createElement("span");
  number.className = "answer-action-number";
  number.textContent = action.step;
  const title = document.createElement("h4");
  appendInlineText(title, action.title);
  header.append(number, title);
  card.appendChild(header);
  list.appendChild(card);
  if (action.details) appendActionDetail(section, action.details);
}

function appendListItem(section, text) {
  const match = text.match(/^(\d+)[.)]\s*(.+)$/);
  const shouldUseTable = section.dataset.title?.includes("plano") || section.dataset.title?.includes("proximos");
  if (match && shouldUseTable) {
    appendActionCard(section, { step: match[1], title: match[2], details: "" });
    return;
  }

  let list = section.lastElementChild;
  if (!list || list.tagName !== "OL") {
    list = document.createElement("ol");
    list.className = "answer-list";
    section.appendChild(list);
  }
  const item = document.createElement("li");
  const content = document.createElement("span");
  content.className = "answer-list-content";
  appendInlineText(content, text.replace(/^[-*–—]\s+/, "").replace(/^\d+[.)]\s*/, ""));
  item.appendChild(content);
  list.appendChild(item);
}

function appendStepTableItem(section, step, text) {
  let table = section.lastElementChild;
  if (!table || table.tagName !== "TABLE" || !table.classList.contains("answer-step-table")) {
    table = document.createElement("table");
    table.className = "answer-table answer-step-table";
    appendTableRow(table, ["Etapa", "Acao"], true);
    section.appendChild(table);
  }
  appendTableRow(table, [step, text], false);
}

function appendTableRow(table, cells, isHeader) {
  const tr = document.createElement("tr");
  cells.forEach((cell, index) => {
    const element = document.createElement(isHeader ? "th" : "td");
    const columnKey = isHeader ? normalizeColumnKey(cell) : table.rows[0]?.cells[index]?.dataset.columnKey || "";
    if (isHeader) element.dataset.columnKey = columnKey;
    if (columnKey === "etapa" || columnKey === "item" || (isHeader && columnKey === "classe de investimento")) {
      element.classList.add("answer-table-strong-green");
    }
    appendInlineText(element, String(cell).trim());
    tr.appendChild(element);
  });
  table.appendChild(tr);
}

function normalizeTableRows(rows) {
  const usefulRows = rows
    .map((row) => row.map((cell) => cell.trim()).filter(Boolean))
    .filter((row) => row.length > 1 || !/^\d+[.)]?$/.test(row[0] || ""));
  if (!usefulRows.length) return [];

  const maxColumns = Math.max(...usefulRows.map((row) => row.length));
  const hasHeader = usefulRows[0].some((cell) => /[a-zA-ZÀ-ÿ]/.test(cell)) && !/^\d+[.)]?$/.test(usefulRows[0][0] || "");
  const headersBySize = {
    2: ["Etapa", "Acao"],
    3: ["Item", "Analise", "Recomendacao"],
  };
  const normalizedRows = usefulRows.map((row) => {
    const nextRow = [...row];
    while (nextRow.length < maxColumns) nextRow.push("");
    return nextRow;
  });

  if (hasHeader) return normalizedRows;
  return [headersBySize[maxColumns] || Array.from({ length: maxColumns }, (_, index) => `Coluna ${index + 1}`), ...normalizedRows];
}

function appendTable(section, rows) {
  const normalizedRows = normalizeTableRows(rows);
  if (!normalizedRows.length) return;
  if (isActionSection(section) && normalizedRows.length === 1 && normalizedRows[0][0]?.toLowerCase() === "etapa") return;
  const table = document.createElement("table");
  table.className = "answer-table";
  normalizedRows.forEach((row, index) => appendTableRow(table, row, index === 0));
  section.appendChild(table);
}

function renderAiAnswer(text) {
  answer.innerHTML = "";
  const lines = removeProfessionalDisclaimer(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/\r?\n/)
    .map((line) => normalizeAnswerText(line).trim())
    .filter(Boolean);

  let currentSection = null;
  let tableRows = [];
  const flushTable = () => {
    if (!tableRows.length) return;
    currentSection = ensureAnswerSection(currentSection);
    appendTable(currentSection, tableRows);
    tableRows = [];
  };

  lines.forEach((line) => {
    const cleanLine = line.replace(/^[-–—]{2,}$/, "").trim();
    if (!cleanLine) return;

    const isTitle = /^#{1,3}\s+/.test(cleanLine) || (/^\*\*.+\*\*$/.test(cleanLine) && cleanLine.length < 90);
    if (isTitle) {
      flushTable();
      currentSection = createAnswerSection(cleanLine);
      return;
    }

    currentSection = ensureAnswerSection(currentSection);
    const normalizedLine = cleanAnswerLine(cleanLine);
    const action = isActionSection(currentSection) ? parsePipedActionLine(normalizedLine) : null;
    if (action) {
      flushTable();
      appendActionCard(currentSection, action);
      return;
    }

    if (/^\|.+\|$/.test(cleanLine)) {
      const cells = cleanLine.split("|").map((cell) => cell.trim()).filter(Boolean);
      const isDivider = cells.every((cell) => /^:?-{2,}:?$/.test(cell));
      if (!isDivider && cells.length) tableRows.push(cells);
      return;
    }

    flushTable();
    currentSection = ensureAnswerSection(currentSection);
    if (isActionSection(currentSection) && /^[-*–—]\s+/.test(cleanLine) && currentSection.querySelector(".answer-action-card")) {
      appendActionDetail(currentSection, cleanLine);
      return;
    }
    if (/^[-*–—]\s+/.test(cleanLine) || /^\d+[.)]\s+/.test(cleanLine)) appendListItem(currentSection, cleanLine);
    else appendParagraph(currentSection, cleanLine);
  });

  flushTable();
}

function setLoading(loading) {
  submitButton.disabled = loading;
  submitButton.textContent = loading ? "Consultando a IA..." : "Analisar minhas financas ->";
  if (loading) resultStatus.classList.remove("success", "error");
  resultStatus.textContent = loading ? "Processando" : "Aguardando";
  resultStatus.classList.toggle("loading", loading);
}

async function submitAnalysis(event) {
  event.preventDefault();
  formError.hidden = true;
  answer.hidden = true;

  if (!form.reportValidity()) return;

  const financialData = collectFinancialData();
  if (!financialData.goals.length) {
    formError.textContent = "Selecione pelo menos um objetivo principal.";
    formError.hidden = false;
    goalInputs[0]?.focus();
    return;
  }
  const prompt = buildPrompt(financialData);

  if (prompt.length > 2000) {
    formError.textContent = `O resumo gerado possui ${prompt.length} caracteres. Reduza o objetivo ou a quantidade de categorias.`;
    formError.hidden = false;
    return;
  }

  renderMetrics(financialData);
  setActiveWorkspaceTab("dashboard");
  answerPlaceholder.hidden = true;
  answer.hidden = false;
  answer.textContent = "Consultando a IA...";
  setLoading(true);

  try {
    const response = await fetch("/api/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.erro || "Erro desconhecido.");
    renderAiAnswer(data.resposta);
    resultStatus.textContent = "Analise concluida";
    resultStatus.classList.add("success");
  } catch (error) {
    answer.textContent = error.message || "Erro ao conectar com a API local.";
    resultStatus.textContent = "Erro";
    resultStatus.classList.add("error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Analisar minhas financas ->";
    resultStatus.classList.remove("loading");
  }
}

goalDetailsInput.addEventListener("input", () => {
  document.querySelector("#goalCount").textContent = goalDetailsInput.value.length;
});
consultingTab.addEventListener("click", () => setActiveWorkspaceTab("consulting"));
dashboardTab.addEventListener("click", () => setActiveWorkspaceTab("dashboard"));
addExpenseButton.addEventListener("click", () => {
  addExpenseRow("", 0, { focus: true });
  const financialData = collectFinancialData();
  renderDashboardMetrics(financialData);
  renderConsultingChart(financialData);
});
importSelect.addEventListener("change", () => applyImportedStatement(importSelect.value));
form.addEventListener("input", () => {
  const financialData = collectFinancialData();
  renderDashboardMetrics(financialData);
  if (!dashboardPanel.hidden) renderConsultingChart(financialData);
});
form.addEventListener("submit", submitAnalysis);
loadImportedStatements();
