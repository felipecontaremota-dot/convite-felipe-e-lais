import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
const path = "dist/index.html";
const html = await readFile(path, "utf8");
const decorated = html
  .replace(
    "</head>",
    '<link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#183F35"></head>',
  )
  .replace(
    "</body>",
    `<script>if('serviceWorker' in navigator && window.isSecureContext){window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{});});}</script></body>`,
  );
await writeFile(path, decorated);
const bundles = await readdir("dist/_expo/static/js/web");
const paths = await readdir("dist/assets", { recursive: true });
const assets = (
  await Promise.all(
    paths.map(async (name) =>
      (await stat(`dist/assets/${name}`)).isFile() ? name : null,
    ),
  )
).filter(Boolean);
const precache = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  ...bundles
    .filter((name) => name.endsWith(".js"))
    .map((name) => `/_expo/static/js/web/${name}`),
  ...assets.map((name) => `/assets/${name}`),
];
const version = createHash("sha256")
  .update(decorated)
  .digest("hex")
  .slice(0, 12);
const worker = (await readFile("dist/sw.js", "utf8"))
  .replace(
    /const CACHE = ["'][^"']+["'];/,
    `const CACHE = 'felipe-lais-${version}';`,
  )
  .replace(/cache\.addAll\(\[[\s\S]*?\]\)/, "cache.addAll(PRECACHE)");
await writeFile(
  "dist/sw.js",
  `const PRECACHE=${JSON.stringify(precache)};\n${worker}`,
);
