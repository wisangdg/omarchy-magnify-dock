import QtQuick
import qs.Commons

Rectangle {
  id: root

  property var targetItem: null
  property bool isOpen: false
  property bool isAutoHide: true
  property bool isReserveSpace: false
  property bool isAudioMuted: false
  // The same menu serves the Trash. A trash target hides every app-only row and
  // offers "Empty Trash", the way macOS does it.
  property bool isTrash: false
  property bool isTrashEmpty: true
  readonly property bool showAppRows: root.targetItem !== null && !root.isTrash
  readonly property bool showDockRows: root.targetItem === null
  readonly property bool containsPointer: menuHover.hovered

  signal pinToggled(var item)
  property bool canForceClose: false
  signal forceCloseClicked(var item)
  signal quitClicked(var item)
  signal launchClicked(var item)
  signal muteAudioToggled(var item)
  signal emptyTrashRequested()
  signal autoHideToggled()
  signal reserveSpaceToggled()
  signal menuClosed()
  signal settingsRequested()

  visible: isOpen
  opacity: isOpen ? 1 : 0
  Behavior on opacity {
    NumberAnimation { duration: 120; easing.type: Easing.OutQuad }
  }

  width: 190
  height: menuColumn.implicitHeight + 16
  implicitWidth: 190
  implicitHeight: menuColumn.implicitHeight + 16
  radius: 12
  color: Util.alpha(Color.background, 0.94)
  border.color: Util.alpha(Color.foreground, 0.18)
  border.width: 1

  HoverHandler {
    id: menuHover
  }

  // Specular top highlight
  Rectangle {
    anchors.top: parent.top
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.margins: 1
    height: 1
    radius: 12
    color: Util.alpha("#ffffff", 0.15)
  }

  Column {
    id: menuColumn
    anchors.centerIn: parent
    width: parent.width - 12
    spacing: 3

    // App Header if item selected
    Item {
      visible: root.showAppRows
      width: parent.width
      height: visible ? 24 : 0

      Text {
        anchors.verticalCenter: parent.verticalCenter
        anchors.left: parent.left
        anchors.leftMargin: 8
        anchors.right: parent.right
        anchors.rightMargin: 8
        elide: Text.ElideRight
        text: root.targetItem ? String(root.targetItem.name || "") : ""
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
        font.bold: true
        color: Color.accent
      }
    }

    // Divider
    Rectangle {
      visible: root.showAppRows
      width: parent.width
      height: 1
      color: Util.alpha(Color.foreground, 0.12)
    }

    // Trash: the only action macOS offers on the Trash item itself. Greyed out
    // while the trash is empty, like the Finder's Empty Trash item.
    Rectangle {
      visible: root.isTrash
      width: parent.width
      height: 26
      radius: 6
      color: (!root.isTrashEmpty && emptyTrashMouse.containsMouse)
        ? Util.alpha(Color.accent, 0.2) : "transparent"

      Row {
        anchors.fill: parent
        anchors.leftMargin: 8
        spacing: 8
        Text {
          anchors.verticalCenter: parent.verticalCenter
          text: "  Empty Trash"
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
          color: Color.foreground
          opacity: root.isTrashEmpty ? 0.45 : 1
        }
      }

      MouseArea {
        id: emptyTrashMouse
        objectName: "emptyTrash"
        anchors.fill: parent
        hoverEnabled: true
        enabled: !root.isTrashEmpty
        cursorShape: Qt.PointingHandCursor
        onClicked: {
          root.menuClosed()
          root.emptyTrashRequested()
        }
      }
    }

    // Launch / Focus Action
    Rectangle {
      visible: root.showAppRows
      width: parent.width
      height: 26
      radius: 6
      color: launchMouse.containsMouse ? Util.alpha(Color.accent, 0.2) : "transparent"

      Row {
        anchors.fill: parent
        anchors.leftMargin: 8
        spacing: 8
        Text {
          anchors.verticalCenter: parent.verticalCenter
          text: root.targetItem && root.targetItem.isRunning ? "󰖯  Bring to Front" : "󱂬  Open"
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
          color: Color.foreground
        }
      }

      MouseArea {
        id: launchMouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: {
          var item = root.targetItem
          root.menuClosed()
          root.launchClicked(item)
        }
      }
    }

    // Keep in Dock (Pin / Unpin)
    Rectangle {
      visible: root.showAppRows
      width: parent.width
      height: 26
      radius: 6
      color: pinMouse.containsMouse ? Util.alpha(Color.accent, 0.2) : "transparent"

      Row {
        anchors.fill: parent
        anchors.leftMargin: 8
        spacing: 8
        Text {
          anchors.verticalCenter: parent.verticalCenter
          text: (root.targetItem && root.targetItem.isPinned) ? "✓  Keep in Dock" : "    Keep in Dock"
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
          color: Color.foreground
        }
      }

      MouseArea {
        id: pinMouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: {
          var item = root.targetItem
          root.menuClosed()
          root.pinToggled(item)
        }
      }
    }

    // Mute / Unmute Audio Action (Silent)
    Rectangle {
      visible: root.showAppRows
      width: parent.width
      height: visible ? 26 : 0
      radius: 6
      color: muteMouse.containsMouse ? Util.alpha(Color.accent, 0.2) : "transparent"

      Row {
        anchors.fill: parent
        anchors.leftMargin: 8
        spacing: 8
        Text {
          anchors.verticalCenter: parent.verticalCenter
          text: root.isAudioMuted ? "󰕾  Unmute Audio" : "󰝟  Mute Audio (Silent)"
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
          color: Color.foreground
        }
      }

      MouseArea {
        id: muteMouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: {
          var item = root.targetItem
          root.menuClosed()
          root.muteAudioToggled(item)
        }
      }
    }

    // Quit / Close Action
    Rectangle {
      visible: root.showAppRows && root.targetItem.isRunning
      width: parent.width
      height: 26
      radius: 6
      color: quitMouse.containsMouse ? Util.alpha(Color.accent, 0.2) : "transparent"

      Row {
        anchors.fill: parent
        anchors.leftMargin: 8
        spacing: 8
        Text {
          anchors.verticalCenter: parent.verticalCenter
          text: "󰅖  Quit"
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
          color: Color.foreground
        }
      }

      MouseArea {
        id: quitMouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: {
          var item = root.targetItem
          root.menuClosed()
          root.quitClicked(item)
        }
      }
    }

    Rectangle {
      visible: root.showAppRows && root.targetItem.isRunning && root.canForceClose
      width: parent.width
      height: 26
      radius: 6
      color: forceMouse.containsMouse ? Util.alpha(Color.urgent, 0.2) : "transparent"

      Row {
        anchors.fill: parent
        anchors.leftMargin: 8
        spacing: 8
        Text {
          anchors.verticalCenter: parent.verticalCenter
          text: "󰅙  Force Close…"
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
          color: Color.urgent
        }
      }

      MouseArea {
        id: forceMouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: {
          var item = root.targetItem
          root.menuClosed()
          root.forceCloseClicked(item)
        }
      }
    }

    // Dock Settings (shown when right-clicking divider or dock capsule)
    Item {
      visible: root.showDockRows
      width: parent.width
      height: visible ? 24 : 0

      Text {
        anchors.verticalCenter: parent.verticalCenter
        anchors.left: parent.left
        anchors.leftMargin: 8
        anchors.right: parent.right
        anchors.rightMargin: 8
        elide: Text.ElideRight
        text: "Dock"
        font.family: Style.font.family
        font.pixelSize: Style.font.bodySmall
        font.bold: true
        color: Color.accent
      }
    }

    Rectangle {
      visible: root.showDockRows
      width: parent.width
      height: 1
      color: Util.alpha(Color.foreground, 0.12)
    }

    // Dock Settings Action
    Rectangle {
      visible: root.showDockRows
      width: parent.width
      height: 26
      radius: 6
      color: settingsMouse.containsMouse ? Util.alpha(Color.accent, 0.2) : "transparent"

      Row {
        anchors.fill: parent
        anchors.leftMargin: 8
        spacing: 8
        Text {
          anchors.verticalCenter: parent.verticalCenter
          text: "󰒓  Dock Settings…"
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
          color: Color.foreground
        }
      }

      MouseArea {
        id: settingsMouse
        objectName: "dockSettings"
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: {
          root.menuClosed()
          root.settingsRequested()
        }
      }
    }

    // Auto-hide Toggle
    Rectangle {
      visible: root.showDockRows
      width: parent.width
      height: 26
      radius: 6
      color: autoHideMouse.containsMouse ? Util.alpha(Color.accent, 0.2) : "transparent"

      Row {
        anchors.fill: parent
        anchors.leftMargin: 8
        spacing: 8
        Text {
          anchors.verticalCenter: parent.verticalCenter
          text: root.isAutoHide ? "✓  Auto-hide Dock" : "    Auto-hide Dock"
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
          color: Color.foreground
        }
      }

      MouseArea {
        id: autoHideMouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: {
          root.menuClosed()
          // Close the popup surface before changing the panel input mask.
          root.autoHideToggled()
        }
      }
    }

    // Reserve desktop space Toggle
    Rectangle {
      visible: root.showDockRows
      width: parent.width
      height: 26
      radius: 6
      color: reserveMouse.containsMouse ? Util.alpha(Color.accent, 0.2) : "transparent"

      Row {
        anchors.fill: parent
        anchors.leftMargin: 8
        spacing: 8
        Text {
          anchors.verticalCenter: parent.verticalCenter
          text: root.isReserveSpace ? "✓  Reserve screen space" : "    Reserve screen space"
          font.family: Style.font.family
          font.pixelSize: Style.font.bodySmall
          color: Color.foreground
        }
      }

      MouseArea {
        id: reserveMouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: {
          root.menuClosed()
          // Close before exclusionMode/exclusiveZone changes on the layer.
          root.reserveSpaceToggled()
        }
      }
    }

  }
}
