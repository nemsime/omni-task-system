import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api";

export function createSocket(telegramId: string): Socket {
  return io(API_URL, {
    auth: { telegramId },
    transports: ["websocket"],
  });
}
