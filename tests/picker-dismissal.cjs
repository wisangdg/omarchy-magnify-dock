const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const qml = fs.readFileSync(path.join(__dirname, '..', 'DockInstance.qml'), 'utf8');
const closeBody = qml.match(/function closePicker\(\) \{([\s\S]*?)\n  \}/)[1];
const closePicker = new Function('root', 'pickerShowTimer', 'pickerHideTimer', closeBody);
const dismissBody = qml.match(/function dismissAppPopups\(\) \{([\s\S]*?)\n  \}/)[1];
const dismiss = new Function('root', 'appHoverCooldown', dismissBody);
const requestBody = qml.match(/function requestAppTooltip\(item, target\) \{([\s\S]*?)\n  \}/)[1];
const request = new Function('root', 'appHoverCooldown', 'item', 'target', requestBody);
const focusBody = qml.match(/function onActiveToplevelChanged\(\) \{([\s\S]*?)\n    \}/)[1];
const focusChanged = new Function('root', focusBody);
const clicks = [...qml.matchAll(/onClicked: function\(item\) \{([\s\S]*?)\n            \}/g)];
assert.equal(clicks.length, 2, 'exercise pinned and unpinned app clicks');

for (const [, body] of clicks) {
  for (const open of [false, true]) {
    const showTimer = { running: !open, stop() { this.running = false; } };
    const hideTimer = { running: open, stop() { this.running = false; } };
    const cooldown = { running: false, restart() { this.running = true; } };
    const root = {
      pickerOpen: open, pendingPickerKey: 'whatsapp', pickerKey: open ? 'whatsapp' : '',
      tooltipVisible: true, hideScheduled: false,
      clearTooltip() { this.tooltipVisible = false; },
      scheduleDockHide() { this.hideScheduled = true; },
      closePicker() { closePicker(this, showTimer, hideTimer); },
      dismissAppPopups() { dismiss(this, cooldown); },
      rebuildDock() {
        // A replacement delegate reports hover while focus warps the pointer.
        request(this, cooldown, { key: 'whatsapp', windows: [{}] }, {});
      },
    };
    const item = { id: 'whatsapp' };
    let activations = 0;
    const model = {
      handleItemClick(actual) {
        assert.equal(actual, item);
        assert.equal(root.pickerOpen, false, 'dismiss before focus can warp the pointer');
        assert.equal(root.pendingPickerKey, '');
        assert.equal(root.pickerKey, '');
        assert.equal(root.tooltipVisible, false);
        assert.equal(showTimer.running, false, 'pending hover must not reopen the picker');
        assert.equal(hideTimer.running, false);
        assert.equal(root.hideScheduled, true);
        assert.equal(cooldown.running, true);
        focusChanged(root);
        assert.equal(root.pickerOpen, false);
        assert.equal(showTimer.running, false);
        assert.equal(root.pendingPickerKey, '');
        activations++;
      },
    };
    new Function('root', 'DockModel', 'item', 'Util', 'DesktopEntries', body)(root, model, item, {}, {});
    assert.equal(activations, 1);
    // Keyboard/external focus changes must also dismiss an existing picker.
    root.pickerOpen = true;
    cooldown.running = false;
    focusChanged(root);
    assert.equal(root.pickerOpen, false);
    assert.equal(root.pendingPickerKey, '');
  }
}
console.log('PASS: pinned/unpinned clicks dismiss open and pending pickers before activating apps.');
