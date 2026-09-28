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
