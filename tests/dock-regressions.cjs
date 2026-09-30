const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const directory = path.join(__dirname, "..");
const model = {};
vm.createContext(model);
vm.runInContext(fs.readFileSync(path.join(directory, "DockModel.js"), "utf8"), model);
const qml = fs.readFileSync(path.join(directory, "DockInstance.qml"), "utf8");
function handler(name, next, parameters) {
  const body = qml.split(`  function ${name}(`)[1].split(`\n  function ${next}(`)[0];
  return new Function("root", "DockModel", ...parameters,
    body.slice(body.indexOf("{") + 1).replace(/\n  }\s*$/, ""));
}
const toggle = handler("togglePinApp", "rebuildDock", ["appId"]);
const load = handler("loadConfig", "saveConfig", ["rawText"]);
const reorder = handler("reorderPinnedApps", "updateMagnification", ["fromIndex", "toIndex"]);
const root = {
  customPinnedApps: ["only-app"],
  saveConfig() { this.saved = JSON.stringify({ pinned: this.customPinnedApps }); },
  rebuildDock() {}, updateMagnification() {},
};

assert.equal(model.buildDockItems([], null, null, null, null).pinned.length,
  model.defaultPinnedApps.length);
toggle(root, model, "only-app");
assert.equal(root.customPinnedApps.length, 0);
load(root, model, root.saved);
assert.equal(model.buildDockItems([], null, null, null, root.customPinnedApps).pinned.length, 0);
reorder(root, model, 0, 1);
assert.equal(root.customPinnedApps.length, 0);
toggle(root, model, "new-app");
assert.deepEqual(root.customPinnedApps, ["new-app"]);
const running = model.buildDockItems([{ appId: "running-app" }], null, null, null, []);
assert.equal(running.pinned.length, 0);
assert.equal(running.unpinned.length, 1);

