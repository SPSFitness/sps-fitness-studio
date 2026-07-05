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

  // Standard headers for all GHL requests
  var ghlHeaders = {
    "Authorization": "Bearer " + GHL_KEY,
    "Version": "2021-07-28",
    "Content-Type": "application/json",
    "Accept": "application/json"
  };

  try {
    var allMessages = [];
    var contactsAnalysed = 0;
    var conversationsFound = 0;

    // Step 1 — get recent conversations
    var convUrl = "https://services.leadconnectorhq.com/conversations/search?locationId=" + GHL_LOC + "&limit=50&sortBy=last_message_date&sortOrder=desc";
    var convRes = await fetch(convUrl, { headers: ghlHeaders });

    if (!convRes.ok) {
      var errText = await convRes.text();
      return { statusCode: 200, headers, body: JSON.stringify({ error: "GHL conversations error: " + convRes.status + " " + errText, themes: [], commonQuestions: [], commonObjections: [], keyPhrases: [], contactsAnalysed: 0, messagesAnalysed: 0, lastUpdated: new Date().toISOString() }) };
    }

    var convData = await convRes.json();
    var conversations = convData.conversations || convData.data || [];
    conversationsFound = conversations.length;

    var thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    var processed = new Set();

    for (var i = 0; i < conversations.length; i++) {
      var conv = conversations[i];
      if (!conv.contactId) continue;
      if (processed.has(conv.contactId)) continue;
      processed.add(conv.contactId);

      // Check contact for AI off tag
      try {
        var contactRes = await fetch(
          "https://services.leadconnectorhq.com/contacts/" + conv.contactId,
          { headers: ghlHeaders }
        );
        if (contactRes.ok) {
          var cData = await contactRes.json();
          var contact = cData.contact || cData;
          var tags = (contact.tags || []).map(function(t) { return String(t).toLowerCase(); });
          if (tags.some(function(t) { return t.includes("ai off") || t.includes("ai-off"); })) continue;
        }
      } catch(e) {}

      contactsAnalysed++;

      // Get messages
      try {
        var msgRes = await fetch(
          "https://services.leadconnectorhq.com/conversations/" + conv.id + "/messages?limit=50",
          { headers: ghlHeaders }
        );
        if (!msgRes.ok) continue;
        var msgData = await msgRes.json();
        var messages = msgData.messages || [];
        if (messages.messages) messages = messages.messages;
        if (!Array.isArray(messages)) messages = [];

        messages.forEach(function(m) {
          if (!m.body || m.body.length < 5) return;
          var msgTime = m.dateAdded ? new Date(m.dateAdded).getTime() : Date.now();
          if (msgTime < thirtyDaysAgo) return;
          if (m.direction === "inbound") {
            allMessages.push(m.body.substring(0, 400));
          }
        });
      } catch(e) {}

      if (contactsAnalysed >= 40) break;
    }

    // Step 2 — if no inbound messages found, grab any messages for debugging
    var debugInfo = {};
    if (allMessages.length === 0 && conversations.length > 0) {
      debugInfo.note = "No inbound messages in last 30 days. Trying all directions...";
      for (var i = 0; i < Math.min(5, conversations.length); i++) {
        try {
          var msgRes = await fetch(
            "https://services.leadconnectorhq.com/conversations/" + conversations[i].id + "/messages?limit=10",
            { headers: ghlHeaders }
          );
          if (!msgRes.ok) continue;
          var msgData = await msgRes.json();
          var messages = msgData.messages || [];
          if (messages.messages) messages = messages.messages;
          if (!Array.isArray(messages)) messages = [];
          messages.forEach(function(m) {
            if (m.body && m.body.length > 5) {
              allMessages.push("[" + (m.direction||"?") + "] " + m.body.substring(0, 300));
            }
          });
        } catch(e) {}
      }
    }

    if (allMessages.length === 0) {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          themes: [], commonQuestions: [], commonObjections: [], keyPhrases: [],
          contactsAnalysed, messagesAnalysed: 0, conversationsFound,
          debug: debugInfo,
          message: "No messages found in the last 30 days from leads without AI off tag.",
          lastUpdated: new Date().toISOString()
        })
      };
    }

    // Step 3 — Claude analysis
    var messagesText = allMessages.slice(0, 60).join("\n---\n");
    var claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        system: "You analyse messages from fitness gym leads. Return ONLY valid JSON: { themes: string[], commonQuestions: string[], commonObjections: string[], keyPhrases: string[] }. Be specific to what actually appears in the messages.",
        messages: [{ role: "user", content: "Analyse these gym lead messages and extract themes:\n\n" + messagesText }]
      })
    });

    var claudeData = await claudeRes.json();
    var text = claudeData.content ? claudeData.content.map(function(b) { return b.text||""; }).join("") : "";
    var insights;
    try { insights = JSON.parse(text.replace(/```json|```/g,"").trim()); }
    catch(e) { insights = { themes:[], commonQuestions:[], commonObjections:[], keyPhrases:[] }; }

    insights.contactsAnalysed = contactsAnalysed;
    insights.messagesAnalysed = allMessages.length;
    insights.conversationsFound = conversationsFound;
    insights.lastUpdated = new Date().toISOString();

    return { statusCode: 200, headers, body: JSON.stringify(insights) };

  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
