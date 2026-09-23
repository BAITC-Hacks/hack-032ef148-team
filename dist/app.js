const STORAGE_KEY = "taskforge-ai-v1";

const scoreRules = [
  { label: "Контекст и потребность", weight: 20, keys: ["context", "need"], tip: "Опишите текущую ситуацию и необходимое изменение" },
  { label: "Данные и материалы", weight: 20, keys: ["data"], tip: "Укажите доступные данные, примеры или источники" },
  { label: "Ожидаемый результат", weight: 15, keys: ["result"], tip: "Опишите конкретный результат работы команды" },
  { label: "Критерии успеха", weight: 15, keys: ["success"], tip: "Добавьте измеримые признаки успешного решения" },
  { label: "Ограничения", weight: 10, keys: ["constraints"], tip: "Укажите сроки, технологии, доступы и другие границы" },
  { label: "Пользователи", weight: 10, keys: ["users"], tip: "Уточните, для кого создаётся решение" },
  { label: "Связь с бизнесом", weight: 10, keys: ["contact", "interaction"], tip: "Добавьте контакт и формат обратной связи" },
];

const fieldDefinitions = [
  { key: "title", label: "Название задачи", type: "input", wide: true },
  { key: "topic", label: "Тема", type: "select", options: ["Образование", "Ритейл", "Логистика", "Экология", "Финансы", "Другое"] },
  { key: "users", label: "Пользователи", type: "input" },
  { key: "context", label: "Контекст", type: "textarea", wide: true },
  { key: "need", label: "Потребность", type: "textarea", wide: true },
  { key: "data", label: "Данные и материалы", type: "textarea", wide: true },
  { key: "constraints", label: "Ограничения", type: "textarea", wide: true },
  { key: "result", label: "Ожидаемый результат", type: "textarea", wide: true },
  { key: "success", label: "Критерии успеха", type: "textarea", wide: true },
  { key: "contact", label: "Контакт", type: "input" },
  { key: "interaction", label: "Формат взаимодействия", type: "input" },
];

const teams = [
  { id: "team-batys", name: "БАТЫС", interests: "AI, EdTech", skills: "JavaScript, UX, OpenAI" },
  { id: "team-orbit", name: "Orbit Lab", interests: "Логистика, данные", skills: "Python, аналитика, карты" },
  { id: "team-qadam", name: "Qadam", interests: "Образование", skills: "React, дизайн, исследования" },
  { id: "team-green", name: "GreenByte", interests: "Экология", skills: "IoT, ML, визуализация" },
  { id: "team-nomad", name: "Nomad Stack", interests: "Ритейл, финансы", skills: "Node.js, BI, мобильная разработка" },
];

const seedTasks = [
  {
    id: "task-1", title: "Снизить потери заявок на образовательные программы", topic: "Образование",
    context: "Учебный центр получает заявки из сайта, мессенджеров и социальных сетей, но часть обращений теряется при ручной обработке.",
    need: "Нужно объединить заявки и показать менеджеру, какие обращения требуют ответа.", users: "Менеджеры приёмной комиссии и абитуриенты",
    data: "Обезличенный CSV из 500 заявок, статусы и время первого ответа.", constraints: "MVP за 2 недели, без хранения персональных данных.",
    result: "Прототип единой очереди заявок с приоритетами.", success: "Не менее 90% тестовых заявок отображаются с корректным статусом; время поиска заявки до 30 секунд.",
    contact: "Айдана, руководитель приёмной комиссии", interaction: "Две консультации в неделю по 30 минут", confirmed: true, createdAt: "2026-09-18T09:00:00Z"
  },
  {
    id: "task-2", title: "Оптимизировать маршруты курьерской доставки", topic: "Логистика",
    context: "Курьеры малого магазина ежедневно планируют маршруты вручную, из-за чего последние заказы часто опаздывают.",
    need: "Нужен инструмент для группировки адресов и понятного порядка доставки.", users: "Диспетчер и 12 курьеров",
    data: "История 1 200 обезличенных доставок и координаты районов.", constraints: "Использовать открытые карты; расчёт должен занимать менее минуты.",
    result: "Интерактивный прототип планировщика маршрута.", success: "Сократить расчётный путь минимум на 10% на контрольной выборке.",
    contact: "Тимур, операционный менеджер", interaction: "Созвон по понедельникам и ответы в чате", confirmed: true, createdAt: "2026-09-19T11:00:00Z"
  },
  {
    id: "task-3", title: "Панель контроля заполненности контейнеров", topic: "Экология",
    context: "Оператор вывозит вторсырьё по фиксированному графику, хотя контейнеры заполняются неравномерно.",
    need: "Показать приоритетные точки вывоза на карте.", users: "Диспетчеры службы вывоза",
    data: "Таблица замеров заполненности за три месяца.", constraints: "Только веб-прототип.",
    result: "Панель с картой и списком приоритетных точек.", success: "",
    contact: "Менеджер пилота", interaction: "Одна консультация в неделю", confirmed: true, createdAt: "2026-09-20T10:00:00Z"
  },
  {
    id: "task-4", title: "Помочь покупателям находить товары в магазине", topic: "Ритейл",
    context: "Посетители часто спрашивают сотрудников, где находится нужный товар.",
    need: "Упростить поиск товарной категории в торговом зале.", users: "Покупатели супермаркета",
    data: "", constraints: "",
    result: "Прототип поиска отдела по названию товара.", success: "",
    contact: "Администратор магазина", interaction: "", confirmed: true, createdAt: "2026-09-20T14:00:00Z"
  },
  {
    id: "task-5", title: "Разобраться с расходами малого бизнеса", topic: "Финансы",
    context: "Владелец хочет лучше видеть расходы компании.",
    need: "Нужен удобный обзор расходов.", users: "",
    data: "", constraints: "",
    result: "", success: "",
    contact: "", interaction: "", confirmed: true, createdAt: "2026-09-21T08:00:00Z"
  },
];

