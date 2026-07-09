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
    var url = SHEETS_URL + "?action=" + encodeURIComponent(action);
    var res;

    if (event.httpMethod === "POST" && event.body) {
      // Apps Script needs the data in the POST body as plain text
      // It reads via e.postData.contents
      res = await fetch(url, {
        method: "POST",
        redirect: "follow",
        body: event.body
      });
    } else {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow"
      });
    }

    var text = await res.text();

    // Check if we got HTML back (error page or redirect failed)
    if (text.trim().startsWith("<!")) {
      return { statusCode: 502, headers, body: JSON.stringify({ 
        error: "Sheets returned HTML — possible redirect issue",
        status: res.status,
        url: res.url
      })};
    }

    return { statusCode: 200, headers, body: text };

  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
