import { createHash, randomUUID } from "node:crypto";

const stopWords = new Set([
  "для", "при", "или", "как", "что", "это", "его", "она", "они", "оно", "также", "иных", "иной",
  "всех", "всего", "данных", "данной", "настоящего", "общества", "общество", "бва", "работы", "работников",
  "соответствии", "части", "вопросам", "области", "осуществляет", "обеспечивает", "организует", "проводит",
  "the", "and", "for", "with", "from", "this", "that"
]);

// JavaScript \b only understands ASCII letters, so Cyrillic words use explicit (?<![\p{L}\p{N}]) boundaries.
const actionPattern = /(?<![\p{L}\p{N}])(?:организу(?:ет|ют)|осуществля(?:ет|ют)|обеспечива(?:ет|ют)|контролиру(?:ет|ют)|анализиру(?:ет|ют)|проверя(?:ет|ют)|провод(?:ит|ят)|разрабатыва(?:ет|ют)|готов(?:ит|ят)|согласовыва(?:ет|ют)|утвержда(?:ет|ют)|взаимодейству(?:ет|ют)|управля(?:ет|ют)|координиру(?:ет|ют)|предоставля(?:ет|ют)|формиру(?:ет|ют)|выявля(?:ет|ют)|оценива(?:ет|ют)|сопоставля(?:ет|ют)|назнача(?:ет|ют)|распределя(?:ет|ют)|информиру(?:ет|ют)|участву(?:ет|ют)|запрашива(?:ет|ют)|вед(?:ет|ут)|вынос(?:ит|ят)|использу(?:ет|ют)|довод(?:ит|ят)|копировать|получать|расширять|требовать|принима(?:ет|ют|ть))(?![\p{L}\p{N}])/iu;
const unitPattern = /(?:департамент|управление|отдел|служба|блок|дирекция|центр)\s+[а-яёa-z][^.;:()\n]{2,110}/giu;

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»“”"'()]/g, " ")
    .replace(/(?<![\p{L}\p{N}])(?:ао|пао|ооо|компания|общества|общество)(?![\p{L}\p{N}])/gu, " ")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const tokenCache = new Map();

// Crude Russian stemmer: verb endings first so "организует" and "организуют" share a stem.
function tokens(value) {
  const key = String(value || "");
  if (tokenCache.has(key)) return tokenCache.get(key);
  const result = new Set(normalize(key)
    .split(" ")
    .filter((word) => !stopWords.has(word))
    .map((word) => word.replace(/(ывают|ивают|ывает|ивает|ают|яют|уют|ует|ает|яет|ют|ет|ут|ит|ят|ать|ять|ить)$/u, ""))
    .map((word) => word.replace(/(иями|ями|ами|ого|ему|ому|ими|ыми|ий|ый|ая|ое|ые|ов|ам|ах|ях|ия|ие|ии|ию|а|я|ы|и|у|е)$/u, ""))
    .filter((word) => word.length > 2 && !stopWords.has(word)));
  if (tokenCache.size > 20_000) tokenCache.clear();
  tokenCache.set(key, result);
  return result;
}

function similarity(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  const union = new Set([...a, ...b]).size;
  const containment = intersection / Math.min(a.size, b.size);
  return Math.min(1, (intersection / union) * 0.6 + containment * 0.4);
}

function compactSnippet(text, limit = 360) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

function clauseOf(line, fallback) {
  const match = line.match(/^((?:\d+\.){1,4}\d*|[а-яёa-z]\.)\s*/iu);
  return match?.[1]?.replace(/\.$/, "") || fallback;
}

