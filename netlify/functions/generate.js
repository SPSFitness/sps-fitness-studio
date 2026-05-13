exports.handler = async function(event, context) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: headers, body: "" };
  }

  var imgbbKey = process.env.IMGBB_KEY;
  if (!imgbbKey) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "IMGBB_KEY not configured" }) };
  }

  var body;
  try { body = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  try {
    var params = new URLSearchParams();
    params.append("key", imgbbKey);
    params.append("image", body.image);
    if (body.name) params.append("name", body.name);

    var response = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: params
    });
    var data = await response.json();

    if (data.success && data.data && data.data.url) {
      return { statusCode: 200, headers: headers, body: JSON.stringify({ url: data.data.url }) };
    } else {
      return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "Upload failed" }) };
    }
  } catch(err) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
