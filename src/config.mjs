import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

// Only a real OpenAI API key (sk-…) enables the AI review. Anything else, such as a credit
// activation code pasted by mistake, would leave the switch active and fail on every request.
const rawOpenAiKey = (process.env.OPENAI_API_KEY || "").trim();
const openAiKey = rawOpenAiKey.startsWith("sk-") ? rawOpenAiKey : "";
if (rawOpenAiKey && !openAiKey) {
  console.warn("OPENAI_API_KEY не похож на ключ OpenAI (должен начинаться с sk-) — AI-проверка отключена, работает локальный анализ.");
}

export const config = {
  port: Number(process.env.PORT || 4180),
  host: process.env.HOST || "0.0.0.0",
  publicDir: path.resolve(currentDir, "../public"),
  samplesDir: path.resolve(currentDir, "../samples"),
  databaseUrl: process.env.DATABASE_URL || "",
  maxFileBytes: Number(process.env.MAX_FILE_MB || 25) * 1024 * 1024,
  jwtSecret: process.env.JWT_SECRET || "",
  openAiKey,
  openAiModel: (process.env.OPENAI_MODEL || "").trim() || "gpt-6-luna",
  aiEnabled: process.env.AI_ENABLED !== "false",
  demoMode: process.env.DEMO_MODE !== "false"
};
