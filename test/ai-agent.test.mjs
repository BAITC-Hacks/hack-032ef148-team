import test from "node:test";
import assert from "node:assert/strict";
import { reviewWithAgent } from "../src/ai-agent.mjs";

const before = [{ name: "red-8.txt", text: "4. Функции\n4.1. Отдел закупок осуществляет контроль закупок и договоров.\n4.2. Отдел кадров ведёт учёт персонала." }];
const after = [{ name: "red-9.txt", text: "4. Функции\n4.1. Отдел кадров ведёт учёт персонала." }];
const finding = { id: "f1", type: "function_lost", severity: "high", title: "Потеряна функция контроля закупок", explanation: "", evidence: [{ side: "before", clause: "4.1", unit: "Отдел закупок", snippet: "контроль закупок" }] };

// A scripted model: search the new edition, read the old clause, then submit a verdict citing one real and one invented clause.
function scriptedModel() {
  const replies = [
    { tool_calls: [{ id: "c1", type: "function", function: { name: "search_document", arguments: JSON.stringify({ side: "after", query: "контроль закупок" }) } }] },
    { tool_calls: [{ id: "c2", type: "function", function: { name: "read_clause", arguments: JSON.stringify({ side: "before", clause: "4.1" }) } }] },
    { tool_calls: [{ id: "c3", type: "function", function: { name: "submit_verdict", arguments: JSON.stringify({ supported: true, confidence: 91, explanation: "В новой редакции контроля закупок нет.", recommendation: "Назначить владельца.", cited_clauses: [{ side: "before", clause: "4.1" }, { side: "after", clause: "7.7" }] }) } }] }
  ];
  const requests = [];
  const fetchImpl = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: replies[requests.length - 1] }] }), { status: 200 });
  };
  return { fetchImpl, requests };
}

test("agent investigates with tools and its citations are checked against the documents", async () => {
  const { fetchImpl, requests } = scriptedModel();
  const provider = { name: "Test", baseUrl: "http://model", key: "k", model: "m", params: {} };
  const { result, used, stats } = await reviewWithAgent({ findings: [structuredClone(finding)] }, { before, after }, { provider, fetchImpl });

  assert.equal(used, true);
  const reviewed = result.findings[0];
  assert.equal(reviewed.aiSupported, true);
  assert.equal(reviewed.aiConfidence, 91);
  assert.deepEqual(reviewed.aiTrace.map((item) => item.tool), ["search", "read"]);
  assert.deepEqual(reviewed.aiCitations.map((item) => item.verified), [true, false]);
  assert.deepEqual(stats, { reviewed: 1, candidates: 1, supported: 1, toolCalls: 2 });

  // The tool results really reached the model: the old clause text was read back to it.
  const toolMessage = requests[2].messages.find((message) => message.role === "tool" && message.tool_call_id === "c2");
  assert.match(toolMessage.content, /контроль закупок/);
});

test("without a provider the local result is kept", async () => {
  const { used, result } = await reviewWithAgent({ findings: [finding] }, { before, after }, { provider: null });
  assert.equal(used, false);
  assert.equal(result.findings[0].aiReviewed, undefined);
});
