# 🚀 Locator-X: Advanced Locator Generator for Testers

**Locator-X** is a Chrome extension designed to help testers and automation engineers quickly generate, evaluate, and manage locators (XPath, CSS, Playwright, JSPath, jQuery, and more) directly from any webpage — including shadow DOM and iframe contexts.

Built by **Mahesh Mhetre**, a Java + Selenium tester who leveraged AI to architect a modular, theme-aware, and validation-driven extension.

---

## 🧠 Why Locator-X?

- 🔍 **Instant Locator Generation**: Hover or click on any element to get multiple locator types.
- ⚡ **Shadow DOM & Iframe Support**: Handles complex DOM structures with precision.
- 🎯 **Match Count & Uniqueness**: See how many elements match each locator.
- 🧪 **Evaluate & Save Locators**: Test locators live and save them with custom names.
- 🌗 **Theme Toggle**: Switch between light and dark UI for better visibility.
- 🎹 **Keyboard Shortcut**: Toggle capture mode with `Ctrl+Shift+X`.

---

## 📦 Installation Guide

### For Users
1. Clone or download the repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer Mode** (top right).
4. Click **Load unpacked** and select the `Locator-X` folder.
5. **Important**: Enable the extension on `file://` URLs if you want to test on local HTML files:
   - Click on the extension details
   - Enable "Allow access to file URLs"

### For Developers
1. Clone the repository: `git clone <repository-url>`
2. No build process required - this is a pure vanilla JS extension
3. Load the extension as described above
4. Make changes and reload the extension to test

---

## 🧩 Folder Structure
    Locator-X/
    ├── icons/
    │   ├── icon16.png
    │   ├── icon48.png
    │   └── icon128.png
    ├── src/
    │   ├── background.js
    │   ├── content.js
    │   ├── content-iframe.js
    │   ├── highlight.css
    │   ├── sidepanel.html
    │   └── sidepanel.js
    ├── manifest.json
    ├── package.json
    ├── README.md


| Folder/File            | Purpose |
|------------------------|---------|
| `manifest.json`        | Extension configuration and permissions |
| `src/background.js`    | Handles tab events, capture mode, and messaging |
| `src/content.js`       | Core logic for locator generation and highlighting |
| `src/content-iframe.js`| Iframe-specific locator logic |
| `src/sidepanel.html`   | UI for locator evaluation and saved locators |
| `src/sidepanel.js`     | Logic for sidepanel interaction and storage |
| `src/highlight.css`    | Styling for highlighted elements |
| `icons/`               | Extension icons (16, 48, 128 px) |

---

## 🧪 Features Breakdown

### 🔍 Locator Types Supported

- **ID**
- **Name**
- **CSS Selector**
- **Relative XPath**
- **Absolute XPath**
- **Playwright Locator**
- **JSPath**
- **jQuery Selector**

Each locator includes:
- ✅ Match count
- ✅ Uniqueness badge
- ✅ Copy button
- ✅ Click-to-evaluate

---

### ⚡ Shadow DOM & Iframe Support

- Detects shadow hosts and children
- Traverses nested shadow roots
- Injects scripts into iframes
- Generates locators like:
  - `iframe#frameId >>> div.class`
  - `page.locator('#host').shadow().locator('input')`

---

### 🧪 Evaluation Panel

- Enter any locator to test it live
- See match count and highlight results
- Get syntax tips, breakdowns, and best practices
- Save evaluated locators with custom names
- Search and filter saved locators

---

### 🎹 Keyboard Shortcut

- `Ctrl+Shift+X` toggles capture mode
- Hover to preview locators
- Click to capture and send to sidepanel

---

## 🛠 Developer Notes

### 🧠 Built With AI Assistance

This extension was built using AI guidance to accelerate development. Mahesh focused on:

- Modular architecture
- Visual validation
- Theme-aware CSS
- Reversible system tweaks
- Clean separation of logic and UI

### 🧪 Testing Tips

- Use local HTML files or real web apps
- Avoid Chrome system pages (e.g., `chrome://`)
- Use the sidepanel to test and save locators

---

## 🧹 Troubleshooting

### ❌ Extension not loading?

- Ensure `manifest_version` is 3
- Check for missing icons or script paths
- Use `chrome://extensions/` → Inspect views → Console for errors
- Verify all permissions are granted in manifest.json

