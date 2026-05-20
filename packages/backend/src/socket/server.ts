import type http from "node:http";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@dollhouse/shared";
import { Server } from "socket.io";
import type { Delegator } from "../delegator/Delegator.js";
import { env } from "../env.js";
import { registerHandlers } from "./handlers.js";

export type IO = Server<ClientToServerEvents, ServerToClientEvents>;

export function createSocketServer(
  httpServer: http.Server,
  delegator: Delegator,
): IO {
  const io: IO = new Server(httpServer, {
    cors: { origin: env.FRONTEND_ORIGIN, methods: ["GET", "POST"] },
    transports: ["websocket", "polling"],
  });

  setInterval(() => {
    io.emit("heartbeat", { ts: Date.now() });
  }, 5000);

  io.on("connection", (socket) => {
    console.log(`[socket] connected ${socket.id}`);
    socket.emit("heartbeat", { ts: Date.now() });
    socket.emit("log", {
      level: "info",
      message: `Welcome — delegator provider: ${delegator.providerName}`,
    });

    registerHandlers(io, socket, delegator);

    socket.on("disconnect", (reason) => {
      console.log(`[socket] disconnected ${socket.id} (${reason})`);
    });
  });

  return io;
}
