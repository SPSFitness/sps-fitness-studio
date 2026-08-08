const { getStore } = require("@netlify/blobs");

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
    const store = getStore({
      name: "sps-content",
      siteID: process.env.NETLIFY_SITE_ID || "merry-flan-9e55eb",
      token: process.env.NETLIFY_TOKEN
    });

    if (!process.env.NETLIFY_TOKEN) {
      // No token — return empty for reads, ok for writes (silent fail)
      var empty = key === "history" ? { history: [] } : key === "images" ? { images: [] } : key === "queue" ? { queue: [] } : {};
      return { statusCode: 200, headers, body: JSON.stringify(action.startsWith("get") ? empty : { ok: true }) };
    }

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
