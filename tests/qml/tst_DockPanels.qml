import QtQuick
import QtQuick.Controls
import QtTest
import "../.." as Dock
import "../../DockModel.js" as DockModel

TestCase {
  id: testCase
  name: "DockPanels"
  when: windowShown
  visible: true
  width: 700
  height: 720

  Component {
    id: settingsComponent
    Dock.DockSettings {
      settings: DockModel.normalizeSettings(null)
      onPreferenceChanged: function(key, value) {
        var next = Object.assign({}, settings)
        next[key] = value
        settings = DockModel.normalizeSettings(next)
      }
    }
  }
  Component { id: pickerComponent; Dock.DockWindowPicker {} }
  SignalSpy { id: actionSpy }

  function cleanup() { actionSpy.target = null; actionSpy.clear() }

  function test_settingsPreviewAndFilter() {
    var panel = createTemporaryObject(settingsComponent, testCase)
    verify(panel)
    waitForRendering(panel)
    var size = findChild(panel, "iconSize")
    verify(size.width > 100)
    mouseClick(size, size.width * 0.8, size.height / 2)
    verify(panel.settings.iconSize > 34)
    var scope = findChild(panel, "windowScope")
    scope.forceActiveFocus()
    keyClick(Qt.Key_Down)
    keyClick(Qt.Key_Return)
    compare(panel.settings.windowScope, "monitor")
  }

  function test_pickerTargetsExactWindow() {
    var winA = { title: "A" }
    var winB = { title: "B" }
    var panel = createTemporaryObject(pickerComponent, testCase, {
      title: "Editor", rows: [
        { window: winA, title: "A", location: "Workspace 1", active: true },
        { window: winB, title: "B", location: "Workspace 2", active: false }
      ]
    })
    verify(panel)
    waitForRendering(panel)
    actionSpy.target = panel
    actionSpy.signalName = "windowActivated"
    mouseClick(findChild(panel, "focusWindow"))
    compare(actionSpy.count, 1)
    compare(actionSpy.signalArguments[0][0], winA)
    actionSpy.clear()
    actionSpy.signalName = "windowClosed"
    mouseClick(findChild(panel, "closeWindow"))
    compare(actionSpy.count, 1)
    compare(actionSpy.signalArguments[0][0], winA)
    panel.rows = [panel.rows[1]]
    wait(30)
    actionSpy.clear()
    mouseClick(findChild(panel, "closeWindow"))
    compare(actionSpy.count, 1)
    compare(actionSpy.signalArguments[0][0], winB)
  }
}
