pragma Singleton
import QtQuick

// Test stand-in for the shell's qs.Commons.Style singleton. Only the type
// tokens the dock popups actually read are mirrored; the live shell computes
// them from the active theme and font settings.
QtObject {
  readonly property QtObject font: QtObject {
    readonly property string family: "monospace"
    readonly property int caption: 10
    readonly property int bodySmall: 11
    readonly property int title: 14
  }
}