let closed = [];
const first = { close() { closed.push("first"); } };
const focused = { activated: true, close() { closed.push("focused"); } };
model.closeAppWindow({ windows: [first, focused] });
assert.deepEqual(closed, ["focused"]);
closed = [];
model.closeAppWindow({ windows: [first, { close() { closed.push("second"); } }] });
assert.deepEqual(closed, ["first"]);
closed = [];
model.closeAppWindow({ windows: [null, first] });
assert.deepEqual(closed, ["first"]);
closed = [];
model.closeAppWindow({ windows: [first, { activated: true, close() { throw Error("gone"); } }] });
model.closeAppWindow({ windows: [] });
model.closeAppWindow(null);
assert.deepEqual(closed, []);
const closeCommands = [];
const closeHypr = {
  dispatch(command) { closeCommands.push(command); },
  toplevels: { values: {
    0: { wayland: first, address: "abcdef" },
    1: { wayland: focused, address: "0x1a2b3c" },
    length: 2,
  } },
};
for (const usingLua of [false, true]) {
  closeHypr.usingLua = usingLua;
  model.closeAppWindow({ windows: [first, focused] }, closeHypr);
  model.closeAppWindow({ windows: [null, first] }, closeHypr);
  assert.deepEqual(closeCommands.splice(0), usingLua ? [
    'hl.dsp.window.close({ window = "address:0x1a2b3c" })',
    'hl.dsp.window.close({ window = "address:0xabcdef" })',
  ] : ["closewindow address:0x1a2b3c", "closewindow address:0xabcdef"]);
  assert.deepEqual(closed, []);
}
const nativeOnly = { activated: true };
closeHypr.toplevels.values[1] = { wayland: nativeOnly, address: "123abc" };
model.closeAppWindow({ windows: [first, nativeOnly] }, closeHypr);
assert.deepEqual(closeCommands.splice(0), ['hl.dsp.window.close({ window = "address:0x123abc" })']);
model.closeAppWindow({ windows: [focused] }, closeHypr);
assert.deepEqual(closed.splice(0), ["focused"]);
for (const address of ["", 'bad" })', "0x"]) {
  closeHypr.toplevels.values[0].address = address;
  model.closeAppWindow({ windows: [first] }, closeHypr);
  assert.deepEqual(closed.splice(0), ["first"]);
  assert.deepEqual(closeCommands, []);
}
closeHypr.toplevels.values[0].address = "abcdef";
const dispatchClose = closeHypr.dispatch;
closeHypr.dispatch = undefined;
model.closeAppWindow({ windows: [first] }, closeHypr);
assert.deepEqual(closed.splice(0), ["first"]);
closeHypr.dispatch = () => { throw Error("unavailable"); };
model.closeAppWindow({ windows: [first, focused] }, closeHypr);
assert.deepEqual(closed.splice(0), ["focused"]);
model.closeAppWindow({ windows: [nativeOnly, first] }, closeHypr);
assert.deepEqual(closed, []);
closeHypr.dispatch = dispatchClose;
model.closeAppWindow({ windows: [] }, closeHypr);
model.closeAppWindow(null, closeHypr);
assert.deepEqual(closeCommands, []);
assert.equal((qml.match(/DockModel\.closeAppWindow\(/g) || []).length, 4);
assert.equal((qml.match(/DockModel\.closeAppWindow\(item, Hyprland\)/g) || []).length, 3);
assert.ok(qml.includes('DockModel.closeAppWindow({ windows: [win] }, Hyprland)'));
console.log("PASS: exact Lua/legacy close targets; Qt lists; native-only windows; safe fallback; all four close entrypoints.");
const forceWindow = { title: "Disposable", activated: true };
const forceTop = { wayland: forceWindow, address: "abc123", lastIpcObject: { stableId: "12ab", pid: 1234 } };
const forceHypr = { usingLua: true, toplevels: { values: [forceTop] }, dispatch(command) { closeCommands.push(command); } };
const forceTarget = model.forceCloseTarget({ windows: [first, forceWindow] }, forceHypr);
assert.equal(forceTarget.window, forceWindow);
assert.equal(model.forceCloseWindow(forceTarget, false, forceHypr), false);
assert.deepEqual(closeCommands, []);
assert.equal(model.forceCloseWindow(forceTarget, true, forceHypr), true);
assert.match(closeCommands.pop(), /hl\.get_window\("address:0xabc123"\)/);
forceTop.lastIpcObject.stableId = "ffff";
assert.equal(model.forceCloseWindow(forceTarget, true, forceHypr), false);
forceTop.lastIpcObject.stableId = "12ab";
forceTop.lastIpcObject.pid = 5678;
assert.equal(model.forceCloseWindow(forceTarget, true, forceHypr), false);
forceTop.lastIpcObject.pid = 1234;
forceTop.wayland = { title: "Replacement" };
assert.equal(model.forceCloseWindow(forceTarget, true, forceHypr), false);
forceTop.wayland = forceWindow;
forceHypr.toplevels.values = [];
assert.equal(model.forceCloseWindow(forceTarget, true, forceHypr), false);
forceHypr.toplevels.values = [forceTop];
for (const address of ["", "0x", 'abc\";']) {
  forceTop.address = address;
  assert.equal(model.forceCloseTarget({ windows: [forceWindow] }, forceHypr), null);
}
forceTop.address = "abc123";
forceHypr.usingLua = false;
assert.equal(model.forceCloseTarget({ windows: [forceWindow] }, forceHypr), null);
assert.deepEqual(closeCommands, []);
assert.ok(qml.includes("root.finishForceClose(false)"));
assert.ok(qml.includes("root.finishForceClose(true)"));
assert.ok(qml.includes("Unsaved data will be lost"));
console.log("PASS: explicit force confirmation, cancellation, exact identity, stale/reused target rejection.");
if (process.argv.includes("--close-only")) process.exit(0);
// matchApp terminal and substring boundary regression tests
assert.equal(model.matchApp("alacritty", "foot"), false, "alacritty must not match foot");
assert.equal(model.matchApp("kitty", "ghostty"), false, "kitty must not match ghostty");
assert.equal(model.matchApp("org.omarchy.agent", "foot"), true, "agent terminal must match foot");
assert.equal(model.matchApp("terminal", "foot"), true, "generic terminal must match foot");
assert.equal(model.matchApp("sh", "bash"), false, "short substring sh must not match bash");
assert.equal(model.matchApp("cat", "catalog"), false, "short substring cat must not match catalog");
assert.equal(model.matchApp("code", "unicode"), false, "short substring code must not match unicode");
assert.equal(model.matchApp("dev.zed.Zed", "zed"), true, "normalized zed must match");
assert.equal(model.matchApp("vivaldi-stable", "vivaldi"), true, "normalized vivaldi must match");
assert.equal(model.matchApp("org.gnome.Nautilus", "org.gnome.Calculator"), false, "nautilus must not match calculator");
assert.equal(model.matchApp("libreoffice-writer", "libreoffice-calc"), false, "writer must not match calc");
assert.equal(model.matchApp("google-chrome", "google-earth"), false, "chrome must not match earth");
assert.equal(model.matchApp("com.spotify.Client", "spotify"), true, "spotify client must match spotify");
assert.equal(model.matchApp("io.github.troyeguo.koodo-reader", "koodo-reader"), true, "koodo reader must match");

// Baseline centers when pinned is 0 vs > 0
const baseWithPinned = model.computeBaselineCenters(42, 6, 8, 3, 2);
const baseWithoutPinned = model.computeBaselineCenters(42, 6, 8, 0, 2);
assert.ok(baseWithoutPinned.unpinned.length === 2);
assert.ok(baseWithPinned.unpinned[0] > baseWithoutPinned.unpinned[0]);

// Total extra from computeMagnifiedOffsets
const offsets = model.computeMagnifiedOffsets([1.5, 1.2], 42, 0.82);
assert.ok(Array.isArray(offsets));
assert.ok(offsets.totalExtra > 0);

// Window cycling test on handleItemClick
let activatedIndex = -1;
const winA = { activated: true, activate() { activatedIndex = 0; } };
const winB = { activated: false, activate() { activatedIndex = 1; } };
model.handleItemClick({ isRunning: true, windows: [winA, winB] });
assert.equal(activatedIndex, 1, "clicking active app with multiple windows cycles to next window");

// Launch coordination is shared across outputs, but never intercepts window focus.
const dockQml = fs.readFileSync(path.join(directory, "Dock.qml"), "utf8");
assert.ok(dockQml.includes("Util.execDetached(cmd)"),
  "seen marks persist through Util.execDetached, which runs the shell string");
assert.ok(!/Quickshell\.execDetached\(cmd\)/.test(dockQml),
  "Quickshell.execDetached takes an argv list and never runs shell strings");
function launchHandler(name, next, parameters) {
  const body = dockQml.split(`  function ${name}(`)[1].split(`\n  function ${next}(`)[0];
  return new Function("root", "DockModel", ...parameters,
    body.slice(body.indexOf("{") + 1).replace(/\n  }\s*$/, ""));
}
const requestLaunch = launchHandler("requestLaunch", "releaseLaunch", ["launchJob", "launchId", "appName", "existingWindows", "command"]);
const releaseLaunch = launchHandler("releaseLaunch", "completeLaunchedWindows", ["job"]);
const completeWindows = launchHandler("completeLaunchedWindows", "notifyLaunchFailure", ["windows", "entries", "metadata"]);
const launches = { pendingLaunches: {} };
const jobs = [];
const existingWindow = { appId: "editor" };
const launchJob = {
  createObject(parent, properties) {
    const job = Object.assign({
      starts: 0, pending: true, existingWindows: [existingWindow],
      start() { this.starts++; },
      finish() { releaseLaunch(launches, model, this); },
    }, properties);
    jobs.push(job);
    return job;
  },
};
const coordinator = {
  requestLaunch(id, name, existing) {
    return requestLaunch(launches, model, launchJob, id, name, existing || [existingWindow]);
  },
};
const cold = { id: "editor", name: "Editor" };
model.handleItemClick(cold, null, null, null, coordinator);
model.handleItemClick(cold, null, null, null, coordinator);
assert.equal(jobs.length, 1, "duplicate clicks share one launch job");
assert.equal(jobs[0].starts, 1);
coordinator.requestLaunch("browser", "Browser");
assert.equal(jobs.length, 2, "different apps can start concurrently");
completeWindows(launches, model, [{ appId: "unrelated" }], null, null);
assert.equal(Object.keys(launches.pendingLaunches).length, 2);
completeWindows(launches, model, [existingWindow], null, null);
assert.deepEqual(Object.keys(launches.pendingLaunches), ["$browser"],
  "a window that existed before the click cannot release a guard that snapshotted it");
