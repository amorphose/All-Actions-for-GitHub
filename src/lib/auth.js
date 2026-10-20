// "Sign in with GitHub" through the extension's GitHub App, using GitHub's device flow:
// the person types a code on github.com/login/device and approves read-only access.
// Device-flow tokens can be renewed without a client secret, so there's still no server.
// https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-device-flow-to-generate-a-user-access-token

import { TokenError } from "./github.js";

// Neither is a secret: the client ID only names the app, and it appears in every sign-in URL.
export const CLIENT_ID = "Iv23liGpxEEtDHyxscZh";
export const APP_URL = "https://github.com/apps/all-actions-for-github";
export const INSTALL_URL = `${APP_URL}/installations/new`;

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
// Renew a little early so a refresh that's already under way doesn't run into the expiry.
const RENEW_EARLY_MS = 10 * 60 * 1000;

export class SignInError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

async function post(url, params) {
  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...params }),
  });
  if (!res.ok) throw new SignInError(`GitHub returned ${res.status}`, "http");
  return res.json();
}

/** Step one: GitHub hands out a code for the person to type in, and a device code for us to poll with. */
export async function requestDeviceCode() {
  const data = await post(DEVICE_CODE_URL, {});
  if (data.error) throw new SignInError(data.error_description || data.error, data.error);
  return data; // { device_code, user_code, verification_uri, expires_in, interval }
}

const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new SignInError("Sign-in cancelled.", "cancelled"));
    }, { once: true });
  });

/** The saved form of a token response: when the access token and the refresh token run out. */
export function toAuth(data, now = Date.now()) {
  return {
    method: "app",
    refreshToken: data.refresh_token || null,
    expiresAt: data.expires_in ? now + data.expires_in * 1000 : null,
    refreshExpiresAt: data.refresh_token_expires_in ? now + data.refresh_token_expires_in * 1000 : null,
  };
}

/**
 * Step two: ask every few seconds whether the person has approved yet.
 * Resolves with GitHub's token response, or rejects with a SignInError.
 */
export async function pollForToken({ device_code, interval = 5, expires_in = 900 }, { signal, sleep = wait } = {}) {
  let delay = interval * 1000;
  const deadline = Date.now() + expires_in * 1000;
  while (Date.now() < deadline) {
    await sleep(delay, signal);
    if (signal?.aborted) throw new SignInError("Sign-in cancelled.", "cancelled");
    const data = await post(TOKEN_URL, { device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" });
    if (data.access_token) return data;
    if (data.error === "authorization_pending") continue;
    if (data.error === "slow_down") {
      delay = (data.interval ?? interval + 5) * 1000;
      continue;
    }
    if (data.error === "access_denied") throw new SignInError("The sign-in was cancelled on GitHub.", data.error);
    if (data.error === "expired_token") break;
    throw new SignInError(data.error_description || data.error || "GitHub didn't finish the sign-in.", data.error);
  }
  throw new SignInError("The code expired before it was entered. Click Sign in with GitHub to get a new one.", "expired_token");
}

/** Swap the refresh token for a new access token (and a new refresh token: each one works once). */
export async function renew(refreshToken) {
  const data = await post(TOKEN_URL, { grant_type: "refresh_token", refresh_token: refreshToken });
  if (!data.access_token) {
    throw new TokenError("Your GitHub sign-in has expired or was removed. Sign in again from Settings.");
  }
  return data;
}

let renewing = null;

/**
 * The access token to use right now, renewing it first if it's about to run out.
 * Only the background script calls this: a refresh token works once, so two pages renewing at
 * the same moment would sign the person out. Everything else asks the background for the token.
 */
export async function getAccessToken(now = Date.now) {
  const { token, auth } = await chrome.storage.local.get(["token", "auth"]);
  if (!token) return "";
  if (auth?.method !== "app" || !auth.expiresAt || auth.expiresAt - RENEW_EARLY_MS > now()) return token;
  if (!auth.refreshToken) throw new TokenError("Your GitHub sign-in has expired. Sign in again from Settings.");
  renewing ??= (async () => {
    try {
      const data = await renew(auth.refreshToken);
      await chrome.storage.local.set({ token: data.access_token, auth: toAuth(data, now()) });
      return data.access_token;
    } finally {
      renewing = null;
    }
  })();
  return renewing;
}
