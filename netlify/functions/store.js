// Simple key-value store using Netlify Blobs REST API
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

  var SITE_ID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  var TOKEN = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_TOKEN;

  // Use Netlify Blobs API
  var BASE = "https://api.netlify.com/api/v1/sites/" + SITE_ID + "/blobs";
  var authHeaders = { "Authorization": "Bearer " + TOKEN, "Content-Type": "application/json" };

  var keyMap = {
    getImages: "images", saveImages: "images",
    getHistory: "history", saveHistory: "history",
    getQueue: "queue", saveQueue: "queue"
  };

  var key = keyMap[action];

  if (action === "ping") return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };

  if (!key) return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action: " + action }) };

  try {
    if (action.startsWith("get")) {
      var res = await fetch(BASE + "/" + key, { headers: authHeaders });
      if (res.status === 404) {
        var empty = key === "images" ? { images: [] } : key === "history" ? { history: [] } : { queue: [] };
        return { statusCode: 200, headers, body: JSON.stringify(empty) };
      }
      var text = await res.text();
      return { statusCode: 200, headers, body: text };
    } else {
      var body = event.body || "{}";
      var res = await fetch(BASE + "/" + key, {
        method: "PUT",
        headers: authHeaders,
        body: body
      });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