assert.equal(jobs[0].pending, false, "a new window releases the guard that did not snapshot it");
coordinator.requestLaunch("editor", "Editor");
assert.equal(jobs.length, 3, "a mapped window releases the launch guard");
releaseLaunch(launches, model, jobs[0]);
assert.equal(launches.pendingLaunches.$editor, jobs[2], "old completion cannot clear a newer launch");
releaseLaunch(launches, model, jobs[2]);
coordinator.requestLaunch("editor", "Editor");
assert.equal(jobs.length, 4, "failure or timeout releases the guard for retry");
for (const id of ["constructor", "__proto__", "app'$(false)"]) {
  coordinator.requestLaunch(id, id);
  coordinator.requestLaunch(id, id);
}
assert.equal(jobs.length, 7, "unusual IDs remain safe and distinct");
model.handleItemClick({ isRunning: true, windows: [winA, winB] }, null, null, null, coordinator);
assert.equal(jobs.length, 7, "focus must not start a launch job");
assert.equal(activatedIndex, 1);
const nativeEntry = { command: ["/usr/bin/vivaldi-stable", "--password-store=gnome-libsecret", "%U"] };
assert.deepEqual(Array.from(model.launchCommand("vivaldi-stable", nativeEntry)),
  ["uwsm-app", "-t", "service", "--", "vivaldi-stable.desktop"]);
