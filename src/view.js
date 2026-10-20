// The All actions list. Rendered into a shadow root so GitHub's styles and ours can't
// collide; colors come from GitHub's own CSS variables when they're available.
// Data comes from chrome.storage (written by the background worker), so this module
// works the same inside github.com and on an extension page.

import {
  sortEntries, tally, filterEntries, formatDuration, formatWhen, formatAgo, describeCron,
} from "./lib/runs.js";

const STALE_MS = 5 * 60 * 1000;
// A refresh that hasn't reported progress for this long was interrupted (for example the
// background worker was stopped), so the view stops treating it as running.
const STUCK_MS = 2 * 60 * 1000;

const isRunning = (r) => Boolean(r?.running && Date.now() - (r.at || 0) < STUCK_MS);
const HISTORY = 10;

const LABELS = {
  failed: "Failed",
  missed: "Didn't run",
  running: "Running",
  passed: "Passed",
  other: "Cancelled or skipped",
};
const GROUP_TITLES = {
  failed: "Failed",
  missed: "Didn't run",
  running: "Running",
  other: "Cancelled or skipped",
  passed: "Passed",
};

const ICONS = {
  missed: '<svg class="icon missed" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/></svg>',
  failed: '<svg class="icon failed" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2.343 13.657A8 8 0 1 1 13.658 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z"/></svg>',
  passed: '<svg class="icon passed" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16Zm3.78-9.72a.751.751 0 0 0-.018-1.042.751.751 0 0 0-1.042-.018L6.75 9.19 5.28 7.72a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042l2 2a.75.75 0 0 0 1.06 0Z"/></svg>',
  running: '<svg class="icon running spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 1.5a6.5 6.5 0 1 1-6.5 6.5" stroke-linecap="round"/></svg>',
  other: '<svg class="icon other" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm1.5 0a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm3.75-.75h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1 0-1.5Z"/></svg>',
};

/** One of the ICONS strings as an SVG element, without going through innerHTML. */
function parseSvg(markup) {
  const svg = markup.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  return document.importNode(doc.documentElement, true);
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "svg") node.append(parseSvg(v)); // only used with the static icon strings above
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function send(message) {
  try {
    return chrome.runtime.sendMessage(message);
  } catch {
    return Promise.resolve(); // extension was reloaded; the page needs a refresh
  }
}

/**
 * Render the view into `host`. Returns a function that stops listening for updates.
 */
