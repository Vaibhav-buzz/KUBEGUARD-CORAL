const seed = window.KubeGuardData || {};

const state = {
  activeView: "overview",
  live: false,
  config: { owner: "", repo: "", prNumber: "", service: "payments" },
  log: [],
  tables: [],
  pulls: [],
  datadog: { hosts: [], monitors: [], metricNames: [], services: [], incidents: [], reports: [], range: null, errors: [] },
  sentry: { issues: [], error: "" },
  linear: { issues: [], error: "" },
  serviceOptions: [],
  selectedPr: null,
  lastRiskRows: []
};

const titles = {
  overview: "Deployment Intelligence Hub",
  pulls: "Pull Request Risk Queue",
  health: "Service Health",
  incidents: "Incident Signals",
  recommendations: "AI Recommendations",
  gates: "Policies & Gates",
  analytics: "Trends & Analytics",
  map: "Service Map",
  coral: "Coral Workspace",
  integrations: "Integrations",
  admin: "Administration"
};

const sourceColors = {
  github: "#5bd85a",
  sentry: "#7f5cff",
  datadog: "#ff9d24",
  linear: "#43d6dc",
  coral: "#33a3ff"
};

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function firstValue(row, names, fallback = "") {
  for (const name of names) {
    if (row && row[name] !== undefined && row[name] !== null && row[name] !== "") return row[name];
  }
  return fallback;
}

function rowsFromPayload(payload, key = "rows") {
  return Array.isArray(payload?.[key]) ? payload[key] : [];
}

function loadStoredConfig() {
  try {
    state.config = { ...state.config, ...JSON.parse(localStorage.getItem("kubeguard-live-config") || "{}") };
  } catch {
    state.config = { ...state.config };
  }
}

function saveStoredConfig() {
  localStorage.setItem("kubeguard-live-config", JSON.stringify(state.config));
}

function fillConfigForm() {
  if (qs("#live-owner")) qs("#live-owner").value = state.config.owner || "";
  if (qs("#live-repo")) qs("#live-repo").value = state.config.repo || "";
  syncLiveSelects();
}

function readConfigFromForm() {
  state.config = {
    owner: qs("#live-owner")?.value.trim() || "",
    repo: qs("#live-repo")?.value.trim() || "",
    prNumber: qs("#live-pr-number")?.value.trim() || "",
    service: qs("#live-service")?.value.trim() || ""
  };
  saveStoredConfig();
  return state.config;
}

function queryFromConfig(extra = {}) {
  const config = { ...state.config, ...extra };
  const params = new URLSearchParams();
  if (config.owner) params.set("owner", config.owner);
  if (config.repo) params.set("repo", config.repo);
  if (config.prNumber) params.set("pr_number", config.prNumber);
  if (config.service) params.set("service", config.service);
  return params.toString();
}

function selectedTimeRange() {
  return qs("#time-range")?.value || "Last 24 hours";
}

