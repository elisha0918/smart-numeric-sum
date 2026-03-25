# Smart Numeric Sum Extension

A Chrome extension that lets you select any area on screen, automatically recognizes numbers via OCR, and calculates the sum in real time. Completely free, all processing runs locally.

一個 Chrome 擴充功能，框選螢幕上任意區域的數字（包含圖片中的數字或網頁文字），自動 OCR 辨識並即時計算總和。完全免費，所有處理皆在本地完成。

## Features

- **Area Selection** — Draw a rectangle on any webpage to select numbers
- **Local OCR** — Powered by [Tesseract.js](https://github.com/naptha/tesseract.js), no cloud API needed
- **Instant Calculation** — Shows sum, average, and count in a floating popup
- **Draggable Results** — Drag the result window to avoid blocking content
- **Copy Support** — One-click copy for sum value or raw OCR text
- **Multiple Triggers** — Keyboard shortcut (`Ctrl+Shift+S`) or right-click context menu
- **Zero Cost** — Everything runs in your browser, no API keys or subscriptions

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the project folder
5. The extension icon will appear in your toolbar

## Usage

1. Press `Ctrl+Shift+S` (or `Cmd+Shift+S` on Mac), or right-click and select "智能數字選取合計"
2. Draw a rectangle around the numbers you want to calculate
3. Wait for OCR recognition (first run takes a few seconds to load the engine)
4. View results in the floating popup: sum, average, count, and recognized numbers
5. Click the copy button to copy the sum or raw text
6. Drag the title bar to reposition the popup, press `Esc` or click outside to close

## Architecture

```
├── manifest.json        # Chrome MV3 manifest
├── background.js        # Service Worker: shortcuts, context menu, screenshot, message routing
├── content.js/css       # Selection overlay UI + floating result popup
├── offscreen.html/js    # Offscreen Document: image cropping + Tesseract.js OCR
├── popup.html/js/css    # Extension popup panel
├── options.html/js/css  # Settings page (shortcut configuration)
├── lib/                 # Tesseract.js library (WASM engine + worker)
├── lang-data/           # OCR training data (English digits)
└── icons/               # Extension icons
```

**Data Flow:**

```
User triggers shortcut/menu
  → content.js: draw selection overlay
  → content.js: send coordinates to background
  → background.js: capture screenshot (captureVisibleTab)
  → background.js: forward to offscreen document
  → offscreen.js: crop image + Tesseract OCR
  → background.js: parse numbers, calculate sum/avg/count
  → content.js: display floating result popup
```

## Tech Stack

- **Chrome Extension Manifest V3**
- **Tesseract.js v5** — Client-side OCR via WebAssembly
- **Offscreen Document API** — Isolates heavy OCR processing from web pages
- **chrome.tabs.captureVisibleTab** — Screenshot capture
- **Vanilla JS/CSS** — No frameworks, minimal footprint

## Permissions

| Permission | Purpose |
|---|---|
| `activeTab` | Capture screenshot of current tab |
| `contextMenus` | Right-click menu entry |
| `offscreen` | Create offscreen document for OCR |
| `scripting` | Auto-inject content script after extension reload |
| `storage` | Store user preferences |

## License

MIT
