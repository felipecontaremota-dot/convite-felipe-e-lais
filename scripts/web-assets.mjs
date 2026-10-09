import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getExportWebBasePath, webPath } from "../config/web-paths.cjs";

const basePath = getExportWebBasePath();
const shell = webPath("", basePath);
const html = await readFile("dist/index.html", "utf8");
const decorated = html
  .replace(
    "</head>",
    `<link rel="manifest" href="${webPath("manifest.webmanifest", basePath)}"><meta name="theme-color" content="#183F35"></head>`,
  )
  .replace(
    "</body>",
    `<script>if('serviceWorker' in navigator && window.isSecureContext){window.addEventListener('load',()=>{navigator.serviceWorker.register(${JSON.stringify(webPath("sw.js", basePath))},{scope:${JSON.stringify(shell)}}).catch(()=>{});});}</script></body>`,
  );
await writeFile("dist/index.html", decorated);
// Pages serves this shell with a 404 status without changing the original URL.
await writeFile("dist/404.html", decorated);
await writeFile("dist/.nojekyll", "");

const manifest = JSON.parse(
  await readFile("dist/manifest.webmanifest", "utf8"),
);
manifest.start_url = shell;
manifest.scope = shell;
manifest.icons = manifest.icons.map((icon) => ({
  ...icon,
  src: webPath(icon.src, basePath),
}));
await writeFile(
  "dist/manifest.webmanifest",
  JSON.stringify(manifest, null, 2) + "\n",
);

async function files(directory) {
  const entries = await readdir(`dist/${directory}`, { recursive: true });
  return (
    await Promise.all(
      entries.map(async (name) =>
        (await stat(`dist/${directory}/${name}`)).isFile()
          ? `${directory}/${name.replaceAll("\\", "/")}`
          : null,
      ),
    )
  )
    .filter(Boolean)
    .sort();
}
const publicFiles = [
  "manifest.webmanifest",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  ...(await files("_expo")).filter((name) => /\.(js|css)$/.test(name)),
  ...(await files("assets")),
];
const precache = [shell, ...publicFiles.map((name) => webPath(name, basePath))];
const sourceWorker = await readFile("public/sw.js", "utf8");
const hash = createHash("sha256").update(decorated).update(sourceWorker);
for (const name of publicFiles) hash.update(await readFile(`dist/${name}`));
const version = hash.digest("hex").slice(0, 12);
const cachePrefix = `felipe-lais:${shell}:`;
const worker = sourceWorker.replace(
  /\/\/ BEGIN BUILD CONFIG[\s\S]*?\/\/ END BUILD CONFIG/,
  `// BEGIN BUILD CONFIG\nconst SHELL=${JSON.stringify(shell)};\nconst PRECACHE=${JSON.stringify(precache)};\nconst CACHE_PREFIX=${JSON.stringify(cachePrefix)};\nconst CACHE=CACHE_PREFIX+${JSON.stringify(version)};\n// END BUILD CONFIG`,
);
await writeFile("dist/sw.js", worker);
