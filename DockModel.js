// DockModel.js - Core logic for macOS-style dock in Omarchy

var defaultSettings = {
  iconSize: 34, magnification: 1.6, spacing: 6, opacity: 0.76,
  revealDelay: 0, hideDelay: 220, windowScope: "all"
};

function normalizeSettings(input) {
  input = input && typeof input === "object" ? input : {};
  var result = {};
  var ranges = {
    iconSize: [24, 64], magnification: [1, 2], spacing: [2, 16],
    opacity: [0.2, 1], revealDelay: [0, 1000], hideDelay: [100, 2000]
  };
  for (var key in ranges) {
    var value = input[key];
    result[key] = typeof value === "number" && isFinite(value)
      ? Math.max(ranges[key][0], Math.min(ranges[key][1], value))
      : defaultSettings[key];
  }
  result.windowScope = ["all", "monitor", "workspace"].indexOf(input.windowScope) >= 0
    ? input.windowScope : "all";
  return result;
}

function windowMetadata(win, metadata) {
  if (!win || !metadata) return null;
  var list = toArray(metadata);
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].window === win) return list[i];
  }
  return null;
}

// Keep the original Wayland handles so focus and close always target one window.
function filterWindows(windows, metadata, scope, monitorName, workspaceId) {
  var list = toArray(windows);
  if (scope !== "monitor" && scope !== "workspace") return list;
  return list.filter(function(win) {
    var info = windowMetadata(win, metadata);
    if (!info || !monitorName || info.monitorName !== monitorName) return false;
    return scope === "monitor" || (workspaceId !== null && workspaceId !== undefined
      && info.workspaceId === workspaceId);
  });
}

function pickerRows(item, metadata) {
  return toArray(item ? item.windows : []).filter(function(win) { return !!win; }).map(function(win) {
    var info = windowMetadata(win, metadata);
    return {
      window: win,
      title: String(win.title || (item && item.name) || "Untitled window"),
      location: info ? ((info.workspaceName ? "Workspace " + info.workspaceName : "")
        + (info.monitorName ? " · " + info.monitorName : "")) : "",
      active: !!win.activated
    };
  });
}

// Quickshell's HyprlandToplevel.address returns the address in hex without a
// "0x" prefix, while Hyprland's focuswindow matcher expects the 0x form.
function hyprlandAddressFor(win, hypr) {
  if (!win || !hypr || !hypr.toplevels) return "";
  var list = toArray(hypr.toplevels.values);
  for (var i = 0; i < list.length; i++) {
    var toplevel = list[i];
    if (toplevel && toplevel.wayland === win && toplevel.address) {
      var addr = String(toplevel.address);
      return addr.indexOf("0x") === 0 ? addr : "0x" + addr;
    }
  }
  return "";
}

function activateWindow(win, hypr) {
  if (!win) return;
  var address = hyprlandAddressFor(win, hypr);
  if (address && hypr && typeof hypr.dispatch === "function") {
    var command = hypr.usingLua
      ? 'hl.dsp.focus({ window = "address:' + address + '" })'
      : "focuswindow address:" + address;
    try { hypr.dispatch(command); return; } catch (e) {}
  }
  if (typeof win.activate === "function") {
    try { win.activate(); } catch (e) {}
  }
}

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

// Preserve release channels: separate installations must not share windows or pins.
var commonSuffixes = /-(stable|bin|git|oss|browser|desktop|electron|community|ide|app|client|launcher|ce|ee)$/i;

function cleanAppId(id) {
  if (!id) return "";
  var s = String(id).trim().toLowerCase().replace(/\.desktop$/i, "");
  // For reverse-DNS identifiers (e.g. org.gnome.Nautilus, io.github.user.app, dev.zed.Zed, com.spotify.Client)
  if (s.indexOf(".") !== -1) {
    var parts = s.split(".");
    var last = parts[parts.length - 1];
    if ((last === "client" || last === "desktop" || last === "app" || last === "ui") && parts.length > 2) {
      s = parts[parts.length - 2];
    } else {
      s = last;
    }
  }
  return s.replace(commonSuffixes, "").replace(/[^a-z0-9]/g, "");
}

