pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "DockModel.js" as DockModel

Item {
  id: root

  // Injected by Omarchy Shell and forwarded to every output-local dock.
  property var shell: null
  property var manifest: null
  property var pendingLaunches: ({})

  // Unread notification counts keyed by the sender's app name, plus the
  // per-app "seen" marks used to decide what is unread. Shared by every
  // output-local dock so one badge is not counted once per monitor.
  property var notificationCounts: ({})
  property var notificationSeen: ({})
  readonly property string notificationSeenPath: Quickshell.env("HOME") + "/.config/omarchy/dock-notifications-seen.json"
  readonly property string notificationScript: Quickshell.env("HOME") + "/.config/omarchy/plugins/wdg.dock/dock-notifications.py"

  function requestLaunch(launchId, appName, existingWindows, command) {
    var key = "$" + launchId
    if (root.pendingLaunches[key]) return false
    var job = launchJob.createObject(root, {
      launchId: launchId, appName: appName,
      launchCommand: command || DockModel.launchCommand(launchId, null),
      existingWindows: existingWindows || []
    })
    if (!job) {
      root.notifyLaunchFailure(appName, "Could not create the application launcher.")
      return false
    }
    var next = Object.assign({}, root.pendingLaunches)
    next[key] = job
    root.pendingLaunches = next
    job.start()
    return true
  }

  function releaseLaunch(job) {
    job.pending = false
    var key = "$" + job.launchId
    if (root.pendingLaunches[key] !== job) return
    var next = Object.assign({}, root.pendingLaunches)
    delete next[key]
    root.pendingLaunches = next
  }

  function completeLaunchedWindows(windows, entries, metadata) {
    var list = DockModel.toArray(windows)
    if (!list.length) return
    Object.keys(root.pendingLaunches).forEach(function(key) {
      var job = root.pendingLaunches[key]
      var entry = DockModel.findDesktopEntry(entries, job.launchId)
      if (list.some(function(win) {
        return job.existingWindows.indexOf(win) === -1
          && DockModel.entryMatchesWindow(entry, job.launchId, win, metadata)
      })) job.finish()
    })
  }

  function notifyLaunchFailure(appName, detail) {
    // Notification bodies support markup; launcher output must stay plain text.
    var text = (detail || "The application launcher failed.") + " (" + appName + ")"
    text = String(text).trim().slice(-2048)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    Quickshell.execDetached(["notify-send", "--app-name=Dock", "--urgency=critical",
      "--", "Could not launch application", text])
  }

  function loadNotificationSeen(rawText) {
    try {
      if (rawText && rawText.trim().length > 0) {
        var parsed = JSON.parse(rawText)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          root.notificationSeen = parsed
          return
        }
      }
    } catch (e) {}
    root.notificationSeen = ({})
  }

  function applyNotificationCounts(counts) {
    root.notificationCounts = (counts && typeof counts === "object" && !Array.isArray(counts))
      ? counts : ({})
  }

  // Opening an app clears its badge, macOS-style. Keys already cleared are
  // dropped from the live map so the badge hides before the watcher replies.
  function acknowledgeNotifications(item) {
    if (!item) return
    var counts = root.notificationCounts || {}
    var keys = DockModel.notificationKeysForItem(counts, item)
    if (!keys.length) return
    var remaining = Object.assign({}, counts)
    var nextSeen = Object.assign({}, root.notificationSeen)
    var now = Date.now()
    for (var i = 0; i < keys.length; i++) {
      delete remaining[keys[i]]
      nextSeen[keys[i]] = now
    }
    root.notificationCounts = remaining
    root.notificationSeen = nextSeen
    root.saveNotificationSeen()
  }

  function saveNotificationSeen() {
    var jsonStr = JSON.stringify(root.notificationSeen)
    var tmpPath = root.notificationSeenPath + ".tmp." + Date.now()
    var cmd = "printf '%s\\n' " + Util.shellQuote(jsonStr) + " > " + Util.shellQuote(tmpPath)
      + " && mv " + Util.shellQuote(tmpPath) + " " + Util.shellQuote(root.notificationSeenPath)
    Util.execDetached(cmd)
  }

  FileView {
    id: notificationSeenFile
    path: root.notificationSeenPath
    watchChanges: true
    onFileChanged: reload()
    printErrors: false
    onLoaded: root.loadNotificationSeen(text())
    onLoadFailed: root.loadNotificationSeen("")
  }

  Process {
    id: notificationWatch
    command: ["python3", root.notificationScript, "watch", root.notificationSeenPath]
    running: true
    stdout: SplitParser {
      onRead: function(line) {
        try {
          var data = JSON.parse(line)
          if (data && data.counts) root.applyNotificationCounts(data.counts)
        } catch (e) {}
      }
    }
    onExited: notificationWatchRestart.restart()
  }

  Timer {
    id: notificationWatchRestart
    interval: 5000
    onTriggered: if (!notificationWatch.running) notificationWatch.running = true
  }

  // Trash state for the empty/full icon, shared by every output-local dock.
  // gio reads the trash through the same GLib/GVfs backend the file manager
  // and Empty Trash use. `gio monitor` emits a line per trash change, so the
  // probe runs on change instead of on a per-monitor poll.
  property bool trashFull: false
  property bool trashProbeSawEntry: false
  property bool trashProbeAgain: false

  function probeTrash() { trashProbeDebounce.restart() }

  Timer {
    id: trashProbeDebounce
    interval: 120
    onTriggered: {
      if (trashProbe.running) root.trashProbeAgain = true
      else trashProbe.running = true
    }
  }

  Process {
    id: trashProbe
    command: ["gio", "trash", "--list"]
    onStarted: root.trashProbeSawEntry = false
    stdout: SplitParser {
      onRead: function(line) {
        if (String(line).trim().length > 0) root.trashProbeSawEntry = true
      }
    }
    onExited: {
      root.trashFull = root.trashProbeSawEntry
      // A change that landed mid-probe may not be in this listing.
      if (root.trashProbeAgain) {
        root.trashProbeAgain = false
        root.probeTrash()
      }
    }
  }

  Process {
    id: trashWatch
    command: ["gio", "monitor", "trash:///"]
    running: true
    stdout: SplitParser { onRead: function(line) { root.probeTrash() } }
    onStarted: root.probeTrash()
    onExited: trashWatchRestart.restart()
  }

  Timer {
    id: trashWatchRestart
    interval: 5000
    onTriggered: if (!trashWatch.running) trashWatch.running = true
  }

  // Maps an icon name to a file on disk (e.g. "microsoft-edge" ->
  // ".../hicolor/128x128/apps/microsoft-edge.png"). Registered before Qt's
  // themed lookup in DockModel.resolveIcon, so an icon that Qt's startup-time
  // theme listing never saw still resolves. SVGs are listed before PNGs so the
  // first hit per name is the scalable one. Scanned once for all monitors.
  property var iconIndex: ({})
  property var pendingIconIndex: ({})

  function indexIconLine(line) {
    var value = String(line || "").trim()
    if (value.length === 0) return
    var slash = value.lastIndexOf("/")
    var file = slash >= 0 ? value.slice(slash + 1) : value
    var dot = file.lastIndexOf(".")
    var name = dot > 0 ? file.slice(0, dot) : file
    if (name.length > 0 && root.pendingIconIndex[name] === undefined)
      root.pendingIconIndex[name] = value
  }

  Process {
    id: iconIndexScan
    running: true
    command: ["bash", "-c",
      "dirs=\"$HOME/.icons $HOME/.local/share/icons\";" +
      "IFS=\":\"; for d in ${XDG_DATA_DIRS:-/usr/local/share:/usr/share}; do dirs=\"$dirs $d/icons\"; done; unset IFS;" +
      "for ext in svg png; do" +
      "  for base in $dirs; do" +
      "    [[ -d $base ]] && find \"$base\" \\( -path \"*/apps/*\" -o -path \"*/devices/*\" \\) -name \"*.$ext\" 2>/dev/null;" +
      "  done;" +
      "  find /usr/share/pixmaps -maxdepth 1 -name \"*.$ext\" 2>/dev/null;" +
      "done"
    ]
    stdout: SplitParser { onRead: function(line) { root.indexIconLine(line) } }
    onStarted: root.pendingIconIndex = ({})
    // Publishing the finished index makes every dock rebuild, so items that
    // fell back to the generic gear during the scan pick up their real icon.
    onExited: root.iconIndex = root.pendingIconIndex
  }

  Timer {
    id: iconIndexDebounce
    interval: 750
    onTriggered: if (!iconIndexScan.running) iconIndexScan.running = true
  }

  Connections {
    target: DesktopEntries.applications
    function onValuesChanged() { iconIndexDebounce.restart() }
  }

  // Muted Apps State Persistence & Audio Control
  readonly property string mutedAppsPath: Quickshell.env("HOME") + "/.config/omarchy/dock-muted-apps.json"
  readonly property string dockAudioScript: Quickshell.env("HOME") + "/.config/omarchy/plugins/wdg.dock/dock-audio.py"
  property var mutedAppsMap: ({})

  FileView {
    id: mutedAppsFileView
    path: root.mutedAppsPath
    watchChanges: true
    onFileChanged: reload()
    printErrors: false
    onLoaded: root.loadMutedApps(text())
    onLoadFailed: root.loadMutedApps("")
  }

  function loadMutedApps(rawText) {
    try {
      if (rawText && rawText.trim().length > 0) {
        var parsed = JSON.parse(rawText)
        if (parsed && typeof parsed === "object") {
          root.mutedAppsMap = parsed
          return
        }
      }
    } catch (e) {}
    root.mutedAppsMap = ({})
  }

  function isAppAudioMuted(item) {
    if (!item) return false
    var map = root.mutedAppsMap || {}
    var id = String(item.id || "")
    var name = String(item.name || "")
    if (id && map[id] === true) return true
    if (name && map[name] === true) return true
    for (var k in map) {
      if (!map[k]) continue
      if (id && (k === id || DockModel.matchApp(k, id))) return true
      if (name && (k === name || DockModel.normalizeId(k) === DockModel.normalizeId(name))) return true
    }
    return false
  }

  function toggleAppAudio(item) {
    if (!item) return
    var appId = String(item.id || "")
    var appName = String(item.name || "")
    // Update the intent map before the script runs so the sync timer stops
    // immediately on unmute; otherwise it can re-mute the stream in the gap
    // before the persisted file is reloaded.
    var next = Object.assign({}, root.mutedAppsMap)
    if (root.isAppAudioMuted(item)) {
      if (appId) delete next[appId]
      if (appName) delete next[appName]
    } else {
      if (appId) next[appId] = true
      if (appName) next[appName] = true
    }
    root.mutedAppsMap = next
    var cmd = "python3 " + Util.shellQuote(root.dockAudioScript) + " toggle " + Util.shellQuote(appId) + " " + Util.shellQuote(appName)
    Util.execDetached(cmd)
  }

  // A saved mute must also cover streams that appear after the menu action,
  // otherwise muting a silent app (or one that restarts playback) has no effect.
  Timer {
    id: audioSyncTimer
    interval: 1500
    repeat: true
    running: Object.keys(root.mutedAppsMap).length > 0
    onTriggered: audioSyncProc.running = true
  }

  Process {
    id: audioSyncProc
    command: ["python3", root.dockAudioScript, "sync"]
  }

  Component {
    id: launchJob

    Item {
      id: job
      required property string launchId
      required property string appName
      required property var launchCommand
      property var existingWindows: []
      property bool pending: true
      property bool started: false
      property string errorText: ""

      function start() {
        launchTimeout.start()
        launchProc.running = true
      }

      function finish() {
        launchTimeout.stop()
        root.releaseLaunch(job)
        // A timeout releases the guard, not the process or its child application.
        if (!job.pending && !launchProc.running) job.destroy()
      }

      Timer {
        id: launchTimeout
        interval: 8000
        onTriggered: {
          if (!job.started) root.notifyLaunchFailure(job.appName, "The launcher did not start.")
          job.finish()
        }
      }

      Process {
        id: launchProc
        command: job.launchCommand
        onStarted: job.started = true
        stderr: SplitParser {
          onRead: function(data) { job.errorText = (job.errorText + data + "\n").slice(-2048) }
        }
        onExited: function(exitCode, exitStatus) {
          if (exitCode !== 0 || exitStatus !== 0) {
            root.notifyLaunchFailure(job.appName, job.errorText || "Launcher exited with code " + exitCode)
            job.finish()
          } else if (!job.pending) {
            job.destroy()
          }
          // Exit 0 only confirms dispatch; wait for a window or the timeout.
        }
      }
    }
  }

  Variants {
    model: Quickshell.screens

    delegate: Component {
      DockInstance {
        required property var modelData

        dockScreen: modelData
        shell: root.shell
        manifest: root.manifest
        launcher: root
      }
    }
  }
}