for (const id of ["App With Spaces", "app'$(false)", "../outside", "app:action", "-option"]) {
  assert.deepEqual(Array.from(model.launchCommand(id, nativeEntry)),
    ["uwsm-app", "-t", "scope", "--", "gtk-launch", id + ".desktop"]);
}
for (const entry of [null, {}, { command: [] }]) {
  assert.equal(model.launchCommand("dbus-only", entry)[4], "gtk-launch");
}
assert.deepEqual(Array.from(model.launchCommand("io.github.troyeguo.koodo-reader", {
  command: ["/usr/bin/flatpak", "run", "io.github.troyeguo.koodo-reader"]
})), ["uwsm-app", "-t", "service", "--", "io.github.troyeguo.koodo-reader.desktop"]);
let actualCommand;
model.handleItemClick({ id: "vivaldi-stable", desktopEntry: { id: "vivaldi-stable", ...nativeEntry } },
  null, null, null, { requestLaunch(id, name, windows, command) { actualCommand = command; } });
assert.equal(actualCommand[4], "vivaldi-stable.desktop", "click handler uses native resolver");
assert.ok(dockQml.includes('command: job.launchCommand'));
assert.ok(dockQml.includes('if (exitCode !== 0 || exitStatus !== 0)'));
assert.ok(dockQml.includes('if (!job.pending && !launchProc.running) job.destroy()'));
console.log("PASS: shared launch guard; concurrent apps; window match; retry; stale completion; safe IDs; focus preserved.");
if (process.argv.includes("--launch-only")) process.exit(0);

// Release channels must remain distinct when matching, grouping, and pinning.
for (const channel of ["beta", "dev", "nightly", "preview"]) {
  assert.equal(model.matchApp("google-chrome", `google-chrome-${channel}`), false);
}
const browserEntries = ["google-chrome", "google-chrome-beta"].map(id => ({
  id, name: id, command: [id],
}));
const desktopEntries = { byId: id => browserEntries.find(entry => entry.id === id) };
const browserWindows = browserEntries.map(entry => ({ appId: entry.id }));
const browsers = model.buildDockItems(browserWindows, desktopEntries, null, null,
  browserEntries.map(entry => entry.id));
assert.deepEqual(Array.from(browsers.pinned, item => item.windows[0].appId),
  ["google-chrome", "google-chrome-beta"]);
const unpinnedBrowsers = model.buildDockItems(browserWindows, desktopEntries, null, null, []);
assert.equal(unpinnedBrowsers.unpinned.length, 2);
root.customPinnedApps = ["google-chrome"];
toggle(root, model, "google-chrome-beta");
assert.deepEqual(root.customPinnedApps, ["google-chrome", "google-chrome-beta"]);

// App IDs may coincide with Object.prototype property names.
const unusualApps = model.buildDockItems([
  { appId: "constructor" }, { appId: "constructor" }, { appId: "__proto__" },
], null, null, null, []);
assert.deepEqual(Array.from(unusualApps.unpinned, item => [item.id, item.windowCount]),
  [["constructor", 2], ["__proto__", 1]]);

