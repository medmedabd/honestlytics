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
  line.innerHTML = ` <span class="log-time">${now()}</span> <span class="log-msg">${msg}</span> `;
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
  url: "http://localhost:3000",
  write_key: "test-key",
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
function trackSingle() {
  tracker.track({
    event_name: "button_clicked",
    page: "/test",
    html_element: "button",
    properties: { type: "single" },
  });
  const q = tracker.queueSize;
  log(`event added to queue — queue size: ${q}`);
  log(`waiting for flush interval (5s)...`, "warn");
  updateStats(q);
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
      page: "/test",
      html_element: "button",
      properties: { index: i },
    });
  });
  const q = tracker.queueSize;
  log(`5 events added to queue — queue size: ${q}`);
  log(`waiting for flush interval (5s)...`, "warn");
  updateStats(q);
}
function trackMaxBatch() {
  for (let i = 0; i < 20; i++) {
    tracker.track({
      event_name: `batch_event_${i + 1}`,
      page: "/test",
      html_element: "button",
      properties: { batch: true, index: i },
    });
  }
  const q = tracker.queueSize;
  log(`20 events added — triggering immediate flush`, "warn");
  updateStats(q);
}
log("sdk initialized — flush interval: 5s", "info");
updateStats(0);
