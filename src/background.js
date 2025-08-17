// background.js

// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "toggle-capture-mode",
        title: "Toggle Locator Capture Mode",
        contexts: ["page", "selection", "link", "image"]
    });
    
    chrome.contextMenus.create({
        id: "open-sidepanel",
        title: "Open Locator-X Panel",
        contexts: ["page"]
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "toggle-capture-mode") {
        chrome.tabs.sendMessage(tab.id, { action: 'keyboardToggle' });
    } else if (info.menuItemId === "open-sidepanel") {
        if (chrome.sidePanel && chrome.sidePanel.open) {
            chrome.sidePanel.open({ tabId: tab.id });
        }
    }
});

//to get keyboard Action(pressing keys)
chrome.commands.onCommand.addListener((command) => {
    //command for capture mode turn on/off via keyboard
    if (command === "toggle-capture-mode") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'keyboardToggle' });
            }
        });
    }
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
    if (chrome.sidePanel && chrome.sidePanel.open) {
        chrome.sidePanel.open({ tabId: tab.id });
    }
});

// Listen for tab activation and send message to sidepanel
chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.runtime.sendMessage({
        action: 'tabChanged',
        tabId: activeInfo.tabId
    }).catch(() => {}); // Ignore errors if sidepanel not open
});

// Listen for tab updates (URL changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) {
        chrome.runtime.sendMessage({
            action: 'tabUpdated',
            tabId: tabId,
            url: tab.url
        }).catch(() => {}); // Ignore errors if sidepanel not open
    }
});

// Listen for when the side panel is closed
if (chrome.sidePanel && chrome.sidePanel.onClosed) {
    chrome.sidePanel.onClosed.addListener((tabId) => {
        chrome.storage.local.set({ captureMode: false });
        // Send message to all frames in all tabs to turn off capture mode
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id, allFrames: true },
                    func: () => {
                        if (typeof window.captureMode !== 'undefined') window.captureMode = false;
                        if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
                            chrome.runtime.sendMessage({ action: 'toggleCaptureMode', enabled: false });
                        }
                    }
                }).catch(() => {}); // Ignore errors for closed tabs
            });
        });
    });
}

// Ensure capture mode is turned off when the extension is suspended/unloaded
chrome.runtime.onSuspend.addListener(() => {
    chrome.storage.local.set({ captureMode: false });
});

// Fallback: Listen for side panel disconnect (panel closed) using long-lived port
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'sidepanel') {
        port.onDisconnect.addListener(() => {
            chrome.storage.local.set({ captureMode: false });
            // Send message to all frames in all tabs to turn off capture mode
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach(tab => {
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id, allFrames: true },
                        func: () => {
                            window.postMessage({ action: 'toggleCaptureMode', enabled: false }, '*');
                            if (window.chrome && chrome.runtime && chrome.runtime.sendMessage) {
                                chrome.runtime.sendMessage({ action: 'toggleCaptureMode', enabled: false });
                            }
                        }
                    }).catch(() => {}); // Ignore errors for closed tabs
                });
            });
        });
    }
});