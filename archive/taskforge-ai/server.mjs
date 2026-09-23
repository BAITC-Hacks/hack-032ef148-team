import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import process from "node:process";

const root = join(process.cwd(), "dist");
const port = Number(process.env.PORT || 4173);
await loadLocalEnv();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const questionSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        properties: {
          key: { type: "string", enum: ["title", "users", "data", "result", "success", "constraints", "contactInteraction"] },
          prompt: { type: "string" },
          help: { type: "string" },
        },
        required: ["key", "prompt", "help"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

async function loadLocalEnv() {
  try {
    const content = await readFile(join(process.cwd(), ".env"), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (_) {
    // .env необязателен: интерфейс использует локальный резервный режим.
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64_000) throw new Error("Слишком большой запрос");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function extractOutputText(responseData) {
  if (typeof responseData.output_text === "string") return responseData.output_text;
  for (const item of responseData.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

function validQuestions(questions) {
  const allowed = new Set(["title", "users", "data", "result", "success", "constraints", "contactInteraction"]);
  return Array.isArray(questions)
    && questions.length >= 3
    && questions.length <= 7
    && questions.every((item) => allowed.has(item?.key) && typeof item.prompt === "string" && typeof item.help === "string");
}

async function analyzeWithOpenAI(request, response) {
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Некорректный JSON" });
    return;
  }
  const description = String(body.description || "").trim();
  const industry = String(body.industry || "Другое").trim();
  if (description.length < 12) {
    sendJson(response, 400, { error: "Описание должно содержать минимум 12 символов" });
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    sendJson(response, 503, { error: "AI API не настроен; используйте локальный режим" });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        instructions: "Ты анализируешь черновик бизнес-задачи. Верни ровно семь кратких уточняющих вопросов на русском языке. Вопросы должны заполнить только пробелы в постановке задачи. Не добавляй и не предполагай факты, которых нет во входе.",
        input: `Отрасль: ${industry}\nЧерновик: ${description}`,
        text: { format: { type: "json_schema", name: "business_task_questions", strict: true, schema: questionSchema } },
      }),
    });
    if (!apiResponse.ok) throw new Error(`OpenAI API вернул статус ${apiResponse.status}`);
    const responseData = await apiResponse.json();
    const outputText = extractOutputText(responseData);
    const parsed = JSON.parse(outputText);
    if (!validQuestions(parsed.questions)) throw new Error("Ответ AI не прошёл проверку формата");
    sendJson(response, 200, { mode: "openai", questions: parsed.questions });
  } catch (error) {
    sendJson(response, 502, { error: error.name === "AbortError" ? "Превышено время ожидания AI" : error.message });
  } finally {
    clearTimeout(timeout);
  }
}

async function serveStatic(request, response) {
  const requested = new URL(request.url, `http://${request.headers.host}`).pathname;
  const relative = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
  const safePath = normalize(relative).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);
  if (!filePath.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const data = await readFile(filePath);
    response.writeHead(200, { "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream", "Cache-Control": "no-cache" });
    response.end(data);
  } catch (_) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Не найдено");
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/api/analyze") {
    await analyzeWithOpenAI(request, response);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405).end("Method Not Allowed");
    return;
  }
  await serveStatic(request, response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`TaskForge AI: http://127.0.0.1:${port}`);
});
