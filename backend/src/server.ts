import http from "http";
import app from "./app";
import { initRealtime } from "./realtime";
import { setupTelegramBot } from "./telegram/bot";
import { startVoiceWorker } from "./voice/worker";

const PORT = process.env.PORT || 5000;

const telegramBot = setupTelegramBot(app);
const httpServer = http.createServer(app);
initRealtime(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  telegramBot?.start().catch((err) => {
    console.error("Telegram bot startup failed:", err?.message);
  });
  startVoiceWorker();
});
