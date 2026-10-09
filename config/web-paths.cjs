// Build-time configuration shared by Expo and the export/preview scripts.
function getWebBasePath(value = process.env.EXPO_PUBLIC_WEB_BASE_PATH || "") {
  if (value === "" || value === "/") return "";
  const normalized = value.replace(/\/+$/, "");
  if (!/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(normalized)) {
    throw new Error(
      "EXPO_PUBLIC_WEB_BASE_PATH must be / or an absolute path of safe segments.",
    );
  }
  return normalized;
}

function webPath(path = "", basePath = getWebBasePath()) {
  return `${basePath}/${path.replace(/^\/+/, "")}`;
}

function getExportWebBasePath() {
  // Match Expo export's production dotenv precedence without exposing/mutating other keys.
  const { parseProjectEnv } = require("@expo/env");
  const { env } = parseProjectEnv(process.cwd(), {
    mode: "production",
    silent: true,
  });
  return getWebBasePath(
    process.env.EXPO_PUBLIC_WEB_BASE_PATH ??
      env.EXPO_PUBLIC_WEB_BASE_PATH ??
      "",
  );
}

exports.getWebBasePath = getWebBasePath;
exports.webPath = webPath;
exports.getExportWebBasePath = getExportWebBasePath;
