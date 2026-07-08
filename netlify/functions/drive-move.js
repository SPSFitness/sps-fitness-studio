// Moves used Google Drive files to a "Used" subfolder using OAuth access token
exports.handler = async function(event) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  var body;
  try { body = JSON.parse(event.body); } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  var accessToken = body.accessToken;
  var driveIds = body.driveIds || [];
  var FOLDER_ID = "1611vCEdMo-ikeYBzhjv0LqYtTqo3ewnG";

  if (!accessToken) return { statusCode: 401, headers, body: JSON.stringify({ error: "No access token" }) };
  if (!driveIds.length) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, moved: 0 }) };

  var authHeaders = {
    "Authorization": "Bearer " + accessToken,
    "Content-Type": "application/json"
  };

  try {
    // Step 1 — find or create "Used" subfolder
    var searchRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=" +
      encodeURIComponent("'" + FOLDER_ID + "' in parents and name='Used' and mimeType='application/vnd.google-apps.folder' and trashed=false") +
      "&fields=files(id,name)",
      { headers: authHeaders }
    );
    var searchData = await searchRes.json();
    var usedFolders = searchData.files || [];
    var usedFolderId;

    if (usedFolders.length) {
      usedFolderId = usedFolders[0].id;
    } else {
      // Create the Used folder
      var createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          name: "Used",
          mimeType: "application/vnd.google-apps.folder",
          parents: [FOLDER_ID]
        })
      });
      var createData = await createRes.json();
      if (!createData.id) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to create Used folder", detail: createData }) };
      }
      usedFolderId = createData.id;
    }

    // Step 2 — move each file
    var moved = 0;
    var errors = [];

    for (var i = 0; i < driveIds.length; i++) {
      var fileId = driveIds[i];
      try {
        // Get current parents
        var fileRes = await fetch(
          "https://www.googleapis.com/drive/v3/files/" + fileId + "?fields=parents",
          { headers: authHeaders }
        );
        var fileData = await fileRes.json();
        var currentParents = (fileData.parents || [FOLDER_ID]).join(",");

        // Move file
        var moveRes = await fetch(
          "https://www.googleapis.com/drive/v3/files/" + fileId +
          "?addParents=" + usedFolderId + "&removeParents=" + currentParents + "&fields=id",
          { method: "PATCH", headers: authHeaders, body: JSON.stringify({}) }
        );

        if (moveRes.ok) moved++;
        else {
          var errData = await moveRes.json();
          errors.push(fileId + ": " + (errData.error && errData.error.message || moveRes.status));
        }
      } catch(e) { errors.push(fileId + ": " + e.message); }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, moved, errors, total: driveIds.length, usedFolderId }) };

  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