const seedOffers = [
  { id: "offer-1", taskId: "task-1", teamId: "team-qadam", idea: "Единая очередь заявок с подсветкой просроченного ответа.", plan: "Импорт CSV, нормализация статусов, экран очереди, проверка на тестовой выборке.", time: "10 дней", link: "https://example.com/qadam-demo", status: "pending" },
  { id: "offer-2", taskId: "task-1", teamId: "team-batys", idea: "AI-сводка заявки и приоритет на основе времени ожидания.", plan: "Исследование процесса, прототип, тест импорта, пользовательская проверка.", time: "2 недели", link: "https://example.com/batys-demo", status: "pending" },
  { id: "offer-3", taskId: "task-2", teamId: "team-orbit", idea: "Кластеризация адресов и построение короткой последовательности точек.", plan: "Очистка данных, базовый алгоритм, карта, сравнение маршрутов.", time: "12 дней", link: "https://example.com/orbit-demo", status: "accepted" },
  { id: "offer-4", taskId: "task-3", teamId: "team-green", idea: "Карта заполненности с прогнозом следующего вывоза.", plan: "Анализ таблицы, уровни риска, карта, проверка на исторических данных.", time: "2 недели", link: "https://example.com/green-demo", status: "pending" },
  { id: "offer-5", taskId: "task-4", teamId: "team-nomad", idea: "Поиск категории и простая схема торгового зала.", plan: "Справочник категорий, макет карты, поиск, тест с пятью сценариями.", time: "7 дней", link: "https://example.com/nomad-demo", status: "rejected" },
];

const clone = (value) => JSON.parse(JSON.stringify(value));
const initialState = { tasks: clone(seedTasks), offers: clone(seedOffers), draftCard: {} };
let state = loadState();
let currentQuestions = [];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.tasks && saved?.offers) return saved;
  } catch (_) {}
  return clone(initialState);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateCounts();
}

function isFilled(value) {
  return typeof value === "string" && value.trim().length >= 3;
}

function calculateScore(card) {
  const breakdown = scoreRules.map((rule) => {
    const complete = rule.keys.every((key) => isFilled(card[key]));
    return { ...rule, earned: complete ? rule.weight : 0, complete };
  });
  return { score: breakdown.reduce((sum, item) => sum + item.earned, 0), breakdown };
}

function getLevel(score) {
  if (score >= 90) return { key: "priority", label: "Приоритетная", color: "#c9ff5a" };
  if (score >= 70) return { key: "ready", label: "Готовая", color: "#4fe3c1" };
  if (score >= 40) return { key: "working", label: "Рабочая", color: "#67a4ff" };
  return { key: "draft", label: "Черновик", color: "#ffb454" };
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function navigate(viewName) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `${viewName}-view`));
  document.querySelectorAll(".nav-btn").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  if (viewName === "catalog") renderCatalog();
  if (viewName === "offers") renderOffersWorkspace();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setStep(step) {
  document.querySelectorAll(".steps li").forEach((item, index) => {
    item.classList.toggle("active", index === step - 1);
    item.classList.toggle("done", index < step - 1);
  });
}