function extractUnits(text) {
  const allLines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const structureStart = allLines.findIndex((line) => /структур[аы].*(?:организац|работ)|организационн(?:ая|ой) структур/i.test(line));
  let sourceLines = allLines;
  if (structureStart >= 0) {
    const sectionNumber = allLines[structureStart].match(/^(\d+)\./)?.[1];
    const nextSection = allLines.findIndex((line, index) => index > structureStart && sectionNumber && new RegExp(`^${Number(sectionNumber) + 1}\\.`).test(line));
    sourceLines = allLines.slice(structureStart, nextSection > structureStart ? nextSection : structureStart + 90);
  }

  const found = new Map();
  for (const line of sourceLines) {
    for (const match of line.matchAll(unitPattern)) {
      const name = compactSnippet(match[0].replace(/\s+/g, " ").replace(/\s+в соответствии.*$/i, ""), 120);
      const key = normalize(name);
      const looksGeneric = /управление (?:рисками|обществом|в рамках|информационными технологиями|процессами)|центр ответственности/i.test(name);
      const containsAction = /(?<![\p{L}\p{N}])(?:осуществляет|организует|проводит|обеспечивает|подчиняются|определяется)(?![\p{L}\p{N}])/iu.test(name);
      if (key.length > 8 && !looksGeneric && !containsAction && !found.has(key)) found.set(key, { name, key });
    }
  }
  return [...found.values()].slice(0, 40);
}

function ownerFromHeading(line) {
  const clean = line.replace(/^((?:\d+\.){1,4}\d*|[а-яёa-z]\.)\s*/iu, "").trim();
  const match = clean.match(/^((?:Главный аудитор|Директор(?:ы|у)?[^:]{0,170}|Работники БВА|БВА|(?:Департамент|Управление|Отдел|Служба|Дирекция|Центр)[^:.;]{3,170}))\s*:/iu);
  return match ? compactSnippet(match[1].replace(/\s*\(далее[^)]*\)?/giu, ""), 170) : null;
}

function extractFunctions(document) {
  const lines = document.text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const functions = [];
  let currentClause = "—";
  let currentUnit = "Общие функции";

  for (const line of lines) {
    currentClause = clauseOf(line, currentClause);
    const owner = ownerFromHeading(line);
    if (owner) currentUnit = owner;
    else if (/^\d+\.\s+[^\d]/u.test(line)) currentUnit = "Общие функции";

    const chunks = line.split(/(?<=[.;])\s+(?=[А-ЯЁA-Zа-яё])/u);
    for (const chunk of chunks) {
      const clean = chunk.replace(/^((?:\d+\.){1,4}\d*|[а-яёa-z]\.)\s*/iu, "").trim();
      if (clean.length >= 34 && clean.length <= 900 && actionPattern.test(clean)) {
        functions.push({
          id: createHash("sha1").update(`${document.name}:${currentClause}:${clean}`).digest("hex").slice(0, 12),
          text: clean,
          clause: currentClause,
          unit: currentUnit,
          document: document.name
        });
      }
    }
  }
  return functions.slice(0, 700);
}

function evidence(item, side) {
  return {
    side: item.side || side,
    document: item.document,
    clause: item.clause,
    unit: item.unit,
    snippet: compactSnippet(item.text)
  };
}

function makeFinding(type, severity, title, explanation, confidence, beforeItem, afterItem, recommendation) {
  return {
    id: randomUUID(),
    type,
    severity,
    title,
    explanation,
    confidence: Math.round(confidence * 100),
    status: "pending",
    comment: "",
    recommendation,
    evidence: [beforeItem && evidence(beforeItem, "before"), afterItem && evidence(afterItem, "after")].filter(Boolean)
  };
}

function belongsTo(functionUnit, unit) {
  if (normalize(functionUnit) === unit.key) return true;
  const owner = tokens(functionUnit);
  const target = tokens(unit.name);
  if (!owner.size || !target.size) return false;
  let shared = 0;
  for (const token of target) if (owner.has(token)) shared += 1;
  return shared / target.size >= 0.8;
}

// "Директоры департаментов…" or "Работники БВА" cover every unit, so a function handed to them is not orphaned.
const isCollectiveOwner = (unit) => /^(?:директоры|работники|все)/iu.test(unit.trim());

