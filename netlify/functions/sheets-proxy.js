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
    var fetchOptions;

    if (event.httpMethod === "POST" && event.body) {
      // For POST requests, send as URL params since Apps Script reads them via e.parameter
      fetchOptions = {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "action=" + action
      };
      // But also pass the JSON body — Apps Script reads via e.postData.contents
      fetchOptions = {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain" },
        body: event.body
      };
      url = SHEETS_URL + "?action=" + action;
    } else {
      fetchOptions = { method: "GET", redirect: "follow" };
    }

    var res = await fetch(url, fetchOptions);
    var text = await res.text();

    // Verify it's JSON
    try { JSON.parse(text); } catch(e) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Sheets returned non-JSON", preview: text.substring(0, 100) }) };
    }

    return { statusCode: 200, headers, body: text };

  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
