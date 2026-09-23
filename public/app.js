const state = { current: null, filter: "all", mapFilter: "all", reviewFinding: null, installPrompt: null, user: null, authMode: "signin", afterLogin: null };

const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[char]));

const typeLabels = {
  unit_added: "Новое подразделение", unit_removed: "Упразднение", unit_transformed: "Преобразование",
  function_lost: "Потеря функции", function_added: "Новая функция", function_moved: "Перенос функции",
  function_changed: "Изменение функции", function_narrowed: "Сужение функции",
  function_duplicate: "Дублирование", conflict_risk: "Конфликт полномочий"
};
const roleLabels = { expert: "Эксперт", admin: "Администратор" };
const reviewLabels = { pending: "Не проверено", approved: "Подтверждено", rejected: "Отклонено" };
const severityLabels = { high: "Критично", medium: "Средне", low: "Низко", info: "Инфо" };
const unitLabels = { kept: "Сохранено", transformed: "Преобразовано", added: "Создано", removed: "Упразднено" };
const mapLabels = { kept: "Сохранена", changed: "Изменена", narrowed: "Сужена", moved: "Перенесена", lost: "Потеряна", added: "Новая" };

function toast(message) {
  const element = byId("toast");
  element.textContent = message;
  element.classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.add("hidden"), 3200);
}

function showView(name, anchor) {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelectorAll("[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === name));
  byId(`${name}View`).classList.add("active");
  byId("pageTitle").textContent = { upload: "Новое сравнение", results: "Результаты анализа", history: "История", help: "Помощь" }[name];
  if (name === "history") loadHistory();
  if (name === "help") loadConnectInfo();
  if (anchor) byId(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
  else window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view, button.dataset.anchor)));
document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.go)));

for (const side of ["before", "after"]) {
  const input = byId(`${side}File`);
  const drop = byId(`${side}Drop`);
  const name = byId(`${side}Name`);
  input.addEventListener("change", () => {
    name.textContent = input.files[0]?.name || "Файл не выбран";
    drop.classList.toggle("has-file", Boolean(input.files[0]));
  });
  for (const eventName of ["dragenter", "dragover"]) drop.addEventListener(eventName, (event) => { event.preventDefault(); drop.classList.add("dragging"); });
  for (const eventName of ["dragleave", "drop"]) drop.addEventListener(eventName, (event) => { event.preventDefault(); drop.classList.remove("dragging"); });
  drop.addEventListener("drop", (event) => {
    if (!event.dataTransfer.files.length) return;
    const transfer = new DataTransfer();
    transfer.items.add(event.dataTransfer.files[0]);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change"));
  });
}

function metric(label, value, tone = "", hint = "") {
  return `<article class="metric-card ${tone}"><span>${escapeHtml(label)}</span><b>${Number(value || 0)}</b>${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</article>`;
}

function evidenceBlock(item) {
  return `<div class="evidence ${item.side}"><b>${item.side === "before" ? "ДО" : "ПОСЛЕ"} · п. ${escapeHtml(item.clause)} · ${escapeHtml(item.document)}</b>${item.unit && item.unit !== "Общие функции" ? `<small>${escapeHtml(item.unit)}</small>` : ""}<p>${escapeHtml(item.snippet)}</p></div>`;
}

function findingCard(finding) {
  return `<article class="finding-card" data-severity="${escapeHtml(finding.severity)}">
    <span class="severity-bar"></span><div class="finding-main"><header><div><span class="pill">${escapeHtml(typeLabels[finding.type] || finding.type)}</span><h3>${escapeHtml(finding.title)}</h3></div><div class="finding-meta"><span class="severity-tag ${escapeHtml(finding.severity)}">${severityLabels[finding.severity] || ""}</span>${finding.aiReviewed ? `<span class="ai-tag ${finding.aiSupported ? "ok" : "doubt"}">${finding.aiSupported ? "AI подтвердил" : "AI сомневается"}</span>` : ""}<span class="confidence">${finding.confidence}%</span><span class="review-status ${escapeHtml(finding.status)}">${reviewLabels[finding.status] || finding.status}</span></div></header>
    <p>${escapeHtml(finding.explanation)}</p><div class="evidence-grid">${finding.evidence.map(evidenceBlock).join("")}</div><p class="recommendation"><b>Рекомендация:</b> ${escapeHtml(finding.recommendation)}</p>
    ${finding.comment ? `<p class="expert-comment"><b>Комментарий эксперта:</b> ${escapeHtml(finding.comment)}</p>` : ""}
    ${finding.reviewedBy ? `<p class="reviewer">Решение: ${escapeHtml(finding.reviewedBy.name)} · ${new Date(finding.reviewedAt).toLocaleString("ru-RU")}</p>` : ""}
    <div class="finding-actions"><button class="approve" data-review="approved" data-id="${finding.id}">✓ Подтвердить</button><button class="reject" data-review="rejected" data-id="${finding.id}">× Отклонить</button></div></div></article>`;
}

