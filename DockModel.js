// DockModel.js - Core logic for macOS-style dock in Omarchy

var defaultPinnedApps = [
  "vivaldi-stable",
  "Alacritty",
  "org.gnome.Nautilus",
  "dev.zed.Zed",
  "elecwhat",
  "Discord",
  "obsidian"
];

// Qt exposes QQmlListProperty/QList values as array-like sequences. They are
// indexable from QML JavaScript but Array.isArray() returns false, so treating
// only native arrays as valid silently drops every open window.
function toArray(values) {
  if (!values) return [];
  if (Array.isArray(values)) return values;

  var result = [];
  var length = Number(values.length);
  if (!isNaN(length) && length >= 0) {
    for (var i = 0; i < length; i++) result.push(values[i]);
  }
  return result;
}

function normalizeId(id) {
  if (!id) return "";
  return String(id)
    .toLowerCase()
    .replace(/\.desktop$/i, "")
    .replace(/^(org|dev|com|io|net)\.[^.]+\./i, "")
    .replace(/[^a-z0-9]/g, "");
}

function tokenizeAppId(id) {
  if (!id) return [];
  var generic = ["org", "com", "dev", "io", "net", "bin", "app", "apps", "desktop", "linux", "stable", "browser", "git", "ui"];
  var raw = String(id).toLowerCase().replace(/\.desktop$/i, "");
  var parts = raw.split(/[^a-z0-9]+/);
  var tokens = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (p.length >= 3 && generic.indexOf(p) === -1) {
      tokens.push(p);
    }
  }
  return tokens;
}

function matchApp(appIdA, appIdB) {
  if (!appIdA || !appIdB) return false;
  var a = normalizeId(appIdA);
  var b = normalizeId(appIdB);
  if (!a || !b) return false;
  if (a === b) return true;

  // Token-based matching for hyphenated or dotted variants (e.g. vivaldi-stable vs vivaldi, code-oss vs code)
  var tokensA = tokenizeAppId(appIdA);
  var tokensB = tokenizeAppId(appIdB);
  for (var i = 0; i < tokensA.length; i++) {
    if (tokensB.indexOf(tokensA[i]) !== -1) return true;
  }

  // Terminal aliases & generic fallback
  var termNames = ["alacritty", "kitty", "ghostty", "foot", "terminal", "orgomarchyagent", "agent"];
  if ((a === "terminal" && termNames.indexOf(b) !== -1) || (b === "terminal" && termNames.indexOf(a) !== -1)) return true;
  if ((a === "orgomarchyagent" || a === "agent") && b === "foot") return true;
  if ((b === "orgomarchyagent" || b === "agent") && a === "foot") return true;

  // Browser fallbacks
  var browserNames = ["vivaldistable", "vivaldi", "chromium", "googlechrome", "firefox", "brave"];
  if (a === "browser" && browserNames.indexOf(b) !== -1) return true;
  if (b === "browser" && browserNames.indexOf(a) !== -1) return true;

  return false;
}

function entryAliases(entry, fallbackId) {
  var aliases = [fallbackId];
  if (!entry) return aliases;

  aliases.push(entry.id || "");
  aliases.push(entry.startupClass || "");
  aliases.push(entry.name || "");

  var command = toArray(entry.command);
  if (command.length > 0) aliases.push(command[0]);
  if (entry.execString) aliases.push(String(entry.execString).split(/\s+/)[0]);
  return aliases;
}

function windowAliases(win) {
  if (!win) return [];
  return [
    win.appId || "",
    win.initialClass || "",
    win.class || ""
  ];
}

function entryMatchesWindow(entry, fallbackId, win) {
  var appAliases = entryAliases(entry, fallbackId);
  var winAliases = windowAliases(win);
  for (var a = 0; a < appAliases.length; a++) {
    for (var w = 0; w < winAliases.length; w++) {
      if (matchApp(appAliases[a], winAliases[w])) return true;
    }
  }
  return false;
}

function findDesktopEntry(desktopEntries, appId) {
  if (!desktopEntries || !appId) return null;
  var id = String(appId);

  var entry = desktopEntries.byId ? desktopEntries.byId(id) : null;
  if (entry) return entry;

  entry = desktopEntries.byId ? desktopEntries.byId(id.toLowerCase()) : null;
  if (entry) return entry;

  if (desktopEntries.heuristicLookup) {
    entry = desktopEntries.heuristicLookup(id);
    if (entry) return entry;
  }

  if (desktopEntries.applications) {
    var apps = toArray(desktopEntries.applications.values);
    for (var i = 0; i < apps.length; i++) {
      var item = apps[i];
      if (item && item.id && matchApp(item.id, id)) {
        return item;
      }
    }
  }

  return null;
}

