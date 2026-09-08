import QtQuick
import QtQuick.Controls
import QtQuick.Effects
import Quickshell
import qs.Commons
import qs.Ui

Rectangle {
  id: root

  property var targetItem: null
  property bool isOpen: false
  property bool isAutoHide: true
  property bool isReserveSpace: false
  readonly property bool containsPointer: menuHover.hovered

  signal pinToggled(var item)
  signal quitClicked(var item)
  signal launchClicked(var item)
  signal autoHideToggled()
  signal reserveSpaceToggled()
  signal menuClosed()

  visible: isOpen
  opacity: isOpen ? 1 : 0
  Behavior on opacity {
    NumberAnimation { duration: 120; easing.type: Easing.OutQuad }
  }

  width: 190
  height: menuColumn.implicitHeight + 16
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
      visible: root.targetItem !== null
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
      visible: root.targetItem !== null
      width: parent.width
      height: 1
      color: Util.alpha(Color.foreground, 0.12)
    }

    // Launch / Focus Action
    Rectangle {
      visible: root.targetItem !== null
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
      visible: root.targetItem !== null
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

    // Quit / Close Action
    Rectangle {
      visible: root.targetItem !== null && root.targetItem.isRunning
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
          text: "󰅖  Close Window"
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

    // Divider
    Rectangle {
      width: parent.width
      height: 1
      color: Util.alpha(Color.foreground, 0.12)
    }

    // Auto-hide Toggle
    Rectangle {
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