// Execute the real save handler against a temporary path, including shell metacharacters.
const save = handler("saveConfig", "togglePinApp", ["Util"]);
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "dock-save-test-"));
try {
  const configPath = path.join(tempDirectory, "dock's settings.json");
  const state = {
    configPath, autoHide: true, reserveSpace: false, preferences: model.normalizeSettings({ iconSize: 48, windowScope: "monitor" }),
    customPinnedApps: ["app's-id", "$(touch UNEXPECTED)", "`touch UNEXPECTED`"],
  };
  const util = {
    shellQuote: value => "'" + value.replace(/'/g, "'\\''") + "'",
    execDetached(command) {
      const result = spawnSync("sh", ["-c", command], { encoding: "utf8", cwd: tempDirectory });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, "");
    },
  };
  for (const pins of [state.customPinnedApps, []]) {
    state.customPinnedApps = pins;
    save(state, model, util);
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, "utf8")), {
      version: 1, autoHide: true, reserveSpace: false, pinned: pins,
      settings: JSON.parse(JSON.stringify(state.preferences)),
    });
    assert.deepEqual(fs.readdirSync(tempDirectory), [path.basename(configPath)]);
  }
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}

console.log("PASS: empty pins survive unpin/reload/reorder; running apps remain visible; close targets one window only; terminals distinct; no substring collisions; no vendor false positives; window cycling works.");
console.log("PASS: release channels stay separate; prototype app IDs work; settings persist through the real shell command.");

// Settings stay backward-compatible and reject invalid types/out-of-range values.
assert.equal(model.normalizeSettings(null).iconSize, 34);
assert.equal(model.normalizeSettings({ iconSize: 500 }).iconSize, 64);
assert.equal(model.normalizeSettings({ opacity: -1 }).opacity, 0.2);
assert.equal(model.normalizeSettings({ magnification: NaN }).magnification, 1.6);
assert.equal(model.normalizeSettings({ hideDelay: "900" }).hideDelay, 220);
assert.equal(model.normalizeSettings({ windowScope: "invalid" }).windowScope, "all");
const windows = [
  { appId: "editor", title: "Project A", activated: true },
  { appId: "editor", title: "Project B" },
  { appId: "browser", title: "Docs" },
  { appId: "unknown" }
];
const metadata = [
  { window: windows[0], monitorName: "DP-1", workspaceId: 1, workspaceName: "1" },
  { window: windows[1], monitorName: "DP-1", workspaceId: 2, workspaceName: "2" },
  { window: windows[2], monitorName: "HDMI-1", workspaceId: 3, workspaceName: "3" }
];
const filtered = (scope, monitor, workspace) => Array.from(model.filterWindows(
  windows, metadata, scope, monitor, workspace));
assert.deepEqual(filtered("all", "DP-1", 1), windows);
assert.deepEqual(filtered("monitor", "DP-1", 1), windows.slice(0, 2));
assert.deepEqual(filtered("workspace", "DP-1", 1), [windows[0]]);
assert.deepEqual(filtered("workspace", "HDMI-1", 3), [windows[2]]);
assert.deepEqual(filtered("workspace", "DP-1", null), []);
assert.deepEqual(filtered("monitor", "missing", 1), []);
metadata[0].workspaceId = -4;
metadata[0].workspaceName = "code";
assert.deepEqual(filtered("workspace", "DP-1", -4), [windows[0]]);
metadata[0].monitorName = "HDMI-1";
assert.deepEqual(filtered("workspace", "DP-1", -4), []);
assert.deepEqual(filtered("workspace", "HDMI-1", -4), [windows[0]]);
const scopedDock = model.buildDockItems(filtered("workspace", "HDMI-1", -4),
  null, null, null, ["editor", "browser"]);
assert.equal(scopedDock.pinned.length, 2);
assert.equal(scopedDock.pinned[0].windowCount, 1);
assert.equal(scopedDock.pinned[1].windowCount, 0);
const rows = model.pickerRows(scopedDock.pinned[0], metadata);
assert.equal(rows[0].window, windows[0]);
assert.equal(rows[0].title, "Project A");
assert.equal(rows[0].location, "Workspace code · HDMI-1");
assert.equal(rows[0].active, true);
assert.equal(model.pickerRows(null, metadata).length, 0);
let activated = 0;
model.activateWindow({ activate() { activated++; } });
model.activateWindow(null);
model.activateWindow({ activate() { throw Error("closed"); } });
assert.equal(activated, 1);
// Focus must dispatch to the exact clicked window address, not just the workspace.
let focusDispatch = "";
const focusTarget = { activate() { activated++; } };
const focusHypr = {
  dispatch(cmd) { focusDispatch = cmd; },
  toplevels: { values: [{ wayland: focusTarget, address: "1a2b3c" }] },
};
model.activateWindow(focusTarget, focusHypr);
assert.equal(focusDispatch, "focuswindow address:0x1a2b3c",
  "focus dispatches focuswindow with the 0x-prefixed Hyprland address");
