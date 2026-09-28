import QtQuick
import Quickshell.Wayland
import qs.Commons

// A still thumbnail of one Wayland toplevel. Loaded lazily by the window
// picker so nothing touches the screencopy protocol until a preview is shown.
//
// Toplevel capture needs the compositor's hyprland-toplevel-export-v1. Where
// it is missing hasContent stays false and the glyph below stands in.
Item {
  id: root

  property var window: null
  readonly property bool hasPreview: capture.hasContent

  function requestCapture() {
    if (capture.captureSource) capture.captureFrame()
  }

  Rectangle {
    anchors.fill: parent
    radius: 6
    color: Util.alpha(Color.foreground, 0.1)
  }

  ScreencopyView {
    id: capture
    anchors.fill: parent
    captureSource: root.window
    live: false
    paintCursor: false
    visible: hasContent
    constraintSize: Qt.size(root.width, root.height)
    onCaptureSourceChanged: if (captureSource) root.requestCapture()
    onWidthChanged: if (captureSource) root.requestCapture()
    onHeightChanged: if (captureSource) root.requestCapture()
    Component.onCompleted: root.requestCapture()
  }

  Text {
    visible: !capture.hasContent
    anchors.centerIn: parent
    text: "󰖯"
    font.family: Style.font.family
    font.pixelSize: 22
    color: Util.alpha(Color.foreground, 0.5)
  }
}
