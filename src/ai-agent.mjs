import { similarity } from "./analyzer.mjs";

// Agentic review: for each significant finding the model investigates the source documents itself
// through tools (search, read a clause) and only then submits a verdict that must cite real clauses.
// Every tool call is recorded, so the expert sees how the agent reached its conclusion.

const severityOrder = { high: 0, medium: 1, low: 2, info: 3 };

const instructions = [
  "Ты — AI-агент эксперта по организационному проектированию и внутреннему аудиту.",
  "Тебе дан один вывод автоматического сравнения двух редакций положения: «до» (before) и «после» (after).",
  "Проверь его по документам: ищи функцию в обеих редакциях инструментом search_document, читай нужные пункты целиком инструментом read_clause.",
  "Отличай перенос или переформулирование функции от её реальной потери. Для потери обязательно поищи функцию в редакции «после» другими словами.",
  "Не добавляй фактов, которых нет в документах. Если доказательств не хватает, supported=false.",
  "Сделай не больше 4 вызовов поиска и чтения, затем обязательно вызови submit_verdict и сошлись на прочитанные пункты.",
  "Пиши на русском языке, кратко и по делу."
].join(" ");

const tools = [
  {
    type: "function",
    function: {
      name: "search_document",
      description: "Найти пункты документа, наиболее близкие по смыслу к запросу. Возвращает номера пунктов и фрагменты.",
      parameters: {
        type: "object",
        properties: {
          side: { type: "string", enum: ["before", "after"], description: "before — прежняя редакция, after — новая" },
          query: { type: "string", description: "Ключевые слова функции или подразделения" }
        },
        required: ["side", "query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_clause",
      description: "Прочитать пункт документа целиком по его номеру, например 4.2 или 5.1.3.",
      parameters: {
        type: "object",
        properties: {
          side: { type: "string", enum: ["before", "after"] },
          clause: { type: "string", description: "Номер пункта" }
        },
        required: ["side", "clause"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "submit_verdict",
      description: "Завершить проверку вывода и вынести вердикт.",
      parameters: {
        type: "object",
        properties: {
          supported: { type: "boolean", description: "Подтверждается ли вывод документами" },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          explanation: { type: "string", description: "Обоснование со ссылками на пункты" },
          recommendation: { type: "string", description: "Что сделать эксперту или разработчику структуры" },
          cited_clauses: {
            type: "array",
            items: {
              type: "object",
              properties: { side: { type: "string", enum: ["before", "after"] }, clause: { type: "string" } },
              required: ["side", "clause"]
            }
          }
        },
        required: ["supported", "confidence", "explanation", "recommendation", "cited_clauses"]
      }
    }
  }
];
const verdictOnly = tools.filter((tool) => tool.function.name === "submit_verdict");

const excerpt = (text, limit) => {
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
};
const clauseKey = (value) => String(value || "").trim().replace(/^п\.?\s*/iu, "").replace(/\.$/, "");

// Numbered clauses of every document on one side; unnumbered lines belong to the clause above them.
export function buildClauseIndex(documents, side) {
  const clauses = [];
  for (const document of documents) {
    let current = null;
    for (const line of document.text.split(/\n+/).map((item) => item.trim()).filter(Boolean)) {
      const number = line.match(/^((?:\d+\.){1,4}\d*)\s+/u)?.[1];
      if (number || !current) {
        current = { side, document: document.name, clause: number ? clauseKey(number) : "—", text: line };
        clauses.push(current);
      } else {
        current.text += `\n${line}`;
      }
    }
  }
  return clauses;
}

function runTool(name, args, index) {
  const side = args.side === "before" ? "before" : "after";
  const clauses = index[side];
  if (name === "search_document") {
    const query = String(args.query || "").slice(0, 300);
    const hits = clauses
      .map((item) => ({ item, score: similarity(query, item.text) }))
      .filter((hit) => hit.score >= 0.08)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return {
      summary: { tool: "search", side, query, found: hits.length, clauses: hits.map((hit) => hit.item.clause) },
      result: hits.length
        ? hits.map((hit) => ({ clause: hit.item.clause, document: hit.item.document, relevance: Math.round(hit.score * 100), excerpt: excerpt(hit.item.text, 320) }))
        : "Ничего похожего не найдено. Попробуй другие слова."
    };
  }
  if (name === "read_clause") {
    const wanted = clauseKey(args.clause);
    const matches = clauses.filter((item) => item.clause === wanted);
    return {
      summary: { tool: "read", side, clause: wanted, found: matches.length },
      result: matches.length
        ? matches.map((item) => ({ clause: item.clause, document: item.document, text: excerpt(item.text, 1500) }))
        : `Пункт ${wanted} в редакции «${side === "before" ? "до" : "после"}» не найден.`
    };
  }
  return { summary: { tool: name, found: 0 }, result: `Неизвестный инструмент ${name}` };
}

async function chat(provider, messages, toolset, fetchImpl) {
  const response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: provider.model, messages, tools: toolset, tool_choice: "auto", ...provider.params }),
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`${provider.name} API: ${response.status} ${details.slice(0, 200)}`);
  }
  const payload = await response.json();
  return payload.choices?.[0]?.message || {};
}

