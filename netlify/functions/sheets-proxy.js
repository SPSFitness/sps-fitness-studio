// Proxies all Google Sheets requests to avoid CORS issues from non-Netlify domains
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

  if (!action) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "No action specified" }) };
  }

  try {
    var url = SHEETS_URL + "?action=" + action;
    var fetchOptions = { method: "GET" };

    if (event.httpMethod === "POST" && event.body) {
      fetchOptions = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: event.body
      };
      url = SHEETS_URL + "?action=" + action;
    }

    var res = await fetch(url, fetchOptions);
    var text = await res.text();

    return { statusCode: 200, headers, body: text };

  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
