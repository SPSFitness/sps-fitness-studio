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

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  var imgbbKey = process.env.IMGBB_KEY;
  if (!imgbbKey) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: "IMGBB_KEY not configured" }) };
  }

  var body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers: headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  try {
    var imageData = body.image || "";
    if (!imageData) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ error: "No image data provided" }) };
    }

    // Strip data URL prefix if present
    if (imageData.indexOf("base64,") !== -1) {
      imageData = imageData.split("base64,")[1];
    }

    // Check size - Netlify limit is 6MB
    var sizeBytes = Math.round(imageData.length * 0.75);
    if (sizeBytes > 5 * 1024 * 1024) {
      return { statusCode: 413, headers: headers, body: JSON.stringify({ error: "Image too large (>5MB). Try a smaller file." }) };
    }

    // Use FormData (multipart) instead of URLSearchParams - avoids encoding bloat
    var form = new FormData();
    form.append("key", imgbbKey);
    form.append("image", imageData);
    if (body.name) form.append("name", body.name);

    var response = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: form
    });

    var data;
    try {
      data = await response.json();
    } catch (e) {
      return { statusCode: 502, headers: headers, body: JSON.stringify({ error: "ImgBB returned non-JSON response", status: response.status }) };
    }

    if (data.success && data.data) {
      // Use data.image.url for original quality, not display_url which is compressed
      var originalUrl = (data.data.image && data.data.image.url) || data.data.url;
      return {
        statusCode: 200,
        headers: headers,
        body: JSON.stringify({ url: originalUrl, display_url: data.data.display_url || originalUrl })
      };
    }

    var errMsg = data && data.error ? (data.error.message || JSON.stringify(data.error)) : "Upload failed — HTTP " + response.status;
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: errMsg }) };

  } catch (err) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: err.message }) };
  }
};
