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

  // --- Time budget --------------------------------------------------------
  // Netlify kills a synchronous function at ~10 seconds. If that happens
  // mid-run it returns an HTML error page, which the app cannot parse as JSON
  // ("Unexpected token '<'"). To stay bomb-proof we cap the GoHighLevel
  // fetching at a few seconds, leaving headroom for the Claude call, and we
  // ALWAYS return valid JSON — even on failure — so the app never sees HTML.
  var START = Date.now();
  var GHL_BUDGET_MS = 5000;   // stop pulling GHL data after 5s
  var MAX_LEADS = 40;         // sample up to this many leads
  var MAX_MSGS = 80;          // stop once we have this many messages
  var CONVOS_PER_LEAD = 2;    // most recent couple of conversations per lead
  var CONCURRENCY = 6;        // parallel GHL requests

  function budgetLeft() { return (Date.now() - START) < GHL_BUDGET_MS; }

  function fetchJson(url, ms) {
    // Per-request timeout so one slow upstream call can't stall the whole run.
    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function() { ctrl.abort(); }, ms || 3000) : null;
    return fetch(url, { headers: ghlHeaders, signal: ctrl ? ctrl.signal : undefined })
      .then(function(r) {
        if (timer) clearTimeout(timer);
        if (!r.ok) return { __notOk: r.status };
        return r.json();
      })
      .catch(function() { if (timer) clearTimeout(timer); return { __err: true }; });
  }

  function extractMessages(msgData) {
    var messages = [];
    if (!msgData || msgData.__err || msgData.__notOk) return messages;
    if (Array.isArray(msgData)) messages = msgData;
    else if (Array.isArray(msgData.messages)) messages = msgData.messages;
    else if (msgData.messages && Array.isArray(msgData.messages.messages)) messages = msgData.messages.messages;
    else if (Array.isArray(msgData.data)) messages = msgData.data;
    return messages;
  }

  function isInbound(m) {
    var dir = m.direction || m.type || "";
    return (dir === "inbound" || dir === "incoming" || dir === 1 || String(dir) === "1");
  }

  try {
    var allMessages = [];
    var contactsAnalysed = 0;
    var debugLog = [];

    // Step 1 — contacts
    var contactsData = await fetchJson(
      "https://services.leadconnectorhq.com/contacts/?locationId=" + GHL_LOC + "&limit=100", 4000
    );
    if (contactsData.__notOk || contactsData.__err) {
      return { statusCode: 200, headers, body: JSON.stringify({
        error: "Contacts fetch failed" + (contactsData.__notOk ? (": " + contactsData.__notOk) : ""),
        themes: [], commonQuestions: [], commonObjections: [], keyPhrases: [],
        contactsAnalysed: 0, messagesAnalysed: 0, lastUpdated: new Date().toISOString()
      })};
    }

    var contacts = contactsData.contacts || contactsData.data || [];
    debugLog.push("Total contacts found: " + contacts.length);

    // Filter out AI off tagged contacts
    var leads = contacts.filter(function(c) {
      var tags = (c.tags || []).map(function(t) { return String(t).toLowerCase(); });
      return !tags.some(function(t) { return t.includes("ai off") || t.includes("ai-off"); });
    });
    debugLog.push("Leads without AI off tag: " + leads.length);

    var pool = leads.slice(0, MAX_LEADS);
    var idx = 0;

    // Worker: pulls leads off a shared index and fetches their conversations +
    // messages. Runs CONCURRENCY of these at once instead of one lead at a
    // time, so the whole sweep takes seconds, not minutes.
    async function worker() {
      while (idx < pool.length && allMessages.length < MAX_MSGS && budgetLeft()) {
        var lead = pool[idx++];
        contactsAnalysed++;

        var convData = await fetchJson(
          "https://services.leadconnectorhq.com/conversations/search?locationId=" + GHL_LOC +
          "&contactId=" + lead.id + "&limit=5", 3000
        );
        var conversations = (convData && (convData.conversations || convData.data)) || [];

        for (var j = 0; j < Math.min(conversations.length, CONVOS_PER_LEAD); j++) {
          if (allMessages.length >= MAX_MSGS || !budgetLeft()) break;
          var conv = conversations[j];
          if (!conv || !conv.id) continue;

          var msgData = await fetchJson(
            "https://services.leadconnectorhq.com/conversations/" + conv.id + "/messages?limit=30", 3000
          );
          extractMessages(msgData).forEach(function(m) {
            var body = m.body || m.message || m.text || m.content || "";
            if (body && body.length > 5 && isInbound(m)) {
              allMessages.push(body.substring(0, 400));
            }
          });
        }
      }
    }

    var workers = [];
    for (var w = 0; w < CONCURRENCY; w++) workers.push(worker());
    await Promise.all(workers);

    debugLog.push("Inbound messages found: " + allMessages.length + " (budget used " + (Date.now() - START) + "ms)");

    // Fallback — if no inbound messages at all and we still have budget, grab a
    // few of any direction for context (parallel, capped hard).
    if (allMessages.length === 0 && budgetLeft()) {
      debugLog.push("No inbound — trying any direction");
      var fbLeads = leads.slice(0, 12);
      await Promise.all(fbLeads.map(async function(lead) {
        if (allMessages.length >= 40 || !budgetLeft()) return;
        var convData = await fetchJson(
          "https://services.leadconnectorhq.com/conversations/search?locationId=" + GHL_LOC +
          "&contactId=" + lead.id + "&limit=3", 2500
        );
        var conversations = (convData && (convData.conversations || convData.data)) || [];
        for (var j = 0; j < Math.min(conversations.length, 2); j++) {
          if (allMessages.length >= 40 || !budgetLeft()) break;
          if (!conversations[j] || !conversations[j].id) continue;
          var msgData = await fetchJson(
            "https://services.leadconnectorhq.com/conversations/" + conversations[j].id + "/messages?limit=20", 2500
          );
          extractMessages(msgData).forEach(function(m) {
            var body = m.body || m.message || m.text || "";
            if (body && body.length > 5) allMessages.push("[" + (m.direction || "?") + "] " + body.substring(0, 300));
          });
        }
      }));
      debugLog.push("After fallback: " + allMessages.length + " messages");
    }

    if (allMessages.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({
        themes: [], commonQuestions: [], commonObjections: [], keyPhrases: [],
        contactsAnalysed: contactsAnalysed, messagesAnalysed: 0,
        message: "Found " + leads.length + " leads but no messages. " + debugLog.join(" | "),
        debug: debugLog, lastUpdated: new Date().toISOString()
      })};
    }

    // Claude analysis — bounded so it can't hang the function past the Netlify limit.
    var messagesText = allMessages.slice(0, 60).join("\n---\n");
    var claudeCtrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var claudeTimer = claudeCtrl ? setTimeout(function() { claudeCtrl.abort(); }, 8000) : null;

    var insights;
    try {
      var claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
        signal: claudeCtrl ? claudeCtrl.signal : undefined,
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1000,
          system: "You analyse messages from fitness gym leads. Return ONLY valid JSON: { themes: string[], commonQuestions: string[], commonObjections: string[], keyPhrases: string[] }. Be specific to what actually appears in the messages.",
          messages: [{ role: "user", content: "Analyse these gym lead messages:\n\n" + messagesText }]
        })
      });
      if (claudeTimer) clearTimeout(claudeTimer);
      var claudeData = await claudeRes.json();
      var text = claudeData.content ? claudeData.content.map(function(b) { return b.text || ""; }).join("") : "";
      try { insights = JSON.parse(text.replace(/```json|```/g, "").trim()); }
      catch (e) { insights = { themes: [], commonQuestions: [], commonObjections: [], keyPhrases: [] }; }
    } catch (e) {
      if (claudeTimer) clearTimeout(claudeTimer);
      // Collected the messages but the analysis step failed/timed out — still
      // return valid JSON so the app shows a clean message, not an HTML error.
      return { statusCode: 200, headers, body: JSON.stringify({
        error: "Collected " + allMessages.length + " messages but the analysis step timed out. Try again.",
        themes: [], commonQuestions: [], commonObjections: [], keyPhrases: [],
        contactsAnalysed: contactsAnalysed, messagesAnalysed: allMessages.length,
        debug: debugLog, lastUpdated: new Date().toISOString()
      })};
    }

    insights.contactsAnalysed = contactsAnalysed;
    insights.messagesAnalysed = allMessages.length;
    insights.debug = debugLog;
    insights.lastUpdated = new Date().toISOString();

    return { statusCode: 200, headers, body: JSON.stringify(insights) };

  } catch (err) {
    // Last-resort guard: always JSON, never an HTML crash page.
    return { statusCode: 200, headers, body: JSON.stringify({
      error: err && err.message ? err.message : "Unknown error",
      themes: [], commonQuestions: [], commonObjections: [], keyPhrases: [],
      contactsAnalysed: 0, messagesAnalysed: 0, lastUpdated: new Date().toISOString()
    })};
  }
};
