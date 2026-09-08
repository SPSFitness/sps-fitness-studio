// netlify/functions/store.js
// Cross-device store for SPS Content Studio, backed by Netlify Blobs.
// Includes an envcheck action to confirm the environment variables are reaching
// the function, and surfaces real errors instead of faking success on writes.
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

  // Diagnostic: reports whether the env vars are present, without exposing values.
  if (action === "envcheck") {
    return { statusCode: 200, headers, body: JSON.stringify({
      hasSiteId: !!process.env.NETLIFY_SITE_ID,
      siteIdLen: (process.env.NETLIFY_SITE_ID || "").length,
      hasToken: !!process.env.NETLIFY_BLOBS_TOKEN,
      tokenLen: (process.env.NETLIFY_BLOBS_TOKEN || "").length
    }) };
  }

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

    var siteID = process.env.NETLIFY_SITE_ID;
    var token = process.env.NETLIFY_BLOBS_TOKEN;

    // If explicit creds are present use them; otherwise fall back to the
    // auto-configured context (works when Blobs is enabled on the site).
    var store = (siteID && token)
      ? getStore({ name: "sps-content", siteID: siteID, token: token })
      : getStore("sps-content");

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