function labelsFromRow(row) {
  const raw = firstValue(row, ["label_names", "labels"], "");
  if (Array.isArray(raw)) return raw.map((item) => typeof item === "string" ? item : item?.name).filter(Boolean);
  return String(raw)
    .split(/[,|;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function serviceFromLabels(row) {
  return labelsFromRow(row)
    .map((name) => String(name).match(/^service:(.+)$/i)?.[1])
    .find(Boolean) || "";
}

function tagsFromValue(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "")
    .split(/[,|;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function serviceFromDatadogRow(row) {
  const tagMatch = tagsFromValue(firstValue(row, ["tags", "tag_set"], ""))
    .map((tag) => tag.match(/^service:(.+)$/i)?.[1])
    .find(Boolean);
  if (tagMatch) return tagMatch;
  const queryMatch = String(firstValue(row, ["query"], "")).match(/service:([a-z0-9_.-]+)/i)?.[1];
  if (queryMatch) return queryMatch;
  const name = String(firstValue(row, ["name", "title"], "")).toLowerCase();
  return [...state.serviceOptions, ...state.pulls.map((pr) => pr.service), state.config.service]
    .find((service) => service && name.includes(String(service).toLowerCase())) || "";
}

function addOptionValue(values, value) {
  const clean = String(value || "").trim();
  if (clean && !values.includes(clean)) values.push(clean);
}

function deriveServiceOptions() {
  const values = [];
  state.serviceOptions.forEach((item) => addOptionValue(values, item));
  state.pulls.forEach((pr) => addOptionValue(values, pr.service));
  (state.datadog.services || []).forEach((service) => {
    addOptionValue(values, firstValue(service, ["service", "name", "env", "tag_service"], ""));
  });
  (state.datadog.monitors || []).forEach((monitor) => addOptionValue(values, serviceFromDatadogRow(monitor)));
  (state.datadog.incidents || []).forEach((incident) => addOptionValue(values, firstValue(incident, ["service", "customer_impact_scope"], "")));
  (state.sentry.issues || []).forEach((issue) => {
    addOptionValue(values, firstValue(issue, ["project", "project__slug", "project_slug"], ""));
  });
  (state.linear.issues || []).forEach((issue) => {
    const labels = firstValue(issue, ["label_names", "label__names", "labels"], "");
    String(labels).split(/[,|;]/).forEach((label) => addOptionValue(values, String(label).replace(/^service:/i, "")));
  });
  return values.sort((a, b) => a.localeCompare(b));
}

function syncSelect(selector, placeholder, options, value, renderLabel = (item) => item, allowCurrentValue = true) {
  const select = qs(selector);
  if (!select) return;
  const allOptions = [...options];
  if (allowCurrentValue && value && !allOptions.some((item) => String(item.value ?? item) === String(value))) {
    allOptions.unshift({ value, label: value });
  }
  select.innerHTML = `<option value="">${placeholder}</option>` + allOptions
    .map((item) => {
      const optionValue = String(item.value ?? item);
      const label = renderLabel(item);
      return `<option value="${escapeHtml(optionValue)}">${escapeHtml(label)}</option>`;
    })
    .join("");
  const hasValue = allOptions.some((item) => String(item.value ?? item) === String(value));
  select.value = hasValue ? String(value || "") : "";
}

function syncLiveSelects() {
  syncSelect(
    "#live-pr-number",
    state.pulls.length ? "Select PR" : "No PRs loaded",
    state.pulls.map((pr) => ({ value: String(pr.number), label: `#${pr.number} ${pr.title}` })),
    state.config.prNumber,
    (item) => item.label,
    false
  );
  syncSelect("#live-service", deriveServiceOptions().length ? "Select service" : "No services loaded", deriveServiceOptions(), state.config.service, (item) => item, false);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { ok: false, error: text };
  }
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `${url} returned ${response.status}`);
  }
  return payload;
}

function emptyState(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function setLiveStatus(mode, title, detail) {
  const dot = qs("#live-dot");
  dot.classList.remove("live", "error", "static");
  dot.classList.add(mode);
  qs("#live-title").textContent = title;
  qs("#live-detail").textContent = detail;
}

function addLog(message) {
  const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  state.log.unshift({ stamp, message });
  state.log = state.log.slice(0, 12);
  renderLog();
}

function renderLog() {
  qs("#operation-log").innerHTML = state.log.length
    ? state.log.map((row) => `<div class="log-row"><time>${row.stamp}</time><span>${escapeHtml(row.message)}</span></div>`).join("")
    : emptyState("Live actions will appear here.");
}

function toast(message) {
  const el = qs("#toast");
  el.textContent = message;
  el.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => el.classList.remove("show"), 2400);
}

function schemaName(row) {
  return String(firstValue(row, ["schema_name", "schema", "source", "name"], "unknown")).toLowerCase();
}

function tableName(row) {
  return String(firstValue(row, ["table_name", "table", "name"], "unknown"));
}

function sourceGroups() {
  return state.tables.reduce((acc, row) => {
    const schema = schemaName(row);
    acc[schema] = acc[schema] || [];
    acc[schema].push(tableName(row));
    return acc;
  }, {});
}

function calculateRisk(lines, files, sentry = 0, datadog = 0, linear = 0) {
  let size = 0;
  if (lines > 500 || files > 20) size = 25;
  else if (lines > 200 || files > 10) size = 15;
  else if (lines > 50 || files > 5) size = 8;

  let datadogScore = 0;
  if (datadog >= 5) datadogScore = 25;
  else if (datadog >= 2) datadogScore = 18;
  else if (datadog >= 1) datadogScore = 10;

  return size + Math.min(sentry * 7, 35) + datadogScore + Math.min(linear * 5, 15);
}

function levelForScore(score) {
  if (score >= 70) return "CRITICAL";
  if (score >= 45) return "HIGH";
  if (score >= 20) return "MEDIUM";
  return "LOW";
}

function statusForScore(score) {
  if (score >= 70) return "BLOCKED";
  if (score >= 45) return "REVIEW";
  return "APPROVED";
}

function riskColor(score) {
  if (score >= 70) return "#ff4b52";
  if (score >= 45) return "#ff7c35";
  if (score >= 20) return "#ffd15c";
  return "#5bd85a";
}

function datadogStatusRisk(status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("alert")) return 80;
  if (value.includes("warn")) return 55;
  if (value.includes("no data")) return 30;
  if (value.includes("ok")) return 0;
  return 15;
}

function metricRisk(report) {
  const latest = Number(report?.latest);
  if (!Number.isFinite(latest)) return 0;
  if (report.key === "memory_usable") {
    if (latest < 10) return 75;
    if (latest < 20) return 45;
    return 0;
  }
  if (report.key === "disk_in_use" || report.key === "cpu_user") {
    if (latest > 90) return 75;
    if (latest > 70) return 45;
    return 0;
  }
  if (report.key === "load_norm") {
    if (latest > 1.5) return 70;
    if (latest > 1) return 40;
    return 0;
  }
  return 0;
}

function formatMetricValue(value, unit = "") {
  if (value === null || value === undefined || value === "") return "--";
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  const precision = Math.abs(number) >= 10 ? 1 : 2;
  return `${number.toFixed(precision)}${unit}`;
}

function sparkline(report, options = {}) {
  const points = Array.isArray(report?.points) ? report.points : [];
  if (!points.length) return `<div class="mini-chart empty">No Datadog points</div>`;
  const width = options.width || 260;
  const height = options.height || 72;
  const values = points.map((point) => Number(point.value)).filter(Number.isFinite);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const path = points.map((point, index) => {
    const x = index * step;
    const y = height - ((Number(point.value) - min) / span) * (height - 12) - 6;
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const fillPath = `${path} L${width} ${height} L0 ${height} Z`;
  const color = riskColor(metricRisk(report));
  return `
    <svg class="mini-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(report.label)} Datadog trend">
      <path d="${fillPath}" fill="${color}" opacity="0.16"></path>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
  `;
}

function relatedMonitors(service) {
  const selected = String(service || "").toLowerCase();
  return (state.datadog.monitors || []).filter((monitor) => {
    if (!selected) return true;
    const monitorService = serviceFromDatadogRow(monitor).toLowerCase();
    if (monitorService === selected) return true;
    return `${firstValue(monitor, ["name"], "")} ${firstValue(monitor, ["query"], "")} ${firstValue(monitor, ["tags"], "")}`
      .toLowerCase()
      .includes(selected);
  });
}

function deriveDatadogServiceNames() {
  const values = [];
  (state.datadog.services || []).forEach((service) => addOptionValue(values, firstValue(service, ["service", "name", "env", "tag_service"], "")));
  (state.datadog.monitors || []).forEach((monitor) => addOptionValue(values, serviceFromDatadogRow(monitor)));
  (state.datadog.incidents || []).forEach((incident) => addOptionValue(values, firstValue(incident, ["service", "customer_impact_scope"], "")));
  state.pulls.forEach((pr) => addOptionValue(values, pr.service));
  addOptionValue(values, state.config.service);
  if (!values.length && state.datadog.hosts?.length) addOptionValue(values, "infrastructure");
  return values.sort((a, b) => a.localeCompare(b));
}

function reportSummaryRisk() {
  return Math.max(0, ...(state.datadog.reports || []).map(metricRisk));
}

function normalizePull(row, index) {
  const additions = Number(firstValue(row, ["additions"], 0)) || 0;
  const deletions = Number(firstValue(row, ["deletions"], 0)) || 0;
  const lines = Number(firstValue(row, ["lines_changed"], additions + deletions)) || 0;
  const files = Number(firstValue(row, ["changed_files", "files_changed"], 0)) || 0;
  const sentry = Number(firstValue(row, ["open_sentry_issues"], 0)) || 0;
  const datadog = Number(firstValue(row, ["avg_error_rate_pct"], 0)) || 0;
  const linear = Number(firstValue(row, ["open_linear_bugs"], 0)) || 0;
  const score = Number(firstValue(row, ["score"], calculateRisk(lines, files, sentry, datadog, linear)));
  const title = firstValue(row, ["title", "pr_title"], `Pull request ${index + 1}`);
  const branch = firstValue(row, ["head__ref", "branch"], "unknown");
  const target = firstValue(row, ["base__ref", "target"], "main");
  const service = firstValue(row, ["service", "tag_service"], "") || serviceFromLabels(row) || state.config.service || inferService(`${title} ${branch}`);

  return {
    number: Number(firstValue(row, ["number", "pr_number"], index + 1)),
    title,
    branch,
    target,
    service,
    score,
    level: levelForScore(score),
    status: statusForScore(score),
    updated: firstValue(row, ["updated_at", "updated"], "live"),
    lines,
    files,
    sentry,
    events: Number(firstValue(row, ["highest_sentry_event_count"], 0)) || 0,
    datadog: Number(datadog.toFixed ? datadog.toFixed(2) : datadog),
    linear
  };
}

function applyPullSelection() {
  const selected = state.pulls.find((pr) => String(pr.number) === String(state.config.prNumber)) || state.pulls[0] || null;
  state.selectedPr = selected;
  if (selected) {
    state.config.prNumber = String(selected.number);
    if (selected.service) state.config.service = selected.service;
  } else {
    state.config.prNumber = "";
  }
}

function inferService(text) {
  const value = String(text).toLowerCase();
  if (value.includes("payment")) return "payments";
  if (value.includes("auth")) return "auth";
  if (value.includes("order")) return "orders";
  if (value.includes("search")) return "search";
  if (value.includes("web") || value.includes("ui")) return "web";
  return state.config.service || "unknown";
}

function distributions() {
  const buckets = [
    { label: "Critical (70-100)", count: 0, color: "#ff4b52" },
    { label: "High (45-69)", count: 0, color: "#ff7c35" },
    { label: "Medium (20-44)", count: 0, color: "#ffd15c" },
    { label: "Low (0-19)", count: 0, color: "#5bd85a" }
  ];
  for (const pr of state.pulls) {
    if (pr.score >= 70) buckets[0].count += 1;
    else if (pr.score >= 45) buckets[1].count += 1;
    else if (pr.score >= 20) buckets[2].count += 1;
    else buckets[3].count += 1;
  }
  const total = state.pulls.length || 1;
  return buckets.map((bucket) => ({ ...bucket, pct: `${Math.round((bucket.count / total) * 100)}%` }));
}

function renderMetrics() {
  const count = state.pulls.length;
  const average = count ? Math.round(state.pulls.reduce((sum, pr) => sum + pr.score, 0) / count) : 0;
  const blocked = state.pulls.filter((pr) => pr.status === "BLOCKED").length;
  const incidents = (state.datadog.incidents?.length || 0) + (state.sentry.issues?.length || 0);
  const monitors = state.datadog.monitors || [];
  const alertMonitors = monitors.filter((item) => String(firstValue(item, ["overall_state", "status", "state"], "")).toLowerCase().includes("alert")).length;
  const success = monitors.length ? `${Math.max(0, Math.round(((monitors.length - alertMonitors) / monitors.length) * 100))}%` : "--";
  const metrics = [
    ["PRs Awaiting Review", count, "GitHub pulls", "PR", "#7f5cff"],
    ["Average Risk Score", count ? average : "--", "Computed from live PRs", "RS", "#ff9d24"],
    ["Blocked Merges", blocked, "Critical score gate", "BL", "#ff4b52"],
    ["Open Incidents", incidents, "Datadog + Sentry", "IN", "#ff5fa3"],
    ["Deployment Success", success, "Datadog monitor state", "OK", "#5bd85a"]
  ];

  qs("#metric-grid").innerHTML = metrics.map(([label, value, detail, icon, color]) => `
    <article class="metric-card">
      <div class="metric-icon" style="background:${color}22;color:${color};box-shadow:inset 0 0 22px ${color}22">${icon}</div>
      <div>
        <h3>${label}</h3>
        <span class="metric-value">${value}</span>
        <span class="metric-delta up"><strong>Live</strong> ${detail}</span>
      </div>
    </article>
  `).join("");
}

function renderPrTables() {
  const query = qs("#global-search").value.trim().toLowerCase();
  const pulls = state.pulls.filter((pr) => `${pr.number} ${pr.title} ${pr.service} ${pr.branch} ${pr.status}`.toLowerCase().includes(query));
  const rows = pulls.map((pr) => `
    <tr data-pr="${pr.number}">
      <td><div class="pr-cell"><span class="repo-mark">GH</span><div><strong>#${pr.number} ${escapeHtml(pr.title)}</strong><span>${escapeHtml(pr.branch)} -> ${escapeHtml(pr.target)}</span></div></div></td>
      <td><span class="service-pill ${escapeHtml(pr.service)}">${escapeHtml(pr.service)}</span></td>
      <td><span class="risk-ring" style="--score:${pr.score};--ring:${riskColor(pr.score)}">${pr.score}</span></td>
      <td><span class="level-pill level-${pr.level.toLowerCase()}">${pr.level}</span></td>
      <td>${escapeHtml(pr.updated)}</td>
      <td><span class="level-pill status-${pr.status.toLowerCase()}">${pr.status}</span></td>
    </tr>
  `).join("");

  const fullRows = pulls.map((pr) => `
    <tr data-pr="${pr.number}">
      <td><div class="pr-cell"><span class="repo-mark">GH</span><div><strong>#${pr.number} ${escapeHtml(pr.title)}</strong><span>${escapeHtml(pr.branch)} -> ${escapeHtml(pr.target)}</span></div></div></td>
      <td class="branch-text">${escapeHtml(pr.branch)} -> ${escapeHtml(pr.target)}</td>
      <td><span class="service-pill ${escapeHtml(pr.service)}">${escapeHtml(pr.service)}</span></td>
      <td>${pr.lines} lines, ${pr.files} files, ${pr.sentry} Sentry, ${pr.datadog}% error, ${pr.linear} Linear</td>
      <td><span class="risk-ring" style="--score:${pr.score};--ring:${riskColor(pr.score)}">${pr.score}</span></td>
      <td><span class="level-pill status-${pr.status.toLowerCase()}">${pr.status}</span></td>
    </tr>
  `).join("");

  qs("#pr-table").innerHTML = rows || `<tr><td colspan="6">${emptyState("No live GitHub pull requests returned yet.")}</td></tr>`;
  qs("#pulls-table").innerHTML = fullRows || `<tr><td colspan="6">${emptyState("No live pull requests. Create a PR in the configured GitHub repo, then load GitHub PRs.")}</td></tr>`;
}

function renderLegend() {
  qs("#distribution-total").textContent = state.pulls.length ? String(state.pulls.length) : "--";
  qs("#risk-legend").innerHTML = distributions().map((item) => `
    <div class="legend-row"><span class="legend-dot" style="background:${item.color}"></span><span>${item.label}</span><strong>${item.count} (${item.pct})</strong></div>
  `).join("");
}

function liveIncidents() {
  const datadog = (state.datadog.incidents || []).map((item, index) => ({
    id: firstValue(item, ["public_id", "id"], `DD-${index + 1}`),
    title: firstValue(item, ["title", "name"], "Datadog incident"),
    service: firstValue(item, ["customer_impact_scope", "service"], state.config.service || "service"),
    priority: firstValue(item, ["severity", "priority"], "Datadog"),
    state: firstValue(item, ["state", "status"], "live"),
    updated: firstValue(item, ["modified", "updated_at", "created"], "live"),
    source: "Datadog"
  }));
  const sentry = (state.sentry.issues || []).map((item, index) => ({
    id: firstValue(item, ["short_id", "id"], `SEN-${index + 1}`),
    title: firstValue(item, ["title", "culprit"], "Sentry issue"),
    service: firstValue(item, ["project", "project__slug"], state.config.service || "service"),
    priority: firstValue(item, ["level", "priority"], "Sentry"),
    state: firstValue(item, ["status"], "live"),
    updated: firstValue(item, ["last_seen", "updated_at"], "live"),
    source: "Sentry"
  }));
  const monitors = (state.datadog.monitors || [])
    .filter((item) => !String(firstValue(item, ["status", "overall_state", "state"], "")).toLowerCase().includes("ok"))
    .map((item, index) => ({
      id: firstValue(item, ["id"], `MON-${index + 1}`),
      title: firstValue(item, ["name"], "Datadog monitor"),
      service: serviceFromDatadogRow(item) || state.config.service || "infrastructure",
      priority: firstValue(item, ["status", "overall_state", "state"], "Monitor"),
      state: firstValue(item, ["status", "overall_state", "state"], "live"),
      updated: firstValue(item, ["modified", "created"], "live"),
      source: "Datadog Monitor"
    }));
  return [...datadog, ...monitors, ...sentry];
}

function renderIncidents() {
  const items = liveIncidents();
  const html = items.map((incident) => `
    <div class="incident-row">
      <strong>${escapeHtml(incident.id)}</strong>
      <span>${escapeHtml(incident.title)}</span>
      <span class="service-pill ${escapeHtml(incident.service)}">${escapeHtml(incident.service)}</span>
      <span class="priority">${escapeHtml(incident.priority)} ${escapeHtml(incident.updated)}</span>
    </div>
  `).join("");
  qs("#incident-list").innerHTML = html || emptyState("No live Datadog incidents or Sentry issues returned.");
  qs("#incident-board").innerHTML = items.length ? items.map((incident) => `
    <article class="incident-card"><header><strong>${escapeHtml(incident.id)}</strong><span>${escapeHtml(incident.source)}</span></header><h3>${escapeHtml(incident.title)}</h3><p>${escapeHtml(incident.service)} service. State: ${escapeHtml(incident.state)}. Updated ${escapeHtml(incident.updated)}.</p></article>
  `).join("") : emptyState("No live incident signals available.");
}

function renderTrend(target = "#trend-chart") {
  const el = qs(target);
  if (!el) return;
  const report = (state.datadog.reports || []).find((item) => Array.isArray(item.points) && item.points.length);
  if (!report) {
    el.innerHTML = emptyState("No live Datadog metric points returned yet.");
    return;
  }
  el.innerHTML = `
    <div class="chart-heading">
      <div><strong>${escapeHtml(report.label)}</strong><span>Datadog live metric, ${escapeHtml(state.datadog.range?.label || selectedTimeRange())}</span></div>
      <strong>${formatMetricValue(report.latest, report.unit)}</strong>
    </div>
    ${sparkline(report, { width: 520, height: 150 })}
  `;
}

function renderServiceBars() {
  const services = state.pulls.reduce((acc, pr) => {
    acc[pr.service] = Math.max(acc[pr.service] || 0, pr.score);
    return acc;
  }, {});
  qs("#service-bars").innerHTML = Object.entries(services).map(([service, score]) => `
    <div class="service-row"><strong>${escapeHtml(service)}</strong><div class="bar-track"><div class="bar-fill" style="--width:${score}%;--bar-color:${riskColor(score)}"></div></div><strong style="color:${riskColor(score)}">${score}</strong></div>
  `).join("") || emptyState("No live service risk scores yet.");
}

function renderSources() {
  const groups = sourceGroups();
  const html = Object.entries(groups).map(([schema, tables]) => {
    const color = sourceColors[schema] || "#33a3ff";
    return `
      <article class="source-card">
        <header><h3>${escapeHtml(schema)}</h3><span class="status-pill ready">Live</span></header>
        <p>${tables.length} Coral tables discovered from this source.</p>
        <div class="source-health" style="--source-color:${color}">Connected through Coral</div>
        <p>${escapeHtml(tables.slice(0, 5).join(", "))}${tables.length > 5 ? ` +${tables.length - 5}` : ""}</p>
      </article>
    `;
  }).join("");
  qs("#source-grid").innerHTML = html || emptyState("No live Coral source tables discovered.");
  renderLiveTables();
  renderLiveSummary();
}

function renderRecommendations() {
  const pr = state.selectedPr;
  if (!pr) {
    qs("#recommendation-card").innerHTML = emptyState("Select or load a live PR to generate a recommendation.");
    qs("#recommendation-grid").innerHTML = emptyState("No live PR recommendation data available.");
    return;
  }
  const reasons = [
    `${pr.lines} changed lines across ${pr.files} files`,
    `${pr.sentry} Sentry issues`,
    `${pr.datadog}% Datadog error rate`,
    `${pr.linear} Linear bugs`
  ];
  const action = pr.score >= 70
    ? "Block the merge until the service baseline is healthy."
    : pr.score >= 45
      ? "Hold for a low-traffic window or split the PR."
      : "Proceed with normal monitoring.";
  const card = `<h3>PR #${pr.number} (${escapeHtml(pr.title)}) is ${pr.level.toLowerCase()} risk.</h3><ul>${reasons.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><div class="recommendation-action"><strong>Recommendation:</strong> ${action}</div>`;
  qs("#recommendation-card").innerHTML = card;
  qs("#recommendation-grid").innerHTML = `<article class="recommendation-card">${card}</article>`;
}

function renderCommentPreview() {
  const pr = state.selectedPr;
  if (!pr) {
    qs("#comment-preview").innerHTML = emptyState("Run a live PR query to preview the risk comment.");
    return;
  }
  qs("#comment-preview").innerHTML = `
    <h3>Deployment Risk Score: ${pr.score}/100 - ${pr.level}</h3>
    <p>${pr.score >= 70 ? "Merge blocked by the live gate." : "Live gate recommends review before merge."}</p>
    <table><thead><tr><th>Signal</th><th>Value</th><th>Max</th></tr></thead><tbody>
      <tr><td>PR size</td><td>${pr.lines} lines, ${pr.files} files</td><td>25</td></tr>
      <tr><td>Sentry</td><td>${pr.sentry} issues</td><td>35</td></tr>
      <tr><td>Datadog</td><td>${pr.datadog}% error rate</td><td>25</td></tr>
      <tr><td>Linear</td><td>${pr.linear} bugs</td><td>15</td></tr>
    </tbody></table>
    <p><strong>Powered by Coral:</strong> live data joined from connected tools.</p>
  `;
}

function renderHealthCards() {
  const services = deriveDatadogServiceNames();
  const hosts = state.datadog.hosts || [];
  const reports = state.datadog.reports || [];
  const metricCards = reports.map((report) => `
    <article class="metric-report">
      <header><span>${escapeHtml(report.label)}</span><strong>${formatMetricValue(report.latest, report.unit)}</strong></header>
      ${sparkline(report)}
      <footer><span>avg ${formatMetricValue(report.avg, report.unit)}</span><span>${report.seriesCount || 0} series</span></footer>
    </article>
  `).join("");
  const serviceCards = services.map((name) => {
    const monitors = relatedMonitors(name);
    const monitorRisk = Math.max(0, ...monitors.map((monitor) => datadogStatusRisk(firstValue(monitor, ["status", "overall_state", "state"], ""))));
    const relatedRisk = Math.max(state.pulls.find((pr) => pr.service === name)?.score || 0, monitorRisk, reportSummaryRisk());
    const status = monitors.find((monitor) => datadogStatusRisk(firstValue(monitor, ["status", "overall_state", "state"], "")) > 0);
    return `
      <article class="health-card">
        <div class="health-header">
          <h3>${escapeHtml(name)}</h3>
          <span class="level-pill level-${levelForScore(relatedRisk).toLowerCase()}">${levelForScore(relatedRisk)}</span>
        </div>
        <p>${status ? escapeHtml(firstValue(status, ["name"], "Datadog monitor needs attention.")) : "Live Datadog baseline is available for this service."}</p>
        <div class="health-meter"><span style="--width:${Math.max(8, 100 - relatedRisk)}%;--bar-color:${riskColor(relatedRisk)}"></span></div>
        <div class="health-stats">
          <div><span>Health risk</span><strong>${relatedRisk}</strong></div>
          <div><span>Hosts</span><strong>${hosts.length}</strong></div>
          <div><span>Monitors</span><strong>${monitors.length || state.datadog.monitors?.length || 0}</strong></div>
        </div>
      </article>
    `;
  }).join("");
  const reportCard = `
    <article class="health-card datadog-report-card">
      <div class="health-header">
        <h3>Datadog Live Reports</h3>
        <span class="status-pill ready">${reports.filter((item) => item.points?.length).length} metrics</span>
      </div>
      <p>Live timeseries fetched from Datadog Metrics Query API for ${escapeHtml(state.datadog.range?.label || selectedTimeRange())}.</p>
      <div class="metric-report-grid">${metricCards || emptyState("No Datadog metric points returned.")}</div>
    </article>
  `;
  const errors = (state.datadog.errors || []).length
    ? `<article class="health-card datadog-error-card"><h3>Datadog Notes</h3><p>${escapeHtml((state.datadog.errors || []).slice(0, 2).join(" "))}</p></article>`
    : "";
  qs("#service-health-grid").innerHTML = reportCard + serviceCards + errors;
}

function renderIntegrations() {
  const groups = sourceGroups();
  qs("#integration-grid").innerHTML = Object.entries(groups).map(([schema, tables]) => `
    <article class="integration-card"><div class="integration-header"><h3>${escapeHtml(schema)}</h3><span class="status-pill ready">Live</span></div><p>${tables.length} tables available through Coral.</p><footer><span>${escapeHtml(schema)}.*</span><button class="secondary-button" data-action="discover">Refresh</button></footer></article>
  `).join("") || emptyState("No live integrations discovered.");
}

function renderAnalytics() {
  renderTrend("#analytics-trend");
  qs("#analytics-distribution").innerHTML = `<h3>Distribution</h3><div class="legend">${distributions().map((item) => `<div class="legend-row"><span class="legend-dot" style="background:${item.color}"></span><span>${item.label}</span><strong>${item.count} (${item.pct})</strong></div>`).join("")}</div>`;
  qs("#analytics-services").innerHTML = `<h3>Service Risk</h3><div class="service-bars">${qs("#service-bars")?.innerHTML || emptyState("No live service risk scores.")}</div>`;
}

function renderServiceMap() {
  const groups = Object.keys(sourceGroups());
  const nodes = ["coral", ...groups].slice(0, 8);
  if (!nodes.length) {
    qs("#service-map").innerHTML = emptyState("No live source topology available.");
    return;
  }
  qs("#service-map").innerHTML = nodes.map((name, index) => {
    const x = 10 + (index % 4) * 22;
    const y = 18 + Math.floor(index / 4) * 34;
    const count = name === "coral" ? state.tables.length : (sourceGroups()[name] || []).length;
    return `<div class="map-node" style="left:${x}%;top:${y}%"><strong>${escapeHtml(name)}</strong><span>${count} live tables</span></div>`;
  }).join("");
}

function renderLiveSummary() {
  qs("#profile-name").textContent = state.config.owner || "Live session";
  qs("#profile-team").textContent = state.config.repo || "Waiting for repo";
  qs("#live-coral-status").textContent = state.live ? "Connected" : "Waiting";
  qs("#live-table-count").textContent = String(state.tables.length);
  const datadogRows = (state.datadog.hosts?.length || 0) + (state.datadog.monitors?.length || 0) + (state.datadog.metricNames?.length || 0) + (state.datadog.services?.length || 0) + (state.datadog.incidents?.length || 0) + (state.datadog.reports?.length || 0);
  qs("#live-datadog-count").textContent = `${datadogRows} rows`;
  qs("#live-pr-count").textContent = String(state.pulls.length);
}

function renderLiveTables() {
  const groups = sourceGroups();
  qs("#live-tables-list").innerHTML = Object.entries(groups).map(([schema, tables]) => `<div><strong>${escapeHtml(schema)}</strong><span>${escapeHtml(tables.slice(0, 4).join(", "))}${tables.length > 4 ? ` +${tables.length - 4}` : ""}</span></div>`).join("") || emptyState("Run Discover Tables to load live Coral tables.");
}

function renderLiveDatadog() {
  const items = [
    ["Hosts", state.datadog.hosts?.length || 0],
    ["Monitors", state.datadog.monitors?.length || 0],
    ["Metric names", state.datadog.metricNames?.length || 0],
    ["Services", state.datadog.services?.length || 0],
    ["Incidents", state.datadog.incidents?.length || 0],
    ["Metric reports", state.datadog.reports?.filter((item) => item.points?.length).length || 0]
  ];
  qs("#live-datadog-list").innerHTML = items.map(([label, value]) => `<div><strong>${label}</strong><span>${value}</span></div>`).join("");
}

function renderAll() {
  syncLiveSelects();
  renderMetrics();
  renderPrTables();
  renderLegend();
  renderIncidents();
  renderTrend();
  renderServiceBars();
  renderSources();
  renderRecommendations();
  renderCommentPreview();
  renderHealthCards();
  renderIntegrations();
  renderAnalytics();
  renderServiceMap();
  renderLiveSummary();
  renderLiveTables();
  renderLiveDatadog();
}

async function hydrateConfigFromServer() {
  if (state.config.owner && state.config.repo) return;
  try {
    const config = await fetchJson("/api/live/config");
    state.config = {
      owner: state.config.owner || config.owner || "",
      repo: state.config.repo || config.repo || "",
      prNumber: state.config.prNumber || config.prNumber || "",
      service: state.config.service || config.service || "payments"
    };
    fillConfigForm();
  } catch {
    addLog("Live config endpoint is not reachable yet.");
  }
}

async function loadLiveData() {
  if (window.location.protocol === "file:") {
    setLiveStatus("error", "Live server required", "Start .\\start-live.ps1 and open http://localhost:4173. Direct file mode has no live tool access.");
    addLog("Direct file mode blocked live loading.");
    renderAll();
    return;
  }
  await hydrateConfigFromServer();
  readConfigFromForm();
  setLiveStatus("static", "Loading live data", "Querying Coral, GitHub, Datadog, Sentry, and Linear.");

  const [status, tables, datadog, sentry, linear, pulls] = await Promise.allSettled([
    fetchJson("/api/live/status"),
    fetchJson("/api/live/tables"),
    fetchJson(`/api/live/datadog?range=${encodeURIComponent(selectedTimeRange())}`),
    fetchJson("/api/live/sentry"),
    fetchJson("/api/live/linear"),
    fetchJson(`/api/live/github/pulls?${queryFromConfig()}`)
  ]);

  if (status.status === "fulfilled" && status.value.ok) {
    state.live = true;
    setLiveStatus("live", "Live Coral mode", `Connected to ${status.value.coralVersion || "Coral"}.`);
    addLog(`Connected to ${status.value.coralVersion || "Coral"}.`);
  } else {
    const detail = status.status === "fulfilled" ? (status.value.errors || [status.value.error]).filter(Boolean).join(" ") : status.reason.message;
    setLiveStatus("error", "Live tool issue", detail || "Coral status check failed.");
    addLog(detail || "Coral status check failed.");
  }

  if (tables.status === "fulfilled" && tables.value.ok) state.tables = rowsFromPayload(tables.value);
  else addLog(tables.status === "fulfilled" ? (tables.value.error || "Coral tables returned no rows.") : tables.reason.message);

  if (datadog.status === "fulfilled" && datadog.value.ok) state.datadog = datadog.value;
  else addLog(datadog.status === "fulfilled" ? (datadog.value.error || "Datadog returned no rows.") : datadog.reason.message);

  if (sentry.status === "fulfilled" && sentry.value.ok) state.sentry = sentry.value;
  else addLog(sentry.status === "fulfilled" ? (sentry.value.error || "Sentry returned no rows.") : sentry.reason.message);

  if (linear.status === "fulfilled" && linear.value.ok) state.linear = linear.value;
  else addLog(linear.status === "fulfilled" ? (linear.value.error || "Linear returned no rows.") : linear.reason.message);

  if (pulls.status === "fulfilled" && pulls.value.ok) {
    state.serviceOptions = [...new Set([...(state.serviceOptions || []), ...(pulls.value.services || [])])];
    state.pulls = rowsFromPayload(pulls.value).map(normalizePull);
    applyPullSelection();
    saveStoredConfig();
    addLog(`Loaded ${state.pulls.length} GitHub PRs via ${pulls.value.mode || "live API"}.`);
  } else {
    addLog(pulls.status === "fulfilled" ? (pulls.value.error || pulls.value.message || "GitHub returned no PR rows.") : pulls.reason.message);
  }

  qs("#sync-time").textContent = "live";
  renderAll();
}

async function discoverLiveTables() {
  const tables = await fetchJson("/api/live/tables");
  if (!tables.ok) throw new Error(tables.error || "Failed to load Coral tables.");
  state.tables = rowsFromPayload(tables);
  state.live = true;
  setWorkflowStep("discover");
  addLog(`Discovered ${state.tables.length} Coral tables.`);
  renderAll();
}

async function loadLivePulls() {
  readConfigFromForm();
  if (!state.config.owner || !state.config.repo) throw new Error("Enter GitHub owner and repository.");
  const pulls = await fetchJson(`/api/live/github/pulls?${queryFromConfig()}`);
  if (!pulls.ok) throw new Error(pulls.error || pulls.message || "Failed to load GitHub PRs.");
  state.pulls = rowsFromPayload(pulls).map(normalizePull);
  state.serviceOptions = [...new Set([...(state.serviceOptions || []), ...(pulls.services || [])])];
  applyPullSelection();
  fillConfigForm();
  saveStoredConfig();
  setWorkflowStep("join");
  addLog(`Loaded ${state.pulls.length} GitHub PRs via ${pulls.mode || "live API"}.`);
  renderAll();
}

async function runLiveRiskQuery() {
  readConfigFromForm();
  if (!state.config.owner || !state.config.repo || !state.config.prNumber) throw new Error("Enter owner, repo, and PR number.");
  const result = await fetchJson(`/api/live/risk?${queryFromConfig()}`);
  qs("#live-query-result").textContent = JSON.stringify(result.rows || result, null, 2);
  if (!result.ok) throw new Error(result.error || "Risk query failed.");
  state.lastRiskRows = rowsFromPayload(result);
  if (state.lastRiskRows.length) {
    const pr = normalizePull(state.lastRiskRows[0], 0);
    state.selectedPr = pr;
    const index = state.pulls.findIndex((item) => item.number === pr.number);
    if (index >= 0) state.pulls[index] = pr;
    else state.pulls.unshift(pr);
  }
  setWorkflowStep("score");
  addLog(`Ran risk query for PR #${state.config.prNumber} via ${result.mode || "Coral"}.`);
  if (result.error) addLog(result.error);
  renderAll();
}

function setWorkflowStep(step) {
  qsa(".workflow-step").forEach((el) => el.classList.toggle("active", el.dataset.step === step));
}

async function runAction(action) {
  try {
    if (action === "save-live-config") {
      readConfigFromForm();
      addLog(`Saved live config for ${state.config.owner || "owner"}/${state.config.repo || "repo"}.`);
      toast("Live configuration saved.");
      return;
    }
    if (action === "load-live" || action === "sync") await loadLiveData();
    else if (action === "discover") await discoverLiveTables();
    else if (action === "load-pulls") await loadLivePulls();
    else if (action === "run-query") await runLiveRiskQuery();
    else if (action === "score") {
      setWorkflowStep("score");
      addLog(state.selectedPr ? `Computed ${state.selectedPr.score}/100 from live rows.` : "No live PR selected.");
    } else if (action === "comment") {
      setWorkflowStep("comment");
      renderRecommendations();
      renderCommentPreview();
      addLog("Rendered live PR comment preview.");
    } else if (action === "gate") {
      setWorkflowStep("gate");
      addLog(state.selectedPr?.score >= 70 ? "Live gate would block this PR." : "Live gate would allow this PR.");
    }
    toast("Live action complete.");
  } catch (error) {
    addLog(error.message);
    toast(error.message);
  }
}

async function runFullFlow() {
  for (const action of ["discover", "load-pulls", "run-query", "score", "comment", "gate"]) {
    await runAction(action);
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
}

function setActiveView(view) {
  state.activeView = view;
  qsa(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  qsa(".view-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === view));
  qs("#page-title").textContent = titles[view] || titles.overview;
}

function selectPr(number) {
  const pr = state.pulls.find((item) => item.number === Number(number));
  if (!pr) return;
  state.selectedPr = pr;
  state.config.prNumber = String(pr.number);
  state.config.service = pr.service || state.config.service;
  fillConfigForm();
  saveStoredConfig();
  addLog(`Selected live PR #${pr.number}.`);
  renderRecommendations();
  renderCommentPreview();
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-view]");
    const jump = event.target.closest("[data-view-jump]");
    const action = event.target.closest("[data-action]");
    const prRowEl = event.target.closest("tr[data-pr]");
    if (nav) setActiveView(nav.dataset.view);
    if (jump) setActiveView(jump.dataset.viewJump);
    if (prRowEl) selectPr(prRowEl.dataset.pr);
    if (action) {
      const name = action.dataset.action;
      if (name === "run-full-flow") void runFullFlow();
      else void runAction(name);
    }
  });
  qs("#global-search").addEventListener("input", () => {
    renderPrTables();
    renderIncidents();
  });
  qs("#time-range").addEventListener("change", () => {
    addLog(`Datadog interval changed to ${selectedTimeRange()}.`);
    void loadLiveData();
  });
  qs("#live-pr-number").addEventListener("change", (event) => {
    if (event.target.value) selectPr(event.target.value);
    else readConfigFromForm();
  });
  qs("#live-service").addEventListener("change", () => {
    readConfigFromForm();
    if (state.selectedPr) state.selectedPr = { ...state.selectedPr, service: state.config.service || state.selectedPr.service };
    renderAll();
  });
  qs("#sync-now").addEventListener("click", () => void runAction("sync"));
  qs("#ask-ai").addEventListener("click", () => {
    setActiveView("recommendations");
    void runAction("comment");
  });
  qs("#generate-recommendation").addEventListener("click", () => void runAction("comment"));
  qs("#clear-log").addEventListener("click", () => {
    state.log = [];
    renderLog();
  });
}

function init() {
  loadStoredConfig();
  fillConfigForm();
  qs("#sql-preview").textContent = seed.sql || "";
  setLiveStatus("static", "Waiting for live data", "Start the live server, then load Coral data.");
  renderAll();
  renderLog();
  bindEvents();
  void loadLiveData();
}

document.addEventListener("DOMContentLoaded", init);