assert.equal(activated, 1, "wayland activate() is skipped when a focus dispatch is available");
focusHypr.usingLua = true;
focusHypr.toplevels.values = {
  0: { wayland: winA, address: "abcdef" },
  1: { wayland: focusTarget, address: "0x1a2b3c" },
  length: 2,
};
model.activateWindow(focusTarget, focusHypr);
assert.equal(focusDispatch, 'hl.dsp.focus({ window = "address:0x1a2b3c" })');
model.handleItemClick({ isRunning: true, windows: [winA, focusTarget] },
  null, null, null, null, focusHypr);
assert.equal(focusDispatch, 'hl.dsp.focus({ window = "address:0x1a2b3c" })',
  "Lua window cycling targets the exact window in a Qt list without doubling 0x");
model.handleItemClick({ isRunning: true, windows: [focusTarget] },
  null, null, null, null, focusHypr);
assert.equal(focusDispatch, 'hl.dsp.focus({ window = "address:0x1a2b3c" })');
assert.equal(activated, 1);
model.activateWindow({ activate() { activated++; } }, focusHypr);
assert.equal(activated, 2, "unmapped windows retain Wayland activation");
focusHypr.dispatch = () => { throw Error("unavailable"); };
model.activateWindow(focusTarget, focusHypr);
assert.equal(activated, 3, "synchronous dispatch errors retain Wayland activation");
console.log("PASS: Lua and legacy focus dispatch; click/cycle routing; Qt list identity; activation fallback.");
if (process.argv.includes("--focus-only")) process.exit(0);
console.log("PASS: settings validation; monitor/workspace moves; persistent pins; picker window identity and actions.");

const loadSettings = handler("loadConfig", "saveConfig", ["rawText", "settingsSaveTimer"]);
const restored = { rebuildDock() {}, preferences: model.normalizeSettings(null) };
loadSettings(restored, model, JSON.stringify({
  settings: { iconSize: 52, windowScope: "workspace" }, pinned: [], autoHide: true
}), { running: false });
assert.equal(restored.preferences.iconSize, 52);
assert.equal(restored.preferences.windowScope, "workspace");
assert.equal(restored.customPinnedApps.length, 0);
loadSettings(restored, model, JSON.stringify({ settings: { iconSize: 26 } }), { running: true });
assert.equal(restored.preferences.iconSize, 52, "external reload must not overwrite pending slider edits");
console.log("PASS: settings restore after reload; pending preview survives file watcher updates.");

// Per-application audio mute tests
const loadMuted = handler("loadMutedApps", "isAppAudioMuted", ["rawText"]);
const isMuted = handler("isAppAudioMuted", "toggleAppAudio", ["item"]);

const audioRoot = {
  mutedAppsMap: {},
  contextTarget: null,
};

loadMuted(audioRoot, model, JSON.stringify({ "spotify": true, "Vivaldi": true }));
assert.equal(isMuted(audioRoot, model, { id: "spotify" }), true, "spotify should be muted by id");
assert.equal(isMuted(audioRoot, model, { name: "Vivaldi" }), true, "vivaldi should be muted by name");
assert.equal(isMuted(audioRoot, model, { id: "vivaldi-stable" }), true, "vivaldi-stable should be muted by normalized id");
assert.equal(isMuted(audioRoot, model, { id: "alacritty" }), false, "alacritty should not be muted");
assert.equal(isMuted(audioRoot, model, null), false, "null item should return false");

loadMuted(audioRoot, model, "");
assert.equal(isMuted(audioRoot, model, { id: "spotify" }), false, "empty config should clear muted apps");

// Dynamic desktop entry and icon resolution tests (Orca, Warp, StartupWMClass)
const mockDesktopEntries = {
  byId(id) { return null; },
  applications: {
    values: [
      { id: "orca-ide.desktop", startupClass: "orca", name: "Orca", icon: "orca-ide" },
      { id: "dev.warp.Warp.desktop", startupClass: "dev.warp.Warp", name: "Warp", icon: "dev.warp.Warp" }
    ]
  }
};

