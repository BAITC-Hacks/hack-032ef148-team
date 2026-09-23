import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

// Only real API keys enable the AI agent: OpenAI keys start with sk-, NVIDIA keys with nvapi-.
// Anything else, such as a credit activation code pasted by mistake, would leave the switch
// active and fail on every request, so it is ignored with a warning.
function apiKey(name, prefix) {
  const raw = (process.env[name] || "").trim();
  if (raw && !raw.startsWith(prefix)) {
    console.warn(`${name} не похож на API-ключ (должен начинаться с ${prefix}) — ключ проигнорирован.`);
    return "";
  }
  return raw;
}

const openAiKey = apiKey("OPENAI_API_KEY", "sk-");
const nvidiaKey = apiKey("NVIDIA_API_KEY", "nvapi-");

// Both providers speak the OpenAI Chat Completions protocol with tool calling; OpenAI wins if both are set.
const aiProvider = openAiKey
  ? {
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      key: openAiKey,
      model: (process.env.OPENAI_MODEL || "").trim() || "gpt-6-luna",
      params: { max_completion_tokens: 2000 }
    }
  : nvidiaKey
    ? {
        name: "NVIDIA",
        baseUrl: "https://integrate.api.nvidia.com/v1",
        key: nvidiaKey,
        model: (process.env.NVIDIA_MODEL || "").trim() || "deepseek-ai/deepseek-v4.1-flash",
        params: { temperature: 0.1, max_tokens: 2000 }
      }
    : null;

export const config = {
  port: Number(process.env.PORT || 4180),
  host: process.env.HOST || "0.0.0.0",
  publicDir: path.resolve(currentDir, "../public"),
  samplesDir: path.resolve(currentDir, "../samples"),
  databaseUrl: process.env.DATABASE_URL || "",
  maxFileBytes: Number(process.env.MAX_FILE_MB || 25) * 1024 * 1024,
  jwtSecret: process.env.JWT_SECRET || "",
  aiProvider,
  aiEnabled: process.env.AI_ENABLED !== "false",
  aiMaxFindings: Number(process.env.AI_MAX_FINDINGS || 12),
  demoMode: process.env.DEMO_MODE !== "false"
};
