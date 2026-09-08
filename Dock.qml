pragma ComponentBehavior: Bound

import QtQuick
import Quickshell

Item {
  id: root

  // Injected by Omarchy Shell and forwarded to every output-local dock.
  property var shell: null
  property var manifest: null

  Variants {
    model: Quickshell.screens

    delegate: Component {
      DockInstance {
        required property var modelData

        dockScreen: modelData
        shell: root.shell
        manifest: root.manifest
      }
    }
  }
}
