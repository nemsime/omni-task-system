import type { Server as HttpServer } from "http";
import { Server as IOServer } from "socket.io";

let io: IOServer | null = null;

export function initRealtime(httpServer: HttpServer) {
  io = new IOServer(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    const telegramId = socket.handshake.auth?.telegramId;

    if (typeof telegramId === "string" && telegramId.length > 0) {
      socket.join(roomFor(telegramId));
      console.log(`🔌 client joined room ${roomFor(telegramId)}`);
    } else {
      console.log("🔌 client connected without telegramId (no room joined)");
    }
  });

  console.log("📡 Realtime layer initialized");
}

function roomFor(telegramId: string) {
  return `user:${telegramId}`;
}

export function emitTaskCreated(telegramId: string, task: unknown) {
  if (!io) return;
  io.to(roomFor(telegramId)).emit("task:created", task);
}

export function emitTaskUpdated(telegramId: string, task: unknown) {
  if (!io) return;
  io.to(roomFor(telegramId)).emit("task:updated", task);
}

export function emitTaskDeleted(
  telegramId: string,
  payload: { id: number; taskNumber: number }
) {
  if (!io) return;
  io.to(roomFor(telegramId)).emit("task:deleted", payload);
}
