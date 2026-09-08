# macOS Magnify Dock for Omarchy

<div align="center">

[![Omarchy Plugin](https://img.shields.io/badge/Omarchy-Plugin-blue.svg?style=for-the-badge&logo=archlinux)](https://omarchy.org)
[![Quickshell Native](https://img.shields.io/badge/Quickshell-QML-violet.svg?style=for-the-badge&logo=qt)](https://quickshell.outfoxxed.me/)
[![Hyprland](https://img.shields.io/badge/Hyprland-Wayland-teal.svg?style=for-the-badge)](https://hyprland.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](./LICENSE)

<br/>

**The authentic, fluid, and pointer-coupled macOS floating dock for Omarchy Quattro & Hyprland.**

<br/>

![macOS Magnify Dock Preview](./preview.png)

</div>

---

## 🍎 The Authentic macOS Experience on Linux

While most Wayland docks use static, fixed-size icon slots, **macOS Magnify Dock** is built from the ground up to recreate the signature feel, physics, and fluid aesthetics of the genuine Apple macOS Dock.

Every animation runs at your monitor's native refresh rate (144Hz, 180Hz, 200Hz+) with GPU-accelerated Wayland layer-shell rendering, zero cursor stutter, and seamless Omarchy theme sync.

---

## ✨ Key Features

* 🌊 **Pointer-Coupled Magnification Wave** — Experience the iconic macOS parabolic zoom wave. As your cursor glides across the dock, icons smoothly magnify up to 1.6× using a raised-cosine curve while neighboring icons seamlessly slide aside with fluid physical momentum.
* 🏀 **Launch Bounce Physics** — Just like on macOS, clicking to open an application sets the icon playfully bouncing in place until its Wayland window appears and settles smoothly into focus.
* 🪟 **Frosted Glass Floating Capsule** — Beautiful translucent glassmorphism with 3D top specular highlights, subtle borders, and smooth rounded corners ($18\text{px}$) that adapt to your Omarchy theme palette.
* 🔀 **Fluid Drag-and-Drop Reordering** — Long-click and drag pinned apps along the rail to reorder your favorites. Neighboring icons smoothly part ways in real time, settling with cubic easing upon release.
* 💡 **Live Running Indicators** — Unobtrusive running dots beneath open applications with real-time active window focus synchronization via Hyprland & Wayland `ToplevelManager`.
* ⏱️ **Intelligent Auto-Hide & Edge Reveal** — Keep the dock persistently visible with exclusive tiling space, or enable smooth edge-reveal auto-hide that glides into view when your pointer approaches the bottom edge.
* 🖱️ **Right-Click Context Menu** — Right-click any icon to bring windows to front, pin/unpin favorites ("Keep in Dock"), close active windows, or toggle dock preferences on the fly.
* 🖥️ **Native Multi-Monitor Support** — Automatically initializes independent, output-local dock instances across all connected displays without flickering or desync.
* ⚡ **Zero-Flicker Architecture** — Built natively on Quickshell and Wayland Layer Shell (`wlr-layer-shell`) with optimized input masks for flicker-free hover transitions.

---

## 📦 Installation

Install and enable the dock directly through the Omarchy CLI:

```bash
omarchy plugin add https://github.com/wisangdg/omarchy-magnify-dock.git --enable
```

To update to the latest version at any time:

```bash
omarchy plugin update wdg.magnify-dock --yes
```

---

## 🎮 Controls & Interaction

| Gesture / Action | Control | Description |
| :--- | :--- | :--- |
| **Open / Focus Window** | `Left-Click` | Opens the application (with launch bounce) or brings the running window to front. |
| **Context Menu** | `Right-Click` | Displays macOS-style context menu (Keep in Dock, Bring to Front, Close, Options). |
| **Quick Close / Unpin** | `Middle-Click` | Closes the running window, or toggles the application's pinned state. |
| **Reorder Favorites** | `Click & Drag` | Drag any pinned app along the dock rail to reorder. |
| **App Drawer / Launcher** | `Click 󰀻 Icon` | Toggles the native Omarchy application launcher (leftmost button). |
| **Reveal Dock** | `Cursor to Edge` | Instantly reveals the dock when in Auto-hide mode. |

---

## ⚙️ Configuration

Your preferences are automatically saved to `~/.config/omarchy/dock-pinned-macos.json`:

```json
{
  "version": 1,
  "autoHide": false,
  "reserveSpace": true,
  "pinned": [
    "vivaldi-stable",
    "elecwhat",
    "org.gnome.Nautilus",
    "org.mozilla.Thunderbird",
    "chromium",
    "antigravity-ide",
    "dev.zed.Zed",
    "io.github.troyeguo.koodo-reader"
  ]
}
```

* **`autoHide`** (`true` / `false`): Automatically slides the dock off-screen when inactive and reveals it upon touching the bottom screen edge.
* **`reserveSpace`** (`true` / `false`): Tells Hyprland to reserve exclusive screen space at the bottom so tiled windows stop cleanly above the dock capsule.
* **`pinned`** (array): The ordered list of desktop application IDs pinned to your dock favorites.

---

## 🛠️ Verification & Testing

This plugin includes an automated regression test suite ensuring zero regressions across window matching, pinned app persistence, and baseline geometry:

```bash
node tests/dock-regressions.cjs
omarchy plugin validate .
```

---

## 📄 License

Distributed under the [MIT License](./LICENSE).  
Copyright © 2026 Wisang Drillian Geni ([@wisangdg](https://github.com/wisangdg)).