const foundOrca = model.findDesktopEntry(mockDesktopEntries, "orca");
assert.ok(foundOrca, "findDesktopEntry must find orca-ide for appId=orca via startupClass");
assert.equal(foundOrca.id, "orca-ide.desktop");
assert.equal(foundOrca.icon, "orca-ide");

const mockAppLib = {
  iconIndex: {
    "orca-ide": "/usr/share/icons/hicolor/128x128/apps/orca-ide.png"
  },
  iconSource(name) {
    return "/usr/share/icons/Adwaita/application-x-executable.png";
  }
};

const orcaDockItems = model.buildDockItems(
  [{ appId: "orca", title: "Orca" }],
  mockDesktopEntries,
  mockAppLib,
  null,
  []
);
assert.equal(orcaDockItems.unpinned.length, 1);
assert.equal(orcaDockItems.unpinned[0].icon, "file:///usr/share/icons/hicolor/128x128/apps/orca-ide.png", "running Orca window must resolve orca-ide icon without showing gear fallback");

// Browser web app windows. A Chromium --app window runs under
// "<browser>-<host>__-<profile>", an id that shares nothing with the launcher
// name, so it must resolve through the site host in the desktop entry's Exec.
const webappEntry = {
  id: "f15library.desktop",
  name: "f15library",
  icon: "f15library",
  execString: 'omarchy-launch-webapp "https://www.f15library.com"',
  command: ["omarchy-launch-webapp", "https://www.f15library.com"]
};
const browserEntry = {
  id: "vivaldi-stable.desktop",
  name: "Vivaldi",
  icon: "vivaldi",
  execString: "/usr/bin/vivaldi-stable --password-store=gnome-libsecret %U",
  command: ["vivaldi-stable"]
};
const webappDesktopEntries = {
  byId(id) { return [webappEntry, browserEntry].find((entry) => entry.id === id) || null; },
  applications: { values: [webappEntry, browserEntry] }
};
const webappWindow = {
  appId: "vivaldi-www.f15library.com__-Default",
  initialClass: "vivaldi-www.f15library.com__-Default",
  class: "vivaldi-www.f15library.com__-Default",
  title: "F15 Library",
  activated: true
};
const plainBrowserWindow = { appId: "vivaldi-stable", class: "vivaldi-stable", title: "Vivaldi" };

assert.equal(model.webappHostFromAppId("vivaldi-www.f15library.com__-Default"), "www.f15library.com");
assert.equal(model.webappHostFromAppId("vivaldi-stable"), "", "a plain browser app id carries no host");
assert.equal(model.entryWebappHost(webappEntry), "www.f15library.com");
assert.equal(model.entryWebappHost(browserEntry), "", "a browser entry launches no site");
assert.equal(model.sameSiteHost("www.f15library.com", "f15library.com"), true);
assert.equal(model.sameSiteHost("www.f15library.com", "notf15library.com"), false, "host suffix must fall on a dot boundary");
assert.ok(model.entryMatchesWindow(webappEntry, "f15library", webappWindow, null), "web app window must match its entry via the Exec host");
assert.equal(model.entryMatchesWindow(browserEntry, "vivaldi-stable", webappWindow, null), false, "the browser entry must not absorb a web app window");
assert.equal(model.entryMatchesWindow(webappEntry, "f15library", plainBrowserWindow, null), false, "the web app entry must not absorb a plain browser window");

const webappDock = model.buildDockItems([webappWindow, plainBrowserWindow], webappDesktopEntries, null, null, ["vivaldi-stable", "f15library"]);
assert.equal(webappDock.pinned[0].windowCount, 1, "Vivaldi pin keeps the plain browser window");
assert.equal(webappDock.pinned[1].windowCount, 1, "f15library pin must own its web app window");
assert.equal(webappDock.unpinned.length, 0, "a pinned web app must not add a second running icon");

const unpinnedWebapp = model.buildDockItems([webappWindow], webappDesktopEntries, null, null, []);
assert.equal(unpinnedWebapp.unpinned.length, 1);
assert.equal(unpinnedWebapp.unpinned[0].id, "f15library.desktop", "an unpinned web app still resolves its desktop entry");

