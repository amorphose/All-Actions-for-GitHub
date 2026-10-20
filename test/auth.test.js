import { test } from "node:test";
import assert from "node:assert/strict";
import { pollForToken, getAccessToken, toAuth, SignInError } from "../src/lib/auth.js";
import { TokenError } from "../src/lib/github.js";

// Answers each POST to github.com/login/oauth/access_token with the next reply in the list.
function fakeTokenEndpoint(replies) {
  const sent = [];
  const fetch = async (url, init) => {
    sent.push({ url, body: Object.fromEntries(new URLSearchParams(init.body)) });
    const reply = replies.shift();
    return new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch, sent };
}

async function withFetch(fake, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = fake;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

// chrome.storage.local in memory.
function fakeStorage(initial) {
  const data = { ...initial };
  globalThis.chrome = {
    storage: {
      local: {
        get: async (keys) => Object.fromEntries([keys].flat().filter((k) => k in data).map((k) => [k, data[k]])),
        set: async (items) => Object.assign(data, items),
      },
    },
  };
  return data;
}

test("pollForToken waits through pending and slow_down, then returns the token", async () => {
  const gh = fakeTokenEndpoint([
    { error: "authorization_pending" },
    { error: "slow_down", interval: 10 },
    { access_token: "ghu_x", expires_in: 28800, refresh_token: "ghr_x", refresh_token_expires_in: 15897600 },
  ]);
  const waits = [];
  const data = await withFetch(gh.fetch, () =>
    pollForToken({ device_code: "dc", interval: 5, expires_in: 900 }, { sleep: async (ms) => waits.push(ms) }),
  );
  assert.equal(data.access_token, "ghu_x");
  assert.deepEqual(waits, [5000, 5000, 10000]);
  assert.equal(gh.sent[0].body.device_code, "dc");
  assert.equal(gh.sent[0].body.grant_type, "urn:ietf:params:oauth:grant-type:device_code");
  assert.equal(gh.sent[0].body.client_secret, undefined);
});

test("pollForToken reports a sign-in cancelled on GitHub", async () => {
  const gh = fakeTokenEndpoint([{ error: "access_denied" }]);
  await assert.rejects(
    withFetch(gh.fetch, () => pollForToken({ device_code: "dc" }, { sleep: async () => {} })),
    (e) => e instanceof SignInError && e.code === "access_denied",
  );
});

test("pollForToken reports an expired code", async () => {
  const gh = fakeTokenEndpoint([{ error: "expired_token" }]);
  await assert.rejects(
    withFetch(gh.fetch, () => pollForToken({ device_code: "dc" }, { sleep: async () => {} })),
    (e) => e instanceof SignInError && e.code === "expired_token",
  );
});

test("getAccessToken leaves a pasted token and a fresh sign-in alone", async () => {
  const gh = fakeTokenEndpoint([]);
  fakeStorage({ token: "github_pat_x" });
  assert.equal(await withFetch(gh.fetch, () => getAccessToken()), "github_pat_x");
  fakeStorage({ token: "ghu_a", auth: toAuth({ expires_in: 28800, refresh_token: "ghr_a" }) });
  assert.equal(await withFetch(gh.fetch, () => getAccessToken()), "ghu_a");
  assert.equal(gh.sent.length, 0);
});

test("getAccessToken renews a sign-in that's about to expire, once for callers at the same time", async () => {
  const now = Date.now();
  const gh = fakeTokenEndpoint([{ access_token: "ghu_b", expires_in: 28800, refresh_token: "ghr_b", refresh_token_expires_in: 15897600 }]);
  const data = fakeStorage({ token: "ghu_a", auth: toAuth({ expires_in: 60, refresh_token: "ghr_a" }, now) });
  const [one, two] = await withFetch(gh.fetch, () => Promise.all([getAccessToken(), getAccessToken()]));
  assert.equal(one, "ghu_b");
  assert.equal(two, "ghu_b");
  assert.equal(gh.sent.length, 1);
  assert.equal(gh.sent[0].body.grant_type, "refresh_token");
  assert.equal(gh.sent[0].body.refresh_token, "ghr_a");
  assert.equal(data.token, "ghu_b");
  assert.equal(data.auth.refreshToken, "ghr_b");
  assert.ok(data.auth.expiresAt > now + 7 * 3600 * 1000);
});

test("getAccessToken asks to sign in again when GitHub refuses the refresh token", async () => {
  const gh = fakeTokenEndpoint([{ error: "bad_refresh_token" }]);
  fakeStorage({ token: "ghu_a", auth: toAuth({ expires_in: 1, refresh_token: "ghr_old" }) });
  await assert.rejects(withFetch(gh.fetch, () => getAccessToken()), TokenError);
});
