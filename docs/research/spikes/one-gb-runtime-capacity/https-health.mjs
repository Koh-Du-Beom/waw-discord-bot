import fs from "node:fs";
import https from "node:https";

const [portText = "443", certificatePath, privateKeyPath] = process.argv.slice(2);
const port = Number(portText);
if (!Number.isInteger(port) || port < 1 || port > 65535 || !certificatePath || !privateKeyPath) {
  throw new Error("usage: node https-health.mjs port certificate-path private-key-path");
}

const server = https.createServer(
  {
    cert: fs.readFileSync(certificatePath),
    key: fs.readFileSync(privateKeyPath),
  },
  (request, response) => {
    if (request.method !== "GET" || request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true }));
  },
);

server.listen(port, "0.0.0.0");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
