import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT || 4180),
  host: process.env.HOST || "0.0.0.0",
  publicDir: path.resolve(currentDir, "../public"),
  samplesDir: path.resolve(currentDir, "../samples"),
  databaseUrl: process.env.DATABASE_URL || "",
  maxFileBytes: Number(process.env.MAX_FILE_MB || 25) * 1024 * 1024,
  jwtSecret: process.env.JWT_SECRET || "",
  openAiKey: process.env.OPENAI_API_KEY || "",
  openAiModel: process.env.OPENAI_MODEL || "gpt-6-luna",
  aiEnabled: process.env.AI_ENABLED !== "false",
  demoMode: process.env.DEMO_MODE !== "false"
};
