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
    // Check image size - Netlify limit is 6MB
    var imageData = body.image || "";
    var sizeBytes = Math.round(imageData.length * 0.75);
    if (sizeBytes > 5000000) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ error: "Image too large. Please use images under 5MB." }) };
    }

    var params = new URLSearchParams();
    params.append("key", imgbbKey);
    params.append("image", imageData);
    if (body.name) params.append("name", body.name);

    var response = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: params
    });

    var data = await response.json();

    if (data.success && data.data && data.data.url) {
      return { statusCode: 200, headers: headers, body: JSON.stringify({ url: data.data.url, display_url: data.data.display_url }) };
    } else {
      // Return actual ImgBB error for debugging
      var errMsg = data.error ? (data.error.message || JSON.stringify(data.error)) : "Upload failed - status: " + response.status;
      return { statusCode: 500, headers: headers, body: JSON.stringify({ error: errMsg, imgbb_response: data }) };
    }
  } catch(err) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
