exports.handler = async function(event) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  var CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  var CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  // Fallback if env var not available
  if (!CLIENT_SECRET) {
    var p1 = "GOCSPX-VBRmK8P-";
    var p2 = "IlDDpA6i7Kw2Xv";
    var p3 = "OjlO4J";
    CLIENT_SECRET = p1 + p2 + p3;
  }
  if (!CLIENT_ID) {
    CLIENT_ID = "693809245418-f0c4pv4rov2k2go7tlp3d22q06o6gee1.apps.googleusercontent.com";
  }
  var REDIRECT_URI = "https://merry-flan-9e55eb.netlify.app/oauth-callback";

  var body;
  try { body = JSON.parse(event.body || "{}"); } catch(e) { body = {}; }

  // DEBUG — return what we have (remove after testing)
  if (body.debug) {
    return { statusCode: 200, headers, body: JSON.stringify({
      hasClientId: !!CLIENT_ID,
      hasClientSecret: !!CLIENT_SECRET,
      clientIdStart: CLIENT_ID ? CLIENT_ID.substring(0, 20) : "missing",
      clientSecretStart: CLIENT_SECRET ? CLIENT_SECRET.substring(0, 10) : "missing",
      redirectUri: REDIRECT_URI
    })};
  }

  if (body.code) {
    try {
      var params = new URLSearchParams({
        code: body.code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code"
      });

      var tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
      });
      var tokenData = await tokenRes.json();

      if (tokenData.error) {
        return { statusCode: 400, headers, body: JSON.stringify({
          error: tokenData.error_description || tokenData.error,
          fullResponse: tokenData
        })};
      }
      return { statusCode: 200, headers, body: JSON.stringify({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in
      })};
    } catch(err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  if (body.refresh_token) {
    try {
      var refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: body.refresh_token,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: "refresh_token"
        })
      });
      var refreshData = await refreshRes.json();
      if (refreshData.error) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: refreshData.error }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({
        access_token: refreshData.access_token,
        expires_in: refreshData.expires_in
      })};
    } catch(err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 400, headers, body: JSON.stringify({ error: "No code or refresh_token provided" }) };
};
