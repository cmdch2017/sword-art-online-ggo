import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { contentTypeFor } from "./src/server-mime.mjs";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const privateBuild = process.argv.includes("--private");
const entryFile = privateBuild ? "/刀剑神域GGO.html" : "/docs/index.html";

createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const relative = decodeURIComponent(url.pathname === "/" ? entryFile : url.pathname);
    const target = path.resolve(root, `.${relative}`);
    if (!target.startsWith(root)) throw new Error("Path outside workspace");
    const content = await readFile(target);
    response.writeHead(200, {
      "Content-Type": contentTypeFor(target),
      "Cache-Control": "no-store"
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving http://127.0.0.1:${port}`);
});
