# All Actions for GitHub

A browser extension that adds an account-wide **All actions** view to GitHub, next to "All issues" and "All pull requests". One page shows whether each of your repositories' scheduled workflows ran and passed, so you don't have to click into every repo each morning.

![The All actions page showing the Needs attention list: one failed backup with the step that failed, a forecast job that didn't run, and a schedule GitHub turned off after 60 days](docs/screenshots/all-actions-light.png)

- **Actions** appears between Issues and Pull requests in GitHub's header and in the left-hand menu. The header icon gets a red dot when something needs attention.
- Press **G** then **A** anywhere on GitHub to open it, like G I for All issues. (Inside a repository, G A still opens that repository's Actions tab.)
- The page opens at `https://github.com/?all-actions`, inside GitHub's own top bar, with a sidebar of filters like the All issues page.
- Problems sort to the top: runs that **failed** (with the step that failed) and scheduled workflows that **didn't run** when they were due, including ones GitHub switched off after 60 days without activity.
- Each row shows the schedule in plain words in your own time zone with the UTC time GitHub uses alongside ("Daily at 04:05 (08:05 UTC)"), the latest run, and a strip of the last 10 runs. Click anything to open it on GitHub.
- It checks again in the background every 30 minutes, and the toolbar icon shows how many workflows need attention.
- Optional desktop notifications when a workflow fails or doesn't run, and separately when one passes (both off by default).
- It runs entirely in your browser. There's no server: it talks to GitHub directly, with read-only access you give it by signing in with GitHub or with a token you create.

> Version 1.0. Works in Chrome, Edge, Brave and other Chromium browsers, and in Firefox 140 or later.

It follows your GitHub theme. Here's every workflow in dark mode:

![The All actions page in dark mode listing all eight demo workflows grouped into Failed, Didn't run, Running and Passed, each with its schedule and last 10 runs](docs/screenshots/all-actions-dark.png)

<sub>Screenshots use made-up demo data.</sub>

## Install

Listings on the Chrome Web Store and Firefox Add-ons are on the way. Edge users will install from the Chrome Web Store: Edge allows that once you turn on **Allow extensions from other stores** when it asks. Until the listings are up, install from the latest release:

1. Download **all-actions-for-github.zip** from the [latest release](https://github.com/amorphose/All-Actions-for-GitHub/releases/latest) and unzip it somewhere you'll keep it.
2. Open your browser's extensions page:
   - Chrome / Brave: `chrome://extensions`
   - Edge: `edge://extensions`
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose the unzipped folder (the one containing `manifest.json`).
5. The setup page opens automatically. After setup, open the list from the new Actions icon on GitHub or the extension's toolbar icon.

### Firefox

Firefox only keeps add-ons that Mozilla has signed, so until the extension is on Firefox Add-ons, you can try it as a temporary add-on:

1. Download **all-actions-for-github-firefox.zip** from the [latest release](https://github.com/amorphose/All-Actions-for-GitHub/releases/latest). (The other zip is for Chrome and Edge.)
2. Open `about:debugging`, choose **This Firefox**, and click **Load Temporary Add-on**.
3. Pick the zip (or `manifest.json` from the unzipped folder).
4. If the setup page shows **Allow access to GitHub**, click **Allow access**. Firefox can leave the extension switched off on github.com until you agree.

Firefox removes a temporary add-on when it closes, so load it again after you restart Firefox. Your connection and settings are kept. To update, load the newer zip the same way.

### Updating

Your connection and settings are kept when you update, so setup is a one-time step.

1. Get the new files **into the same folder**: unzip the new release over the old folder, replacing the files.
2. On the extensions page, click the reload icon on the extension's card.
3. Refresh any open GitHub tabs.

Loading a copy from a *different* folder counts as a new extension, and removing the extension deletes its storage. Either one means connecting again.

## Connect your GitHub account

The setup page offers two ways to connect. Both give the extension the same read-only access.

### Sign in with GitHub (recommended)

1. Click **Sign in with GitHub**. The setup page shows a code.
2. Click **Open github.com/login/device** (this also copies the code), paste the code, and click **Authorize** on the page that lists the app's read-only permissions.
3. The first time, the setup page asks you to **choose your repositories**. That opens GitHub, where you install the [All Actions for GitHub app](https://github.com/apps/all-actions-for-github) on **All repositories** or only the ones you want watched. Come back and the page moves on by itself.

There's nothing to renew: GitHub's sign-in lasts 8 hours at a time, and the extension renews it in the background for as long as you use it (GitHub asks you to sign in again only after 6 months without the extension running). To change which repositories it watches later, use **Change repositories on GitHub** under step 2 in Settings.

### Use a read-only token

1. Click **Open GitHub's token page**. The link pre-fills a fine-grained token named "All Actions for GitHub" with a 90-day expiry and two read-only permissions:
   - **Actions: Read** to see workflow runs.
   - **Contents: Read** to read each workflow file's `schedule:` so the extension can tell when a run is missing. Without it everything else still works; you just won't see "didn't run" warnings.
2. Under **Repository access**, choose **All repositories**, or only the repos you want watched. Then click **Generate token**.
3. Copy the token, paste it into the setup page under **Finish connecting**, and click **Connect**.

When the token expires, the page tells you, and you can paste a new one under **Settings** (also available by right-clicking the toolbar icon and choosing **Options**). To switch to Sign in with GitHub, click **Disconnect** and sign in.

### Then

Choose whether to watch **scheduled workflows only** (the default) or **every workflow run**, optionally shorten how late a scheduled run can be before it counts as missed, optionally turn on desktop notifications, and click **Open All actions**.

### What it can do

Either way it can only *read*: workflow runs, repository details (name, visibility) and file contents (used only for workflow files under `.github/workflows/`). It can't change code, settings or workflows. The access token is stored in your browser's extension storage and is sent only to GitHub (`api.github.com`, and `github.com/login` to sign in and renew).

See the [privacy policy](PRIVACY.md) for everything the extension stores and sends.

## How it works

| Piece | File | What it does |
|---|---|---|
| All actions page | `src/view.*` | The list itself, rendered in a shadow root so GitHub's styles and ours don't collide. It uses GitHub's own color variables, so it follows your GitHub theme. |
| Settings | `src/settings.*` | Connecting (sign-in or token), what to watch, the missed-run delay, notifications, and links to report a problem. |
| Sign in with GitHub | `src/lib/auth.js` | GitHub's [device flow](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-device-flow-to-generate-a-user-access-token) for the extension's GitHub App, and renewing the access token before it expires. Device-flow tokens renew without a client secret, so there's still no server. |
| GitHub client | `src/lib/github.js` | Lists your repos (`GET /user/repos`), then recent runs per repo (`GET /repos/{owner}/{repo}/actions/runs`). GitHub has no account-wide runs endpoint, so it's one request per repo, six at a time. |
| Run logic | `src/lib/runs.js`, `src/lib/cron.js` | Groups runs by workflow, classifies them (failed, didn't run, running, passed, cancelled/skipped), works out when each schedule last should have fired, sorts and formats. No browser APIs, so it's unit-tested in Node. |
| GitHub integration | `src/content.js`, `src/early.js` | Copies GitHub's own Pull requests link, turns it into an Actions link, and inserts it just before Pull requests. On `github.com/?all-actions` it hides the page body and shows the list in its place, under GitHub's real top bar. |
| Background | `src/background.js` | Does the fetching (on request and every 30 minutes), saves results to extension storage, and keeps the toolbar badge current. |

Results are cached, so the page opens instantly and refreshes when the last check is more than 5 minutes old (or when you click **Refresh**). Each refresh asks for each repo's workflow list, and then for its recent runs only if one of its workflows is scheduled (or, with **every workflow run** chosen, if it has any workflows). Repos without workflows cost one request. Lists are asked for with the ETag from last time, and GitHub answers unchanged ones with "304 Not Modified", which [doesn't count](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#use-conditional-requests-if-appropriate) against the 5,000 requests per hour. So on a quiet day a refresh uses almost none of the limit, even with hundreds of repos. Workflow files are re-read at most every 12 hours, and the failing step is looked up once per failed run.

### How "didn't run" works

GitHub runs schedules in UTC and often starts them hours late at busy times, so a scheduled run counts as missed only when nothing has started **12 hours** after it was due. You can shorten that to anywhere from 1 to 12 hours in Settings. Late runs inside that window aren't flagged. Workflows created after the due time are ignored, and a schedule you turned off yourself shows as "Turned off" rather than as a problem.

## Roadmap

- **Next:** listings on the Chrome Web Store and Firefox Add-ons. Edge users will install from the Chrome Web Store.
- **Later:** organization repos, a Re-run button.

## License

[MIT](LICENSE)