function renderFindings() {
  if (!state.current) return;
  const items = state.current.findings.filter((finding) => state.filter === "all" || finding.severity === state.filter || finding.type === state.filter || finding.status === state.filter);
  byId("findingCount").textContent = `${items.length} из ${state.current.findings.length}`;
  byId("findingList").innerHTML = items.length ? items.map(findingCard).join("") : '<div class="empty-state small"><h2>Нет выводов по фильтру</h2></div>';
}

function renderUnits(record) {
  const units = record.units || [];
  byId("unitGrid").innerHTML = units.length ? units.map((unit) => `<article class="unit-card ${unit.status}">
    <span class="unit-status">${unitLabels[unit.status]}</span>
    <div class="unit-flow"><div><small>ДО</small><b>${escapeHtml(unit.before || "—")}</b></div><span>→</span><div><small>ПОСЛЕ</small><b>${escapeHtml(unit.status === "removed" ? (unit.after ? `функции частично в «${unit.after}»` : "—") : unit.after || "—")}</b></div></div>
    ${unit.functionsTotal ? `<p>${unit.functionsMoved} из ${unit.functionsTotal} функций сохранены за этим подразделением</p>` : ""}
  </article>`).join("") : '<div class="empty-state small"><h2>Подразделения не распознаны</h2><p>Раздел «Структура» в документах не найден.</p></div>';
}

function mapSide(side) {
  if (!side) return '<span class="muted">—</span>';
  return `<b>п. ${escapeHtml(side.clause)}</b>${side.unit !== "Общие функции" ? ` · <span class="muted">${escapeHtml(side.unit)}</span>` : ""}<p>${escapeHtml(side.text)}</p>`;
}

function renderMap() {
  const rows = (state.current?.functionMap || []).filter((row) => state.mapFilter === "all" || row.status === state.mapFilter);
  byId("mapCount").textContent = `${rows.length} из ${state.current?.functionMap?.length || 0}`;
  byId("mapBody").innerHTML = rows.length ? rows.map((row) => `<tr class="${row.status}"><td><span class="map-status ${row.status}">${mapLabels[row.status]}</span></td><td>${mapSide(row.before)}</td><td>${mapSide(row.after)}</td><td class="score">${row.score ? `${row.score}%` : "—"}</td></tr>`).join("") : '<tr><td colspan="4" class="muted">Нет строк по фильтру</td></tr>';
}

function renderProgress(record) {
  const total = record.findings.length;
  const reviewed = record.findings.filter((item) => item.status !== "pending").length;
  const percent = total ? Math.round((reviewed / total) * 100) : 0;
  byId("reviewProgress").innerHTML = `<div><b>Экспертная проверка</b><span>${reviewed} из ${total} выводов · ${percent}%</span></div><div class="progress-track"><span></span></div>`;
  byId("reviewProgress").querySelector(".progress-track span").style.width = `${percent}%`;
}

function renderResult(record) {
  state.current = record;
  byId("emptyResults").classList.add("hidden");
  byId("resultContent").classList.remove("hidden");
  byId("resultName").textContent = record.name;
  byId("resultDocs").textContent = `${record.documents.before.name} → ${record.documents.after.name} · функций: ${record.metrics?.functionsBefore ?? "—"} → ${record.metrics?.functionsAfter ?? "—"}`;
  byId("resultEngine").textContent = record.engine.mode === "local+openai" ? `AI-проверка · ${record.engine.model}` : "Объяснимый локальный анализ";
  byId("reportLink").href = `/api/analyses/${record.id}/report`;
  const s = record.summary;
  byId("metricGrid").innerHTML = [
    metric("Подразделения", s.unitsAfter, "", `создано ${s.addedUnits || 0} · упразднено ${s.removedUnits || 0}`),
    metric("Потери функций", s.lostFunctions, s.lostFunctions ? "high" : "good"),
    metric("Сужения", s.narrowedFunctions, s.narrowedFunctions ? "medium" : "good"),
    metric("Переносы", s.movedFunctions, "medium"),
    metric("Дублирование", s.duplicates, s.duplicates ? "medium" : "good"),
    metric("Конфликты", s.conflicts, s.conflicts ? "high" : "good")
  ].join("");
  byId("engineWarning").textContent = record.engine.warning || "";
  byId("engineWarning").classList.toggle("hidden", !record.engine.warning);
  renderProgress(record);
  renderFindings();
  renderUnits(record);
  renderMap();
}

