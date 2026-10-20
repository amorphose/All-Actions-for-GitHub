import { getUser, listInstallations, TokenError } from "./lib/github.js";
import { requestDeviceCode, pollForToken, toAuth, SignInError, INSTALL_URL } from "./lib/auth.js";
import {
  getToken, setToken, clearToken, getAuth, getLogin, setLogin, getAvatar, getSettings, setSettings, getSnapshot, updateBadge,
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
const TOKENS_URL = "https://github.com/settings/personal-access-tokens";
const INSTALL_CHECK_MS = 5000;

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

/** The current token from the background script, which renews it when needed. */
async function currentToken() {
  const res = await chrome.runtime.sendMessage({ type: "get-token" });
  if (res?.error) throw new TokenError(res.error);
  return res?.token || "";
}

let signIn = null; // AbortController while waiting for the person to approve on GitHub
let installation = null; // { id } once the app is installed on the person's account
let installTimer = null;
let waitingForInstall = false;
let avatarChecked = false;

/** Show one of: the two ways to connect, the sign-in code, or the connected account and its repositories. */
async function showConnected() {
  const [token, auth, login, avatar] = await Promise.all([getToken(), getAuth(), getLogin(), getAvatar()]);
  const app = auth?.method === "app";
  const signingIn = Boolean(signIn) && !token;
  $("heading").textContent = token ? "Settings" : "Connect your GitHub account";
  $("disconnect").hidden = !token;
  $("step1-title").textContent = token ? "GitHub account" : "Choose how to connect";
  $("step2-title").textContent = token ? "Repositories" : "Finish connecting";
  $("choices").hidden = Boolean(token);
  $("choice-app").classList.toggle("picked", signingIn);
  $("account").hidden = !token;
  $("replace").hidden = !token || app;
  $("paste").hidden = Boolean(token) || signingIn;
  $("device").hidden = !signingIn;
  if (token) {
    $("account-login").textContent = `@${login}`;
    $("account-method").textContent = app ? "Signed in with GitHub" : "Connected with a token";
    $("avatar").hidden = !avatar;
    if (avatar) $("avatar").src = avatar;
    $("avatar-initial").hidden = Boolean(avatar);
    $("avatar-initial").textContent = login.slice(0, 1).toUpperCase();
    if (!avatar && !avatarChecked) addAvatar();
  }
  if (!token || !app) installation = null;
  await showRepos(token, app, login);
}

/** Connections saved before 1.0 have no profile picture yet: look it up once. */
async function addAvatar() {
  avatarChecked = true;
  try {
    const user = await getUser(await currentToken());
    if (!user.avatar_url) return;
    await setLogin(user.login, user.avatar_url);
    await showConnected();
  } catch {
    // Not important enough to show an error for; the initial stays.
  }
}

async function showRepos(token, app, login) {
  clearTimeout(installTimer);
  const needsInstall = token && app && !installation && !(await findInstallation(login));
  $("install").hidden = !needsInstall;
  $("repos").hidden = !token || needsInstall;
  if (needsInstall) {
    waitingForInstall = true;
    // Check again shortly, so the page moves on by itself once the person comes back from GitHub.
    installTimer = setTimeout(showConnected, INSTALL_CHECK_MS);
    return;
  }
  if (!token) return;
  const snapshot = await getSnapshot();
  const n = snapshot?.repoCount;
  $("repo-count").textContent = snapshot?.fetchedAt
    ? `Watching ${n} ${n === 1 ? "repository" : "repositories"}.`
    : "Checking your repositories…";
  $("contents-note").hidden = app || snapshot?.scheduleAccess !== "denied";
  $("repos-link").textContent = app ? "Change repositories on GitHub ↗" : "Change the token's repositories on GitHub ↗";
  $("repos-link").href = !app ? TOKENS_URL
    : installation?.id ? `https://github.com/settings/installations/${installation.id}` : "https://github.com/settings/installations";
}

/** Whether the app is installed on the person's own account. Remembers the installation once found. */
async function findInstallation(login) {
  try {
    const all = await listInstallations(await currentToken());
    const mine = all.find((i) => i.account?.login?.toLowerCase() === login.toLowerCase());
    if (mine && waitingForInstall) {
      waitingForInstall = false;
      chrome.runtime.sendMessage({ type: "refresh" }).catch(() => {}); // the newly chosen repositories
    }
    installation = mine ? { id: mine.id } : null;
  } catch (err) {
    // Can't tell right now (offline, or the sign-in expired): don't nag about installing.
    installation = { id: "" };
    if (err instanceof TokenError) setStatus(err.message, "err");
  }
  return installation;
}

async function onSignIn() {
  $("signin").disabled = true;
  setStatus("Asking GitHub for a code…");
  const controller = new AbortController();
  try {
    const code = await requestDeviceCode();
    signIn = controller;
    $("user-code").textContent = code.user_code;
    $("device-link").href = code.verification_uri;
    setStatus("");
    await showConnected();
    const data = await pollForToken(code, { signal: controller.signal });
    setStatus("Finishing sign-in…");
    const user = await getUser(data.access_token);
    // Results from a previous connection may belong to another account.
    await chrome.storage.local.remove(["snapshot", "scheduleCache", "httpCache"]);
    await chrome.storage.local.set({ token: data.access_token, auth: toAuth(data) });
    await setLogin(user.login, user.avatar_url);
    await updateBadge(null);
    signIn = null;
    chrome.runtime.sendMessage({ type: "refresh" }).catch(() => {});
    await showConnected();
    setStatus(`Signed in as @${user.login}.`, "ok");
  } catch (err) {
    if (signIn === controller) signIn = null;
    await showConnected();
    if (err instanceof SignInError && err.code === "cancelled") setStatus("");
    else setStatus(err instanceof SignInError ? err.message : `Couldn't reach GitHub: ${err.message}`, "err");
  } finally {
    $("signin").disabled = false;
  }
}

function onCancelSignIn() {
  signIn?.abort();
}

/** Copy the sign-in code. Runs straight from a click, which browsers require for writing to the clipboard. */
function copyCode() {
  navigator.clipboard.writeText($("user-code").textContent).catch(() => {});
}

async function onTokenSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const input = form.querySelector("input");
  const button = form.querySelector("button");
  const token = input.value.trim();
  if (!token) {
    setStatus("Paste the token GitHub showed you after you generated it.", "err");
    return;
  }
  button.disabled = true;
  setStatus("Checking the token with GitHub…");
  try {
    const user = await getUser(token);
    await setToken(token);
    await chrome.storage.local.remove("auth");
    await setLogin(user.login, user.avatar_url);
    // Results from a previous token may belong to another account.
    await chrome.storage.local.remove("snapshot");
    await updateBadge(null);
    input.value = "";
    await showConnected();
    setStatus(`Connected as @${user.login}.`, "ok");
    chrome.runtime.sendMessage({ type: "refresh" }).catch(() => {});
  } catch (err) {
    setStatus(
      err instanceof TokenError
        ? "GitHub didn't accept that token. Check you copied all of it, then try again."
        : `Couldn't reach GitHub: ${err.message}`,
      "err",
    );
  } finally {
    button.disabled = false;
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
    setStatus("Connect your GitHub account first (step 1).", "err");
    return;
  }
  location.href = VIEW_URL;
}

async function onDisconnect() {
  const app = (await getAuth())?.method === "app";
  await clearToken();
  await updateBadge(null);
  installation = null;
  waitingForInstall = false;
  for (const input of document.querySelectorAll("[data-token-form] input")) input.value = "";
  setStatus(
    app
      ? "Signed out. To take away the app's access too, uninstall it on GitHub under Settings, Applications."
      : "Disconnected. The token was removed from this browser. You can also delete it on GitHub.",
  );
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
  for (const form of document.querySelectorAll("[data-token-form]")) form.addEventListener("submit", onTokenSubmit);
  $("signin").addEventListener("click", onSignIn);
  $("cancel-signin").addEventListener("click", onCancelSignIn);
  $("copy-code").addEventListener("click", copyCode);
  $("device-link").addEventListener("click", copyCode);
  $("install-link").href = INSTALL_URL;
  // Keep the repository count current while the page is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.snapshot && !signIn) showConnected();
  });
  $("scope-scheduled").addEventListener("change", onScopeChange);
  $("scope-all").addEventListener("change", onScopeChange);
  $("done").addEventListener("click", onDone);
  $("disconnect").addEventListener("click", onDisconnect);
  await showConnected();
}

init();