function toast(message) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 3200);
}

function updateCounts() {
  document.getElementById("task-count").textContent = state.tasks.length;
  document.getElementById("offer-count").textContent = state.offers.length;
}

function buildQuestions(description) {
  const short = description.trim();
  return [
    { key: "title", prompt: "Как коротко назвать эту задачу?", help: "До 8–10 слов, без рекламных формулировок." },
    { key: "users", prompt: "Кто столкнулся с этой проблемой и будет пользоваться результатом?", help: "Укажите конкретную группу пользователей." },
    { key: "data", prompt: "Какие данные, примеры или материалы вы готовы предоставить?", help: "Можно указать формат и примерный объём." },
    { key: "result", prompt: "Какой конкретный результат должна создать команда?", help: "Например: прототип, панель, модель или исследование." },
    { key: "success", prompt: "По каким измеримым признакам вы поймёте, что решение успешно?", help: "Добавьте число, срок или проверяемое условие." },
    { key: "constraints", prompt: "Какие сроки, технологии, доступы или ограничения важно учесть?", help: "Если ограничений нет, так и напишите." },
    { key: "contactInteraction", prompt: "Кто будет контактным лицом и как часто команда сможет получать обратную связь?", help: "Без личных чувствительных данных." },
  ].map((question, index) => ({ ...question, id: `q-${index + 1}`, sourcePreview: short.slice(0, 80) }));
}

function renderQuestions(questions) {
  const container = document.getElementById("questions");
  container.innerHTML = questions.map((question, index) => `
    <div class="question">
      <label for="answer-${question.key}">${index + 1}. ${escapeHtml(question.prompt)}</label>
      <small>${escapeHtml(question.help)}</small>
      <textarea id="answer-${question.key}" data-answer="${question.key}" rows="2" placeholder="Ваш ответ"></textarea>
    </div>
  `).join("");
}

function renderCardFields(card) {
  const container = document.getElementById("card-fields");
  container.innerHTML = fieldDefinitions.map((field) => {
    const value = escapeHtml(card[field.key] || "");
    const className = field.wide ? "wide" : "";
    if (field.type === "textarea") {
      return `<label class="${className}">${field.label}<textarea data-card-field="${field.key}" rows="3">${value}</textarea></label>`;
    }
    if (field.type === "select") {
      return `<label class="${className}">${field.label}<select data-card-field="${field.key}">${field.options.map((option) => `<option ${option === card[field.key] ? "selected" : ""}>${option}</option>`).join("")}</select></label>`;
    }
    return `<label class="${className}">${field.label}<input data-card-field="${field.key}" value="${value}" /></label>`;
  }).join("");
  container.querySelectorAll("[data-card-field]").forEach((element) => {
    element.addEventListener("input", () => {
      state.draftCard[element.dataset.cardField] = element.value;
      updateScore(state.draftCard, false);
    });
  });
  updateScore(card, false);
}

function updateScore(card, confirmed) {
  const { score, breakdown } = calculateScore(card || {});
  const level = getLevel(score);
  document.getElementById("score-value").textContent = score;
  document.getElementById("score-ring").style.setProperty("--score", score);
  const levelElement = document.getElementById("score-level");
  levelElement.textContent = level.label;
  levelElement.className = `level ${level.key}`;
  document.getElementById("score-label").textContent = confirmed ? "Подтверждённый рейтинг" : "Предварительная оценка";
  document.getElementById("score-breakdown").innerHTML = breakdown.map((item) => `
    <div class="score-row"><span>${item.label}</span><strong>${item.earned}/${item.weight}</strong><div class="bar"><span style="width:${item.complete ? 100 : 0}%"></span></div></div>
  `).join("");
  const missing = breakdown.filter((item) => !item.complete);
  document.getElementById("missing-list").innerHTML = missing.length
    ? missing.map((item) => `<li>${escapeHtml(item.tip)} (+${item.weight})</li>`).join("")
    : "<li>Карточка содержит все сведения для старта работы</li>";
  return score;
}

