// Netlify Blobs store using built-in context (no SDK needed)
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
  if (!key) return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action: " + action }) };

  try {
    // Use @netlify/blobs via dynamic require (available in Netlify runtime)
    var blobs;
    try {
      blobs = require("@netlify/blobs");
    } catch(e) {
      // Fallback if not available
      return { statusCode: 200, headers, body: JSON.stringify(
        action.startsWith("get") 
          ? (key === "history" ? { history: [] } : key === "images" ? { images: [] } : { queue: [] })
          : { ok: true, note: "blobs unavailable" }
      )};
    }

    const store = blobs.getStore("sps-content");

    if (action.startsWith("get")) {
      const val = await store.get(key);
      if (!val) {
        var empty = key === "history" ? { history: [] } : key === "images" ? { images: [] } : key === "queue" ? { queue: [] } : {};
        return { statusCode: 200, headers, body: JSON.stringify(empty) };
      }
      return { statusCode: 200, headers, body: val };
    } else {
      await store.set(key, event.body || "{}");
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
