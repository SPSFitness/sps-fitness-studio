// Proxies Google Sheets requests — uses GET only to avoid CORS preflight
exports.handler = async function(event) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  var SHEETS_URL = "https://script.google.com/macros/s/AKfycbyPSdZtx3IXDfiYfqwjKN1b5o-7sr43By0bvz9OlfOnaDQGFaicgEmgjkvKG1IR6wkpDQ/exec";
  var params = event.queryStringParameters || {};
  var action = params.action;

  if (!action) return { statusCode: 400, headers, body: JSON.stringify({ error: "No action" }) };

  try {
    var url;
    
    // For write operations encode data in URL as GET param to avoid CORS preflight
    if (event.body && event.httpMethod === "POST") {
      var encoded = encodeURIComponent(event.body);
      url = SHEETS_URL + "?action=" + action + "&data=" + encoded;
    } else {
      url = SHEETS_URL + "?action=" + action;
    }

    var res = await fetch(url, { method: "GET", redirect: "follow" });
    var text = await res.text();

    if (text.trim().startsWith("<")) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Sheets returned HTML", status: res.status }) };
    }

    return { statusCode: 200, headers, body: text };
  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
