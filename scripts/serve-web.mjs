import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { getExportWebBasePath, webPath } from "../config/web-paths.cjs";

const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};
// Simulate Pages: unknown in-scope paths serve 404.html with HTTP 404, no redirect.
export function createExportServer({
  basePath = getExportWebBasePath(),
  root = resolve("dist"),
} = {}) {
  const shell = webPath("", basePath);
  return createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://internal").pathname,
      );
      if (basePath && pathname === basePath) {
        response.writeHead(301, { Location: shell }).end();
        return;
      }
      if (!pathname.startsWith(shell)) {
        response.writeHead(404).end("Outside application scope");
        return;
      }
      let file = resolve(root, pathname.slice(shell.length) || "index.html");
      if (file !== root && !file.startsWith(root + sep)) {
        response.writeHead(403).end();
        return;
      }
      let status = 200;
      try {
        if ((await stat(file)).isDirectory())
          file = resolve(file, "index.html");
        await stat(file);
      } catch {
        file = resolve(root, "404.html");
        status = 404;
      }
      const body = await readFile(file);
      response.writeHead(status, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(400).end();
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  createExportServer().listen(8082, "127.0.0.1", () =>
    console.log(
      `Export web servido na porta 8082 sob ${webPath("", getExportWebBasePath())}, com fallback 404 do Pages.`,
    ),
  );
}
