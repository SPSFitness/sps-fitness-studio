exports.handler = async function(event) {
  var headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  var GHL_KEY = process.env.GHL_API_KEY;
  var GHL_LOC = "gdOQzGdEopzxAxvr2znF";
  var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  if (!GHL_KEY || !ANTHROPIC_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing API keys" }) };
  }

  try {
    var allMessages = [];
    var contactsAnalysed = 0;

    // Pull recent conversations directly — last 30 days
    var thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);

    // Get conversations for this location
    var convRes = await fetch(
      "https://services.leadconnectorhq.com/conversations/search?locationId=" + GHL_LOC + "&limit=50&sortBy=last_message_date&sortOrder=desc",
      {
        headers: {
          "Authorization": "Bearer " + GHL_KEY,
          "Version": "2021-07-28",
          "Content-Type": "application/json"
        }
      }
    );

    var convData = await convRes.json();
    var conversations = convData.conversations || [];

    // Filter out AI off contacts and get messages
    var processed = new Set();

    for (var i = 0; i < conversations.length; i++) {
      var conv = conversations[i];
      var contactId = conv.contactId;

      // Skip if already processed this contact
      if (processed.has(contactId)) continue;
      processed.add(contactId);

      // Check contact tags — skip if AI off
      try {
        var contactRes = await fetch(
          "https://services.leadconnectorhq.com/contacts/" + contactId,
          {
            headers: {
              "Authorization": "Bearer " + GHL_KEY,
              "Version": "2021-07-28"
            }
          }
        );
        var contactData = await contactRes.json();
        var contact = contactData.contact || contactData;
        var tags = (contact.tags || []).map(function(t) { return String(t).toLowerCase(); });
        var hasAiOff = tags.some(function(t) { return t.includes("ai off") || t.includes("ai-off"); });
        if (hasAiOff) continue;
      } catch(e) { continue; }

      contactsAnalysed++;

      // Get messages from this conversation
      try {
        var msgRes = await fetch(
          "https://services.leadconnectorhq.com/conversations/" + conv.id + "/messages?limit=50",
          {
            headers: {
              "Authorization": "Bearer " + GHL_KEY,
              "Version": "2021-07-28"
            }
          }
        );
        var msgData = await msgRes.json();
        var messages = msgData.messages || (msgData.messages && msgData.messages.messages) || [];

        // Handle nested messages structure
        if (!Array.isArray(messages) && messages.messages) messages = messages.messages;

        messages.forEach(function(m) {
          if (m.direction === "inbound" && m.body && m.body.length > 10) {
            // Only include if within last 30 days
            var msgTime = m.dateAdded ? new Date(m.dateAdded).getTime() / 1000 : Date.now() / 1000;
            if (msgTime > thirtyDaysAgo) {
              allMessages.push(m.body.substring(0, 400));
            }
          }
        });
      } catch(e) {}

      if (contactsAnalysed >= 30) break;
    }

    // If still no messages, try getting ALL messages not just inbound
    if (allMessages.length === 0 && conversations.length > 0) {
      for (var i = 0; i < Math.min(conversations.length, 10); i++) {
        try {
          var msgRes = await fetch(
            "https://services.leadconnectorhq.com/conversations/" + conversations[i].id + "/messages?limit=20",
            {
              headers: {
                "Authorization": "Bearer " + GHL_KEY,
                "Version": "2021-07-28"
              }
            }
          );
          var msgData = await msgRes.json();
          var messages = msgData.messages || [];
          if (!Array.isArray(messages) && messages.messages) messages = messages.messages;

          messages.forEach(function(m) {
            if (m.body && m.body.length > 10) {
              allMessages.push("[" + (m.direction || "unknown") + "] " + m.body.substring(0, 400));
            }
          });
        } catch(e) {}
      }
    }

    if (allMessages.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          themes: [],
          commonQuestions: [],
          commonObjections: [],
          keyPhrases: [],
          contactsAnalysed: contactsAnalysed,
          messagesAnalysed: 0,
          conversationsFound: conversations.length,
          debug: "No messages found. Conversations found: " + conversations.length,
          lastUpdated: new Date().toISOString()
        })
      };
    }

    // Use Claude to extract themes
    var messagesText = allMessages.slice(0, 60).join("\n---\n");
    var claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        system: "You analyse messages from fitness gym leads and extract key themes, concerns, questions and objections. Return ONLY valid JSON with: themes (array of 8-12 short specific strings max 10 words each), commonQuestions (array of 5-8 questions leads asked), commonObjections (array of 3-5 barriers mentioned), keyPhrases (array of 5-10 actual phrases used). Be specific — only include what actually appears in the messages. If messages are sparse, work with what is there.",
        messages: [{ role: "user", content: "Analyse these gym lead messages:\n\n" + messagesText }]
      })
    });

    var claudeData = await claudeRes.json();
    var responseText = claudeData.content ? claudeData.content.map(function(b) { return b.text || ""; }).join("") : "";

    var insights;
    try {
      var clean = responseText.replace(/```json|```/g, "").trim();
      insights = JSON.parse(clean);
    } catch(e) {
      insights = { themes: [], commonQuestions: [], commonObjections: [], keyPhrases: [] };
    }

    insights.contactsAnalysed = contactsAnalysed;
    insights.messagesAnalysed = allMessages.length;
    insights.conversationsFound = conversations.length;
    insights.lastUpdated = new Date().toISOString();

    return { statusCode: 200, headers, body: JSON.stringify(insights) };

  } catch(err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message, stack: err.stack })
    };
  }
};