export async function mountView(host) {
  const root = host.shadowRoot || host.attachShadow({ mode: "open" });
  const css = await fetch(chrome.runtime.getURL("src/view.css")).then((r) => r.text());

  const ui = {
    meta: el("span", { class: "meta" }),
    refresh: el("button", { class: "btn", type: "button", onclick: () => send({ type: "refresh" }) }, "↻ Refresh"),
    settings: el("button", { class: "btn", type: "button", onclick: () => send({ type: "open-settings" }) }, "Settings"),
    nav: el("nav", { class: "side", "aria-label": "Filter workflows" }),
    search: el("input", { type: "search", class: "search", placeholder: "Filter by repository or workflow", "aria-label": "Filter by repository or workflow" }),
    banner: el("div", { class: "banner", role: "status", hidden: true }),
    count: el("strong"),
    rows: el("div"),
    errors: el("details", { class: "errors", hidden: true }, el("summary"), el("ul")),
  };

  root.replaceChildren(
    el("style", {}, css),
    el(
      "div",
      { class: "aa" },
      el(
        "header",
        { class: "pagehead" },
        el("h1", {}, "All actions"),
        ui.meta,
        el("span", { class: "grow" }),
        ui.refresh,
        ui.settings,
      ),
      el(
        "div",
        { class: "layout" },
        ui.nav,
        el(
          "div",
          { class: "content" },
          ui.search,
          ui.banner,
          el(
            "div",
            { class: "box" },
            el(
              "div",
              { class: "boxhead" },
              ui.count,
              el("span", { class: "grow" }),
              el("span", { class: "col-when" }, "Latest run"),
              el("span", { class: "col-hist" }, "Last 10 runs"),
            ),
            ui.rows,
          ),
          el(
            "div",
            { class: "legend" },
            ...["passed", "failed", "running", "other"].map((s) => el("span", {}, el("i", { class: `sq ${s}` }), LABELS[s])),
          ),
          ui.errors,
        ),
      ),
    ),
  );

  const state = { tab: null, query: "", snapshot: null, refreshState: null, hasToken: false, signedIn: false };

  ui.search.addEventListener("input", () => {
    state.query = ui.search.value;
    render();
  });

  function renderMeta() {
    const r = state.refreshState;
    if (isRunning(r)) {
      ui.meta.textContent = r.total ? `Checking ${r.done} of ${r.total} repositories…` : "Finding your repositories…";
      return;
    }
    const s = state.snapshot;
    if (!s?.fetchedAt) {
      ui.meta.textContent = "";
      return;
    }
    const what = s.scheduledOnly ? "Scheduled workflows" : "All workflows";
    ui.meta.textContent = `${what} in ${s.repoCount} repositories · checked ${formatAgo(Date.now() - Date.parse(s.fetchedAt))}`;
  }

  function renderBanner() {
    const err = state.refreshState?.error;
    let text = "";
    let info = false;
    if (!state.hasToken) text = "";
    else if (err?.kind === "token") {
      text = state.signedIn
        ? "Your GitHub sign-in has expired or was removed. Open Settings to sign in again."
        : "GitHub no longer accepts your token. It has probably expired. Open Settings to paste a new one.";
    }
    else if (err?.kind === "rate") text = `GitHub's hourly request limit was reached.${err.resetAt ? ` Try again after ${new Date(err.resetAt).toLocaleTimeString()}.` : ""}`;
    else if (err) text = `Couldn't refresh: ${err.message}`;
    else if (state.snapshot?.scheduleAccess === "denied") {
      info = true;
      text = state.signedIn
        ? "GitHub didn't let the extension read your workflow files, so workflows that didn't run can't be spotted."
        : "To spot scheduled workflows that didn't run, your token also needs Contents: Read. Open Settings to see how to add it.";
    }
    ui.banner.textContent = text;
    ui.banner.classList.toggle("info", info);
    ui.banner.hidden = !text;
  }

  function render() {
    renderMeta();
    renderBanner();
    ui.refresh.disabled = isRunning(state.refreshState) || !state.hasToken;

    const s = state.snapshot;
    const entries = sortEntries(s?.entries ?? []);
    const counts = tally(entries);
    // Pick the starting filter once real results are in: problems first if there are any.
    if (!state.tab && s?.fetchedAt) state.tab = counts.attention ? "attention" : "all";
    const tab = state.tab || "all";

    const items = [
      ["attention", "Needs attention", counts.attention, null],
      ["all", "All workflows", counts.total, null],
      ["failed", "Failed", counts.failed, "failed"],
      ["missed", "Didn't run", counts.missed, "missed"],
      ["running", "Running", counts.running, "running"],
      ["passed", "Passed", counts.passed, "passed"],
    ];
    if (counts.other) items.push(["other", "Cancelled or skipped", counts.other, "other"]);
    ui.nav.replaceChildren(
      el(
        "ul",
        {},
        ...items.map(([key, label, n, dot]) =>
          el(
            "li",
            {},
            el(
              "button",
              {
                type: "button",
                class: "navitem",
                "aria-current": tab === key ? "true" : null,
                onclick: () => {
                  state.tab = key;
                  render();
                },
              },
              dot ? el("span", { class: `dot ${dot}` }) : el("span", { class: "dot none" }),
              el("span", { class: "label" }, label),
              el("span", { class: "n" }, n),
            ),
          ),
        ),
      ),
    );

    const shown = filterEntries(entries, tab, state.query);
    ui.count.textContent = `${shown.length} ${shown.length === 1 ? "workflow" : "workflows"}`;
    const rows = [];
    if (!state.hasToken) {
      rows.push(
        el(
          "div",
          { class: "empty-state" },
          el("p", {}, "Connect your GitHub account to see your workflow runs here."),
          el("button", { class: "btn primary", type: "button", onclick: () => send({ type: "open-settings" }) }, "Connect"),
        ),
      );
    } else if (!s?.fetchedAt) {
      rows.push(el("div", { class: "empty-state" }, "Checking your repositories for the first time…"));
    } else if (!entries.length) {
      rows.push(
        el(
          "div",
          { class: "empty-state" },
          `${s.scheduledOnly ? "No scheduled workflow runs" : "No workflow runs"} in the last 14 days in the repositories ${
            state.signedIn ? "you chose" : "this token can see"}.`,
        ),
      );
    } else if (!shown.length) {
      rows.push(
        el(
          "div",
          { class: "empty-state" },
          tab === "attention" && !state.query ? "Nothing needs attention. Every workflow ran on schedule and its latest run passed or is still going." : "No workflows match.",
        ),
      );
    } else {
      let lastState = null;
      for (const e of shown) {
        if (tab === "all" && e.state !== lastState) {
          rows.push(el("div", { class: "group" }, GROUP_TITLES[e.state]));
          lastState = e.state;
        }
        rows.push(renderRow(e));
      }
    }
    ui.rows.replaceChildren(...rows);

    const errs = s?.errors ?? [];
    ui.errors.hidden = !errs.length;
    if (errs.length) {
      ui.errors.querySelector("summary").textContent = `Couldn't read ${errs.length} ${errs.length === 1 ? "repository" : "repositories"}`;
      ui.errors.querySelector("ul").replaceChildren(...errs.map((x) => el("li", {}, `${x.repo}: ${x.message}`)));
    }
  }

  const stored = await chrome.storage.local.get(["snapshot", "refreshState", "token", "auth"]);
  state.snapshot = stored.snapshot?.fetchedAt ? stored.snapshot : null;
  state.refreshState = stored.refreshState || null;
  state.hasToken = Boolean(stored.token);
  state.signedIn = stored.auth?.method === "app";
  render();

  const onChange = (changes, area) => {
    if (area !== "local") return;
    if (changes.snapshot) state.snapshot = changes.snapshot.newValue?.fetchedAt ? changes.snapshot.newValue : null;
    if (changes.refreshState) state.refreshState = changes.refreshState.newValue || null;
    if (changes.token) state.hasToken = Boolean(changes.token.newValue);
    if (changes.auth) state.signedIn = changes.auth.newValue?.method === "app";
    if (changes.snapshot || changes.refreshState || changes.token) render();
  };
  chrome.storage.onChanged.addListener(onChange);
  const timer = setInterval(renderMeta, 30000);

  if (state.hasToken && !isRunning(state.refreshState) && (!state.snapshot || Date.now() - Date.parse(state.snapshot.fetchedAt) > STALE_MS)) {
    send({ type: "refresh" });
  }

  return () => {
    chrome.storage.onChanged.removeListener(onChange);
    clearInterval(timer);
  };
}

