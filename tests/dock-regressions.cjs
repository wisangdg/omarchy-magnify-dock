const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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

console.log("PASS: empty pins survive unpin/reload/reorder; running apps remain visible; close targets one window only; terminals distinct; no substring collisions; no vendor false positives; window cycling works.");
