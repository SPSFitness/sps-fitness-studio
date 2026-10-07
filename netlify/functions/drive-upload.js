// netlify/functions/drive-upload.js
// Uploads a generated overlay image (base64 PNG) into a specific Drive folder
// and returns a public, high-resolution URL for the CSV. Sibling to drive-move.js.
// Uses the user's OAuth access token (passed from the browser, same as drive-move).

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  try {
    var body = JSON.parse(event.body || "{}");
    var accessToken = body.accessToken;
    var folderId = body.folderId;
    var filename = body.filename || ("sps-overlay-" + Date.now() + ".png");
    var base64 = body.imageBase64;   // PNG data, no data: prefix

    if (!accessToken) return { statusCode: 400, body: JSON.stringify({ error: "Missing accessToken" }) };
    if (!folderId)    return { statusCode: 400, body: JSON.stringify({ error: "Missing folderId" }) };
    if (!base64)      return { statusCode: 400, body: JSON.stringify({ error: "Missing imageBase64" }) };

    // Multipart upload: metadata part + media part.
    var boundary = "sps_boundary_" + Date.now();
    var metadata = { name: filename, parents: [folderId] };

    var multipartBody =
      "--" + boundary + "\r\n" +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) + "\r\n" +
      "--" + boundary + "\r\n" +
      "Content-Type: image/png\r\n" +
      "Content-Transfer-Encoding: base64\r\n\r\n" +
      base64 + "\r\n" +
      "--" + boundary + "--";

    var uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
      {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + accessToken,
          "Content-Type": "multipart/related; boundary=" + boundary
        },
        body: multipartBody
      }
    );
    var uploadJson = await uploadRes.json();
    if (!uploadRes.ok || !uploadJson.id) {
      return { statusCode: 500, body: JSON.stringify({ error: "Upload failed", detail: uploadJson }) };
    }
    var fileId = uploadJson.id;

    // Make it readable by anyone with the link, so GHL can fetch it.
    await fetch("https://www.googleapis.com/drive/v3/files/" + fileId + "/permissions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + accessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ role: "reader", type: "anyone" })
    });

    // Return the direct-download URL (full-resolution, the format that publishes sharp).
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        fileId: fileId,
        url: "https://drive.google.com/uc?export=download&id=" + fileId
      })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e && e.message || e) }) };
  }
};
