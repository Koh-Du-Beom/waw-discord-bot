import { createConnection, type Socket } from "node:net";

const path = process.env.WAW_ADMIN_COMMAND_SOCKET;
if (!path) throw new Error("socket_path_missing");
const count = Number(process.env.WAW_HOLD_CONNECTIONS ?? "8");
const milliseconds = Number(process.env.WAW_HOLD_MS ?? "2000");
const sockets: Socket[] = [];
await Promise.all(Array.from({ length: count }, () =>
  new Promise<void>((resolve, reject) => {
    const socket = createConnection(path);
    sockets.push(socket);
    socket.once("connect", resolve);
    socket.once("error", reject);
  }),
));
process.stdout.write("connections_held\n");
await new Promise((resolve) => setTimeout(resolve, milliseconds));
for (const socket of sockets) socket.destroy();
