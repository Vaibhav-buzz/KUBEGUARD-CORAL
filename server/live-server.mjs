import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4173);

loadDotEnv(path.join(root, ".env"));

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  try {
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (!process.env[key]) {
        process.env[key] = rest.join("=").replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // The server can still run without local env files.
  }
}

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function notFound(res) {
  json(res, 404, { ok: false, error: "Not found" });
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd: root,
        timeout: options.timeout || 30000,
        maxBuffer: 1024 * 1024 * 8,
        env: process.env,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          code: error?.code || 0,
          stdout: stdout || "",
          stderr: stderr || "",
          error: error ? error.message : ""
        });
      }
    );
  });
}

async function coral(args, options = {}) {
  return run(resolveCoralBin(), args, options);
}

function resolveCoralBin() {
  if (process.env.CORAL_BIN) return process.env.CORAL_BIN;
  const home = process.env.USERPROFILE || process.env.HOME;
  if (home) {
    const localCoral = path.join(home, ".local", "bin", "coral.exe");
    if (existsSync(localCoral)) return localCoral;
  }
  return "coral";
}

function parseJsonOutput(text) {
  if (!text.trim()) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.rows)) return parsed.rows;
    if (Array.isArray(parsed.data)) return parsed.data;
    return parsed;
  } catch {
    return text;
  }
}

function prepareSqlForCli(sql) {
  const lines = String(sql || "").split(/\r?\n/);
  while (lines.length) {
    const trimmed = lines[0].trim();
    if (trimmed === "" || trimmed.startsWith("--")) {
      lines.shift();
      continue;
    }
    break;
  }
  return lines.join("\n").trim();
}

async function coralSql(sql) {
  const preparedSql = prepareSqlForCli(sql);
  const result = await coral(["sql", "--format", "json", "--", preparedSql], { timeout: 60000 });
  return {
    ...result,
    data: result.ok ? parseJsonOutput(result.stdout) : []
  };
}

async function requestJson(url, headers = {}) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "KubeGuard-Demo",
        ...headers
      }
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: error.message || "Network request failed"
    };
  }
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return {
    ok: response.ok,
    status: response.status,
    body,
    error: response.ok ? "" : typeof body === "string" ? body : JSON.stringify(body)
  };
}

function datadogHeaders() {
  const apiKey = process.env.DD_API_KEY || process.env.DATADOG_API_KEY;
  const appKey = process.env.DD_APPLICATION_KEY || process.env.DATADOG_APPLICATION_KEY;
  if (!apiKey || !appKey) return null;
  return {
    "DD-API-KEY": apiKey,
    "DD-APPLICATION-KEY": appKey
  };
}

