// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const { FileStore } = require("metro-cache");
const https = require("https");

const config = getDefaultConfig(__dirname);

// Use a stable on-disk store (shared across web/android)
const root = process.env.METRO_CACHE_ROOT || path.join(__dirname, ".metro-cache");
config.cacheStores = [
  new FileStore({ root: path.join(root, "cache") }),
];

config.maxWorkers = 2;

/**
 * Proxy locale CEI per il preview web (i proxy CORS pubblici spesso falliscono).
 * GET /cei-liturgia?data-liturgia=YYYYMMDD
 */
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      try {
        const rawUrl = req.url || "";
        if (!rawUrl.startsWith("/cei-liturgia")) {
          return middleware(req, res, next);
        }
        const u = new URL(rawUrl, "http://localhost");
        const data = (u.searchParams.get("data-liturgia") || "").replace(/\D/g, "");
        if (!/^\d{8}$/.test(data)) {
          res.statusCode = 400;
          res.end("Missing data-liturgia=YYYYMMDD");
          return;
        }
        const target =
          "https://www.chiesacattolica.it/liturgia-del-giorno/?data-liturgia=" + data;
        https
          .get(
            target,
            {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
                "Accept-Language": "it-IT,it;q=0.9",
                Accept: "text/html,application/xhtml+xml",
              },
            },
            (up) => {
              res.statusCode = up.statusCode || 502;
              res.setHeader("Content-Type", "text/html; charset=utf-8");
              res.setHeader("Access-Control-Allow-Origin", "*");
              up.pipe(res);
            },
          )
          .on("error", (err) => {
            res.statusCode = 502;
            res.end(String(err && err.message ? err.message : err));
          });
        return;
      } catch (e) {
        res.statusCode = 500;
        res.end(String(e && e.message ? e.message : e));
      }
    };
  },
};

module.exports = config;
