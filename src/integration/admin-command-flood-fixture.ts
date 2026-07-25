import { createConnection } from "node:net";

const path = process.env.WAW_ADMIN_COMMAND_SOCKET;
if (!path) throw new Error("socket_path_missing");
await Promise.all(Array.from({ length: 64 }, (_, index) =>
  new Promise<void>((resolve) => {
    const socket = createConnection(path);
    socket.once("error", () => resolve());
    socket.once("close", () => resolve());
    socket.once("connect", () => {
      socket.end(index % 2 === 0 ? "{bad}\n" : "{}\n{}\n");
    });
    socket.resume();
  }),
));
process.stdout.write("malformed_flood_complete\n");
