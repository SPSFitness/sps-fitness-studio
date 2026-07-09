// Netlify Blobs storage — replaces Google Sheets backend
// Works from any domain, no CORS issues, free on Netlify
const { getStore } = require("@netlify/blobs");

exports.handler = async function(event) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  var params = event.queryStringParameters || {};
  var action = params.action;

  const store = getStore("sps-fitness");

  try {
    // GET actions
    if (action === "getImages") {
      var val = await store.get("images");
      return { statusCode: 200, headers, body: JSON.stringify({ images: val ? JSON.parse(val) : [] }) };
    }
    if (action === "getHistory") {
      var val = await store.get("history");
      return { statusCode: 200, headers, body: JSON.stringify({ history: val ? JSON.parse(val) : [] }) };
    }
    if (action === "getQueue") {
      var val = await store.get("queue");
      return { statusCode: 200, headers, body: JSON.stringify({ queue: val ? JSON.parse(val) : [] }) };
    }
    if (action === "ping") {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // POST actions
    var body = {};
    try { body = JSON.parse(event.body || "{}"); } catch(e) {}

    if (action === "saveImages") {
      await store.set("images", JSON.stringify(body.images || []));
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
    if (action === "saveHistory") {
      await store.set("history", JSON.stringify(body.history || []));
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }
    if (action === "saveQueue") {
      await store.set("queue", JSON.stringify(body.queue || []));
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action: " + action }) };

  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