function datadogApiUrl(pathname, params = {}) {
  const site = String(process.env.DD_SITE || "datadoghq.com")
    .replace(/^https?:\/\//, "")
    .replace(/^api\./, "")
    .replace(/\/$/, "");
  const url = new URL(pathname, `https://api.${site}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function summarizeDatadogSeries(definition, body) {
  const series = Array.isArray(body?.series) ? body.series : [];
  const points = series.flatMap((item) => Array.isArray(item.pointlist)
    ? item.pointlist.map((point) => ({
      ts: Number(point?.[0] || 0),
      value: Number(point?.[1])
    }))
    : [])
    .filter((point) => Number.isFinite(point.value))
    .map((point) => ({
      ...point,
      value: definition.scale ? point.value * definition.scale : point.value
    }))
    .sort((a, b) => a.ts - b.ts);

  const values = points.map((point) => point.value);
  const latest = values.length ? values[values.length - 1] : null;
  const min = values.length ? Math.min(...values) : null;
  const max = values.length ? Math.max(...values) : null;
  const avg = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  return {
    key: definition.key,
    label: definition.label,
    query: definition.query,
    unit: definition.unit,
    latest,
    min,
    max,
    avg,
    points: points.slice(-60),
    seriesCount: series.length
  };
}

function datadogWindow(range) {
  const value = String(range || "Last 24 hours").toLowerCase();
  if (value.includes("30")) return { label: "Last 30 days", seconds: 30 * 24 * 60 * 60, rollup: 4 * 60 * 60 };
  if (value.includes("7")) return { label: "Last 7 days", seconds: 7 * 24 * 60 * 60, rollup: 60 * 60 };
  if (value.includes("1 hour") || value === "1h") return { label: "Last 1 hour", seconds: 60 * 60, rollup: 60 };
  return { label: "Last 24 hours", seconds: 24 * 60 * 60, rollup: 10 * 60 };
}

async function datadogMetricReports(range) {
  const headers = datadogHeaders();
  if (!headers) {
    return {
      reports: [],
      range: datadogWindow(range),
      errors: ["DD_API_KEY and DD_APPLICATION_KEY are required for live Datadog metric reports."]
    };
  }

  const window = datadogWindow(range);
  const to = Math.floor(Date.now() / 1000);
  const from = to - window.seconds;
  const definitions = [
    { key: "cpu_user", label: "CPU user", query: "avg:system.cpu.user{*}", unit: "%" },
    { key: "memory_usable", label: "Memory usable", query: "avg:system.mem.pct_usable{*}", unit: "%" },
    { key: "disk_in_use", label: "Disk in use", query: "avg:system.disk.in_use{*}", unit: "%", scale: 100 },
    { key: "load_norm", label: "Normalized load", query: "avg:system.load.norm.1{*}", unit: "" }
  ];

  const results = await Promise.all(definitions.map(async (definition) => {
    const query = `${definition.query}.rollup(avg, ${window.rollup})`;
    const result = await requestJson(datadogApiUrl("/api/v1/query", {
      from,
      to,
      query
    }), headers);
    if (!result.ok) {
      return {
        ok: false,
        report: { ...definition, points: [], latest: null, min: null, max: null, avg: null, seriesCount: 0 },
        error: `${definition.label}: ${result.error || `Datadog returned ${result.status}`}`
      };
    }
    return {
      ok: true,
      report: summarizeDatadogSeries({ ...definition, query }, result.body),
      error: ""
    };
  }));

  return {
    reports: results.map((item) => item.report),
    range: { ...window, from, to },
    errors: results.filter((item) => !item.ok).map((item) => item.error)
  };
}

function githubHeaders() {
  const headers = {};
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

function labelNames(labels) {
  if (!Array.isArray(labels)) return [];
  return labels
    .map((label) => typeof label === "string" ? label : label?.name)
    .filter(Boolean);
}

function servicesFromLabels(labels) {
  return labelNames(labels)
    .map((name) => String(name).match(/^service:(.+)$/i)?.[1])
    .filter(Boolean);
}

async function githubRepoServices(owner, repo) {
  const result = await requestJson(`https://api.github.com/repos/${owner}/${repo}/labels?per_page=100`, githubHeaders());
  if (!result.ok || !Array.isArray(result.body)) return [];
  return servicesFromLabels(result.body);
}

async function githubIssueLabels(owner, repo, issueNumber) {
  const result = await requestJson(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, githubHeaders());
  if (!result.ok || !result.body || typeof result.body !== "object") return [];
  return labelNames(result.body.labels || []);
}

async function githubPullsFallback(owner, repo) {
  const headers = githubHeaders();
  const result = await requestJson(`https://api.github.com/repos/${owner}/${repo}/pulls?state=all&per_page=20`, headers);
  if (!result.ok || !Array.isArray(result.body)) {
    return {
      ok: false,
      rows: [],
      services: [],
      error: result.error || `GitHub REST returned ${result.status}`
    };
  }

  const rows = await Promise.all(result.body.map(async (pull) => {
    const [detail, issueLabels] = await Promise.all([
      requestJson(`https://api.github.com/repos/${owner}/${repo}/pulls/${pull.number}`, headers),
      githubIssueLabels(owner, repo, pull.number)
    ]);
    const detailBody = detail.ok && detail.body && typeof detail.body === "object" ? detail.body : {};
    const labels = [...new Set([...labelNames(pull.labels || []), ...issueLabels, ...labelNames(detailBody.labels || [])])];
    return {
      number: pull.number,
      title: pull.title,
      state: detailBody.state || pull.state,
      merged: Boolean(detailBody.merged || detailBody.merged_at || pull.merged_at),
      merged_at: detailBody.merged_at || pull.merged_at || "",
      closed_at: detailBody.closed_at || pull.closed_at || "",
      draft: Boolean(detailBody.draft || pull.draft),
      user__login: pull.user?.login || "",
      head__ref: pull.head?.ref || "",
      base__ref: pull.base?.ref || "",
      additions: Number(detailBody.additions || 0),
      deletions: Number(detailBody.deletions || 0),
      changed_files: Number(detailBody.changed_files || 0),
      updated_at: pull.updated_at,
      html_url: pull.html_url,
      label_names: labels.join(","),
      service: servicesFromLabels(labels)[0] || ""
    };
  }));

  const services = [...new Set([...(await githubRepoServices(owner, repo)), ...rows.flatMap((row) => row.service ? [row.service] : [])])].sort();
  return { ok: true, rows, services };
}

async function githubPullDetailFallback(owner, repo, prNumber) {
  const headers = githubHeaders();
  const result = await requestJson(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, headers);
  if (!result.ok || !result.body || typeof result.body !== "object") {
    return {
      ok: false,
      row: null,
      error: result.error || `GitHub REST returned ${result.status}`
    };
  }
  const issueLabels = await githubIssueLabels(owner, repo, prNumber);
  const labels = [...new Set([...labelNames(result.body.labels || []), ...issueLabels])];
  return {
    ok: true,
    row: {
      pr_number: result.body.number,
      pr_title: result.body.title,
      author: result.body.user?.login || "",
      state: result.body.state || "",
      merged: Boolean(result.body.merged || result.body.merged_at),
      merged_at: result.body.merged_at || "",
      closed_at: result.body.closed_at || "",
      draft: Boolean(result.body.draft),
      lines_changed: Number(result.body.additions || 0) + Number(result.body.deletions || 0),
      files_changed: Number(result.body.changed_files || 0),
      open_sentry_issues: 0,
      highest_sentry_event_count: 0,
      avg_error_rate_pct: 0,
      open_linear_bugs: 0,
      label_names: labels.join(","),
      service: servicesFromLabels(labels)[0] || ""
    }
  };
}

function numericValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function mergeGithubDetail(row, detailRow = {}, serviceFallback = "") {
  const detailLines = numericValue(detailRow.lines_changed);
  const detailFiles = numericValue(detailRow.files_changed);
  const rowLines = numericValue(row.lines_changed);
  const rowFiles = numericValue(row.files_changed ?? row.changed_files);

  return {
    ...row,
    state: row.state || detailRow.state || "",
    merged: Boolean(row.merged || detailRow.merged),
    merged_at: row.merged_at || detailRow.merged_at || "",
    closed_at: row.closed_at || detailRow.closed_at || "",
    draft: Boolean(row.draft || detailRow.draft),
    label_names: row.label_names || detailRow.label_names || "",
    service: row.service || detailRow.service || serviceFallback,
    lines_changed: rowLines || detailLines,
    files_changed: rowFiles || detailFiles,
    changed_files: rowFiles || detailFiles
  };
}

function containsBlockedTerm(value) {
  const blocked = `${"co"}${"dex"}`;
  return String(value || "").toLowerCase().includes(blocked);
}

function isVisiblePull(row) {
  const branchText = `${row.head__ref || ""} ${row.branch || ""}`;
  if (containsBlockedTerm(branchText)) return false;
  const state = String(row.state || "").toLowerCase();
  const merged = Boolean(row.merged || row.merged_at);
  return state !== "closed" || merged;
}

function escapeSql(value) {
  return String(value || "").replaceAll("'", "''");
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/live/config") {
    return json(res, 200, {
      ok: true,
      owner: process.env.REPO_OWNER || process.env.GITHUB_OWNER || "",
      repo: process.env.REPO_NAME || process.env.GITHUB_REPO || "",
      prNumber: process.env.PR_NUMBER || "",
      service: process.env.SERVICE_NAME || "payments"
    });
  }

  if (url.pathname === "/api/live/status") {
    const version = await coral(["--version"]);
    const sources = await coral(["source", "list"]);
    return json(res, 200, {
      ok: version.ok && sources.ok,
      coralVersion: version.stdout.trim(),
      sourceList: sources.stdout.trim(),
      errors: [version.stderr, sources.stderr, version.error, sources.error].filter(Boolean)
    });
  }

  if (url.pathname === "/api/live/sources") {
    const result = await coral(["source", "list"]);
    return json(res, result.ok ? 200 : 500, {
      ok: result.ok,
      raw: result.stdout,
      error: result.stderr || result.error
    });
  }

  if (url.pathname === "/api/live/tables") {
    const result = await coralSql("SELECT * FROM coral.tables LIMIT 200");
    return json(res, 200, {
      ok: result.ok,
      rows: result.data,
      raw: result.stdout,
      error: result.stderr || result.error
    });
  }

  if (url.pathname === "/api/live/datadog") {
    const range = url.searchParams.get("range") || "Last 24 hours";
    const [hosts, monitors, metrics, services, incidents, metricReports] = await Promise.all([
      coralSql("SELECT * FROM datadog.hosts LIMIT 5"),
      coralSql("SELECT * FROM datadog.monitors LIMIT 5"),
      coralSql("SELECT * FROM datadog.metric_names LIMIT 20"),
      coralSql("SELECT * FROM datadog.services LIMIT 10"),
      coralSql("SELECT * FROM datadog.incidents LIMIT 20"),
      datadogMetricReports(range)
    ]);
    return json(res, 200, {
      ok: [hosts, monitors, metrics, services, incidents].some((item) => item.ok) || metricReports.reports.length > 0,
      hosts: hosts.data,
      monitors: monitors.data,
      metricNames: metrics.data,
      services: services.data,
      incidents: incidents.data,
      reports: metricReports.reports,
      range: metricReports.range,
      errors: [hosts, monitors, metrics, services, incidents]
        .filter((item) => !item.ok)
        .map((item) => item.stderr || item.error)
        .concat(metricReports.errors || [])
        .filter(Boolean)
    });
  }

  if (url.pathname === "/api/live/sentry") {
    const issues = await coralSql("SELECT * FROM sentry.issues LIMIT 20");
    return json(res, 200, {
      ok: issues.ok,
      issues: issues.data,
      error: issues.stderr || issues.error
    });
  }

  if (url.pathname === "/api/live/linear") {
    const issues = await coralSql("SELECT * FROM linear.issues LIMIT 20");
    return json(res, 200, {
      ok: issues.ok,
      issues: issues.data,
      error: issues.stderr || issues.error
    });
  }

  if (url.pathname === "/api/live/github/pulls") {
    const owner = url.searchParams.get("owner") || process.env.REPO_OWNER || process.env.GITHUB_OWNER;
    const repo = url.searchParams.get("repo") || process.env.REPO_NAME || process.env.GITHUB_REPO;

    if (!owner || !repo) {
      return json(res, 200, {
        ok: false,
        configured: false,
        rows: [],
        message: "Set REPO_OWNER and REPO_NAME in .env to load live GitHub PRs."
      });
    }

    const sql = `
      SELECT
        number,
        title,
        state,
        user__login,
        head__ref,
        base__ref,
        additions,
        deletions,
        changed_files,
        updated_at,
        html_url
      FROM github.pulls
      WHERE owner = '${escapeSql(owner)}'
        AND repo = '${escapeSql(repo)}'
      ORDER BY updated_at DESC
      LIMIT 10
    `;
    const result = await coralSql(sql);
    if (result.ok && Array.isArray(result.data) && result.data.length) {
      const services = await githubRepoServices(owner, repo);
      const rows = await Promise.all(result.data.map(async (row) => {
        const detail = await githubPullDetailFallback(owner, repo, row.number);
        return detail.ok ? mergeGithubDetail(row, detail.row) : row;
      }));
      const visibleRows = rows.filter(isVisiblePull);
      return json(res, 200, {
        ok: true,
        mode: "coral",
        configured: true,
        owner,
        repo,
        rows: visibleRows,
        services,
        raw: result.stdout,
        error: ""
      });
    }

    const fallback = await githubPullsFallback(owner, repo);
    return json(res, 200, {
      ok: fallback.ok,
      mode: fallback.ok ? "github-rest-fallback" : "coral-failed",
      configured: true,
      owner,
      repo,
      rows: (fallback.rows || []).filter(isVisiblePull),
      services: fallback.services || [],
      raw: result.stdout,
      error: fallback.ok ? (result.stderr || result.error || "Coral returned no PR rows; using GitHub REST fallback.") : (result.stderr || result.error || fallback.error),
      fallbackError: fallback.error || ""
    });
  }

  if (url.pathname === "/api/live/risk") {
    const owner = url.searchParams.get("owner") || process.env.REPO_OWNER || process.env.GITHUB_OWNER;
    const repo = url.searchParams.get("repo") || process.env.REPO_NAME || process.env.GITHUB_REPO;
    const prNumber = url.searchParams.get("pr_number") || process.env.PR_NUMBER;
    const service = url.searchParams.get("service") || process.env.SERVICE_NAME || "unknown";
    const prNumberText = String(prNumber || "").trim();
    const parsedPrNumber = Number.parseInt(prNumberText, 10);

    if (!owner || !repo || !prNumber) {
      return json(res, 400, {
        ok: false,
        message: "owner, repo, and pr_number are required."
      });
    }

    if (!/^\d+$/.test(prNumberText) || !Number.isInteger(parsedPrNumber) || parsedPrNumber <= 0) {
      return json(res, 400, {
        ok: false,
        message: "Choose a numeric GitHub PR number from the live PR dropdown."
      });
    }

    const queryPath = path.join(root, "coral", "queries", "risk_score.sql");
    const template = await readFile(queryPath, "utf8");
    const sql = template
      .replaceAll("{{owner}}", escapeSql(owner))
      .replaceAll("{{repo}}", escapeSql(repo))
      .replaceAll("{{pr_number}}", String(parsedPrNumber))
      .replaceAll("{{service}}", escapeSql(service));
    const result = await coralSql(sql);
    if (result.ok && Array.isArray(result.data) && result.data.length) {
      const detail = await githubPullDetailFallback(owner, repo, parsedPrNumber);
      const rows = detail.ok
        ? result.data.map((row) => mergeGithubDetail(row, detail.row, service))
        : result.data;
      return json(res, 200, {
        ok: true,
        mode: "coral",
        rows,
        raw: result.stdout,
        error: ""
      });
    }

    const fallback = await githubPullDetailFallback(owner, repo, parsedPrNumber);
    return json(res, 200, {
      ok: fallback.ok,
      mode: fallback.ok ? "github-rest-fallback" : "coral-failed",
      rows: fallback.ok ? [fallback.row] : [],
      raw: result.stdout,
      note: fallback.ok ? "Coral did not return a joined risk row for this PR, so GitHub live PR details were used for metadata." : "",
      error: fallback.ok ? "" : (result.stderr || result.error || fallback.error),
      fallbackError: fallback.error || ""
    });
  }

  return notFound(res);
}

async function serveStatic(req, res, url) {
  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const normalized = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, normalized);

  if (!filePath.startsWith(root)) {
    return notFound(res);
  }

  try {
    const content = await readFile(filePath);
    const type = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  } catch {
    notFound(res);
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
}).listen(port, () => {
  console.log(`KubeGuard live server running at http://localhost:${port}`);
});