// Fuzzy icon resolution without desktop entry
const fuzzyIcon = model.resolveIcon("orca", mockAppLib, null, ["orca"]);
assert.equal(fuzzyIcon, "file:///usr/share/icons/hicolor/128x128/apps/orca-ide.png", "fuzzy icon lookup must map orca to orca-ide in iconIndex");

// CLI helper integration test
const scriptPath = path.join(directory, "dock-audio.py");
const statusOut = JSON.parse(spawnSync("python3", [scriptPath, "status", "test-app", "Test App"], { encoding: "utf8" }).stdout);
assert.equal(statusOut.app_id, "test-app");
assert.equal(typeof statusOut.is_muted, "boolean");

const syncOut = JSON.parse(spawnSync("python3", [scriptPath, "sync"], { encoding: "utf8" }).stdout);
assert.equal(typeof syncOut.synced, "number");

const testAudioPath = path.join(directory, "tests", "test_dock_audio.py");
if (fs.existsSync(testAudioPath)) {
  const audioEdge = spawnSync("python3", [testAudioPath], { encoding: "utf8" });
  assert.equal(audioEdge.status, 0, audioEdge.stdout + audioEdge.stderr);
}

console.log("PASS: per-app audio mute state works; dynamic desktop entry & icon resolution verified; dock-audio.py CLI verified.");

// Window preview and notification badge toggles default on and stay backward compatible.
assert.equal(model.normalizeSettings(null).showWindowPreviews, true);
assert.equal(model.normalizeSettings(null).showNotificationBadges, true);
assert.equal(model.normalizeSettings({ showWindowPreviews: false }).showWindowPreviews, false);
assert.equal(model.normalizeSettings({ showNotificationBadges: false }).showNotificationBadges, false);
assert.equal(model.normalizeSettings({ iconSize: 40 }).showNotificationBadges, true);

// Badges match a notification's app name against both name and id, without
// double counting the same app reported under two keys.
const notifCounts = { Thunderbird: 2, "org.mozilla.Thunderbird": 1, espanso: 4 };
assert.equal(model.notificationCountFor(notifCounts, { name: "Thunderbird", id: "org.mozilla.Thunderbird" }), 3);
assert.equal(model.notificationCountFor(notifCounts, { name: "Espanso", id: "espanso" }), 4);
assert.equal(model.notificationCountFor(notifCounts, { name: "Zed", id: "dev.zed.Zed" }), 0);
assert.deepEqual(Array.from(model.notificationKeysForItem(notifCounts, { name: "Thunderbird", id: "org.mozilla.Thunderbird" })),
  ["Thunderbird", "org.mozilla.Thunderbird"]);
assert.equal(model.notificationCountFor(null, { name: "Thunderbird" }), 0);
assert.equal(model.notificationCountFor(notifCounts, null), 0);

// dock-notifications.py counts only what arrived after each app's seen mark.
const notifScript = path.join(directory, "dock-notifications.py");
const notifState = fs.mkdtempSync(path.join(os.tmpdir(), "dock-notif-"));
const notifHistory = path.join(notifState, "omarchy", "notifications", "history");
fs.mkdirSync(notifHistory, { recursive: true });
for (const [name, entry] of [
  ["100-1.json", { app: "Thunderbird", timestamp: 100 }],
  ["200-2.json", { app: "Thunderbird", timestamp: 200 }],
  ["150-3.json", { app: "espanso", timestamp: 150 }],
  ["175-4.json", { app: "", timestamp: 175 }],
]) fs.writeFileSync(path.join(notifHistory, name), JSON.stringify(entry));
const notifSeen = path.join(notifState, "seen.json");
const notifEnv = { ...process.env, XDG_STATE_HOME: notifState };
const countAll = JSON.parse(spawnSync("python3", [notifScript, "count", notifSeen], { encoding: "utf8", env: notifEnv }).stdout);
assert.deepEqual(countAll.counts, { Thunderbird: 2, espanso: 1 });
fs.writeFileSync(notifSeen, JSON.stringify({ Thunderbird: 150 }));
const countSeen = JSON.parse(spawnSync("python3", [notifScript, "count", notifSeen], { encoding: "utf8", env: notifEnv }).stdout);
assert.deepEqual(countSeen.counts, { Thunderbird: 1, espanso: 1 });
fs.rmSync(notifState, { recursive: true, force: true });
console.log("PASS: preview/badge toggles default on; badges dedupe by app; dock-notifications.py counts unread only.");
