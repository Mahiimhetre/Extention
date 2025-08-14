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
                });
            });
        });
    });
} else {
    console.warn('BACKGROUND: chrome.sidePanel.onClosed is not available in this Chrome version/environment. Consider updating Chrome or implementing a fallback.'); 
}

// Ensure capture mode is turned off when the extension is suspended/unloaded
chrome.runtime.onSuspend.addListener(() => {
    console.log('BACKGROUND: Extension is being suspended/unloaded. Disabling capture mode.');
    chrome.storage.local.set({ captureMode: false });
});

// Fallback: Listen for side panel disconnect (panel closed) using long-lived port
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'sidepanel') {
        port.onDisconnect.addListener(() => {
            console.log('BACKGROUND: Side panel port disconnected. Disabling capture mode (fallback).');
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
                    });
                });
            });
        });
    }
});