import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { initStore } from "../src/store.mjs";
import { createApp } from "../src/app.mjs";

let server;
let base;

before(async () => {
  const store = await initStore("");
  server = createApp({ storeMode: store.mode }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

async function call(method, path, { body, token } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test("auth, roles and signed expert review work end to end", async () => {
  const analysis = (await call("POST", "/api/demo/synthetic", { body: {} })).body;
  const findingPath = `/api/analyses/${analysis.id}/findings/${analysis.findings[0].id}`;

  // Anonymous visitors can analyze and read, but not sign decisions.
  assert.equal((await call("PATCH", findingPath, { body: { status: "approved" } })).status, 401);

  // Validation.
  assert.equal((await call("POST", "/api/auth/signup", { body: { email: "bad", password: "12345678", name: "Иван" } })).status, 400);
  assert.equal((await call("POST", "/api/auth/signup", { body: { email: "a@b.kz", password: "short", name: "Иван" } })).status, 400);

  // First account becomes admin, the next ones experts.
  const admin = await call("POST", "/api/auth/signup", { body: { email: "admin@batys.kz", password: "admin-pass-1", name: "Админ" } });
  assert.equal(admin.status, 201);
  assert.equal(admin.body.user.role, "admin");
  assert.equal(admin.body.user.passwordHash, undefined);
  const expert = await call("POST", "/api/auth/signup", { body: { email: "Expert@Batys.kz", password: "expert-pass-1", name: "Эксперт Айгерим" } });
  assert.equal(expert.body.user.role, "expert");
  assert.equal(expert.body.user.email, "expert@batys.kz");
  assert.equal((await call("POST", "/api/auth/signup", { body: { email: "expert@batys.kz", password: "another-pass", name: "Дубль" } })).status, 409);

  assert.equal((await call("POST", "/api/auth/signin", { body: { email: "expert@batys.kz", password: "wrong-pass-1" } })).status, 401);
  const signin = await call("POST", "/api/auth/signin", { body: { email: "expert@batys.kz", password: "expert-pass-1" } });
  assert.equal(signin.status, 200);
  const token = signin.body.token;

  // A signed decision records who made it and shows up in the report.
  const reviewed = await call("PATCH", findingPath, { token, body: { status: "approved", comment: "Подтверждаю" } });
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.body.findings.find((item) => item.id === analysis.findings[0].id).reviewedBy.name, "Эксперт Айгерим");
  const report = await (await fetch(`${base}/api/analyses/${analysis.id}/report`)).text();
  assert.match(report, /эксперт: Эксперт Айгерим/);

  // User management is admin-only.
  assert.equal((await call("GET", "/api/users", { token })).status, 403);
  const users = await call("GET", "/api/users", { token: admin.body.token });
  assert.equal(users.body.items.length, 2);
  const promoted = await call("PATCH", `/api/users/${expert.body.user.id}`, { token: admin.body.token, body: { role: "admin" } });
  assert.equal(promoted.body.user.role, "admin");
  assert.equal((await call("PATCH", `/api/users/${admin.body.user.id}`, { token: admin.body.token, body: { role: "expert" } })).status, 400);

  // Logout revokes every token issued before it.
  assert.equal((await call("GET", "/api/auth/me", { token })).status, 200);
  assert.equal((await call("POST", "/api/auth/logout", { token })).status, 204);
  assert.equal((await call("GET", "/api/auth/me", { token })).status, 401);

  assert.equal((await call("DELETE", `/api/users/${expert.body.user.id}`, { token: admin.body.token })).status, 204);
  assert.equal((await call("GET", "/api/nope")).status, 404);
});
