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
  Component {
    id: contextMenuComponent
    Dock.DockContextMenu {
      isOpen: true
      targetItem: ({ key: "trash", name: "Trash", isPinned: false, isRunning: false })
      isTrash: true
      isTrashEmpty: false
    }
  }
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

  function test_trashMenuOnlyOffersEmptyTrash() {
    var menu = createTemporaryObject(contextMenuComponent, testCase)
    verify(menu)
    waitForRendering(menu)
    // A trash target must hide Bring to Front, Keep in Dock, Mute, Close and
    // Force Close, or the menu would offer app actions for a folder of files.
    verify(!menu.showAppRows)
    actionSpy.target = menu
    actionSpy.signalName = "emptyTrashRequested"
    mouseClick(findChild(menu, "emptyTrash"))
    compare(actionSpy.count, 1)
  }

  function test_appMenuKeepsAppRows() {
    var menu = createTemporaryObject(contextMenuComponent, testCase, {
      isTrash: false, targetItem: ({ key: "pin_x", name: "Editor", isPinned: true, isRunning: false })
    })
    verify(menu)
    waitForRendering(menu)
    verify(menu.showAppRows)
    verify(!menu.showDockRows)
  }

  function test_dockSettingsMenuOnDivider() {
    var menu = createTemporaryObject(contextMenuComponent, testCase, {
      isTrash: false, targetItem: null
    })
    verify(menu)
    waitForRendering(menu)
    verify(!menu.showAppRows)
    verify(menu.showDockRows)
    actionSpy.target = menu
    actionSpy.signalName = "settingsRequested"
    mouseClick(findChild(menu, "dockSettings"))
    compare(actionSpy.count, 1)
  }
}
