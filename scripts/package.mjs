// Builds the release zips from the repository, one per browser family:
//   all-actions-for-github.zip          Chrome, Edge, Brave and other Chromium browsers
//   all-actions-for-github-firefox.zip  Firefox
// manifest.json in the repo works in both, but each browser warns about the background
// entry meant for the other, so each zip keeps only its own.
//   npm run package

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const FILES = ["manifest.json", "icons", "src", "LICENSE", "README.md"];
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));

const builds = {
  "all-actions-for-github.zip": (m) => {
    delete m.background.scripts;
    delete m.browser_specific_settings;
  },
  "all-actions-for-github-firefox.zip": (m) => {
    delete m.background.service_worker;
  },
};

for (const [zip, adjust] of Object.entries(builds)) {
  const dir = mkdtempSync(join(tmpdir(), "all-actions-"));
  try {
    for (const f of FILES) cpSync(join(root, f), join(dir, f), { recursive: true });
    const m = structuredClone(manifest);
    adjust(m);
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
    rmSync(join(root, zip), { force: true });
    execFileSync("zip", ["-q", "-r", "-X", join(root, zip), ...FILES], { cwd: dir });
    console.log(`built ${zip}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
