import { loadSnapshot, TokenError, RateLimitError } from "./lib/github.js";
import { getAccessToken } from "./lib/auth.js";
import { getToken, getSettings, getSnapshot, setSnapshot, updateBadge } from "./lib/storage.js";
import { newProblems, newPasses, graceMs } from "./lib/runs.js";

export const VIEW_URL = "https://github.com/?all-actions";
const REFRESH_MINUTES = 30;

let running = null;

/** Fetch fresh results. Progress and errors go to storage so every open view can show them. */
function refresh() {
  if (running) return running;
  running = (async () => {
    if (!(await getToken())) return;
    const { scheduledOnly, notify, notifyPass, missedAfterHours } = await getSettings();
    const previous = await getSnapshot();
    const { scheduleCache = {}, httpCache = {} } = await chrome.storage.local.get(["scheduleCache", "httpCache"]);
    await chrome.storage.local.set({ refreshState: { running: true, done: 0, total: 0, at: Date.now() } });
    try {
      const token = await getAccessToken(); // renews a Sign in with GitHub token when it's due
      const result = await loadSnapshot(token, {
        scheduledOnly,
        grace: graceMs(missedAfterHours),
        previous,
        scheduleCache,
        httpCache,
        onProgress: (done, total) => chrome.storage.local.set({ refreshState: { running: true, done, total, at: Date.now() } }),
      });
      await chrome.storage.local.set({ scheduleCache: result.scheduleCache, httpCache: result.httpCache });
      await setSnapshot(result.snapshot);
      if (previous?.fetchedAt) {
        if (notify) await notifyProblems(newProblems(previous, result.snapshot));
        if (notifyPass) await notifyPasses(newPasses(previous, result.snapshot));
      }
      await chrome.storage.local.set({ refreshState: { running: false } });
    } catch (e) {
      const kind = e instanceof TokenError ? "token" : e instanceof RateLimitError ? "rate" : "other";
      await chrome.storage.local.set({
        refreshState: { running: false, error: { kind, message: e.message, resetAt: e.resetAt ?? null } },
      });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Desktop notification for newly failed or missed workflows (opt-in from Settings). */
async function notifyProblems(problems) {
  const title = problems.length === 1 ? "A workflow needs attention" : `${problems.length} workflows need attention`;
  await showNotification(problems, title, (e) => (e.state === "failed" ? "failed" : "didn't run"), "problem");
}

/** Desktop notification for workflows whose latest run just passed (separate opt-in). */
async function notifyPasses(passes) {
  const title = passes.length === 1 ? "A workflow passed" : `${passes.length} workflows passed`;
  await showNotification(passes, title, () => "passed", "pass");
}

async function showNotification(entries, title, outcome, kind) {
  if (!entries.length) return;
  if (!(await chrome.permissions.contains({ permissions: ["notifications"] }))) return;
  const lines = entries.slice(0, 4).map((e) => `${e.repo.name} / ${e.workflow.name}: ${outcome(e)}`);
  if (entries.length > 4) lines.push(`and ${entries.length - 4} more`);
  await chrome.notifications.create(`all-actions-${kind}-${Date.now()}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
    title,
    message: lines.join("\n"),
  });
}

// Clicking a notification opens the All actions page.
function onNotificationClick(id) {
  if (!id.startsWith("all-actions-")) return;
  chrome.tabs.create({ url: VIEW_URL });
  chrome.notifications.clear(id);
}
function listenForNotificationClicks() {
  // The notifications API only exists once the optional permission has been granted.
  if (chrome.notifications && !chrome.notifications.onClicked.hasListener(onNotificationClick)) {
    chrome.notifications.onClicked.addListener(onNotificationClick);
  }
}
listenForNotificationClicks();
chrome.permissions.onAdded.addListener(listenForNotificationClicks);

// Toolbar icon opens the All actions page on github.com.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: VIEW_URL });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "refresh") refresh();
  if (message?.type === "open-settings") chrome.runtime.openOptionsPage();
  // Settings asks here rather than renewing the token itself, so only one place ever renews it.
  if (message?.type === "get-token") {
    getAccessToken().then(
      (token) => sendResponse({ token }),
      (e) => sendResponse({ error: e.message }),
    );
    return true; // the answer comes later
  }
});

// Check in the background so the badge stays current.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refresh") refresh();
});

async function setUp() {
  await chrome.alarms.create("refresh", { periodInMinutes: REFRESH_MINUTES });
  // A refresh interrupted by a browser restart would otherwise look stuck.
  await chrome.storage.local.set({ refreshState: { running: false } });
  await updateBadge(await getSnapshot());
}

chrome.runtime.onStartup.addListener(setUp);
chrome.runtime.onInstalled.addListener(async (details) => {
  await setUp();
  if (details.reason === "install") chrome.runtime.openOptionsPage();
});
