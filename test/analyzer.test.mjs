import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeDocuments } from "../src/analyzer.mjs";
import { parseDocument } from "../src/parser.mjs";
import { renderReport } from "../src/report.mjs";

function document(name, text) {
  return { name, text, size: Buffer.byteLength(text), characters: text.length };
}

async function sample(fileName) {
  const buffer = await readFile(new URL(`../samples/${fileName}`, import.meta.url));
  return parseDocument({ originalname: fileName.split("/").pop(), buffer, size: buffer.length });
}

test("finds new organizational units and function changes with evidence", () => {
  const before = document("before.docx", `
3.4. Блок внутреннего аудита состоит из следующих подразделений:
а. Департамент непрерывного мониторинга системы внутреннего контроля.
5.1. Департамент непрерывного мониторинга организует мониторинг контрольных процедур и готовит отчеты.
5.2. Департамент непрерывного мониторинга контролирует устранение выявленных нарушений.
  `);
  const after = document("after.docx", `
3.4. Блок внутреннего аудита состоит из следующих подразделений:
а. Департамент непрерывного мониторинга системы внутреннего контроля.
б. Департамент ИТ-аудита и анализа данных.
5.1. Департамент непрерывного мониторинга организует мониторинг контрольных процедур и готовит отчеты.
5.2. Департамент ИТ-аудита анализирует информационные системы и выявляет технологические риски.
  `);

  const result = analyzeDocuments(before, after);
  assert.ok(result.summary.total > 0);
  assert.ok(result.findings.every((finding) => finding.evidence.length > 0));
  assert.ok(result.findings.some((finding) => finding.type === "unit_added"));
});

test("extracts functions written in Cyrillic (regression: ASCII \\b never matched Russian verbs)", () => {
  const text = "5.1. Департамент мониторинга организует мониторинг контрольных процедур и готовит отчеты.";
  const result = analyzeDocuments(document("a.txt", text), document("b.txt", text));
  assert.equal(result.metrics.functionsBefore, 1);
  assert.equal(result.functionMap[0].status, "kept");
});

test("returns a stable summary for identical documents", () => {
  const text = "3.1. Департамент аудита организует проверки, анализирует результаты и готовит заключение для Совета директоров.";
  const result = analyzeDocuments(document("v1.docx", text), document("v2.docx", text));
  assert.equal(result.summary.lostFunctions, 0);
  assert.equal(result.summary.addedFunctions, 0);
  assert.equal(result.metrics.evidenceCoverage, result.findings.length ? 100 : 0);
});

test("synthetic sample: dissolved unit, lost function, transformation and duplication", async () => {
  const result = analyzeDocuments(await sample("synthetic/polozhenie-bva-redakciya-8.txt"), await sample("synthetic/polozhenie-bva-redakciya-9.txt"));
  const byType = (type) => result.findings.filter((finding) => finding.type === type);

  const removed = byType("unit_removed").find((finding) => finding.title.includes("Отдел аудита закупок"));
  assert.ok(removed, "procurement audit unit is reported as dissolved");
  assert.match(removed.explanation, /2 из 3 функций перешли в «Департамент операционного аудита»/);

  assert.ok(byType("unit_transformed").some((finding) => finding.title.includes("Департамент финансового аудита → Департамент операционного аудита")));
  assert.ok(byType("unit_added").some((finding) => finding.title.includes("ИТ-аудита")));

  const lost = byType("function_lost");
  assert.equal(lost.length, 1);
  assert.equal(lost[0].evidence[0].clause, "4.4.2");
  assert.match(lost[0].evidence[0].snippet, /антикоррупционных/);

  assert.ok(byType("function_duplicate").some((finding) => finding.evidence.map((item) => item.clause).sort().join() === "4.1.2,4.3.2"));
});

test("organizer control set (редакция 8 → 9): reorganization, lost and narrowed functions, duplication", async () => {
  const before = await sample("polozhenie-vnutrenniy-audit-red-8.docx");
  const after = await sample("polozhenie-vnutrenniy-audit-red-9.docx");
  const result = analyzeDocuments(before, after);

  const unit = (name) => result.units.find((item) => (item.after || item.before || "").includes(name));
  assert.equal(unit("ИТ-аудита и анализа данных").status, "added");
  assert.equal(unit("операционного аудита").status, "added");
  assert.equal(unit("непрерывного мониторинга").status, "kept");
  assert.equal(unit("контроля качества").status, "kept");

  assert.ok(result.findings.some((finding) => finding.type === "unit_removed" && finding.title.includes("Директор направления внутреннего аудита")));

  const lostClauses = result.findings.filter((finding) => finding.type === "function_lost").map((finding) => finding.evidence[0].clause);
  assert.ok(lostClauses.includes("5.5.4"), "ДККМ loses analysis of continuous audit results");
  assert.ok(lostClauses.includes("5.5.10"), "ДККМ loses preparing proposals for the plan");

  const narrowed = result.findings.find((finding) => finding.type === "function_narrowed" && finding.evidence[0].clause === "5.5.5");
  assert.ok(narrowed, "quarterly reporting frequency disappears");
  assert.match(narrowed.explanation, /ежеквартальной/);

  assert.ok(result.summary.duplicates > 0);
  for (const finding of result.findings) {
    assert.ok(finding.evidence.length > 0, `${finding.title} has evidence`);
    for (const item of finding.evidence) assert.ok(item.snippet && item.clause && item.document, "evidence names document, clause and fragment");
  }

  const html = renderReport({ id: "t", name: "Контроль", createdAt: new Date().toISOString(), documents: { before, after }, engine: { mode: "local" }, ...result });
  assert.match(html, /Подразделения/);
  assert.match(html, /Сопоставление функций/);
  assert.match(html, /5\.5\.4/);
});

test("rejects unsupported formats", async () => {
  await assert.rejects(parseDocument({ originalname: "virus.exe", buffer: Buffer.from("x"), size: 1 }), { status: 415 });
});