function normalizeId(id) {
  if (!id) return "";
  return cleanAppId(id) || String(id).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchApp(appIdA, appIdB) {
  if (!appIdA || !appIdB) return false;
  var a = normalizeId(appIdA);
  var b = normalizeId(appIdB);
  if (!a || !b) return false;
  if (a === b) return true;

  // Exact raw compare without .desktop
  var rawA = String(appIdA).toLowerCase().replace(/\.desktop$/i, "");
  var rawB = String(appIdB).toLowerCase().replace(/\.desktop$/i, "");
  if (rawA === rawB) return true;

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

  var genericExes = ["python", "python3", "bash", "sh", "flatpak", "uwsm", "uwsm-app", "electron"];
  var command = toArray(entry.command);
  if (command.length > 0) {
    var cmdExe = String(command[0]).replace(/^.*\//, "");
    if (genericExes.indexOf(cmdExe) === -1) aliases.push(cmdExe);
  }
  if (entry.execString) {
    var rawExe = String(entry.execString).split(/\s+/)[0].replace(/^.*\//, "");
    if (genericExes.indexOf(rawExe) === -1) aliases.push(rawExe);
  }
  return aliases;
}

function windowAliases(win, metadata) {
  if (!win) return [];
  var aliases = [
    win.appId || "",
    win.initialClass || "",
    win.class || ""
  ];
  if (metadata) {
    var info = windowMetadata(win, metadata);
    if (info) {
      if (info.appId) aliases.push(info.appId);
      if (info.windowClass) aliases.push(info.windowClass);
      if (info.initialClass) aliases.push(info.initialClass);
    }
  }
  return aliases.filter(function(a) { return !!a; });
}

function entryMatchesWindow(entry, fallbackId, win, metadata) {
  var appAliases = entryAliases(entry, fallbackId);
  var winAliases = windowAliases(win, metadata);
  for (var a = 0; a < appAliases.length; a++) {
    for (var w = 0; w < winAliases.length; w++) {
      if (matchApp(appAliases[a], winAliases[w])) return true;
    }
  }
  return false;
}

function findDesktopEntry(desktopEntries, appId, win, metadata) {
  if (!desktopEntries || (!appId && !win)) return null;

  var candidates = [];
  function addCandidate(val) {
    if (!val) return;
    var s = String(val).trim();
    if (s.length > 0 && candidates.indexOf(s) === -1) candidates.push(s);
    var lower = s.toLowerCase();
    if (lower.length > 0 && candidates.indexOf(lower) === -1) candidates.push(lower);
    var noExt = lower.replace(/\.desktop$/i, "");
    if (noExt.length > 0 && candidates.indexOf(noExt) === -1) candidates.push(noExt);
    var cleaned = cleanAppId(s);
    if (cleaned.length > 0 && candidates.indexOf(cleaned) === -1) candidates.push(cleaned);
  }

  addCandidate(appId);
  if (win) {
    var winList = windowAliases(win, metadata);
    for (var w = 0; w < winList.length; w++) {
      addCandidate(winList[w]);
    }
    if (win.title) {
      var parts = String(win.title).split(/\s+[-–—|:]\s+/);
      for (var p = 0; p < parts.length; p++) {
        var part = parts[p].trim();
        if (part.length > 1 && part.length < 30) {
          addCandidate(part);
        }
      }
    }
  }

  if (candidates.length === 0) return null;

  // 1. Direct ID lookups
  for (var c = 0; c < candidates.length; c++) {
    var cand = candidates[c];
    var entry = desktopEntries.byId ? desktopEntries.byId(cand) : null;
    if (entry) return entry;
    entry = desktopEntries.byId ? desktopEntries.byId(cand + ".desktop") : null;
    if (entry) return entry;
  }

  // 2. Heuristic lookup
  if (desktopEntries.heuristicLookup) {
    for (var h = 0; h < candidates.length; h++) {
      var hEntry = desktopEntries.heuristicLookup(candidates[h]);
      if (hEntry) return hEntry;
    }
  }

  // 3. Scan applications model
  if (desktopEntries.applications) {
    var apps = toArray(desktopEntries.applications.values);

    // Pass A: Match StartupWMClass (FreeDesktop standard for window class mapping)
    for (var i = 0; i < apps.length; i++) {
      var scItem = apps[i];
      if (!scItem || !scItem.startupClass) continue;
      for (var k = 0; k < candidates.length; k++) {
        if (matchApp(scItem.startupClass, candidates[k])) return scItem;
      }
    }

    // Pass B: Match item.id
    for (var j = 0; j < apps.length; j++) {
      var idItem = apps[j];
      if (!idItem || !idItem.id) continue;
      for (var m = 0; m < candidates.length; m++) {
        if (matchApp(idItem.id, candidates[m])) return idItem;
      }
    }

    // Pass C: Match executable commands and aliases
    for (var e = 0; e < apps.length; e++) {
      var exeItem = apps[e];
      if (!exeItem) continue;
      var aliases = entryAliases(exeItem, exeItem.id);
      for (var a = 0; a < aliases.length; a++) {
        var alias = aliases[a];
        if (!alias) continue;
        for (var n = 0; n < candidates.length; n++) {
          if (matchApp(alias, candidates[n])) return exeItem;
        }
      }
    }

    // Pass D: Match application display name
    for (var p = 0; p < apps.length; p++) {
      var nameItem = apps[p];
      if (!nameItem || !nameItem.name) continue;
      for (var cn = 0; cn < candidates.length; cn++) {
        if (matchApp(nameItem.name, candidates[cn])) return nameItem;
      }
    }
  }

  return null;
}

function resolveIcon(iconName, appLibrary, Quickshell, candidates) {
  var name = String(iconName || "").trim();
  var names = [];
  function addName(n) {
    if (!n) return;
    var s = String(n).trim();
    if (s.length > 0 && names.indexOf(s) === -1) names.push(s);
  }
  addName(name);
  if (Array.isArray(candidates)) {
    for (var i = 0; i < candidates.length; i++) addName(candidates[i]);
  }
  if (name) {
    addName(name.toLowerCase());
    addName(cleanAppId(name));
  }

  function isGearIcon(src) {
    return !src || String(src).indexOf("application-x-executable") !== -1;
  }

  // 1. Direct candidate lookups
  for (var k = 0; k < names.length; k++) {
    var cand = names[k];
    if (cand.indexOf("file://") === 0 || cand.indexOf("image://") === 0) return cand;
    if (cand.charAt(0) === "/") return "file://" + cand;

    if (appLibrary && appLibrary.iconIndex && typeof appLibrary.iconIndex === "object") {
      var direct = appLibrary.iconIndex[cand] || appLibrary.iconIndex[cand.toLowerCase()];
      if (direct) return "file://" + direct;
    }

    if (Quickshell && typeof Quickshell.iconPath === "function") {
      var themed = Quickshell.iconPath(cand, true);
      if (themed && themed.length > 0 && !isGearIcon(themed)) return themed;
    }

    if (appLibrary && typeof appLibrary.iconSource === "function") {
      var src = appLibrary.iconSource(cand);
      if (src && src.length > 0 && !isGearIcon(src)) return src;
    }
  }

  // 2. Fuzzy prefix/substring match in appLibrary.iconIndex
  if (appLibrary && appLibrary.iconIndex && typeof appLibrary.iconIndex === "object") {
    var iconKeys = Object.keys(appLibrary.iconIndex);
    for (var m = 0; m < names.length; m++) {
      var base = cleanAppId(names[m]);
      if (!base || base.length < 3) continue;
      for (var ik = 0; ik < iconKeys.length; ik++) {
        var key = iconKeys[ik];
        var cleanKey = cleanAppId(key);
        if (cleanKey === base || key.indexOf(base + "-") === 0 || key.indexOf("-" + base) !== -1) {
          return "file://" + appLibrary.iconIndex[key];
        }
      }
    }
  }

  // 3. Fallback to generic executable icon
  if (Quickshell && typeof Quickshell.iconPath === "function") {
    return Quickshell.iconPath("application-x-executable", true);
  }
  return name;
}

function buildDockItems(toplevels, desktopEntries, appLibrary, Quickshell, customPinned, metadata) {
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
    var resolvedIcon = resolveIcon(rawIcon, appLibrary, Quickshell, [pinId]);

    var appWindows = [];
    var isFocused = false;

    for (var w = 0; w < windowList.length; w++) {
      if (matchedWindows[w]) continue;
      var win = windowList[w];
      if (!win) continue;
      if (entryMatchesWindow(entry, pinId, win, metadata)) {
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
  var runningMap = Object.create(null);
  var runningOrder = [];

  for (var k = 0; k < windowList.length; k++) {
    if (matchedWindows[k]) continue;
    var toplevel = windowList[k];
    if (!toplevel) continue;
    if (toplevel.parent) continue;

    var info = windowMetadata(toplevel, metadata);
    var rawAppId = String(toplevel.appId || (info && (info.initialClass || info.windowClass)) || toplevel.initialClass || toplevel.class || "").trim();
    if (!rawAppId) continue;
    var dEntry = findDesktopEntry(desktopEntries, rawAppId, toplevel, metadata);
    var normKey = normalizeId((dEntry && dEntry.id) ? dEntry.id : rawAppId);
    if (!normKey) normKey = rawAppId || ("win_" + k);

    if (!runningMap[normKey]) {
      var name = (dEntry && dEntry.name) ? dEntry.name : (toplevel.title || (info && info.title) || rawAppId);
      var icn = (dEntry && dEntry.icon) ? dEntry.icon : rawAppId;
      var iconCandidates = windowAliases(toplevel, metadata);
      var iconPath = resolveIcon(icn, appLibrary, Quickshell, iconCandidates);

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

function launchCommand(launchId, entry) {
  // UWSM expands Exec fields, Terminal and Path without a second GTK launcher.
  // Services survive dock reloads; Type=exec still reports failure to start.
  // ponytail: unusual IDs/Exec-less entries keep GTK; extend only with parser parity tests.
  if (/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(launchId)
      && entry && entry.command && entry.command.length > 0) {
    return ["uwsm-app", "-t", "service", "--", launchId + ".desktop"];
  }
  return ["uwsm-app", "-t", "scope", "--", "gtk-launch", launchId + ".desktop"];
}

function handleItemClick(item, Util, appLibrary, desktopEntries, launcher, hypr) {
  if (!item) return;

  if (item.isRunning && item.windows && item.windows.length > 0) {
    var windows = item.windows;
    var activeIdx = -1;
    for (var i = 0; i < windows.length; i++) {
      if (windows[i] && windows[i].activated) {
        activeIdx = i;
        break;
      }
    }
    // If one of its windows is already active:
    // - If multiple windows exist, cycle to the next window.
    // - If only 1 window exists, leave it in place.
    if (activeIdx !== -1) {
      if (windows.length > 1) {
        var nextIdx = (activeIdx + 1) % windows.length;
        activateWindow(windows[nextIdx], hypr);
      }
      return;
    }
    for (var j = 0; j < windows.length; j++) {
      if (windows[j]) {
        activateWindow(windows[j], hypr);
        return;
      }
    }
    return;
  }

  var launchId = resolveLaunchId(item, desktopEntries);
  if (!launchId) return;

  var appName = item.name || launchId;
  if (launcher) {
    var existing = [];
    for (var w = 0; w < toArray(item.windows).length; w++) {
      if (item.windows[w]) existing.push(item.windows[w]);
    }
    var entry = item.desktopEntry || findDesktopEntry(desktopEntries, launchId);
    return launcher.requestLaunch(launchId, appName, existing, launchCommand(launchId, entry));
  }

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

function selectedAppWindow(item) {
  if (!item || !item.windows || item.windows.length === 0) return null;
  var target = null;
  for (var i = 0; i < item.windows.length; i++) {
    var win = item.windows[i];
    if (win) {
      if (!target) target = win;
      if (win.activated) {
        target = win;
        break;
      }
    }
  }
  return target;
}

function forceCloseTarget(item, hypr) {
  var win = selectedAppWindow(item);
  var address = hyprlandAddressFor(win, hypr);
  if (!hypr || !hypr.usingLua || !/^0x[0-9a-f]+$/i.test(address)) return null;
  var list = toArray(hypr.toplevels.values);
  for (var i = 0; i < list.length; i++) {
    var top = list[i];
    if (top.wayland !== win) continue;
    var info = top.lastIpcObject || {};
    var stableId = String(info.stableId || "");
    var pid = Number(info.pid);
    if (!/^[0-9a-f]+$/i.test(stableId) || !Number.isInteger(pid) || pid <= 1) return null;
    return { window: win, address: address, stableId: stableId, pid: pid,
      title: String(win.title || item.name || "Untitled window") };
  }
  return null;
}

function forceCloseWindow(target, confirmed, hypr) {
  if (!confirmed || !target || !hypr || typeof hypr.dispatch !== "function") return false;
  var live = forceCloseTarget({ windows: [target.window] }, hypr);
  if (!live || live.address !== target.address || live.stableId !== target.stableId || live.pid !== target.pid) return false;
  var command = 'function() local w = hl.get_window("address:' + live.address
    + '"); if w and string.format("%x", w.stable_id) == "' + live.stableId
    + '" and w.pid == ' + live.pid
    + ' then return hl.dispatch(hl.dsp.window.kill({ window = w })) end end';
  try { hypr.dispatch(command); return true; } catch (e) { return false; }
}

function closeAppWindow(item, hypr) {
  var target = selectedAppWindow(item);
  // Close the focused window, or the first available window if this app is
  // unfocused. A failed close must never cascade into closing other windows.
  if (!target) return;
  var address = hyprlandAddressFor(target, hypr);
  if (/^0x[0-9a-f]+$/i.test(address) && hypr && typeof hypr.dispatch === "function") {
    var command = hypr.usingLua
      ? 'hl.dsp.window.close({ window = "address:' + address + '" })'
      : "closewindow address:" + address;
    try { hypr.dispatch(command); return; } catch (e) {}
  }
  if (typeof target.close === "function") {
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
  offsets.totalExtra = totalExtra;
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
