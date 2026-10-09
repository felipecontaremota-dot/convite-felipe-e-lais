// Android 11+ package visibility for documented map/ride schemes used by canOpenURL.
const { withAndroidManifest } = require("expo/config-plugins");
module.exports = function withMapQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const queries = manifest.queries || (manifest.queries = [{}]);
    const intents = queries[0].intent || (queries[0].intent = []);
    for (const scheme of ["google.navigation", "waze", "uber"]) {
      if (
        !intents.some((intent) =>
          intent.data?.some((data) => data.$?.["android:scheme"] === scheme),
        )
      ) {
        intents.push({
          action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
          data: [{ $: { "android:scheme": scheme } }],
        });
      }
    }
    return config;
  });
};