function resolveIcon(iconName, appLibrary, Quickshell) {
  var name = String(iconName || "").trim();
  if (!name) {
    return (Quickshell && typeof Quickshell.iconPath === "function")
      ? Quickshell.iconPath("application-x-executable", true)
      : "";
  }
  if (name.indexOf("file://") === 0 || name.indexOf("image://") === 0) {
    return name;
  }
  if (name.charAt(0) === "/") {
    return "file://" + name;
  }
  if (appLibrary && typeof appLibrary.iconSource === "function") {
    var src = appLibrary.iconSource(name);
    if (src && src.length > 0) return src;
  }
  if (Quickshell && typeof Quickshell.iconPath === "function") {
    var themed = Quickshell.iconPath(name, true);
    if (themed && themed.length > 0) return themed;
    return Quickshell.iconPath("application-x-executable", true);
  }
  return name;
}

function buildDockItems(toplevels, desktopEntries, appLibrary, Quickshell, customPinned) {
  var pinnedConfig = Array.isArray(customPinned)
    ? customPinned
    : defaultPinnedApps;

  var windowList = toArray(toplevels);
  var matchedWindows = {};

  var pinnedList = [];
  for (var i = 0; i < pinnedConfig.length; i++) {
    var pin = pinnedConfig[i];
    var pinId = typeof pin === "string" ? pin : (pin.id || "");
    if (!pinId) continue;

    var entry = findDesktopEntry(desktopEntries, pinId);
    var displayName = (entry && entry.name) ? entry.name : (pin.name || pinId);
    var rawIcon = (entry && entry.icon) ? entry.icon : (pin.icon || pinId);
    var resolvedIcon = resolveIcon(rawIcon, appLibrary, Quickshell);

    var appWindows = [];
    var isFocused = false;

    for (var w = 0; w < windowList.length; w++) {
      var win = windowList[w];
      if (!win) continue;
      if (entryMatchesWindow(entry, pinId, win)) {
        appWindows.push(win);
        matchedWindows[w] = true;
        if (win.activated) {
          isFocused = true;
        }
      }
    }

    pinnedList.push({
      key: "pin_" + pinId,
      id: (entry && entry.id) ? entry.id : pinId,
      name: displayName,
      icon: resolvedIcon,
      desktopEntry: entry,
      isPinned: true,
      isRunning: appWindows.length > 0,
      isFocused: isFocused,
      windowCount: appWindows.length,
      windows: appWindows
    });
  }

  // Group remaining unpinned running windows
  var runningMap = {};
  var runningOrder = [];

  for (var k = 0; k < windowList.length; k++) {
    if (matchedWindows[k]) continue;
    var toplevel = windowList[k];
    if (!toplevel) continue;
    if (toplevel.parent) continue;

    var rawAppId = String(toplevel.appId || toplevel.initialClass || toplevel.class || "").trim();
    if (!rawAppId) continue;
    var dEntry = findDesktopEntry(desktopEntries, rawAppId);
    var normKey = normalizeId((dEntry && dEntry.id) ? dEntry.id : rawAppId);

    if (!runningMap[normKey]) {
      var name = (dEntry && dEntry.name) ? dEntry.name : (toplevel.title || rawAppId);
      var icn = (dEntry && dEntry.icon) ? dEntry.icon : rawAppId;
      var iconPath = resolveIcon(icn, appLibrary, Quickshell);

      runningMap[normKey] = {
        key: "run_" + normKey,
        id: (dEntry && dEntry.id) ? dEntry.id : rawAppId,
        name: name,
        icon: iconPath,
        desktopEntry: dEntry,
        isPinned: false,
        isRunning: true,
        isFocused: false,
        windowCount: 0,
        windows: []
      };
      runningOrder.push(normKey);
    }

    runningMap[normKey].windows.push(toplevel);
    runningMap[normKey].windowCount++;
    if (toplevel.activated) {
      runningMap[normKey].isFocused = true;
    }
  }

  var unpinnedList = [];
  for (var r = 0; r < runningOrder.length; r++) {
    unpinnedList.push(runningMap[runningOrder[r]]);
  }

  return {
    pinned: pinnedList,
    unpinned: unpinnedList,
    totalItems: pinnedList.length + unpinnedList.length
  };
}

