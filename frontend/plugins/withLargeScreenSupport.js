/**
 * Evita il letterboxing su tablet Android stock (es. Lenovo): l'app deve
 * dichiararsi ridimensionabile, senza vincolo di aspect ratio, e libera
 * di ruotare. Non cambia i layout JS: solo il manifest nativo.
 */
const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

const ASPECT_META_NAMES = new Set(["android.max_aspect", "android.min_aspect"]);

function ensureSupportsScreens(manifest) {
  const current = manifest["supports-screens"]?.[0]?.$ ?? {};
  manifest["supports-screens"] = [
    {
      $: {
        ...current,
        "android:smallScreens": "true",
        "android:normalScreens": "true",
        "android:largeScreens": "true",
        "android:xlargeScreens": "true",
        "android:anyDensity": "true",
      },
    },
  ];
}

function stripAspectMeta(holder) {
  if (!holder["meta-data"]) return;
  holder["meta-data"] = holder["meta-data"].filter(
    (item) => !ASPECT_META_NAMES.has(item.$?.["android:name"]),
  );
}

function withLargeScreenSupport(config) {
  return withAndroidManifest(config, (modConfig) => {
    const androidManifest = modConfig.modResults;
    const manifest = androidManifest.manifest;
    if (!manifest) return modConfig;

    ensureSupportsScreens(manifest);

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
    application.$["android:resizeableActivity"] = "true";
    stripAspectMeta(application);

    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(androidManifest);
    activity.$["android:resizeableActivity"] = "true";
    activity.$["android:screenOrientation"] = "fullUser";
    delete activity.$["android:maxAspectRatio"];
    delete activity.$["android:minAspectRatio"];
    stripAspectMeta(activity);

    return modConfig;
  });
}

module.exports = withLargeScreenSupport;
