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

  var ghlHeaders = {
    "Authorization": "Bearer " + GHL_KEY,
    "Version": "2021-07-28",
    "Content-Type": "application/json",
    "Accept": "application/json"
  };

  try {
    var allMessages = [];
    var contactsAnalysed = 0;
    var debugLog = [];

    // Step 1 — get contacts directly, not via conversations
    var contactsRes = await fetch(
      "https://services.leadconnectorhq.com/contacts/?locationId=" + GHL_LOC + "&limit=100&sortBy=date_added&sortOrder=desc",
      { headers: ghlHeaders }
    );

    if (!contactsRes.ok) {
      var errText = await contactsRes.text();
      return { statusCode: 200, headers, body: JSON.stringify({
        error: "Contacts fetch failed: " + contactsRes.status + " " + errText,
        themes: [], commonQuestions: [], commonObjections: [], keyPhrases: [],
        contactsAnalysed: 0, messagesAnalysed: 0, lastUpdated: new Date().toISOString()
      })};
    }

    var contactsData = await contactsRes.json();
    var contacts = contactsData.contacts || contactsData.data || [];
    debugLog.push("Total contacts found: " + contacts.length);

    // Filter out AI off tagged contacts
    var leads = contacts.filter(function(c) {
      var tags = (c.tags || []).map(function(t) { return String(t).toLowerCase(); });
      return !tags.some(function(t) { return t.includes("ai off") || t.includes("ai-off"); });
    });
    debugLog.push("Leads without AI off tag: " + leads.length);

    // Step 2 — for each lead get their conversations
    for (var i = 0; i < Math.min(leads.length, 50); i++) {
      var lead = leads[i];
      contactsAnalysed++;

      try {
        // Get conversations for this specific contact
        var convRes = await fetch(
          "https://services.leadconnectorhq.com/conversations/search?locationId=" + GHL_LOC + "&contactId=" + lead.id + "&limit=10",
          { headers: ghlHeaders }
        );

        if (!convRes.ok) continue;
        var convData = await convRes.json();
        var conversations = convData.conversations || convData.data || [];

        for (var j = 0; j < conversations.length; j++) {
          var conv = conversations[j];

          try {
            var msgRes = await fetch(
              "https://services.leadconnectorhq.com/conversations/" + conv.id + "/messages?limit=50",
              { headers: ghlHeaders }
            );

            if (!msgRes.ok) continue;
            var msgData = await msgRes.json();

            var messages = [];
            if (Array.isArray(msgData)) messages = msgData;
            else if (Array.isArray(msgData.messages)) messages = msgData.messages;
            else if (msgData.messages && Array.isArray(msgData.messages.messages)) messages = msgData.messages.messages;
            else if (Array.isArray(msgData.data)) messages = msgData.data;

            messages.forEach(function(m) {
              var body = m.body || m.message || m.text || m.content || "";
              var dir = m.direction || m.type || "";
              if (body && body.length > 5 && (dir === "inbound" || dir === "incoming" || dir === 1 || String(dir) === "1")) {
                allMessages.push(body.substring(0, 400));
              }
            });

          } catch(e) {}
        }

      } catch(e) {
        debugLog.push("Lead " + lead.id + " error: " + e.message);
      }
    }

    debugLog.push("Total inbound messages found: " + allMessages.length);

    // If still 0 inbound, grab outbound too for context
    if (allMessages.length === 0) {
      debugLog.push("No inbound messages — trying all message types");
      for (var i = 0; i < Math.min(leads.length, 20); i++) {
        var lead = leads[i];
        try {
          var convRes = await fetch(
            "https://services.leadconnectorhq.com/conversations/search?locationId=" + GHL_LOC + "&contactId=" + lead.id + "&limit=5",
            { headers: ghlHeaders }
          );
          if (!convRes.ok) continue;
          var convData = await convRes.json();
          var conversations = convData.conversations || [];

          for (var j = 0; j < conversations.length; j++) {
            var msgRes = await fetch(
              "https://services.leadconnectorhq.com/conversations/" + conversations[j].id + "/messages?limit=20",
              { headers: ghlHeaders }
            );
            if (!msgRes.ok) continue;
            var msgData = await msgRes.json();
            var messages = Array.isArray(msgData.messages) ? msgData.messages : [];
            if (messages.messages) messages = messages.messages;

            messages.forEach(function(m) {
              var body = m.body || m.message || m.text || "";
              if (body && body.length > 5) {
                allMessages.push("[" + (m.direction||"?") + "] " + body.substring(0, 300));
              }
            });
          }
        } catch(e) {}
      }
      debugLog.push("After trying all types: " + allMessages.length + " messages");
    }

    if (allMessages.length === 0) {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          themes: [], commonQuestions: [], commonObjections: [], keyPhrases: [],
          contactsAnalysed, messagesAnalysed: 0,
          message: "Found " + leads.length + " leads but no messages. " + debugLog.join(" | "),
          debug: debugLog,
          lastUpdated: new Date().toISOString()
        })
      };
    }

    // Claude analysis
    var messagesText = allMessages.slice(0, 60).join("\n---\n");
    var claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        system: "You analyse messages from fitness gym leads. Return ONLY valid JSON: { themes: string[], commonQuestions: string[], commonObjections: string[], keyPhrases: string[] }. Be specific to what actually appears in the messages.",
        messages: [{ role: "user", content: "Analyse these gym lead messages:\n\n" + messagesText }]
      })
    });

    var claudeData = await claudeRes.json();
    var text = claudeData.content ? claudeData.content.map(function(b) { return b.text||""; }).join("") : "";
    var insights;
    try { insights = JSON.parse(text.replace(/```json|```/g,"").trim()); }
    catch(e) { insights = { themes:[], commonQuestions:[], commonObjections:[], keyPhrases:[] }; }

    insights.contactsAnalysed = contactsAnalysed;
    insights.messagesAnalysed = allMessages.length;
    insights.debug = debugLog;
    insights.lastUpdated = new Date().toISOString();

    return { statusCode: 200, headers, body: JSON.stringify(insights) };

  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
