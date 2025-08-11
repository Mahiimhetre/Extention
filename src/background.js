// background.js

chrome.commands.onCommand.addListener((command) => {
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
    console.log("BACKGROUND: Opening side panel."); 
    if (chrome.sidePanel && chrome.sidePanel.open) {
        chrome.sidePanel.open({ tabId: tab.id });
    } else {
        console.warn("BACKGROUND: chrome.sidePanel API not available for opening."); 
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
        console.log(`BACKGROUND: Side panel for tab ${tabId} closed. Disabling capture mode.`);
        chrome.storage.local.set({ captureMode: false });
        chrome.tabs.sendMessage(tabId, { action: 'toggleCaptureMode', enabled: false }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn(`BACKGROUND: Error sending message to content script of tab ${tabId} on panel close:`, chrome.runtime.lastError.message);
            }
        });
    });
} else {
    console.warn('BACKGROUND: chrome.sidePanel.onClosed is not available in this Chrome version/environment. Consider updating Chrome or implementing a fallback.'); 
}