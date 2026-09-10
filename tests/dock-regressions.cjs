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

// CLI helper integration test
const scriptPath = path.join(directory, "dock-audio.py");
const statusOut = JSON.parse(spawnSync("python3", [scriptPath, "status", "test-app", "Test App"], { encoding: "utf8" }).stdout);
assert.equal(statusOut.app_id, "test-app");
assert.equal(typeof statusOut.is_muted, "boolean");

const syncOut = JSON.parse(spawnSync("python3", [scriptPath, "sync"], { encoding: "utf8" }).stdout);
assert.equal(typeof syncOut.synced, "number");

console.log("PASS: per-app audio mute state works; dock-audio.py CLI verified.");
