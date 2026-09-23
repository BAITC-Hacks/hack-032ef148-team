import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import multer from "multer";
import helmet from "helmet";
import compression from "compression";
import { rateLimit } from "express-rate-limit";
import { config } from "./config.mjs";
import { analyzeDocuments } from "./analyzer.mjs";
import { parseDocument } from "./parser.mjs";
import { getAnalysis, listAnalyses, saveAnalysis, updateFinding } from "./store.mjs";
import { reviewWithOpenAI } from "./openai-review.mjs";
import { renderReport } from "./report.mjs";
import { HttpError, authRouter, authenticate, requireRole, roles, usersRouter } from "./auth.mjs";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileBytes, files: 2 }
});

const demoSets = {
  real: {
    name: "Положение о внутреннем аудите: редакция 8 → 9",
    description: "Обезличенный контрольный комплект организатора HackAlem",
    before: "polozhenie-vnutrenniy-audit-red-8.docx",
    after: "polozhenie-vnutrenniy-audit-red-9.docx"
  },
  synthetic: {
    name: "Синтетический пример: реорганизация БВА",
    description: "Короткий пример с упразднением отдела, потерей и дублированием функций",
    before: "synthetic/polozhenie-bva-redakciya-8.txt",
    after: "synthetic/polozhenie-bva-redakciya-9.txt"
  }
};

async function loadSample(fileName) {
  const buffer = await readFile(path.join(config.samplesDir, fileName));
  return parseDocument({ originalname: path.basename(fileName), buffer, size: buffer.length });
}

async function runAnalysis(before, after, { name, useAi }) {
  let analysis = analyzeDocuments(before, after);
  let aiUsed = false;
  let warning = "";

  if (useAi && config.aiEnabled) {
    try {
      const review = await reviewWithOpenAI(analysis, { apiKey: config.openAiKey, model: config.openAiModel });
      analysis = review.result;
      aiUsed = review.used;
      warning = review.warning;
    } catch (error) {
      warning = `AI-проверка недоступна: ${error.message}. Сохранён локальный результат.`;
    }
  }

  const record = {
    id: randomUUID(),
    name: String(name || `Сравнение ${before.name} и ${after.name}`).slice(0, 140),
    createdAt: new Date().toISOString(),
    documents: {
      before: { name: before.name, size: before.size, characters: before.characters },
      after: { name: after.name, size: after.size, characters: after.characters }
    },
    engine: { mode: aiUsed ? "local+openai" : "local", model: aiUsed ? config.openAiModel : null, warning },
    ...analysis
  };

  await saveAnalysis(record);
  return record;
}

function requestLogger(request, response, next) {
  const started = performance.now();
  response.on("finish", () => {
    console.info(JSON.stringify({
      at: new Date().toISOString(), method: request.method, path: request.originalUrl.split("?")[0],
      status: response.statusCode, ms: Math.round(performance.now() - started), user: request.user?.id
    }));
  });
  next();
}

// The Expo web build runs on another origin (e.g. localhost:8081), so the API allows cross-origin calls.
// Auth uses bearer tokens, not cookies, so a wildcard origin does not expose sessions.
function cors(request, response, next) {
  response.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  if (request.method === "OPTIONS") return response.sendStatus(204);
  return next();
}

export function createApp({ storeMode }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        "script-src": ["'self'"],
        "style-src": ["'self'"],
        "img-src": ["'self'", "data:"]
      }
    }
  }));
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", requestLogger, cors);
  app.use("/api", rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: "draft-8" }));
  app.use("/api", authenticate);
  app.use("/api/auth", authRouter());
  app.use("/api/users", usersRouter());

  app.get("/api/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "БАТЫС AI",
      storage: storeMode,
      aiConfigured: Boolean(config.openAiKey && config.aiEnabled),
      model: config.openAiKey ? config.openAiModel : null
    });
  });

  app.get("/api/analyses", async (_request, response) => {
    response.json({ items: await listAnalyses() });
  });

  app.get("/api/analyses/:id", async (request, response) => {
    const record = await getAnalysis(request.params.id);
    if (!record) return response.status(404).json({ error: "Анализ не найден" });
    return response.json(record);
  });

  app.post("/api/analyses", upload.fields([{ name: "before", maxCount: 1 }, { name: "after", maxCount: 1 }]), async (request, response) => {
    const beforeFile = request.files?.before?.[0];
    const afterFile = request.files?.after?.[0];
    if (!beforeFile || !afterFile) return response.status(400).json({ error: "Загрузите документы «до» и «после»" });

    const [before, after] = await Promise.all([parseDocument(beforeFile), parseDocument(afterFile)]);
    const record = await runAnalysis(before, after, { name: request.body.name, useAi: request.body.useAi === "true" });
    return response.status(201).json(record);
  });

  app.get("/api/demo", (_request, response) => {
    response.json({ items: Object.entries(demoSets).map(([id, set]) => ({ id, name: set.name, description: set.description, before: path.basename(set.before), after: path.basename(set.after) })) });
  });

  app.post("/api/demo/:id", async (request, response) => {
    const set = demoSets[request.params.id];
    if (!set) return response.status(404).json({ error: "Демо-набор не найден" });
    const [before, after] = await Promise.all([loadSample(set.before), loadSample(set.after)]);
    const record = await runAnalysis(before, after, { name: set.name, useAi: request.body?.useAi === true });
    return response.status(201).json(record);
  });

  // Expert decisions are signed: only an authenticated expert or admin may approve or reject a finding.
  app.patch("/api/analyses/:id/findings/:findingId", requireRole(...roles), async (request, response) => {
    const status = String(request.body?.status || "");
    if (!["pending", "approved", "rejected"].includes(status)) return response.status(400).json({ error: "Некорректный статус" });
    const result = await updateFinding(request.params.id, request.params.findingId, {
      status,
      comment: String(request.body.comment || "").slice(0, 1200),
      reviewedBy: { id: request.user.id, name: request.user.name }
    });
    if (result === null) return response.status(404).json({ error: "Анализ не найден" });
    if (result === false) return response.status(404).json({ error: "Вывод не найден" });
    return response.json(result);
  });

  app.get("/api/analyses/:id/report", async (request, response) => {
    const record = await getAnalysis(request.params.id);
    if (!record) return response.status(404).send("Анализ не найден");
    return response.type("html").send(renderReport(record));
  });

  app.use("/api", (_request, _response, next) => next(new HttpError(404, "Маршрут не найден")));

  app.use(express.static(config.publicDir, { maxAge: "1h", etag: true }));
  app.use((request, response, next) => {
    if (request.method === "GET" && request.accepts("html")) return response.sendFile("index.html", { root: config.publicDir });
    return next();
  });

  app.use((error, request, response, _next) => {
    const status = error.status || (error.code === "LIMIT_FILE_SIZE" ? 413 : error.type === "entity.parse.failed" ? 400 : 500);
    if (status === 500) console.error(JSON.stringify({ at: new Date().toISOString(), event: "error", path: request.originalUrl, message: error.message, stack: error.stack }));
    response.status(status).json({ error: status === 500 ? "Внутренняя ошибка сервера" : error.message });
  });

  return app;
}
