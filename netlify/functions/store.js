// Persistent key-value store backed by Netlify Blobs.
//
// Uses a *site* store (getStore), so data survives new deploys and browser
// sessions — unlike getDeployStore, which is wiped on every deploy. Strong
// consistency guarantees a value written from one browser is readable
// immediately from another.
//
// The browser contract is unchanged: the frontend POSTs the full JSON body for
// a save (e.g. {"images":[...]}) and expects that same JSON back on the
// matching read, so we persist and return the raw body verbatim.
const { getStore } = require("@netlify/blobs");

// action -> blob key
const KEY_MAP = {
  getImages: "images",    saveImages: "images",
  getHistory: "history",  saveHistory: "history",
  getQueue: "queue",      saveQueue: "queue",
  getAuth: "google-auth", saveAuth: "google-auth"
};

// What a read returns when nothing has been saved yet — shaped exactly like the
// frontend expects so it can destructure d.images / d.history / d.queue.
const EMPTY = {
  images: '{"images":[]}',
  history: '{"history":[]}',
  queue: '{"queue":[]}',
  "google-auth": "{}"
};

function openStore() {
  // Automatic configuration works on deployed Netlify functions: the SDK reads
  // the NETLIFY_BLOBS_CONTEXT that the runtime injects. If you ever hit
  // "environment has not been configured", set two site environment variables —
  // NETLIFY_SITE_ID and NETLIFY_API_TOKEN (a Netlify personal access token) —
  // and the explicit path below takes over. No code change required.
  const opts = { name: "sps-kv", consistency: "strong" };
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN;
  if (siteID && token) {
    opts.siteID = siteID;
    opts.token = token;
  }
  return getStore(opts);
}

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const params = event.queryStringParameters || {};
  const action = params.action;

  if (action === "ping") return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };

  const key = KEY_MAP[action];
  if (!key) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action: " + action }) };
  }

  try {
    const store = openStore();

    if (action.indexOf("get") === 0) {
      const raw = await store.get(key, { type: "text" });
      return { statusCode: 200, headers, body: raw != null ? raw : (EMPTY[key] || "{}") };
    }

    // save*: persist the exact JSON the browser sent.
    await store.set(key, event.body || (EMPTY[key] || "{}"));
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