function resolveLaunchId(item, desktopEntries) {
  if (!item) return "";
  if (item.desktopEntry && item.desktopEntry.id) {
    return String(item.desktopEntry.id).replace(/\.desktop$/i, "");
  }
  var rawId = String(item.id || "").replace(/\.desktop$/i, "");
  if (!rawId) return "";
  if (desktopEntries) {
    var entry = findDesktopEntry(desktopEntries, rawId);
    if (entry && entry.id) {
      return String(entry.id).replace(/\.desktop$/i, "");
    }
  }
  return rawId;
}

function handleItemClick(item, Util, appLibrary, desktopEntries) {
  if (!item) return;

  if (item.isRunning && item.windows && item.windows.length > 0) {
    var windows = item.windows;
    // Match the Dock: clicking a running app brings it forward. If one of its
    // windows is already active, leave the app in place instead of cycling
    // through windows on every click.
    for (var i = 0; i < windows.length; i++) {
      if (windows[i] && windows[i].activated) {
        return;
      }
    }
    if (windows[0] && typeof windows[0].activate === "function") {
      windows[0].activate();
    }
    return;
  }

  var launchId = resolveLaunchId(item, desktopEntries);
  if (!launchId) return;

  var appName = item.name || launchId;

  if (appLibrary && typeof appLibrary.launch === "function") {
    try {
      appLibrary.launch(launchId, appName);
      return;
    } catch (e) {}
  }

  if (Util && typeof Util.execDetached === "function") {
    Util.execDetached("uwsm-app -- gtk-launch " + Util.shellQuote(launchId + ".desktop"));
  }
}

function closeAppWindow(item) {
  if (!item || !item.windows || item.windows.length === 0) return;
  var target = null;
  for (var i = 0; i < item.windows.length; i++) {
    var win = item.windows[i];
    if (win && typeof win.close === "function") {
      if (!target) target = win;
      if (win.activated) {
        target = win;
        break;
      }
    }
  }
  // Close the focused window, or the first available window if this app is
  // unfocused. A failed close must never cascade into closing other windows.
  if (target) {
    try { target.close(); } catch (e) {}
  }
}

// Raised cosine bell: continuous slope at both ends, with a wider shoulder
// than smoothstep. It makes adjacent icons participate in the magnification
// wave instead of snapping between a large icon and nearly resting neighbors.
function scaleFromDistance(dist, maxScale, radius) {
  var limit = radius || 140;
  var topScale = maxScale || 1.6;
  if (dist >= limit) return 1.0;
  var norm = dist / limit;
  var cosine = Math.cos(norm * Math.PI / 2);
  return 1.0 + (topScale - 1.0) * cosine * cosine;
}

// Return transform-only horizontal offsets for a centered row of fixed slots.
// Each magnified icon contributes visual width; half is distributed to either
// side so the wave stays centered and neighboring icons never collide.
function computeMagnifiedOffsets(scales, baseSize, expansionRatio) {
  var values = Array.isArray(scales) ? scales : [];
  var ratio = typeof expansionRatio === "number" ? expansionRatio : 0.82;
  var extras = [];
  var totalExtra = 0;

  for (var i = 0; i < values.length; i++) {
    var extra = Math.max(0, (Number(values[i]) - 1.0) * baseSize * ratio);
    extras.push(extra);
    totalExtra += extra;
  }

  var offsets = [];
  var cursor = -totalExtra / 2;
  for (var j = 0; j < extras.length; j++) {
    offsets.push(cursor + extras[j] / 2);
    cursor += extras[j];
  }
  return offsets;
}

// Calculate fixed unmagnified baseline coordinates
function computeBaselineCenters(baseSize, spacing, pad, pinnedCount, unpinnedCount) {
  var curX = pad;
  var sepWidth = 7;

  // Applications launcher and its following separator
  var launcherCenter = curX + baseSize / 2;
  curX += baseSize + spacing + sepWidth;

  // Pinned items
  var pinnedCenters = [];
  for (var p = 0; p < pinnedCount; p++) {
    pinnedCenters.push(curX + baseSize / 2);
    curX += baseSize + spacing;
  }

  // Unpinned items
  var unpinnedCenters = [];
  if (unpinnedCount > 0) {
    if (pinnedCount > 0) {
      curX += sepWidth;
    }
    for (var u = 0; u < unpinnedCount; u++) {
      unpinnedCenters.push(curX + baseSize / 2);
      curX += baseSize + spacing;
    }
  }

  var totalBaseWidth = curX - spacing + pad;

  return {
    launcher: launcherCenter,
    pinned: pinnedCenters,
    unpinned: unpinnedCenters,
    totalBaseWidth: totalBaseWidth
  };
}
