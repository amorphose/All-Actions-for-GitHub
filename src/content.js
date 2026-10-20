// 1. Adds an "Actions" entry between Issues and Pull requests in GitHub's header and
//    navigation menu. It copies GitHub's own Pull requests element so the new entry picks
//    up the site's styling, then swaps the icon, label and link.
// 2. On https://github.com/?all-actions, shows the All actions list in place of the page
//    content, under GitHub's real top bar.
// 3. Gives the header icon a GitHub-style hover label, and makes G then A open All actions.

(() => {
  const MARK = "data-all-actions";
  const VIEW_URL = "https://github.com/?all-actions";
  // GitHub's "play" octicon, used for Actions across the site.
  const ICON_PATH =
    "M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215Z";
  const SCOPES = "header, .AppHeader, dialog, [role='dialog'], nav";
  const PR_LINK = 'a[href="/pulls"], a[href="https://github.com/pulls"]';

  let attentionCount = 0; // failed plus didn't-run

  function makeIcon(original) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const attr of ["class", "width", "height", "aria-hidden"]) {
      const v = original?.getAttribute(attr);
      if (v) svg.setAttribute(attr, v);
    }
    if (!svg.getAttribute("width")) svg.setAttribute("width", "16");
    if (!svg.getAttribute("height")) svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("fill", "currentColor");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ICON_PATH);
    svg.append(path);
    return svg;
  }

  function relabel(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let hasText = false;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.nodeValue.trim();
      if (!t) continue;
      if (/pull requests/i.test(t)) {
        n.nodeValue = n.nodeValue
          .replace(/(all|your) pull requests/i, "All actions")
          .replace(/pull requests/i, "Actions");
        hasText = true;
      } else if (/^\d+$/.test(t)) {
        n.nodeValue = ""; // drop GitHub's own PR counter if one was copied
      }
    }
    return hasText;
  }

  function buildEntry(prLink) {
    const unit = prLink.parentElement?.tagName === "LI" ? prLink.parentElement : prLink;
    const clone = unit.cloneNode(true);
    clone.setAttribute(MARK, "");
    for (const node of [clone, ...clone.querySelectorAll("*")]) {
      node.removeAttribute("id");
      node.removeAttribute("data-hotkey");
      node.removeAttribute("aria-current");
      node.removeAttribute("aria-labelledby");
      node.removeAttribute("aria-describedby");
      node.removeAttribute("data-analytics-event");
      node.removeAttribute("data-hydro-click");
      node.removeAttribute("data-hydro-click-hmac");
      node.classList?.remove("selected", "active");
    }
    clone.querySelectorAll("tool-tip, .Counter, [class*='Counter']").forEach((n) => n.remove());

    const link = clone.tagName === "A" ? clone : clone.querySelector("a");
    link.href = VIEW_URL;
    link.setAttribute("data-turbo", "false");
    link.setAttribute("aria-label", "All actions");

    const oldSvg = link.querySelector("svg");
    if (oldSvg) oldSvg.replaceWith(makeIcon(oldSvg));
    // The menu item keeps its text label and gets no marker; only the header icon shows one.
    if (!relabel(link)) {
      const dot = document.createElement("span");
      dot.className = "all-actions-dot";
      dot.setAttribute("aria-hidden", "true");
      link.append(dot);
    }
    link.classList.add("all-actions-link");

    return { unit, clone };
  }

  function inject() {
    for (const prLink of document.querySelectorAll(PR_LINK)) {
      if (prLink.closest(`[${MARK}]`) || !prLink.closest(SCOPES)) continue;
      const unit = prLink.parentElement?.tagName === "LI" ? prLink.parentElement : prLink;
      if (unit.previousElementSibling?.hasAttribute(MARK)) continue;
      const { clone } = buildEntry(prLink);
      unit.parentNode.insertBefore(clone, unit);
    }
    updateBadges();
  }

  function updateBadges() {
    for (const dot of document.querySelectorAll(".all-actions-dot")) dot.hidden = !attentionCount;
    for (const a of document.querySelectorAll(".all-actions-link")) {
      const label = attentionCount ? `All actions, ${attentionCount} ${attentionCount === 1 ? "needs" : "need"} attention` : "All actions";
      a.setAttribute("aria-label", label);
      a.removeAttribute("title"); // the header icon gets our own tooltip instead
    }
  }

  /* ---------- Hover label on the header icon, styled like GitHub's ---------- */

  // GitHub's own <tool-tip> element is driven by GitHub's scripts, which don't pick up
  // copies made by an extension, so this draws a lookalike instead. Only the header icon
  // gets one; the menu item already shows its label.
  let tip = null;
  let tipFor = null;
  let tipTimer = 0;

  function tooltip() {
    if (tip?.isConnected) return tip;
    tip = document.createElement("div");
    tip.className = "all-actions-tooltip";
    tip.setAttribute("aria-hidden", "true"); // the link's aria-label already says this
    tip.hidden = true;
    const keys = document.createElement("span");
    keys.className = "all-actions-tooltip-keys";
    for (const k of ["G", "A"]) {
      const kbd = document.createElement("kbd");
      kbd.textContent = k;
      keys.append(kbd);
    }
    tip.append("All actions", keys);
    document.body.append(tip);
    return tip;
  }

  function showTip(link) {
    clearTimeout(tipTimer);
    const t = tooltip();
    tipFor = link;
    t.querySelector(".all-actions-tooltip-keys").hidden = onRepoPage();
    t.hidden = false;
    const r = link.getBoundingClientRect();
    const w = t.offsetWidth;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), document.documentElement.clientWidth - w - 8);
    t.style.left = `${left + window.scrollX}px`;
    t.style.top = `${r.bottom + 6 + window.scrollY}px`;
  }

  function hideTip() {
    clearTimeout(tipTimer);
    tipFor = null;
    if (tip) tip.hidden = true;
  }

  const headerIcon = (target) => {
    const link = target instanceof Element ? target.closest(".all-actions-link") : null;
    return link?.querySelector(".all-actions-dot") ? link : null;
  };
  document.addEventListener("mouseover", (e) => {
    const link = headerIcon(e.target);
    if (link && link !== tipFor) {
      clearTimeout(tipTimer);
      tipTimer = setTimeout(() => showTip(link), 100);
    } else if (!link && tipFor) hideTip();
  });
  document.addEventListener("mouseout", (e) => {
    if (headerIcon(e.target) && !headerIcon(e.relatedTarget)) hideTip();
  });
  document.addEventListener("focusin", (e) => {
    const link = headerIcon(e.target);
    if (link && link.matches(":focus-visible")) showTip(link);
  });
  document.addEventListener("focusout", (e) => {
    if (headerIcon(e.target)) hideTip();
  });
  document.addEventListener("click", hideTip, true);
  window.addEventListener("scroll", hideTip, { passive: true });

  /* ---------- G then A opens All actions ---------- */

  // Top-level paths that aren't repositories. Inside a repo GitHub already uses G A for
  // that repo's Actions tab, so the shortcut is left to GitHub there.
  const NOT_REPOS = new Set([
    "", "settings", "notifications", "pulls", "issues", "orgs", "users", "marketplace", "explore",
    "topics", "trending", "collections", "sponsors", "codespaces", "search", "dashboard", "new",
    "organizations", "account", "login", "logout", "features", "enterprise", "pricing", "about",
    "apps", "stars", "watching", "copilot", "projects", "discussions", "github-copilot", "security", "models",
  ]);
  function onRepoPage() {
    const [owner, repo] = location.pathname.split("/").filter(Boolean);
    return Boolean(owner && repo) && !NOT_REPOS.has(owner.toLowerCase());
  }

  function typingIn(el) {
    if (!(el instanceof Element)) return false;
    if (el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='textbox']")) return true;
    return el.isContentEditable;
  }

  let gPressedAt = 0;
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || typingIn(e.target)) {
      gPressedAt = 0;
      return;
    }
    const key = e.key.toLowerCase();
    if (key === "g" && !e.shiftKey) {
      gPressedAt = Date.now();
      return;
    }
    const afterG = Date.now() - gPressedAt < 1500;
    gPressedAt = 0;
    // A page that already handled G A itself (GitHub, inside a repo) wins.
    if (key === "a" && !e.shiftKey && afterG && !e.defaultPrevented && !onRepoPage()) {
      e.preventDefault();
      location.assign(VIEW_URL);
    }
  });

  /* ---------- The All actions page inside github.com ---------- */

  let host = null;
  let unmount = null;

  const isViewUrl = () => location.pathname === "/" && new URLSearchParams(location.search).has("all-actions");

  async function syncView() {
    const want = isViewUrl();
    document.documentElement.toggleAttribute("data-all-actions-view", want);
    if (!want) {
      if (host) {
        unmount?.();
        host.remove();
        host = unmount = null;
      }
      return;
    }
    if (host?.isConnected) return;
    // GitHub's page body; the header sits above it and stays visible.
    const content = document.querySelector(".application-main") || document.querySelector("main");
    if (!content) return; // not rendered yet; the observer calls us again
    host = document.createElement("div");
    host.id = "all-actions-root";
    content.parentNode.insertBefore(host, content);
    document.title = "All actions";
    const mine = host;
    const { mountView } = await import(chrome.runtime.getURL("src/view.js"));
    const stop = await mountView(mine);
    if (host === mine) unmount = stop;
    else stop();
    clearLoggedOutHeader();
  }

  // Signed out, GitHub's home page header floats over the top of the page, so the list
  // would start underneath it. Push the list down by however much the header covers,
  // measured again as GitHub finishes loading. Signed in, there's no such header and
  // this does nothing.
  function clearLoggedOutHeader() {
    const header = document.querySelector("header.header-logged-out");
    if (!host || !header || window.scrollY > 0) return;
    host.style.paddingTop = "";
    const covered = header.getBoundingClientRect().bottom - host.getBoundingClientRect().top;
    if (covered > 0) host.style.paddingTop = `${Math.ceil(covered)}px`;
  }
  window.addEventListener("resize", clearLoggedOutHeader);
  window.addEventListener("load", clearLoggedOutHeader);

  function setFromSnapshot(snapshot) {
    attentionCount = snapshot?.entries
      ? snapshot.entries.filter((e) => e.state === "failed" || e.state === "missed").length
      : 0;
    updateBadges();
  }

  chrome.storage.local.get("snapshot").then(({ snapshot }) => setFromSnapshot(snapshot));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.snapshot) setFromSnapshot(changes.snapshot.newValue);
  });

  // GitHub renders the header menu lazily and swaps pages without full reloads,
  // so watch for new Pull requests links and add ours next to them.
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      inject();
      syncView();
      clearLoggedOutHeader();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", syncView);
  inject();
  syncView();
})();
