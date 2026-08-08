// Simple in-memory store with localStorage as the real persistence
// The browser handles persistence — this function just proxies between devices
// Uses Netlify's built-in environment for Blobs when available

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

  var empty = key === "history" ? { history: [] } : key === "images" ? { images: [] } : key === "queue" ? { queue: [] } : {};

  try {
    // Try Netlify Blobs with auto-detected context
    var { getStore } = require("@netlify/blobs");
    var store = getStore("sps-content");

    if (action.startsWith("get")) {
      var val = await store.get(key);
      if (!val) return { statusCode: 200, headers, body: JSON.stringify(empty) };
      return { statusCode: 200, headers, body: val };
    } else {
      await store.set(key, event.body || "{}");
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
  } catch(e) {
    // Blobs not available — return empty for reads, ok for writes
    // Browser localStorage handles persistence on same device
    if (action.startsWith("get")) {
      return { statusCode: 200, headers, body: JSON.stringify(empty) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }
};