### ❌ Extension not working on certain pages?

- **Chrome system pages**: Extension cannot run on `chrome://`, `chrome-extension://`, or `chrome-devtools:` pages
- **Web Store pages**: Chrome blocks extensions on the Chrome Web Store
- **PDF files**: Limited functionality on PDF pages
- **Cross-origin iframes**: Some iframes may block content script injection

### ❌ Locator not matching?

- Check if the element is inside a shadow DOM (look for shadow indicators)
- Verify iframe context - use the `>>>` separator for iframe elements
- Ensure the element is visible and not dynamically generated after page load
- Try different locator types (CSS, XPath, Playwright) for better results

### ❌ Capture mode not working?

- Press `Ctrl+Shift+X` to toggle capture mode
- Check if the sidepanel is open (click the extension icon)
- Verify the page is supported (not a Chrome system page)
- Try refreshing the page and reloading the extension

### ❌ Performance issues?

- The extension uses debounced hover events (50ms delay)
- Large pages with many elements may be slower
- Consider using more specific locators to reduce match counts
- Close unused tabs to free up memory

### ❌ Theme not switching?

- Theme preference is stored in Chrome's local storage
- Try toggling the theme switch in the sidepanel
- Check if dark mode CSS variables are properly loaded

### 🔧 Advanced Debugging

1. **Check Extension Console**:
   - Go to `chrome://extensions/`
   - Find Locator-X and click "Inspect views" → "sidepanel.html"
   - Check for JavaScript errors

2. **Check Content Script**:
   - Open Developer Tools on any webpage (F12)
   - Look for content script errors in the Console tab
   - Verify content script injection with `window.captureMode`

3. **Check Background Script**:
   - Go to `chrome://extensions/`
   - Click "Inspect views" → "background page"
   - Monitor message passing between scripts

4. **Reset Extension State**:
   - Disable and re-enable the extension
   - Clear Chrome's local storage for the extension
   - Reload the extension from the extensions page

---

## 🌐 Browser Compatibility

### ✅ Supported
- **Google Chrome**: Version 88+ (Manifest V3 support)
- **Microsoft Edge**: Version 88+ (Chromium-based)
- **Brave Browser**: Latest versions
- **Opera**: Latest versions (Chromium-based)

### ❌ Not Supported
- **Firefox**: Uses different extension API (WebExtensions)
- **Safari**: Uses different extension system
- **Internet Explorer**: Deprecated browser

### 📋 Requirements
- Chrome/Chromium browser with Manifest V3 support
- Developer mode enabled for unpacked extensions
- Minimum Chrome version: 88 (for sidePanel API)

---

## 🚀 Features Overview

### 🎯 Locator Types Generated
- **ID**: `#elementId`
- **Name**: `[name="elementName"]`
- **CSS Selector**: `.class > element`
- **XPath**: `//div[@class='example']`
- **Playwright**: `text="Click me"`
- **JSPath**: `document.querySelector("selector")`
- **jQuery**: `$("selector")`

### 🔧 Advanced Features
- **Shadow DOM Support**: Handles open and closed shadow roots
- **Iframe Support**: Cross-frame element detection with `>>>` separator
- **Match Count Validation**: Shows how many elements match each locator
- **Uniqueness Detection**: Highlights unique vs non-unique locators
- **Element Hierarchy**: Visual tree view of DOM structure
- **Debounced Hover**: Performance-optimized element highlighting
- **Context Menu**: Right-click options for quick access
- **Keyboard Shortcuts**: `Ctrl+Shift+X` for capture mode toggle

---

---

## 🧠 Future Enhancements (Ideas)

- Export saved locators to JSON or CSV
- Add Selenium code snippets for each locator
- Integrate with VS Code or test frameworks
- Add auto-screenshot for captured elements

---

## 🙋‍♂️ About the Author

**Mahesh Mhetre** is a Java + Selenium automation tester with a passion for building tools that empower testers. Locator-X is his first Chrome extension, built with AI support and a deep understanding of real-world testing pain points.

---

## 📬 Feedback & Contributions

This project is open for feedback, ideas, and collaboration. If you’re a tester or developer who wants to improve locator workflows, feel free to fork, star, or reach out.

---