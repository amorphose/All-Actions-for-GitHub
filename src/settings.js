import { getUser, TokenError } from "./lib/github.js";
import {
  getToken, setToken, clearToken, getLogin, setLogin, getSettings, setSettings, updateBadge,
} from "./lib/storage.js";
import { MISSED_AFTER_HOURS } from "./lib/runs.js";

const VIEW_URL = "https://github.com/?all-actions";
const TOKEN_URL =
  "https://github.com/settings/personal-access-tokens/new?" +
  new URLSearchParams({
    name: "All Actions for GitHub",
    description: "Read-only access to workflow runs for the All Actions for GitHub browser extension.",
    expires_in: "90",
    actions: "read",
    contents: "read",
  });

const REPO_URL = "https://github.com/amorphose/All-Actions-for-GitHub";

// Chrome and Edge grant these at install. Firefox can leave them for the person to allow.
const SITE_ACCESS = { origins: ["https://github.com/*", "https://api.github.com/*"] };

const $ = (id) => document.getElementById(id);

async function showAccess() {
  $("access").hidden = await chrome.permissions.contains(SITE_ACCESS).catch(() => true);
}

async function onAccessGrant() {
  // Must be requested straight from the click, before anything else is awaited.
  const granted = await chrome.permissions.request(SITE_ACCESS).catch(() => false);
  await showAccess();
  if (granted && (await getToken())) chrome.runtime.sendMessage({ type: "refresh" }).catch(() => {});
}

/** Version line and a "Report a problem" link that starts the issue with the version and browser. */
function showAbout() {
  const { version } = chrome.runtime.getManifest();
  $("about-version").textContent = `All Actions for GitHub ${version}`;
  const brands = navigator.userAgentData?.brands?.map((b) => `${b.brand} ${b.version}`) ?? [];
  const firefox = navigator.userAgent.match(/Firefox\/(\d+)/);
  const browser = brands.find((b) => !/Chromium|Not.?A.?Brand/i.test(b)) || brands[0]
    || (firefox ? `Firefox ${firefox[1]}` : navigator.userAgent);
  const body = `**What happened?**\n\n\n**What did you expect?**\n\n\n---\nExtension version: ${version}\nBrowser: ${browser}\n`;
  $("report-link").href = `${REPO_URL}/issues/new?${new URLSearchParams({ body })}`;
}

function setStatus(text, kind = "") {
  $("token-status").textContent = text;
  $("token-status").className = `status ${kind}`;
}

async function showConnected() {
  const [token, login] = await Promise.all([getToken(), getLogin()]);
  $("disconnect").hidden = !token;
  $("heading").textContent = token ? "Settings" : "Connect your GitHub account";
  if (token) setStatus(`Connected as @${login}. Paste a new token to replace it.`, "ok");
}

async function onTokenSubmit(e) {
  e.preventDefault();
  const token = $("token-input").value.trim();
  if (!token) {
    setStatus("Paste the token GitHub showed you after you generated it.", "err");
    return;
  }
  $("token-save").disabled = true;
  setStatus("Checking the token with GitHub…");
  try {
    const user = await getUser(token);
    await setToken(token);
    await setLogin(user.login);
    // Results from a previous token may belong to another account.
    await chrome.storage.local.remove("snapshot");
    await updateBadge(null);
    $("token-input").value = "";
    await showConnected();
    setStatus(`Connected as @${user.login}.`, "ok");
  } catch (err) {
    setStatus(
      err instanceof TokenError
        ? "GitHub didn't accept that token. Check you copied all of it, then try again."
        : `Couldn't reach GitHub: ${err.message}`,
      "err",
    );
  } finally {
    $("token-save").disabled = false;
  }
}

async function onScopeChange() {
  const settings = await getSettings();
  await setSettings({ ...settings, scheduledOnly: $("scope-scheduled").checked });
  await chrome.storage.local.remove("snapshot"); // so the next view load fetches with the new setting
}

function showDelay() {
  const hours = Number($("delay").value);
  $("delay-value").textContent = `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

async function onDelayChange() {
  await setSettings({ ...(await getSettings()), missedAfterHours: Number($("delay").value) });
  // Re-check now, keeping the last results so a newly missed run still notifies.
  if (await getToken()) chrome.runtime.sendMessage({ type: "refresh" }).catch(() => {});
}

async function onNotifyChange(e) {
  const box = e.target;
  const key = box.id === "notify-pass" ? "notifyPass" : "notify";
  if (box.checked) {
    // Must be requested straight from the click, before anything else is awaited.
    const granted = await chrome.permissions.request({ permissions: ["notifications"] }).catch(() => false);
    if (!granted) {
      box.checked = false;
      setStatus("Notifications stay off because the permission wasn't granted.", "err");
      return;
    }
  }
  await setSettings({ ...(await getSettings()), [key]: box.checked });
}

async function onDone() {
  if (!(await getToken())) {
    setStatus("Connect a token first (step 2).", "err");
    return;
  }
  location.href = VIEW_URL;
}

async function onDisconnect() {
  await clearToken();
  await updateBadge(null);
  $("token-input").value = "";
  setStatus("Disconnected. The token was removed from this browser. You can also delete it on GitHub.");
  await showConnected();
}

async function init() {
  $("token-link").href = TOKEN_URL;
  showAbout();
  showAccess();
  $("access-grant").addEventListener("click", onAccessGrant);
  const settings = await getSettings();
  $("scope-scheduled").checked = settings.scheduledOnly;
  $("scope-all").checked = !settings.scheduledOnly;
  $("notify").checked = settings.notify;
  Object.assign($("delay"), { min: MISSED_AFTER_HOURS.min, max: MISSED_AFTER_HOURS.max, value: settings.missedAfterHours });
  showDelay();
  $("delay").addEventListener("input", showDelay);
  $("delay").addEventListener("change", onDelayChange);
  $("notify").addEventListener("change", onNotifyChange);
  $("notify-pass").checked = settings.notifyPass;
  $("notify-pass").addEventListener("change", onNotifyChange);
  $("token-form").addEventListener("submit", onTokenSubmit);
  $("scope-scheduled").addEventListener("change", onScopeChange);
  $("scope-all").addEventListener("change", onScopeChange);
  $("done").addEventListener("click", onDone);
  $("disconnect").addEventListener("click", onDisconnect);
  await showConnected();
}

init();
