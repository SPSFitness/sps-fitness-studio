// Simple store using fetch to Netlify Blobs REST API
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

  // Use process.env vars injected by Netlify for Blobs
  var siteId = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  var token = process.env.NETLIFY_BLOBS_TOKEN || process.env.TOKEN;

  var keyMap = {
    getImages: "images", saveImages: "images",
    getHistory: "history", saveHistory: "history",
    getQueue: "queue", saveQueue: "queue"
  };
  var key = keyMap[action];
  if (!key) return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action: " + action }) };

  // Fall back to in-memory if no Blobs credentials
  if (!siteId || !token) {
    // Just return empty for reads, ok for writes
    if (action.startsWith("get")) {
      var empty = action === "getImages" ? { images: [] } : action === "getHistory" ? { history: [] } : { queue: [] };
      return { statusCode: 200, headers, body: JSON.stringify(empty) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, note: "No Blobs credentials" }) };
  }

  var BASE = "https://api.netlify.com/api/v1/blobs/" + siteId + "/site/" + key;
  var authHeaders = { "Authorization": "Bearer " + token };

  try {
    if (action.startsWith("get")) {
      var res = await fetch(BASE, { headers: authHeaders });
      if (res.status === 404) {
        var empty = action === "getImages" ? { images: [] } : action === "getHistory" ? { history: [] } : { queue: [] };
        return { statusCode: 200, headers, body: JSON.stringify(empty) };
      }
      var text = await res.text();
      return { statusCode: 200, headers, body: text };
    } else {
      var res = await fetch(BASE, {
        method: "PUT",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: event.body
      });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