function brief(finding) {
  return JSON.stringify({
    task: "Проверь вывод по документам и вынеси вердикт",
    finding: {
      type: finding.type,
      title: finding.title,
      explanation: finding.explanation,
      evidence: finding.evidence.map((item) => ({ side: item.side, clause: item.clause, unit: item.unit, snippet: item.snippet }))
    }
  });
}

async function investigate(finding, { provider, index, fetchImpl, maxSteps }) {
  const messages = [{ role: "system", content: instructions }, { role: "user", content: brief(finding) }];
  const trace = [];
  for (let step = 0; step < maxSteps; step += 1) {
    const final = step === maxSteps - 1;
    const message = await chat(provider, messages, final ? verdictOnly : tools, fetchImpl);
    const calls = message.tool_calls || [];
    messages.push({ role: "assistant", content: message.content || "", ...(calls.length ? { tool_calls: calls } : {}) });
    if (!calls.length) {
      messages.push({ role: "user", content: "Заверши проверку вызовом submit_verdict." });
      continue;
    }
    for (const call of calls) {
      let args = {};
      try { args = JSON.parse(call.function?.arguments || "{}"); } catch { /* malformed arguments are answered as an empty call */ }
      if (call.function?.name === "submit_verdict") return { verdict: args, trace };
      const { summary, result } = runTool(call.function?.name, args, index);
      trace.push(summary);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { verdict: null, trace };
}

// A citation counts only if that clause really exists on that side: the agent cannot invent evidence.
function verifyCitations(cited, index) {
  return (Array.isArray(cited) ? cited : []).slice(0, 6).map((item) => {
    const side = item?.side === "before" ? "before" : "after";
    const clause = clauseKey(item?.clause);
    return { side, clause, verified: index[side].some((entry) => entry.clause === clause) };
  });
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const current = next++;
      try { results[current] = { value: await worker(items[current]) }; } catch (error) { results[current] = { error }; }
    }
  }));
  return results;
}

export async function reviewWithAgent(result, { before, after }, { provider, fetchImpl = fetch, maxFindings = 12, maxSteps = 6, concurrency = 4 }) {
  if (!provider) return { result, used: false, stats: null, warning: "AI-ключ не настроен — использован локальный анализ." };

  const index = { before: buildClauseIndex(before, "before"), after: buildClauseIndex(after, "after") };
  const candidates = result.findings
    .filter((finding) => finding.severity !== "info")
    .sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9))
    .slice(0, maxFindings);

  const outcomes = await pool(candidates, concurrency, (finding) => investigate(finding, { provider, index, fetchImpl, maxSteps }));
  const reviews = new Map();
  let failure = null;
  candidates.forEach((finding, position) => {
    const outcome = outcomes[position];
    if (outcome.error) { failure ||= outcome.error; return; }
    const { verdict, trace } = outcome.value;
    if (!verdict) return;
    reviews.set(finding.id, {
      aiReviewed: true,
      aiSupported: verdict.supported === true,
      aiConfidence: Math.max(0, Math.min(100, Math.round(Number(verdict.confidence) || 0))),
      aiExplanation: excerpt(verdict.explanation || "", 1200),
      aiRecommendation: excerpt(verdict.recommendation || "", 600),
      aiCitations: verifyCitations(verdict.cited_clauses, index),
      aiTrace: trace
    });
  });

  if (!reviews.size && failure) throw failure;
  result.findings = result.findings.map((finding) => (reviews.has(finding.id) ? { ...finding, ...reviews.get(finding.id) } : finding));

  const reviewed = [...reviews.values()];
  const stats = {
    reviewed: reviewed.length,
    candidates: candidates.length,
    supported: reviewed.filter((item) => item.aiSupported).length,
    toolCalls: reviewed.reduce((sum, item) => sum + item.aiTrace.length, 0)
  };
  const skipped = candidates.length - reviewed.length;
  const warning = skipped ? `AI-агент не завершил проверку ${skipped} из ${candidates.length} выводов${failure ? ` (${failure.message})` : ""}.` : "";
  return { result, used: reviewed.length > 0, stats, warning };
}