const NOTES = {
  inactive: "GitHub turned this schedule off after 60 days without repository activity. Turn it back on from the workflow page.",
  disabled: "Schedule turned off in this repository",
};

function renderRow(e) {
  const now = new Date();
  const l = e.latest;
  const parts = [];
  if (e.crons?.length) parts.push(e.crons.map((c) => describeCron(c, { now })).join(", "));
  else if (l) parts.push(l.event === "schedule" ? "Scheduled" : `On ${l.event.replace(/_/g, " ")}`);
  if (e.note === "missed" && e.expectedAt) parts.push(`was due ${formatWhen(e.expectedAt, now)}`);
  else if (NOTES[e.note]) parts.push(NOTES[e.note]);
  else if (l) {
    if (l.branch) parts.push(`on ${l.branch}`);
    if (e.state === "running") parts.push(`started ${formatAgo(now - Date.parse(l.startedAt))}`);
    else {
      const d = formatDuration(Date.parse(l.updatedAt) - Date.parse(l.startedAt));
      if (d) parts.push(`took ${d}`);
    }
  }

  let failedAt = null;
  if (e.state === "failed" && e.failedStep) {
    const where = e.failedStep.step ? `“${e.failedStep.step}”` : `job “${e.failedStep.job}”`;
    failedAt = el(
      "div",
      { class: "failstep" },
      "Failed at ",
      e.failedStep.url ? el("a", { href: e.failedStep.url }, where) : where,
      e.failedStep.step && e.failedStep.job ? ` in ${e.failedStep.job}` : "",
    );
  }

  const hist = e.history.map((h) =>
    el("a", { class: h.state, href: h.url, title: `${LABELS[h.state]} · ${formatWhen(h.createdAt, now)}` }),
  );
  while (hist.length < HISTORY) hist.unshift(el("span", { class: "empty" }));

  let when;
  if (e.state === "missed") {
    when = el(
      "div",
      { class: "when" },
      el("a", { href: e.workflow.url }, el("b", {}, LABELS.missed)),
      l ? ` · last ran ${formatWhen(l.createdAt, now)}` : " · no recent runs",
    );
  } else if (e.note === "disabled") {
    when = el("div", { class: "when" }, el("a", { href: e.workflow.url }, el("b", {}, "Turned off")), l ? ` · last ran ${formatWhen(l.createdAt, now)}` : "");
  } else if (l) {
    when = el("div", { class: "when" }, el("a", { href: l.url }, el("b", {}, LABELS[e.state])), ` · ${formatWhen(l.createdAt, now)}`);
  } else {
    when = el("div", { class: "when" }, el("b", {}, "Not due yet"));
  }

  return el(
    "div",
    { class: `row ${e.state}` },
    el("span", { svg: ICONS[e.state], title: LABELS[e.state] }),
    el(
      "div",
      { class: "main" },
      el(
        "div",
        { class: "title" },
        el("a", { href: `${e.repo.url}/actions` }, e.repo.name),
        el("span", { class: "wf" }, " / ", el("a", { href: e.workflow.url }, e.workflow.name)),
      ),
      el("div", { class: "sub" }, parts.join(" · ")),
      failedAt,
    ),
    when,
    el("div", { class: "hist", "aria-label": "Last 10 runs, oldest first" }, hist),
  );
}
