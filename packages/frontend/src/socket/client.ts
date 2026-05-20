import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@dollhouse/shared";
import { type Socket, io } from "socket.io-client";

declare const __BACKEND_URL__: string;

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let _socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (_socket) return _socket;
  _socket = io(__BACKEND_URL__, {
    transports: ["websocket"],
    autoConnect: true,
  });
  return _socket;
}
