"""Edge-case checks for dock-audio.py stream matching. Run by dock-regressions.cjs."""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "dock-audio.py")

spec = importlib.util.spec_from_file_location("dock_audio", SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def matches(app_id, app_name, stream_name, pid="999"):
    m.get_hyprland_clients = lambda: []
    m.get_sink_inputs = lambda: [{"id": "1", "muted": False, "props": {
        "application.name": stream_name, "application.process.id": pid}}]
    return len(m.find_matching_streams(app_id, app_name)) == 1


assert m.normalize_name("vivaldi-stable") == "vivaldi"

# Substring collisions must not cross-match unrelated applications.
assert not matches("code", "Code", "Unicode Editor")
assert not matches("opera", "Opera", "operation")
assert not matches("foo-desktop", "Foo Desktop", "Bar Desktop")

# Real-world matches, including reverse-DNS ids and shared display names.
assert matches("vivaldi-stable", "Vivaldi", "Vivaldi")
assert matches("google-chrome", "Google Chrome", "Chrome")
assert matches("code", "Visual Studio Code", "Code")
assert matches("org.gnome.Nautilus", "Files", "Nautilus")
assert matches("com.spotify.Client", "", "Spotify")

# A malformed process id must not abort the whole lookup.
m.get_hyprland_clients = lambda: [{"class": "whatever", "pid": 9999, "title": "x"}]
m.get_sink_inputs = lambda: [{"id": "2", "muted": False, "props": {
    "application.name": "SomethingElse", "application.process.id": "not-a-number"}}]
m.find_matching_streams("other", "Other")

# An exact pid match still wins.
m.get_hyprland_clients = lambda: [{"class": "player", "pid": 500, "title": "Player"}]
m.get_sink_inputs = lambda: [{"id": "3", "muted": False, "props": {
    "application.name": "player", "application.process.id": "500"}}]
assert len(m.find_matching_streams("player", "Player")) == 1

print("PASS: dock-audio.py stream matching (no substring collisions, reverse-DNS, malformed pid).")
sys.exit(0)
