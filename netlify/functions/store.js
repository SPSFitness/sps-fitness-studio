// netlify/functions/store.js
// Cross-device store for SPS Content Studio, backed by Netlify Blobs.
// The catch no longer fakes success on write — a failed write now returns the
// real error so problems are visible instead of silently losing data.
exports.handler = async function(event) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  var params = event.queryStringParameters || {};
  var action = params.action;

  if (action === "ping") return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };

  var keyMap = {
    getImages: "images", saveImages: "images",
    getHistory: "history", saveHistory: "history",
    getQueue: "queue", saveQueue: "queue",
    getAuth: "google-auth", saveAuth: "google-auth"
  };
  var key = keyMap[action];
  if (!key) return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action" }) };

  var empty = key === "history" ? { history: [] }
            : key === "images"  ? { images: [] }
            : key === "queue"   ? { queue: [] }
            : {};

  try {
    var { getStore } = require("@netlify/blobs");

    // Explicit config. The auto-detected context is not always present in
    // functions, which is what made every write throw and get swallowed.
    var store = getStore({
      name: "sps-content",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN
    });

    if (action.indexOf("get") === 0) {
      var val = await store.get(key);
      if (!val) return { statusCode: 200, headers, body: JSON.stringify(empty) };
      return { statusCode: 200, headers, body: val };
    } else {
      await store.set(key, event.body || "{}");
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
  } catch (e) {
    // Surface the real error. Never pretend a write succeeded.
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: String((e && e.message) || e), action: action })
    };
  }
};
