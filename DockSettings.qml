pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import qs.Commons

Rectangle {
  id: root
  property var settings: ({})
  property real maxHeight: 620
  signal preferenceChanged(string key, var value)
  signal dismissed()
  width: 340
  height: Math.min(maxHeight, settingsColumn.implicitHeight + 28)
  radius: 12
  color: Util.alpha(Color.background, 0.98)
  border.color: Util.alpha(Color.foreground, 0.2)

  ScrollView {
    anchors.fill: parent
    anchors.margins: 14
    contentWidth: availableWidth
    clip: true
    ColumnLayout {
      id: settingsColumn
      width: parent.width
      spacing: 10
      RowLayout {
        Layout.fillWidth: true
        Text {
          text: "Dock Settings"
          color: Color.foreground
          font.bold: true
          font.pixelSize: 16
          Layout.fillWidth: true
        }
        Button {
          text: "Done"
          Accessible.name: "Close dock settings"
          onClicked: root.dismissed()
        }
      }
      Text {
        text: "Changes preview immediately and save automatically."
        color: Color.foreground
        opacity: 0.7
        wrapMode: Text.WordWrap
        Layout.fillWidth: true
        font.pixelSize: 12
      }
      Repeater {
        model: [
          { key: "iconSize", label: "Icon size", min: 24, max: 64, step: 1, unit: " px" },
          { key: "magnification", label: "Magnification", min: 1, max: 2, step: 0.05, unit: "×" },
          { key: "spacing", label: "Icon spacing", min: 2, max: 16, step: 1, unit: " px" },
          { key: "opacity", label: "Background opacity", min: 0.2, max: 1, step: 0.05, unit: "%" },
          { key: "revealDelay", label: "Reveal delay", min: 0, max: 1000, step: 50, unit: " ms" },
          { key: "hideDelay", label: "Hide delay", min: 100, max: 2000, step: 50, unit: " ms" }
        ]
        delegate: ColumnLayout {
          id: settingRow
          required property var modelData
          Layout.fillWidth: true
          spacing: 0
          RowLayout {
            Layout.fillWidth: true
            Text {
              text: settingRow.modelData.label
              color: Color.foreground
              Layout.fillWidth: true
            }
            Text {
              text: (settingRow.modelData.key === "opacity"
                ? Math.round(control.value * 100)
                : Math.round(control.value * 100) / 100) + settingRow.modelData.unit
              color: Color.foreground
            }
          }
          Slider {
            id: control
            objectName: settingRow.modelData.key
            Layout.fillWidth: true
            from: settingRow.modelData.min
            to: settingRow.modelData.max
            stepSize: settingRow.modelData.step
            value: root.settings[settingRow.modelData.key]
            Accessible.name: settingRow.modelData.label
            onMoved: root.preferenceChanged(settingRow.modelData.key, value)
          }
        }
      }
      Text { text: "Show running windows from"; color: Color.foreground }
      ComboBox {
        objectName: "windowScope"
        Layout.fillWidth: true
        model: ["All monitors and workspaces", "This monitor", "Active workspace on this monitor"]
        currentIndex: ["all", "monitor", "workspace"].indexOf(root.settings.windowScope)
        Accessible.name: "Running window filter"
        onActivated: function(index) {
          root.preferenceChanged("windowScope", ["all", "monitor", "workspace"][index])
        }
      }
      Text {
        text: "Pinned apps remain available in every mode. Reveal and hide delays apply when Auto-hide is enabled."
        color: Color.foreground
        opacity: 0.7
        wrapMode: Text.WordWrap
        Layout.fillWidth: true
        font.pixelSize: 12
      }
    }
  }
}
