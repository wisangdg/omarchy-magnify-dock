#!/usr/bin/env python3
"""Per-app unread notification counts for dock badges.

Omarchy's notification service writes one JSON file per popup under
~/.local/state/omarchy/notifications/ and moves it into history/ when it leaves
the screen. This only reads those files. A notification is "unread" when its
timestamp is newer than the mark the dock recorded for that app (see
acknowledgeNotifications in Dock.qml).

Usage:
  dock-notifications.py count <seen.json>   # one JSON object, exits
  dock-notifications.py watch <seen.json>   # streams JSON lines on change
"""

import json
import os
import sys
import time


def state_dir():
    base = os.environ.get("XDG_STATE_HOME") or os.path.join(
        os.path.expanduser("~"), ".local", "state")
    return os.path.join(base, "omarchy", "notifications")


def seen_map(path):
    try:
        with open(path) as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def notifications(root):
    # A popup is caught once while on screen and again after the move into
    # history, under the same file name. The name is the dedup key.
    found = {}
    for directory in (root, os.path.join(root, "history")):
        try:
            names = os.listdir(directory)
        except OSError:
            continue
        for name in names:
            if not name.endswith(".json"):
                continue
            stem = name[:-5]
            if stem in found:
                continue
            try:
                with open(os.path.join(directory, name)) as handle:
                    entry = json.load(handle)
            except (OSError, ValueError):
                continue
            if isinstance(entry, dict):
                found[stem] = entry
    return list(found.values())


def counts(root, seen):
    result = {}
    for entry in notifications(root):
        app = str(entry.get("app") or "").strip()
        if not app:
            continue
        try:
            stamp = int(entry.get("timestamp") or 0)
        except (TypeError, ValueError):
            stamp = 0
        try:
            mark = int(seen.get(app) or 0)
        except (TypeError, ValueError):
            mark = 0
        if stamp > mark:
            result[app] = result.get(app, 0) + 1
    return result


def emit(root, seen_path):
    print(json.dumps({"counts": counts(root, seen_map(seen_path))}), flush=True)


def main(argv):
    if len(argv) < 3 or argv[1] not in ("count", "watch"):
        print(json.dumps({"error": "usage: dock-notifications.py count|watch <seen.json>"}))
        return 2
    mode, seen_path = argv[1], argv[2]
    root = state_dir()
    if mode == "count":
        emit(root, seen_path)
        return 0
    last = None
    while True:
        current = counts(root, seen_map(seen_path))
        if current != last:
            print(json.dumps({"counts": current}), flush=True)
            last = current
        time.sleep(2)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