document.querySelector(".tabs").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-tab]");
  if (!tab) return;
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `${tab.dataset.tab}Panel`));
});

byId("filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter;
  byId("filters").querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
  renderFindings();
});

byId("mapFilters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-map]");
  if (!button) return;
  state.mapFilter = button.dataset.map;
  byId("mapFilters").querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
  renderMap();
});

function openReview(id) {
  state.reviewFinding = { id };
  const finding = state.current.findings.find((item) => item.id === id);
  byId("reviewTitle").textContent = finding.title;
  byId("reviewComment").value = finding.comment || "";
  byId("reviewDialog").showModal();
}

byId("findingList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-review]");
  if (!button) return;
  if (!state.user) {
    state.afterLogin = () => openReview(button.dataset.id);
    return openAuth("signin");
  }
  return openReview(button.dataset.id);
});

byId("reviewDialog").addEventListener("close", async () => {
  if (!["approved", "rejected"].includes(byId("reviewDialog").returnValue) || !state.reviewFinding) return;
  try {
    const response = await fetch(`/api/analyses/${state.current.id}/findings/${state.reviewFinding.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ status: byId("reviewDialog").returnValue, comment: byId("reviewComment").value })
    });
    if (response.status === 401) { setSession(null); state.afterLogin = () => openReview(state.reviewFinding.id); openAuth("signin"); return; }
    if (!response.ok) throw new Error((await response.json()).error);
    renderResult(await response.json());
    toast("Решение эксперта сохранено");
  } catch (error) { toast(error.message || "Не удалось сохранить"); }
});

async function withProgress(request) {
  const overlay = byId("processing");
  const button = byId("analyzeButton");
  const steps = ["Извлекаем структуру и пункты…", "Сопоставляем подразделения…", "Проверяем функции и доказательства…", "Формируем заключение…"];
  let progress = 12;
  let index = 0;
  overlay.classList.remove("hidden"); button.disabled = true;
  const timer = setInterval(() => { index = Math.min(index + 1, steps.length - 1); progress = Math.min(progress + 21, 88); byId("processingText").textContent = steps[index]; byId("progressBar").style.width = `${progress}%`; }, 900);
  try {
    const response = await request();
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Ошибка анализа");
    byId("progressBar").style.width = "100%";
    renderResult(payload); showView("results"); toast("Анализ завершён");
  } catch (error) { toast(error.message || "Не удалось выполнить анализ"); }
  finally { clearInterval(timer); overlay.classList.add("hidden"); button.disabled = false; byId("progressBar").style.width = "12%"; byId("processingText").textContent = steps[0]; }
}

byId("analysisForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  formData.set("useAi", String(byId("useAi").checked));
  withProgress(() => fetch("/api/analyses", { method: "POST", body: formData }));
});

async function loadDemoSets() {
  try {
    const { items } = await (await fetch("/api/demo")).json();
    byId("demoActions").innerHTML = items.map((item, index) => `<button class="${index === 0 ? "demo-button primary" : "demo-button"}" data-demo="${escapeHtml(item.id)}" title="${escapeHtml(item.description)}">${index === 0 ? "▶ " : ""}${escapeHtml(item.name)}</button>`).join("");
  } catch { byId("demoActions").innerHTML = ""; }
}

byId("demoActions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-demo]");
  if (!button) return;
  withProgress(() => fetch(`/api/demo/${button.dataset.demo}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ useAi: byId("useAi").checked }) }));
});

async function loadHistory() {
  try {
    const response = await fetch("/api/analyses");
    const { items } = await response.json();
    byId("historyList").innerHTML = items.length ? items.map((item) => `<article class="history-item" data-analysis="${item.id}"><div><h3>${escapeHtml(item.name)}</h3><p>${new Date(item.createdAt).toLocaleString("ru-RU")} · ${escapeHtml(item.documents.before.name)} → ${escapeHtml(item.documents.after.name)}</p></div><div class="history-stats"><span>${item.summary.total} выводов</span><span>${item.summary.lostFunctions} потерь</span></div></article>`).join("") : '<div class="empty-state small"><h2>История пуста</h2><p>Первый анализ появится здесь.</p></div>';
  } catch { byId("historyList").innerHTML = '<div class="warning">Не удалось загрузить историю.</div>'; }
}

byId("historyList").addEventListener("click", async (event) => {
  const item = event.target.closest("[data-analysis]");
  if (!item) return;
  try { const response = await fetch(`/api/analyses/${item.dataset.analysis}`); renderResult(await response.json()); showView("results"); } catch { toast("Не удалось открыть анализ"); }
});
byId("refreshHistory").addEventListener("click", loadHistory);

