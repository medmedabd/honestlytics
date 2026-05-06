const SITE_ID = "09c0fbf1-9b11-4820-9152-95fc9f122c37";
const API_URL = "http://localhost:3000";

let sentTotal = 0;
let retries = 0;
let failed = 0;

function now() {
  return new Date().toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function log(msg, type = "") {
  const el = document.getElementById("console");
  const line = document.createElement("div");
  line.className = "log-line " + type;
  line.innerHTML = `<span class="log-time">${now()}</span> <span class="log-msg">${msg}</span>`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function updateStats(queueSize) {
  document.getElementById("stat-queue").textContent = queueSize;
  document.getElementById("stat-sent").textContent = sentTotal;
  document.getElementById("stat-retry").textContent = retries;
  document.getElementById("stat-failed").textContent = failed;
}

function clearLogs() {
  document.getElementById("console").innerHTML = "";
}

const tracker = new Honestlytics.Honestlytics({
  url: API_URL,
  write_key: "test-key",
  site_id: SITE_ID,
  onRetry(attempt) {
    retries++;
    log(`retry attempt ${attempt}`, "warn");
    updateStats(tracker.queueSize);
  },
  onFailed(error) {
    failed++;
    log(`batch failed (${error.message})`, "error");
    updateStats(tracker.queueSize);
  },
  onSuccess(count) {
    sentTotal += count;
    log(`batch sent successfully (${count} events)`, "success");
    updateStats(tracker.queueSize);
  },
});

// --─ SDK track helpers --------------------------------------------------------

function trackSingle() {
  tracker.track({
    event_name: "button_clicked",
    site_id: SITE_ID,
    page: "/test",
    html_element: "button",
    properties: { type: "single" },
  });
  log(`event added to queue - queue size: ${tracker.queueSize}`);
  log(`waiting for flush interval (5s)...`, "warn");
  updateStats(tracker.queueSize);
}

function trackBatch() {
  [
    "page_view",
    "button_clicked",
    "form_submit",
    "scroll_depth",
    "link_clicked",
  ].forEach((name, i) => {
    tracker.track({
      event_name: name,
      site_id: SITE_ID,
      page: "/test",
      html_element: "button",
      properties: { index: i },
    });
  });
  log(`5 events added to queue - queue size: ${tracker.queueSize}`);
  log(`waiting for flush interval (5s)...`, "warn");
  updateStats(tracker.queueSize);
}

function trackMaxBatch() {
  for (let i = 0; i < 20; i++) {
    tracker.track({
      event_name: `batch_event_${i + 1}`,
      site_id: SITE_ID,
      page: "/test",
      html_element: "button",
      properties: { batch: true, index: i },
    });
  }
  log(`20 events added - triggering immediate flush`, "warn");
  updateStats(tracker.queueSize);
}

// --─ Analytics endpoint tests ------------------------------------------------─

const TODAY = new Date().toISOString().slice(0, 10);
const BASE = `${API_URL}/analytics`;
const QS = `site_id=${SITE_ID}&from=${TODAY}&to=${TODAY}`;

async function testEndpoint(label, url) {
  log(`testing ${label}...`, "info");
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      log(`${label} -> ${res.status} ${JSON.stringify(data)}`, "error");
      return;
    }
    log(`${label} -> ${JSON.stringify(data.data)}`, "success");
  } catch (err) {
    log(`${label} -> fetch failed: ${err.message}`, "error");
  }
}

async function testSummary() {
  await testEndpoint("summary", `${BASE}/summary?${QS}`);
}
async function testPageviews() {
  await testEndpoint("pageviews", `${BASE}/pageviews?${QS}`);
}
async function testEvents() {
  await testEndpoint("events", `${BASE}/events?${QS}`);
}
async function testEventsByName() {
  await testEndpoint(
    "events (pageview)",
    `${BASE}/events?${QS}&event_name=pageview`,
  );
}
async function testSessions() {
  await testEndpoint("sessions", `${BASE}/sessions?${QS}`);
}
async function testUniqueUsers() {
  await testEndpoint("unique-users", `${BASE}/unique-users?${QS}`);
}
async function testSessionDuration() {
  await testEndpoint("session-duration", `${BASE}/session-duration?${QS}`);
}

async function testAll() {
  log("-- running all endpoint tests --", "info");
  await testSummary();
  await testPageviews();
  await testEvents();
  await testEventsByName();
  await testSessions();
  await testUniqueUsers();
  await testSessionDuration();
  log("-- done --", "info");
}

log("sdk initialized - flush interval: 5s", "info");
updateStats(0);
