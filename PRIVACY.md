# Privacy policy

_All Actions for GitHub · last updated October 13, 2026_

All Actions for GitHub runs entirely in your browser. It has no server, collects no analytics, and the developer never receives any of your data.

## What it stores

Everything below is kept in the extension's own storage in your browser profile (`chrome.storage.local`), and nowhere else:

- **Your GitHub token**, which you paste in during setup.
- **Your GitHub username**, to show which account is connected.
- **Your settings**: whether to watch scheduled workflows only, how late a scheduled run can be before it counts as missed, and which desktop notifications are on.
- **The latest results**: names of your repositories and workflows, recent run results, and the schedules read from your workflow files. These are kept so the page opens instantly and can show what changed.

Clicking **Disconnect** in the extension's settings deletes the token, username and results. Removing the extension deletes everything.

## What it sends, and where

The extension only talks to GitHub's API at `https://api.github.com`, using your token, to read:

- the list of repositories you own,
- the workflows in each repository and their recent runs,
- the workflow files under `.github/workflows/`, to read their schedules.

The token is sent nowhere else. Nothing is sent to the developer or to any third party.

The extension also runs on `github.com` pages to add the **Actions** entry to GitHub's header and menu, and to show the All actions page. It doesn't read or send anything from the pages you visit.

## Permissions

- **Storage**: to keep the token, settings and latest results described above.
- **Alarms**: to check for new results every 30 minutes.
- **Notifications** (optional, off by default): to tell you when a workflow fails or doesn't run and, if you choose, when one passes. The browser asks you before turning it on.
- **Access to api.github.com and github.com**: to read your workflow runs and to show the Actions entry and page on GitHub.

The token you create can only read. It can't change your code, settings or workflows.

## Contact

Questions or concerns: open an issue at https://github.com/amorphose/All-Actions-for-GitHub/issues.