// Meaningful words present in the old wording but missing from the new one.
function droppedTerms(beforeText, afterText) {
  const after = tokens(afterText);
  const dropped = [...tokens(beforeText)].filter((token) => !after.has(token));
  const words = normalize(beforeText).split(" ").filter((word) => word.length > 3);
  return dropped.map((stem) => words.find((word) => word.startsWith(stem)) || stem);
}

// Abbreviations such as ДНМ or ДККМ name the scope a duty applies to.
const scopeAbbreviations = (text) => new Set(String(text).match(/(?<![\p{L}])[А-ЯЁ]{2,6}(?![\p{L}])/gu) || []);

// Share of the old unit's functions whose closest match now sits in the new unit.
function functionFlow(before, after, functionMatches) {
  const own = functionMatches.filter((match) => belongsTo(match.beforeItem.unit, before));
  if (!own.length) return { share: 0, moved: 0, total: 0 };
  const moved = own.filter((match) => match.afterItem && belongsTo(match.afterItem.unit, after)).length;
  return { share: moved / own.length, moved, total: own.length };
}

function matchUnits(beforeUnits, afterUnits, functionMatches) {
  const candidates = [];
  for (const before of beforeUnits) {
    for (const after of afterUnits) {
      const nameScore = similarity(before.name, after.name);
      const flow = functionFlow(before, after, functionMatches);
      const score = flow.total ? Math.max(nameScore, nameScore * 0.35 + flow.share * 0.65) : nameScore;
      candidates.push({ before, after, score, nameScore, flow });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const usedBefore = new Set();
  const usedAfter = new Set();
  const pairs = [];
  for (const candidate of candidates) {
    if (candidate.score < 0.48 || usedBefore.has(candidate.before.key) || usedAfter.has(candidate.after.key)) continue;
    usedBefore.add(candidate.before.key);
    usedAfter.add(candidate.after.key);
    pairs.push(candidate);
  }
  for (const before of beforeUnits) {
    if (usedBefore.has(before.key)) continue;
    // Report where the functions of a dissolved unit went, if anywhere.
    const heir = afterUnits
      .map((after) => ({ after, flow: functionFlow(before, after, functionMatches) }))
      .filter((item) => item.flow.moved > 0)
      .sort((a, b) => b.flow.share - a.flow.share)[0];
    pairs.push({ before, after: null, score: 0, heir });
  }
  for (const after of afterUnits) if (!usedAfter.has(after.key)) pairs.push({ before: null, after, score: 0 });
  return pairs;
}

function flowText(flow, target) {
  return flow?.total ? ` ${flow.moved} из ${flow.total} функций перешли в «${target}».` : "";
}

export function analyzeDocuments(beforeDocument, afterDocument) {
  const beforeUnits = extractUnits(beforeDocument.text);
  const afterUnits = extractUnits(afterDocument.text);
  const beforeFunctions = extractFunctions(beforeDocument);
  const afterFunctions = extractFunctions(afterDocument);
  const findings = [];

  // Global one-to-one assignment: strongest pairs first, so a near-identical clause is never
  // stolen by a weaker earlier match. Leftovers may reuse a target (functions merged into one clause).
  const matchThreshold = 0.38;
  const bestScore = new Map();
  const pairs = [];
  for (const beforeItem of beforeFunctions) {
    let best = null;
    for (const afterItem of afterFunctions) {
      const score = similarity(beforeItem.text, afterItem.text);
      if (score >= matchThreshold) pairs.push({ beforeItem, afterItem, score });
      if (!best || score > best.score) best = { afterItem, score };
    }
    bestScore.set(beforeItem.id, best || { afterItem: null, score: 0 });
  }
  pairs.sort((a, b) => b.score - a.score);
  const usedAfter = new Set();
  const assigned = new Map();
  for (const pair of pairs) {
    if (assigned.has(pair.beforeItem.id) || usedAfter.has(pair.afterItem.id)) continue;
    assigned.set(pair.beforeItem.id, pair);
    usedAfter.add(pair.afterItem.id);
  }
  const functionMatches = beforeFunctions.map((beforeItem) => {
    const pair = assigned.get(beforeItem.id);
    if (pair) return pair;
    const fallback = bestScore.get(beforeItem.id);
    if (fallback.score >= matchThreshold) return { beforeItem, afterItem: fallback.afterItem, score: fallback.score, merged: true };
    return { beforeItem, afterItem: null, score: fallback.score };
  });

  const structureRef = (unit, document) => ({ ...unit, document: document.name, clause: "структура", unit: unit.name, text: unit.name });
  const unitMap = [];
  for (const pair of matchUnits(beforeUnits, afterUnits, functionMatches)) {
    const status = !pair.before ? "added" : !pair.after ? "removed" : pair.nameScore < 0.82 ? "transformed" : "kept";
    unitMap.push({
      status,
      before: pair.before?.name || null,
      after: pair.after?.name || pair.heir?.after.name || null,
      functionsMoved: (pair.flow || pair.heir?.flow)?.moved || 0,
      functionsTotal: (pair.flow || pair.heir?.flow)?.total || 0
    });
    if (!pair.before) {
      findings.push(makeFinding("unit_added", "info", `Создано подразделение: ${pair.after.name}`, "Подразделение обнаружено только в документе «после».", 0.9, null, structureRef(pair.after, afterDocument), "Проверить полномочия, ресурсы и границы ответственности нового подразделения."));
    } else if (!pair.after) {
      let heirText = " Функции подразделения не найдены в новой редакции.";
      if (pair.heir) {
        heirText = flowText(pair.heir.flow, pair.heir.after.name);
        if (pair.heir.flow.moved < pair.heir.flow.total) heirText += " Остальные функции без явного правопреемника.";
      }
      findings.push(makeFinding("unit_removed", "high", `Упразднено подразделение: ${pair.before.name}`, `Подразделение из документа «до» отсутствует в новой структуре.${heirText}`, 0.84, structureRef(pair.before, beforeDocument), pair.heir ? structureRef(pair.heir.after, afterDocument) : null, pair.heir ? `Подтвердить передачу функций в «${pair.heir.after.name}» и закрыть разрывы ответственности.` : "Подтвердить упразднение или указать подразделение-правопреемника."));
    } else if (pair.nameScore < 0.82) {
      findings.push(makeFinding("unit_transformed", "medium", `Преобразование: ${pair.before.name} → ${pair.after.name}`, `Подразделение сопоставлено по названию и переходу функций.${flowText(pair.flow, pair.after.name)}`, pair.score, structureRef(pair.before, beforeDocument), structureRef(pair.after, afterDocument), "Подтвердить правопреемство и перенос функций."));
    }
  }

  const ownerDiffers = (left, right) => left.unit !== "Общие функции" && right.unit !== "Общие функции" && similarity(left.unit, right.unit) < 0.82;
  // The closest clause already belongs to someone else's original duty, so this owner simply lost it.
  const isOrphaned = ({ beforeItem, afterItem, merged }) => !afterItem || (merged && ownerDiffers(beforeItem, afterItem) && !isCollectiveOwner(afterItem.unit));

  // Owners of functions (heads, positions) that vanish entirely, e.g. an abolished director role.
  const afterOwners = [...new Set(afterFunctions.map((item) => item.unit))];
  const beforeOwners = [...new Set(beforeFunctions.map((item) => item.unit))].filter((owner) => owner !== "Общие функции");
  for (const owner of beforeOwners) {
    if (afterOwners.some((candidate) => similarity(owner, candidate) >= 0.82)) continue;
    const own = functionMatches.filter((match) => match.beforeItem.unit === owner);
    const heirs = new Map();
    for (const match of own) if (!isOrphaned(match)) heirs.set(match.afterItem.unit, (heirs.get(match.afterItem.unit) || 0) + 1);
    const heirText = [...heirs].sort((a, b) => b[1] - a[1]).map(([unit, count]) => `«${unit}» — ${count}`).join("; ");
    const first = own[0]?.beforeItem;
    if (!first) continue;
    findings.push(makeFinding("unit_removed", "high", `Упразднён владелец функций: ${owner}`,
      `В новой редакции нет позиции «${owner}». Из ${own.length} её функций соответствие найдено для ${own.filter((match) => !isOrphaned(match)).length}${heirText ? `: ${heirText}` : ""}.`,
      0.86, first, null, "Проверить, что каждая функция упразднённой позиции получила нового владельца."));
  }

  const functionMap = [];
  const ref = (item) => ({ clause: item.clause, unit: item.unit, text: compactSnippet(item.text, 240) });

  for (const match of functionMatches) {
    const { beforeItem, afterItem, score } = match;
    if (!afterItem) {
      functionMap.push({ status: "lost", score: Math.round(score * 100), before: ref(beforeItem), after: null });
      findings.push(makeFinding("function_lost", "high", "Возможная потеря функции", "Для функции из предыдущей редакции не найдено достаточно близкого соответствия.", Math.max(0.58, 1 - score), beforeItem, null, "Назначить владельца функции либо документально подтвердить её исключение."));
      continue;
    }

    const ownerChanged = ownerDiffers(beforeItem, afterItem);
    if (isOrphaned(match)) {
      functionMap.push({ status: "lost", score: Math.round(score * 100), before: ref(beforeItem), after: ref(afterItem) });
      findings.push(makeFinding("function_lost", "high", `Функция исключена у «${beforeItem.unit}»`,
        `В новой редакции у этого владельца функции нет. Похожая формулировка сохранилась только у «${afterItem.unit}» (п. ${afterItem.clause}), за которым она была закреплена и раньше.`,
        Math.min(0.9, score * 0.9), beforeItem, afterItem, "Подтвердить, что исключение намеренное и контроль не ослаблен, либо вернуть функцию владельцу."));
      continue;
    }

    const dropped = droppedTerms(beforeItem.text, afterItem.text);
    const narrowed = !ownerChanged && score >= 0.6 && dropped.length >= 3 && dropped.length / tokens(beforeItem.text).size >= 0.2;
    const status = ownerChanged ? "moved" : narrowed ? "narrowed" : score < 0.76 ? "changed" : "kept";
    functionMap.push({ status, score: Math.round(score * 100), before: ref(beforeItem), after: ref(afterItem) });

    if (status === "moved") {
      findings.push(makeFinding("function_moved", "medium", "Функция перешла другому владельцу", `Функция сопоставлена, но владелец изменился: «${beforeItem.unit}» → «${afterItem.unit}».`, score, beforeItem, afterItem, "Подтвердить передачу ответственности и отсутствие разрыва контроля."));
    } else if (status === "narrowed") {
      findings.push(makeFinding("function_narrowed", "medium", "Сужение функции", `Функция сохранена, но из формулировки исчезли условия: ${dropped.slice(0, 6).map((word) => `«${word}»`).join(", ")}.`, score, beforeItem, afterItem, "Проверить, не утрачены ли периодичность, объём или требования к функции."));
    } else if (status === "changed") {
      findings.push(makeFinding("function_changed", "low", "Функция изменена", "Формулировка функции заметно изменилась между редакциями.", score, beforeItem, afterItem, "Проверить, сохранился ли исходный объём полномочий."));
    }
  }

  for (const afterItem of afterFunctions) {
    if (!usedAfter.has(afterItem.id)) {
      functionMap.push({ status: "added", score: 0, before: null, after: ref(afterItem) });
      findings.push(makeFinding("function_added", "info", "Новая функция", "Функция обнаружена только в документе «после».", 0.74, null, afterItem, "Проверить наличие владельца, ресурсов и контрольных процедур."));
    }
  }

  // Standard managerial duties ("выполняет прочие поручения") repeat for every head; they are not duplication.
  const templateOwners = new Map();
  for (const item of afterFunctions) {
    const owners = afterFunctions.filter((other) => similarity(item.text, other.text) >= 0.85).map((other) => normalize(other.unit));
    templateOwners.set(item.id, new Set(owners).size);
  }

  const duplicateCandidates = afterFunctions.slice(0, 260);
  let overlaps = 0;
  for (let i = 0; i < duplicateCandidates.length && overlaps < 18; i += 1) {
    for (let j = i + 1; j < duplicateCandidates.length && overlaps < 18; j += 1) {
      const left = duplicateCandidates[i];
      const right = duplicateCandidates[j];
      if (left.unit === "Общие функции" || right.unit === "Общие функции" || normalize(left.unit) === normalize(right.unit)) continue;
      if (templateOwners.get(left.id) >= 3 || templateOwners.get(right.id) >= 3) continue;
      const leftScope = scopeAbbreviations(left.text);
      const rightScope = scopeAbbreviations(right.text);
      if (leftScope.size && rightScope.size && ![...leftScope].some((item) => rightScope.has(item))) continue;
      const score = similarity(left.text, right.text);
      if (score < 0.74) continue;
      const conflict = /(?<![\p{L}\p{N}])(?:утвержда(?:ет|ют)|контролиру(?:ет|ют)|согласовыва(?:ет|ют)|провод(?:ит|ят) провер|назнача(?:ет|ют)|принима(?:ет|ют) риск)/iu.test(`${left.text} ${right.text}`);
      overlaps += 1;
      findings.push(makeFinding(conflict ? "conflict_risk" : "function_duplicate", conflict ? "high" : "medium", conflict ? "Потенциальный конфликт полномочий" : "Возможное дублирование функций", `Похожие функции закреплены за разными владельцами: «${left.unit}» (п. ${left.clause}) и «${right.unit}» (п. ${right.clause}).`, score, { ...left, side: "after" }, { ...right, side: "after" }, conflict ? "Контрольная функция у двух владельцев: определить, кто утверждает/контролирует, через матрицу RACI." : "Развести зоны ответственности через RACI или назначить единого владельца."));
    }
  }

  const severityRank = { high: 0, medium: 1, low: 2, info: 3 };
  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  const caps = {
    unit_added: 20, unit_removed: 20, unit_transformed: 20,
    function_lost: 36, function_moved: 36, function_changed: 28, function_narrowed: 28,
    function_added: 36, function_duplicate: 18, conflict_risk: 18
  };
  const typeCounts = new Map();
  const limitedFindings = findings.filter((finding) => {
    const countForType = typeCounts.get(finding.type) || 0;
    if (countForType >= (caps[finding.type] || 20)) return false;
    typeCounts.set(finding.type, countForType + 1);
    return true;
  }).slice(0, 180);
  const count = (type) => limitedFindings.filter((item) => item.type === type).length;

  return {
    summary: {
      total: limitedFindings.length,
      keptUnits: unitMap.filter((unit) => unit.status === "kept").length,
      transformedUnits: unitMap.filter((unit) => unit.status === "transformed").length,
      unitsBefore: beforeUnits.length,
      unitsAfter: afterUnits.length,
      addedUnits: count("unit_added"),
      removedUnits: count("unit_removed"),
      lostFunctions: count("function_lost"),
      movedFunctions: count("function_moved"),
      narrowedFunctions: count("function_narrowed"),
      addedFunctions: count("function_added"),
      duplicates: count("function_duplicate"),
      conflicts: count("conflict_risk")
    },
    findings: limitedFindings,
    units: unitMap,
    functionMap,
    metrics: {
      functionsBefore: beforeFunctions.length,
      functionsAfter: afterFunctions.length,
      evidenceCoverage: limitedFindings.length ? 100 : 0
    }
  };
}
