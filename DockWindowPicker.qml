pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import qs.Commons
import qs.Commons as Commons

Rectangle {
  id: root
  property string title: ""
  property var rows: []
  property bool showPreviews: true
  property real maxHeight: 420
  readonly property bool containsPointer: hover.hovered
  // The row box equals the thumbnail box in preview mode, so the thumbnail
  // fills its row instead of floating in padding.
  readonly property real rowHeight: root.showPreviews ? 104 : 62
  readonly property real rowSpacing: 3
  readonly property real thumbWidth: 176
  readonly property real thumbHeight: root.rowHeight
  signal windowActivated(var win)
  signal windowClosed(var win)
  signal dismissed()
  width: root.showPreviews ? 460 : 350
  // Header (4 + 26) plus the list margins (4 + 4) above and below the rows.
  height: Math.min(maxHeight, 38 + rows.length * root.rowHeight
    + Math.max(0, rows.length - 1) * root.rowSpacing)
  radius: 12
  color: Util.alpha(Commons.Color.background, 0.98)
  border.color: Util.alpha(Commons.Color.foreground, 0.2)
  HoverHandler { id: hover }

  RowLayout {
    id: header
    x: 10
    y: 4
    width: parent.width - 20
    height: 26
    Text {
      text: root.title + " · " + root.rows.length
      color: Commons.Color.foreground
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
    anchors { top: header.bottom; bottom: parent.bottom; left: parent.left; right: parent.right; margins: 4 }
    clip: true
    model: root.rows
    spacing: root.rowSpacing
    ScrollBar.vertical: ScrollBar {}
    delegate: RowLayout {
      id: windowRow
      required property var modelData
      width: ListView.view.width
      height: root.rowHeight
      spacing: 6
      // A real toplevel carries a string appId; bare objects (tests, stale
      // rows) do not, and must not touch the screencopy protocol.
      readonly property bool previewsEnabled: root.showPreviews && windowRow.modelData.window
        && typeof windowRow.modelData.window.appId === "string"
      Button {
        id: focusButton
        objectName: "focusWindow"
        Layout.fillWidth: true
        Layout.fillHeight: true
        padding: 0
        Accessible.name: "Focus " + windowRow.modelData.title
        onClicked: root.windowActivated(windowRow.modelData.window)
        background: Rectangle {
          radius: 6
          color: focusButton.hovered || windowRow.modelData.active
            ? Util.alpha(Commons.Color.accent, 0.2) : "transparent"
        }
        contentItem: RowLayout {
          spacing: 8
          Item {
            Layout.preferredWidth: windowRow.previewsEnabled ? root.thumbWidth : 0
            Layout.preferredHeight: windowRow.previewsEnabled ? root.thumbHeight : 0
            Layout.fillHeight: windowRow.previewsEnabled
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
            spacing: 2
            Text {
              width: parent.width
              text: windowRow.modelData.title
              elide: Text.ElideRight
              textFormat: Text.PlainText
              color: Commons.Color.foreground
              font.bold: windowRow.modelData.active
            }
            Text {
              width: parent.width
              text: windowRow.modelData.location
              elide: Text.ElideRight
              textFormat: Text.PlainText
              color: Commons.Color.foreground
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
