pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import qs.Commons

Rectangle {
  id: root
  property string title: ""
  property var rows: []
  property real maxHeight: 420
  readonly property bool containsPointer: hover.hovered
  signal windowActivated(var win)
  signal windowClosed(var win)
  signal dismissed()
  width: 350
  height: Math.min(maxHeight, 54 + rows.length * 62)
  radius: 12
  color: Util.alpha(Color.background, 0.98)
  border.color: Util.alpha(Color.foreground, 0.2)
  HoverHandler { id: hover }

  RowLayout {
    id: header
    x: 12
    y: 6
    width: parent.width - 24
    height: 36
    Text {
      text: root.title + " · " + root.rows.length
      color: Color.foreground
      font.bold: true
      elide: Text.ElideRight
      Layout.fillWidth: true
    }
    ToolButton {
      text: "×"
      Accessible.name: "Dismiss window picker"
      onClicked: root.dismissed()
    }
  }
  ListView {
    anchors { top: header.bottom; bottom: parent.bottom; left: parent.left; right: parent.right; margins: 6 }
    clip: true
    model: root.rows
    spacing: 4
    ScrollBar.vertical: ScrollBar {}
    delegate: RowLayout {
      id: windowRow
      required property var modelData
      width: ListView.view.width
      height: 58
      spacing: 4
      Button {
        id: focusButton
        objectName: "focusWindow"
        Layout.fillWidth: true
        Layout.fillHeight: true
        Accessible.name: "Focus " + windowRow.modelData.title
        onClicked: root.windowActivated(windowRow.modelData.window)
        background: Rectangle {
          radius: 6
          color: focusButton.hovered || windowRow.modelData.active
            ? Util.alpha(Color.accent, 0.2) : "transparent"
        }
        contentItem: Column {
          spacing: 3
          Text {
            width: parent.width
            text: windowRow.modelData.title
            elide: Text.ElideRight
            textFormat: Text.PlainText
            color: Color.foreground
            font.bold: windowRow.modelData.active
          }
          Text {
            width: parent.width
            text: windowRow.modelData.location
            elide: Text.ElideRight
            textFormat: Text.PlainText
            color: Color.foreground
            opacity: 0.65
            font.pixelSize: 11
          }
        }
      }
      ToolButton {
        objectName: "closeWindow"
        text: "×"
        Accessible.name: "Close " + windowRow.modelData.title
        ToolTip.visible: hovered
        ToolTip.text: "Close window"
        onClicked: root.windowClosed(windowRow.modelData.window)
      }
    }
  }
}
