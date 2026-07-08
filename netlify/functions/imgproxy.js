exports.handler = async function(event) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: headers, body: "" };
  }

  var url = event.queryStringParameters && event.queryStringParameters.url;
  if (!url) {
    return { statusCode: 400, headers: headers, body: "Missing url parameter" };
  }

  // Only allow Google Drive/lh3 URLs
  if (!url.includes("drive.google.com") && !url.includes("lh3.googleusercontent.com") && !url.includes("googleusercontent.com")) {
    return { statusCode: 403, headers: headers, body: "URL not allowed" };
  }

  try {
    var response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    var contentType = response.headers.get("content-type") || "image/jpeg";
    var buffer = await response.arrayBuffer();
    var base64 = Buffer.from(buffer).toString("base64");

    return {
      statusCode: 200,
      headers: {
        ...headers,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400"
      },
      body: base64,
      isBase64Encoded: true
    };
  } catch(err) {
    return { statusCode: 500, headers: headers, body: err.message };
  }
};