// Session: the bearer token lives in localStorage; storage may be unavailable (private mode), so every access is guarded.
function readToken() { try { return localStorage.getItem("batys.token"); } catch { return null; } }
function writeToken(token) { try { if (token) localStorage.setItem("batys.token", token); else localStorage.removeItem("batys.token"); } catch { /* session only */ } }
function authHeaders() { const token = readToken(); return token ? { Authorization: `Bearer ${token}` } : {}; }

function setSession(session) {
  writeToken(session?.token || null);
  state.user = session?.user || null;
  byId("accountLabel").textContent = state.user ? state.user.name : "Войти";
  byId("accountAvatar").textContent = state.user ? state.user.name.trim().slice(0, 1).toUpperCase() : "?";
}

function openAuth(mode) {
  state.authMode = mode;
  const signup = mode === "signup";
  document.querySelectorAll("[data-auth]").forEach((tab) => tab.classList.toggle("active", tab.dataset.auth === mode));
  byId("authNameField").classList.toggle("hidden", !signup);
  byId("authTitle").textContent = signup ? "Регистрация эксперта" : "Войти";
  byId("authSubmit").textContent = signup ? "Зарегистрироваться" : "Войти";
  byId("authPassword").autocomplete = signup ? "new-password" : "current-password";
  byId("authError").classList.add("hidden");
  if (!byId("authDialog").open) byId("authDialog").showModal();
}

document.querySelectorAll("[data-auth]").forEach((tab) => tab.addEventListener("click", () => openAuth(tab.dataset.auth)));
byId("authClose").addEventListener("click", () => { state.afterLogin = null; byId("authDialog").close(); });

byId("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const signup = state.authMode === "signup";
  const body = { email: byId("authEmail").value, password: byId("authPassword").value, ...(signup ? { name: byId("authName").value } : {}) };
  byId("authSubmit").disabled = true;
  try {
    const response = await fetch(`/api/auth/${signup ? "signup" : "signin"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Не удалось войти");
    setSession(payload);
    byId("authPassword").value = "";
    byId("authDialog").close();
    toast(`Вы вошли как ${payload.user.name} · ${roleLabels[payload.user.role]}`);
    const next = state.afterLogin; state.afterLogin = null; next?.();
  } catch (error) {
    byId("authError").textContent = error.message;
    byId("authError").classList.remove("hidden");
  } finally { byId("authSubmit").disabled = false; }
});

byId("accountButton").addEventListener("click", () => {
  if (!state.user) return openAuth("signin");
  byId("accountName").textContent = state.user.name;
  byId("accountEmail").textContent = state.user.email;
  byId("accountRole").textContent = roleLabels[state.user.role];
  return byId("accountDialog").showModal();
});

byId("accountDialog").addEventListener("close", async () => {
  if (byId("accountDialog").returnValue !== "logout") return;
  try { await fetch("/api/auth/logout", { method: "POST", headers: authHeaders() }); } catch { /* token is dropped locally anyway */ }
  setSession(null);
  toast("Вы вышли из системы");
});

async function restoreSession() {
  if (!readToken()) return;
  try {
    const response = await fetch("/api/auth/me", { headers: authHeaders() });
    setSession(response.ok ? { token: readToken(), user: (await response.json()).user } : null);
  } catch { /* offline: keep the token for the next attempt */ }
}

// Address and QR code a phone on the same network can use; on a phone itself the current origin already works.
async function loadConnectInfo() {
  if (loadConnectInfo.done) return;
  try {
    const { webUrls } = await (await fetch("/api/connect")).json();
    const onLan = !["localhost", "127.0.0.1"].includes(location.hostname);
    const url = onLan ? location.origin : webUrls[0];
    byId("lanUrl").textContent = url || "адрес компьютера в сети не найден";
    if (url && webUrls.includes(url)) byId("lanQr").src = `/api/connect/qr.svg?url=${encodeURIComponent(url)}`;
    else byId("lanQr").closest(".mobile-qr").classList.add("hidden");
    loadConnectInfo.done = true;
  } catch { byId("lanUrl").textContent = "не удалось определить адрес"; }
}

async function health() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    byId("engineStatus").textContent = data.aiConfigured ? `OpenAI ${data.model} · ${data.storage}` : `Локальный режим · ${data.storage}`;
    byId("useAi").disabled = !data.aiConfigured;
  } catch { byId("systemStatus").textContent = "Сервер недоступен"; }
}

window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); state.installPrompt = event; byId("installButton").classList.remove("hidden"); });
byId("installButton").addEventListener("click", async () => { await state.installPrompt?.prompt(); state.installPrompt = null; byId("installButton").classList.add("hidden"); });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
health();
loadDemoSets();
restoreSession();
