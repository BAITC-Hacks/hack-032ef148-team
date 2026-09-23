import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import express from "express";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { config } from "./config.mjs";
import { bumpTokenVersion, countUsers, createUser, deleteUser, findUserByEmail, findUserById, listUsers, publicUser, updateUser } from "./store.mjs";

const scryptAsync = promisify(scrypt);
export const roles = ["expert", "admin"];

// Without JWT_SECRET tokens are signed with a per-process key: safe, but everyone is logged out on restart.
const jwtSecret = config.jwtSecret || randomBytes(32).toString("hex");
if (!config.jwtSecret) console.warn("JWT_SECRET не задан: используется временный ключ, после перезапуска потребуется повторный вход.");

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, ver: user.tokenVersion }, jwtSecret, { algorithm: "HS256", expiresIn: "12h" });
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateCredentials(body, { withName }) {
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const name = String(body?.name || "").trim();
  if (!emailPattern.test(email) || email.length > 200) throw new HttpError(400, "Укажите корректный email");
  if (password.length < 8 || password.length > 200) throw new HttpError(400, "Пароль должен содержать от 8 до 200 символов");
  if (withName && (name.length < 2 || name.length > 120)) throw new HttpError(400, "Укажите имя от 2 до 120 символов");
  return { email, password, name };
}

// Attaches request.user when a valid, non-revoked token is present; never rejects on its own.
export async function authenticate(request, _response, next) {
  const header = request.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return next();
  try {
    const payload = jwt.verify(token, jwtSecret, { algorithms: ["HS256"] });
    const user = await findUserById(payload.sub);
    if (user && user.tokenVersion === payload.ver) request.user = user;
  } catch {
    // Expired or forged tokens are treated as anonymous; requireRole produces the 401.
  }
  return next();
}

export const requireRole = (...allowed) => (request, _response, next) => {
  if (!request.user) return next(new HttpError(401, "Войдите в систему"));
  if (!allowed.includes(request.user.role)) return next(new HttpError(403, "Недостаточно прав"));
  return next();
};

export function authRouter() {
  const router = express.Router();
  router.use(rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: "draft-8", message: { error: "Слишком много попыток, попробуйте позже" } }));

  router.post("/signup", async (request, response) => {
    const { email, password, name } = validateCredentials(request.body, { withName: true });
    // The very first account administers the instance; everyone after is an expert.
    const role = (await countUsers()) === 0 ? "admin" : "expert";
    const user = await createUser({ id: randomUUID(), email, name, passwordHash: await hashPassword(password), role });
    if (!user) throw new HttpError(409, "Пользователь с таким email уже существует");
    console.info(JSON.stringify({ event: "auth.signup", userId: user.id, role }));
    response.status(201).json({ token: issueToken(user), user: publicUser(user) });
  });

  router.post("/signin", async (request, response) => {
    const { email, password } = validateCredentials(request.body, { withName: false });
    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      console.info(JSON.stringify({ event: "auth.signin_failed", email }));
      throw new HttpError(401, "Неверный email или пароль");
    }
    response.json({ token: issueToken(user), user: publicUser(user) });
  });

  router.post("/logout", requireRole(...roles), async (request, response) => {
    await bumpTokenVersion(request.user.id);
    response.status(204).end();
  });

  router.get("/me", requireRole(...roles), (request, response) => {
    response.json({ user: publicUser(request.user) });
  });

  return router;
}

export function usersRouter() {
  const router = express.Router();
  router.use(requireRole("admin"));

  router.get("/", async (_request, response) => {
    response.json({ items: (await listUsers()).map(publicUser) });
  });

  router.patch("/:id", async (request, response) => {
    const patch = {};
    if (request.body?.role !== undefined) {
      if (!roles.includes(request.body.role)) throw new HttpError(400, `Роль должна быть одной из: ${roles.join(", ")}`);
      if (request.params.id === request.user.id && request.body.role !== "admin") throw new HttpError(400, "Нельзя снять роль администратора с самого себя");
      patch.role = request.body.role;
    }
    if (request.body?.name !== undefined) {
      const name = String(request.body.name).trim();
      if (name.length < 2 || name.length > 120) throw new HttpError(400, "Укажите имя от 2 до 120 символов");
      patch.name = name;
    }
    const user = await updateUser(request.params.id, patch);
    if (!user) throw new HttpError(404, "Пользователь не найден");
    response.json({ user: publicUser(user) });
  });

  router.delete("/:id", async (request, response) => {
    if (request.params.id === request.user.id) throw new HttpError(400, "Нельзя удалить самого себя");
    if (!(await deleteUser(request.params.id))) throw new HttpError(404, "Пользователь не найден");
    response.status(204).end();
  });

  return router;
}
