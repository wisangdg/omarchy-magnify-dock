pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import qs.Commons

Rectangle {
  id: root
  property string title: ""
  property var rows: []
  property bool showPreviews: true
  property real maxHeight: 420
  readonly property bool containsPointer: hover.hovered
  readonly property real rowHeight: root.showPreviews ? 82 : 62
  signal windowActivated(var win)
  signal windowClosed(var win)
  signal dismissed()
  width: root.showPreviews ? 430 : 350
  height: Math.min(maxHeight, 54 + rows.length * root.rowHeight)
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
      height: root.rowHeight - 6
      spacing: 4
      // A real toplevel carries a string appId; bare objects (tests, stale
      // rows) do not, and must not touch the screencopy protocol.
      readonly property bool previewsEnabled: root.showPreviews && windowRow.modelData.window
        && typeof windowRow.modelData.window.appId === "string"
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
        contentItem: RowLayout {
          spacing: 8
          Item {
            Layout.preferredWidth: windowRow.previewsEnabled ? 120 : 0
            Layout.preferredHeight: windowRow.previewsEnabled ? 68 : 0
            visible: windowRow.previewsEnabled
            Loader {
              anchors.fill: parent
              active: windowRow.previewsEnabled
              source: Qt.resolvedUrl("DockWindowPreview.qml")
              onLoaded: {
                item.window = windowRow.modelData.window
                item.requestCapture()
              }
            }
          }
          Column {
            Layout.fillWidth: true
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
