# Store listing

Text and images to paste into the Chrome Web Store and Firefox Add-ons forms. Edge users install from the Chrome Web Store, so there's no Edge Add-ons listing. The images in this folder are made by `scripts/screenshots/capture.cjs`.

## Package

Upload `all-actions-for-github.zip` to the Chrome Web Store and `all-actions-for-github-firefox.zip` to Firefox Add-ons. Both are on the [latest release](https://github.com/amorphose/All-Actions-for-GitHub/releases/latest).

If Firefox Add-ons asks whether the code is minified, bundled or generated: it isn't. There's no build step, and the zip is the source as it is in the repository.

## Basics

- **Name:** All Actions for GitHub
- **Short description / summary** (from `manifest.json`, 109 characters): An account-wide "All actions" view: see whether every repo's scheduled workflows ran and passed, on one page.
- **Category:** Chrome: Developer tools · Firefox: Web Development
- **Website:** https://github.com/amorphose/All-Actions-for-GitHub
- **Support:** https://github.com/amorphose/All-Actions-for-GitHub/issues
- **Privacy policy URL:** https://github.com/amorphose/All-Actions-for-GitHub/blob/main/PRIVACY.md

## Description

```text
GitHub has "All issues" and "All pull requests" pages, but no way to see your Actions across every repository at once. All Actions for GitHub adds one.

An Actions entry appears in GitHub's header and menu, between Issues and Pull requests. It opens a single page, inside GitHub's own layout, that shows whether each of your repositories' scheduled workflows ran and passed.

• Problems first: runs that failed, with the step that failed, and scheduled workflows that didn't run when they were due, including ones GitHub turned off after 60 days without activity.
• Schedules in plain words and in your own time zone, with the UTC time GitHub uses alongside.
• The latest run and a strip of the last 10 runs for every workflow, each linking to GitHub.
• Filters for failed, didn't run, running and passed, plus a search box.
• Checks in the background every 30 minutes. The toolbar icon and a dot on GitHub's header show when something needs attention.
• Optional desktop notifications when a workflow fails or doesn't run, and separately when one passes. Both off by default.
• Follows your GitHub light or dark theme.

Private by design: there's no server and no analytics. Connect by signing in with GitHub, or with a read-only fine-grained token if you prefer. Either way the extension can only read, it talks only to GitHub, and your access stays in your browser.

Open source under the MIT license: https://github.com/amorphose/All-Actions-for-GitHub
```

## Images

| File | Use |
|---|---|
| `logo-300.png` | Edge Add-ons logo (300×300), unused while Edge users install from the Chrome Web Store |
| `../../icons/icon-128.png` | Chrome store icon (128×128) |
| `screenshot-1-needs-attention.png` | Screenshot (1280×800) |
| `screenshot-2-all-workflows-dark.png` | Screenshot (1280×800) |
| `promo-tile-440x280.png` | Small promotional tile (440×280) |

## Permission justifications

Chrome asks for these. Firefox reviewers can read them in the notes.

- **Single purpose:** Show the status of GitHub Actions workflow runs across all of the user's repositories on one page.
- **storage:** Keeps the user's GitHub access (from Sign in with GitHub, or a token they pasted), settings and the latest results in the browser.
- **alarms:** Checks GitHub for new workflow results every 30 minutes.
- **notifications (optional):** Tells the user when a workflow fails or doesn't run and, if they choose, when one passes. Off by default; the browser asks first.
- **Host permission api.github.com:** Reads repositories, workflows, workflow runs and workflow files through GitHub's REST API with the user's own access.
- **Host permission github.com/login:** Sign in with GitHub, using GitHub's device flow: gets a sign-in code, receives the access token once the user approves on github.com, and renews it before it expires.
- **Content script on github.com:** Adds the Actions entry to GitHub's header and menu, and shows the All actions page at github.com/?all-actions.
- **Remote code:** None. All code ships in the package.

## Data disclosure

- The developer collects no data. The only data that leaves the browser is requests to GitHub: API requests to api.github.com with the user's own access, and sign-in requests to github.com/login.
- Chrome's form: tick **Authentication information** (the access token is sent to GitHub), and certify that data isn't sold, isn't used for unrelated purposes and isn't used for creditworthiness.

## Notes for reviewers

```text
The extension needs a GitHub account to show anything. The setup page opens after installing and offers two ways to connect:

A. Sign in with GitHub: click "Sign in with GitHub", open github.com/login/device, enter the code shown and approve. The setup page then asks you to choose repositories, which installs the "All Actions for GitHub" GitHub App (read-only) on the repositories you pick.

B. Read-only token: click "Open GitHub's token page". It pre-fills a read-only token (Actions: Read, Contents: Read). Choose a repository that has a GitHub Actions workflow, generate the token, paste it into the setup page and click Connect.

Then open https://github.com/?all-actions, or click the Actions icon in GitHub's header or the extension's toolbar icon.

Any repository with a scheduled workflow works. If the account has none, choose "Every workflow run" in the settings to see push-triggered runs too.
```