async function handleAnalyze() {
  const description = document.getElementById("draft").value.trim();
  const error = document.getElementById("draft-error");
  const button = document.getElementById("analyze");
  if (description.length < 12) {
    error.textContent = "Добавьте хотя бы одно содержательное предложение (минимум 12 символов).";
    return;
  }
  error.textContent = "";
  button.disabled = true;
  button.textContent = "Анализируем…";
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, industry: document.getElementById("industry").value }),
    });
    if (!response.ok) throw new Error("AI API недоступен");
    const result = await response.json();
    if (!Array.isArray(result.questions) || result.questions.length < 3) throw new Error("Некорректный ответ AI");
    currentQuestions = result.questions;
    document.getElementById("ai-mode").textContent = "AI · OpenAI";
  } catch (_) {
    currentQuestions = buildQuestions(description);
    document.getElementById("ai-mode").textContent = "AI · локальный режим";
  } finally {
    button.disabled = false;
    button.innerHTML = "Проанализировать с AI <span aria-hidden=\"true\">↗</span>";
  }
  renderQuestions(currentQuestions);
  document.getElementById("questions-panel").classList.remove("hidden");
  setStep(2);
  document.getElementById("questions-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function handleBuildCard() {
  const answers = {};
  document.querySelectorAll("[data-answer]").forEach((element) => { answers[element.dataset.answer] = element.value.trim(); });
  const answeredCount = Object.values(answers).filter(isFilled).length;
  const error = document.getElementById("questions-error");
  if (answeredCount < 3) {
    error.textContent = "Ответьте минимум на три вопроса, чтобы сформировать полезную карточку.";
    return;
  }
  error.textContent = "";
  const draft = document.getElementById("draft").value.trim();
  const contactParts = (answers.contactInteraction || "").split(/[,;]| и формат |, формат /i).map((part) => part.trim()).filter(Boolean);
  state.draftCard = {
    title: answers.title || "Новая бизнес-задача",
    topic: document.getElementById("industry").value,
    context: draft,
    need: draft,
    users: answers.users || "",
    data: answers.data || "",
    constraints: answers.constraints || "",
    result: answers.result || "",
    success: answers.success || "",
    contact: contactParts[0] || "",
    interaction: contactParts.slice(1).join(", ") || answers.contactInteraction || "",
    confirmed: false,
  };
  renderCardFields(state.draftCard);
  document.getElementById("card-panel").classList.remove("hidden");
  setStep(3);
  saveState();
  document.getElementById("card-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function handlePublish() {
  const error = document.getElementById("publish-error");
  if (!document.getElementById("human-confirm").checked) {
    error.textContent = "Подтвердите, что вы проверили карточку перед публикацией.";
    return;
  }
  if (!isFilled(state.draftCard.title) || !isFilled(state.draftCard.context)) {
    error.textContent = "У карточки должны быть название и контекст.";
    return;
  }
  error.textContent = "";
  const score = calculateScore(state.draftCard).score;
  const task = { ...state.draftCard, id: `task-${Date.now()}`, confirmed: true, score, createdAt: new Date().toISOString() };
  state.tasks.unshift(task);
  state.draftCard = {};
  saveState();
  updateScore(task, true);
  setStep(4);
  populateSelects();
  toast(`Задача опубликована. Рейтинг: ${score}/100`);
  setTimeout(() => navigate("catalog"), 700);
}

function renderCatalog() {
  const topic = document.getElementById("topic-filter").value;
  const level = document.getElementById("level-filter").value;
  const tasks = state.tasks
    .map((task) => ({ ...task, computedScore: calculateScore(task).score }))
    .filter((task) => topic === "all" || task.topic === topic)
    .filter((task) => level === "all" || getLevel(task.computedScore).key === level)
    .sort((a, b) => b.computedScore - a.computedScore);
  document.getElementById("catalog-total").textContent = state.tasks.length;
  const grid = document.getElementById("catalog-grid");
  grid.innerHTML = tasks.map((task) => {
    const readiness = getLevel(task.computedScore);
    const offersCount = state.offers.filter((offer) => offer.taskId === task.id).length;
    return `
      <article class="task-card" style="--card-accent:${readiness.color}">
        <div class="task-top">
          <div>
            <div class="task-meta"><span class="chip">${escapeHtml(task.topic)}</span><span class="level ${readiness.key}">${readiness.label}</span></div>
            <h2>${escapeHtml(task.title)}</h2>
          </div>
          <div class="task-score">${task.computedScore}<small>/100</small></div>
        </div>
        <p>${escapeHtml(task.need || task.context)}</p>
        <div class="task-footer"><span>${offersCount} откликов · ${escapeHtml(task.users || "Пользователи уточняются")}</span><button class="button ghost small" data-respond="${task.id}">Откликнуться</button></div>
      </article>`;
  }).join("");
  document.getElementById("catalog-empty").classList.toggle("hidden", tasks.length > 0);
  grid.querySelectorAll("[data-respond]").forEach((button) => button.addEventListener("click", () => {
    navigate("offers");
    document.getElementById("offer-task").value = button.dataset.respond;
    document.getElementById("decision-task").value = button.dataset.respond;
    renderOfferList(button.dataset.respond);
  }));
}

function populateFilters() {
  const topics = [...new Set(state.tasks.map((task) => task.topic))].sort();
  const select = document.getElementById("topic-filter");
  const current = select.value;
  select.innerHTML = `<option value="all">Все темы</option>${topics.map((topic) => `<option>${escapeHtml(topic)}</option>`).join("")}`;
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function populateSelects() {
  populateFilters();
  const taskOptions = state.tasks.map((task) => `<option value="${task.id}">${escapeHtml(task.title)}</option>`).join("");
  document.getElementById("offer-task").innerHTML = taskOptions;
  document.getElementById("decision-task").innerHTML = taskOptions;
  document.getElementById("offer-team").innerHTML = teams.map((team) => `<option value="${team.id}">${escapeHtml(team.name)} — ${escapeHtml(team.skills)}</option>`).join("");
}

function submitOffer(payload) {
  const required = ["taskId", "teamId", "idea", "plan", "time", "link"];
  if (required.some((key) => !isFilled(payload[key]))) throw new Error("Заполните все поля предложения.");
  if (!/^https?:\/\//i.test(payload.link)) throw new Error("Ссылка на прототип должна начинаться с http:// или https://");
  const offer = { ...payload, id: `offer-${Date.now()}`, status: "pending" };
  state.offers.unshift(offer);
  saveState();
  return offer;
}

function handleSubmitOffer() {
  const error = document.getElementById("offer-error");
  try {
    const offer = submitOffer({
      taskId: document.getElementById("offer-task").value,
      teamId: document.getElementById("offer-team").value,
      idea: document.getElementById("offer-idea").value.trim(),
      plan: document.getElementById("offer-plan").value.trim(),
      time: document.getElementById("offer-time").value.trim(),
      link: document.getElementById("offer-link").value.trim(),
    });
    error.textContent = "";
    document.getElementById("decision-task").value = offer.taskId;
    renderOfferList(offer.taskId);
    ["offer-idea", "offer-plan", "offer-time", "offer-link"].forEach((id) => { document.getElementById(id).value = ""; });
    toast("Отклик отправлен. Решение остаётся за бизнесом.");
  } catch (exception) {
    error.textContent = exception.message;
  }
}

function renderOffersWorkspace() {
  populateSelects();
  const taskId = document.getElementById("decision-task").value || state.tasks[0]?.id;
  if (taskId) renderOfferList(taskId);
}

function renderOfferList(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  document.getElementById("decision-task-title").textContent = task?.title || "Задача не выбрана";
  const offers = state.offers.filter((offer) => offer.taskId === taskId);
  const list = document.getElementById("offers-list");
  if (!offers.length) {
    list.innerHTML = `<div class="empty">Пока нет предложений. Любая команда может отправить первый отклик.</div>`;
    return;
  }
  list.innerHTML = offers.map((offer) => {
    const team = teams.find((item) => item.id === offer.teamId) || { name: "Команда", skills: "" };
    const statusLabels = { pending: "На рассмотрении", accepted: "Выбрана", rejected: "Отклонена" };
    return `
      <article class="offer-card ${offer.status}">
        <header><div><h3>${escapeHtml(team.name)}</h3><span class="field-hint">${escapeHtml(team.skills)}</span></div><span class="status ${offer.status}">${statusLabels[offer.status]}</span></header>
        <p><strong>Идея:</strong> ${escapeHtml(offer.idea)}</p>
        <p><strong>План:</strong> ${escapeHtml(offer.plan)}</p>
        <div class="offer-meta"><span class="chip">Срок: ${escapeHtml(offer.time)}</span><a class="chip" href="${escapeHtml(offer.link)}" target="_blank" rel="noreferrer">Прототип ↗</a></div>
        <div class="decision-actions"><button class="button accept small" data-decision="accepted" data-offer="${offer.id}">Выбрать</button><button class="button reject small" data-decision="rejected" data-offer="${offer.id}">Отклонить</button><button class="button ghost small" data-decision="pending" data-offer="${offer.id}">Вернуть на рассмотрение</button></div>
      </article>`;
  }).join("");
  list.querySelectorAll("[data-decision]").forEach((button) => button.addEventListener("click", () => {
    const offer = state.offers.find((item) => item.id === button.dataset.offer);
    if (!offer) return;
    offer.status = button.dataset.decision;
    saveState();
    renderOfferList(taskId);
    toast(offer.status === "accepted" ? "Команда выбрана бизнесом" : offer.status === "rejected" ? "Предложение отклонено" : "Предложение возвращено на рассмотрение");
  }));
}

function loadDemo() {
  document.getElementById("industry").value = "Образование";
  document.getElementById("draft").value = "Мы проводим стажировки, но студенты часто не понимают, какие задания им подходят, и пропускают сроки подачи заявок.";
  document.getElementById("draft").dispatchEvent(new Event("input"));
  toast("Слабое описание загружено — запустите AI-анализ");
}

function registerWebMcpTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const register = (tool) => Promise.resolve(context.registerTool(tool)).catch(() => {});
  register({
    name: "read_task_catalog",
    title: "Прочитать каталог задач",
    description: "Возвращает опубликованные бизнес-задачи, отсортированные по рейтингу готовности.",
    inputSchema: { type: "object", properties: { topic: { type: "string" } }, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute(input = {}) {
      return state.tasks
        .filter((task) => !input.topic || task.topic === input.topic)
        .map((task) => ({ id: task.id, title: task.title, topic: task.topic, score: calculateScore(task).score, level: getLevel(calculateScore(task).score).label }));
    },
  });
  register({
    name: "start_task_draft",
    title: "Начать черновик бизнес-задачи",
    description: "Открывает конструктор и заполняет исходное описание и отрасль без публикации.",
    inputSchema: { type: "object", properties: { description: { type: "string", minLength: 12 }, industry: { type: "string" } }, required: ["description"], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      if (!isFilled(input?.description) || input.description.trim().length < 12) throw new Error("description must contain at least 12 characters");
      navigate("builder");
      document.getElementById("draft").value = input.description.trim();
      if (input.industry && [...document.getElementById("industry").options].some((option) => option.value === input.industry)) document.getElementById("industry").value = input.industry;
      document.getElementById("draft").dispatchEvent(new Event("input"));
      return { status: "draft_started", descriptionLength: input.description.trim().length };
    },
  });
  register({
    name: "submit_team_proposal",
    title: "Отправить предложение команды",
    description: "Создаёт реальный отклик команды на выбранную опубликованную задачу.",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" }, teamId: { type: "string" }, idea: { type: "string" }, plan: { type: "string" }, time: { type: "string" }, link: { type: "string" } },
      required: ["taskId", "teamId", "idea", "plan", "time", "link"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      if (!state.tasks.some((task) => task.id === input.taskId)) throw new Error("Unknown taskId");
      if (!teams.some((team) => team.id === input.teamId)) throw new Error("Unknown teamId");
      const offer = submitOffer(input);
      navigate("offers");
      document.getElementById("decision-task").value = offer.taskId;
      renderOfferList(offer.taskId);
      return { id: offer.id, status: offer.status, taskId: offer.taskId, teamId: offer.teamId };
    },
  });
}

document.querySelectorAll(".nav-btn").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.view)));
document.getElementById("draft").addEventListener("input", (event) => { document.getElementById("draft-meter").textContent = `${event.target.value.length} символов`; });
document.getElementById("analyze").addEventListener("click", handleAnalyze);
document.getElementById("build-card").addEventListener("click", handleBuildCard);
document.getElementById("recalculate").addEventListener("click", () => { const score = updateScore(state.draftCard, false); toast(`Предварительный рейтинг пересчитан: ${score}/100`); });
document.getElementById("publish").addEventListener("click", handlePublish);
document.getElementById("load-demo").addEventListener("click", loadDemo);
document.getElementById("topic-filter").addEventListener("change", renderCatalog);
document.getElementById("level-filter").addEventListener("change", renderCatalog);
document.getElementById("submit-offer").addEventListener("click", handleSubmitOffer);
document.getElementById("decision-task").addEventListener("change", (event) => renderOfferList(event.target.value));

updateCounts();
populateSelects();
updateScore(state.draftCard || {}, false);
registerWebMcpTools();
