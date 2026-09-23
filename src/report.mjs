function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const labels = {
  unit_added: "Новое подразделение",
  unit_removed: "Упразднение",
  unit_transformed: "Преобразование подразделения",
  function_lost: "Потеря функции",
  function_added: "Новая функция",
  function_moved: "Перенос функции",
  function_changed: "Изменение функции",
  function_narrowed: "Сужение функции",
  function_duplicate: "Дублирование",
  conflict_risk: "Конфликт интересов"
};
const severityLabels = { high: "критично", medium: "средне", low: "низко", info: "информация" };
const reviewLabels = { pending: "не проверено", approved: "подтверждено экспертом", rejected: "отклонено экспертом" };
const unitLabels = { kept: "Сохранено", transformed: "Преобразовано", added: "Создано", removed: "Упразднено" };
const mapLabels = { kept: "Сохранена", changed: "Изменена", narrowed: "Сужена", moved: "Перенесена", lost: "Потеряна", added: "Новая" };

function conclusion(record) {
  const s = record.summary;
  const parts = [
    `Сравнены документы «${record.documents.before.name}» и «${record.documents.after.name}».`,
    `Подразделений: ${s.unitsBefore} → ${s.unitsAfter} (создано ${s.addedUnits}, упразднено подразделений и позиций ${s.removedUnits}, преобразовано ${s.transformedUnits || 0}, сохранено ${s.keptUnits || 0}).`,
    `Функций: ${record.metrics?.functionsBefore ?? "—"} → ${record.metrics?.functionsAfter ?? "—"}.`
  ];
  const risks = [];
  if (s.lostFunctions) risks.push(`${s.lostFunctions} возможных потерь функций`);
  if (s.narrowedFunctions) risks.push(`${s.narrowedFunctions} сужений функций`);
  if (s.duplicates) risks.push(`${s.duplicates} возможных дублирований`);
  if (s.conflicts) risks.push(`${s.conflicts} потенциальных конфликтов полномочий`);
  parts.push(risks.length ? `Требуют внимания: ${risks.join(", ")}.` : "Существенных рисков не выявлено.");
  return parts.join(" ");
}

function side(item) {
  if (!item) return "—";
  return `<b>п. ${escapeHtml(item.clause)}</b>${item.unit && item.unit !== "Общие функции" ? ` · ${escapeHtml(item.unit)}` : ""}<br>${escapeHtml(item.text)}`;
}

export function renderReport(record) {
  const reviewed = record.findings.filter((finding) => finding.status !== "pending").length;
  const cards = record.findings.map((finding, index) => `
    <article class="finding">
      <header><strong>${index + 1}. ${escapeHtml(labels[finding.type] || finding.type)}</strong><span>${escapeHtml(severityLabels[finding.severity] || finding.severity)} · уверенность ${finding.confidence}%</span></header>
      <h3>${escapeHtml(finding.title)}</h3>
      <p>${escapeHtml(finding.explanation)}</p>
      ${finding.evidence.map((item) => `<blockquote><b>${item.side === "before" ? "ДО" : "ПОСЛЕ"} · ${escapeHtml(item.document)}, пункт ${escapeHtml(item.clause)}</b><br>${escapeHtml(item.snippet)}</blockquote>`).join("")}
      <p><b>Рекомендация:</b> ${escapeHtml(finding.recommendation)}</p>
      <p><b>Статус:</b> ${escapeHtml(reviewLabels[finding.status] || finding.status)}${finding.reviewedBy ? ` · эксперт: ${escapeHtml(finding.reviewedBy.name)}` : ""}${finding.comment ? ` — ${escapeHtml(finding.comment)}` : ""}</p>
    </article>`).join("");

  const units = (record.units || []).map((unit) => `<tr><td>${unitLabels[unit.status]}</td><td>${escapeHtml(unit.before || "—")}</td><td>${escapeHtml(unit.after || "—")}</td></tr>`).join("");
  const mapRows = (record.functionMap || []).filter((row) => row.status !== "kept").map((row) => `<tr><td>${mapLabels[row.status]}</td><td>${side(row.before)}</td><td>${side(row.after)}</td><td>${row.score ? `${row.score}%` : "—"}</td></tr>`).join("");
  const keptCount = (record.functionMap || []).filter((row) => row.status === "kept").length;

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(record.name)} — заключение БАТЫС AI</title><style>
    body{font:14px/1.5 Arial,sans-serif;color:#17202a;max-width:1000px;margin:40px auto;padding:0 24px}h1{font-size:28px;margin-bottom:4px}h2{margin-top:34px}.meta{color:#64748b}.lead{background:#f3f7fb;border-radius:12px;padding:16px 18px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metric{padding:14px;border:1px solid #dbe4ee;border-radius:12px}.metric b{display:block;font-size:24px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #e2e8f0;padding:8px;text-align:left;vertical-align:top}th{background:#f6f8fb}.finding{page-break-inside:avoid;border-top:2px solid #dbe4ee;padding:20px 0}.finding header{display:flex;justify-content:space-between;color:#475569;gap:12px}.finding h3{margin:8px 0}blockquote{background:#f3f7fb;border-left:4px solid #4f46e5;padding:12px;margin:10px 0}@media print{body{margin:0}.finding,tr{break-inside:avoid}}@media(max-width:700px){.summary{grid-template-columns:repeat(2,1fr)}}
  </style></head><body>
    <p class="meta">БАТЫС AI · аналитическое заключение</p>
    <h1>${escapeHtml(record.name)}</h1>
    <p class="meta">Сформировано: ${escapeHtml(new Date(record.createdAt).toLocaleString("ru-RU"))} · Движок: ${record.engine.mode === "local+openai" ? `локальный анализ + OpenAI ${escapeHtml(record.engine.model)}` : "объяснимый локальный анализ"} · Проверено экспертом: ${reviewed} из ${record.findings.length}</p>
    <h2>Итог</h2><p class="lead">${escapeHtml(conclusion(record))}</p>
    <section class="summary">
      <div class="metric"><b>${record.summary.lostFunctions}</b>потери функций</div>
      <div class="metric"><b>${record.summary.narrowedFunctions || 0}</b>сужения</div>
      <div class="metric"><b>${record.summary.duplicates}</b>дублирования</div>
      <div class="metric"><b>${record.summary.conflicts}</b>конфликты</div>
    </section>
    <h2>Подразделения</h2>${units ? `<table><thead><tr><th>Статус</th><th>До</th><th>После</th></tr></thead><tbody>${units}</tbody></table>` : "<p>Раздел структуры не распознан.</p>"}
    <h2>Сопоставление функций</h2><p class="meta">Показаны изменившиеся функции; без изменений сохранено ещё ${keptCount}.</p>
    ${mapRows ? `<table><thead><tr><th>Статус</th><th>До</th><th>После</th><th>Сходство</th></tr></thead><tbody>${mapRows}</tbody></table>` : "<p>Изменений в функциях не обнаружено.</p>"}
    <h2>Выводы и доказательства</h2>${cards || "<p>Существенные отклонения не обнаружены.</p>"}
    <p class="meta">Выводы носят рекомендательный характер и требуют проверки ответственным сотрудником. Каждый вывод подтверждён цитатой из исходного документа.</p>
  </body></html>`;
}
