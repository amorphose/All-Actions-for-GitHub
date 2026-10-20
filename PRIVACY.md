# Privacy policy

_All Actions for GitHub · last updated October 20, 2026_

All Actions for GitHub runs entirely in your browser. It has no server, collects no analytics, and the developer never receives any of your data.

## What it stores

Everything below is kept in the extension's own storage in your browser profile (`chrome.storage.local`), and nowhere else:

- **Your GitHub access**: either the token you paste in during setup, or, if you sign in with GitHub, the access token and renewal token GitHub issues for the extension, and when they expire.
- **Your GitHub username and the link to your profile picture**, to show which account is connected.
- **Your settings**: whether to watch scheduled workflows only, how late a scheduled run can be before it counts as missed, and which desktop notifications are on.
- **The latest results**: names of your repositories and workflows, recent run results, and the schedules read from your workflow files. These are kept so the page opens instantly and can show what changed.

Clicking **Disconnect** in the extension's settings deletes the tokens, username and results. Removing the extension deletes everything. If you signed in with GitHub, you can also uninstall the app on GitHub (Settings, Applications) to take away its access there.

## What it sends, and where

The extension only talks to GitHub. It uses GitHub's API at `https://api.github.com`, with your token, to read:

- the list of repositories you own,
- the workflows in each repository and their recent runs,
- the workflow files under `.github/workflows/`, to read their schedules,
- if you signed in with GitHub, which accounts the app is installed on.

If you sign in with GitHub, it also talks to `https://github.com/login` to get the sign-in code, to receive the access token once you approve, and to renew it before it expires. Settings shows your GitHub profile picture, which your browser loads from GitHub.

Your tokens are sent nowhere else. Nothing is sent to the developer or to any third party.

The extension also runs on `github.com` pages to add the **Actions** entry to GitHub's header and menu, and to show the All actions page. It doesn't read or send anything from the pages you visit.

## Permissions

- **Storage**: to keep the token, settings and latest results described above.
- **Alarms**: to check for new results every 30 minutes.
- **Notifications** (optional, off by default): to tell you when a workflow fails or doesn't run and, if you choose, when one passes. The browser asks you before turning it on.
- **Access to api.github.com and github.com**: to read your workflow runs, to sign in with GitHub, and to show the Actions entry and page on GitHub.

Either way, the access can only read. It can't change your code, settings or workflows.

## Contact

Questions or concerns: open an issue at https://github.com/amorphose/All-Actions-for-GitHub/issues.
