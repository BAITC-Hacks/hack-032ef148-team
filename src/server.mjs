import { config } from "./config.mjs";
import { closeStore, initStore } from "./store.mjs";
import { createApp } from "./app.mjs";

const store = await initStore(config.databaseUrl);
const app = createApp({ storeMode: store.mode });
const server = app.listen(config.port, config.host, () => {
  console.log(`БАТЫС AI: http://127.0.0.1:${config.port} · storage=${store.mode}`);
});

function shutdown() {
  server.close(async () => {
    await closeStore();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
