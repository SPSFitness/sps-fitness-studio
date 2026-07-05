// GHL Lead Insights — pulls conversations from leads without "AI off" tag
// Extracts recurring themes using Claude and returns them for content generation

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
    // 1. Get contacts without "AI off" tag — leads only
    var contactsRes = await fetch(
      "https://services.leadconnectorhq.com/contacts/?locationId=" + GHL_LOC + "&limit=100",
      { headers: { "Authorization": "Bearer " + GHL_KEY, "Version": "2021-07-28" } }
    );
    var contactsData = await contactsRes.json();
    var contacts = (contactsData.contacts || []).filter(function(c) {
      var tags = (c.tags || []).map(function(t) { return t.toLowerCase(); });
      return !tags.some(function(t) { return t.includes("ai off") || t.includes("ai-off"); });
    });

    if (!contacts.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ themes: [], message: "No active leads found" }) };
    }

    // 2. Pull conversations for up to 30 most recent leads
    var recentContacts = contacts.slice(0, 30);
    var allMessages = [];

    for (var i = 0; i < recentContacts.length; i++) {
      var contact = recentContacts[i];
      try {
        var convRes = await fetch(
          "https://services.leadconnectorhq.com/conversations/search?locationId=" + GHL_LOC + "&contactId=" + contact.id + "&limit=5",
          { headers: { "Authorization": "Bearer " + GHL_KEY, "Version": "2021-07-28" } }
        );
        var convData = await convRes.json();
        var conversations = convData.conversations || [];

        for (var j = 0; j < conversations.length; j++) {
          var conv = conversations[j];
          // Get messages in this conversation
          try {
            var msgRes = await fetch(
              "https://services.leadconnectorhq.com/conversations/" + conv.id + "/messages?limit=20",
              { headers: { "Authorization": "Bearer " + GHL_KEY, "Version": "2021-07-28" } }
            );
            var msgData = await msgRes.json();
            var messages = (msgData.messages || msgData.messages && msgData.messages.messages || []);
            messages.forEach(function(m) {
              // Only inbound messages — what leads actually say
              if (m.direction === "inbound" && m.body && m.body.length > 10) {
                allMessages.push(m.body.substring(0, 300));
              }
            });
          } catch(e) {}
        }
      } catch(e) {}
    }

    if (!allMessages.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ themes: [], message: "No lead messages found" }) };
    }

    // 3. Use Claude to extract themes from lead messages
    var messagesText = allMessages.slice(0, 50).join("\n---\n");
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
        system: "You analyse messages from fitness gym leads and extract the key themes, concerns, questions and objections. Return ONLY a JSON object with: themes (array of 8-12 short specific theme strings, each max 10 words, describing real concerns leads have expressed), commonQuestions (array of 5-8 actual questions leads asked), commonObjections (array of 3-5 objections or barriers mentioned), keyPhrases (array of 5-10 actual phrases or words leads used). Be specific and factual — only include what actually appears in the messages.",
        messages: [{ role: "user", content: "Analyse these lead messages and extract themes:\n\n" + messagesText }]
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

    insights.contactsAnalysed = recentContacts.length;
    insights.messagesAnalysed = allMessages.length;
    insights.lastUpdated = new Date().toISOString();

    return { statusCode: 200, headers, body: JSON.stringify(insights) };

  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
