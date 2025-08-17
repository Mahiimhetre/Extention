// Evaluate a locator in all frames (main frame + iframes) and update the UI with the total match count
function evaluateLocatorInAllFrames(locator) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs.length) return;
        const tabId = tabs[0].id;
        chrome.webNavigation.getAllFrames({tabId}, function(frames) {
            let totalMatches = 0;
            let responses = 0;
            frames.forEach(frame => {
                chrome.tabs.sendMessage(
                    tabId,
                    {action: 'evaluateLocator', locator: locator},
                    {frameId: frame.frameId},
                    function(response) {
                        responses++;
                        if (response && typeof response.count === 'number') {
                            totalMatches += response.count;
                        }
                        // When all frames have responded, update the UI
                        if (responses === frames.length) {
                            // Update your UI with totalMatches
                            // Example: update a match count element
                            const matchCountElem = document.getElementById('matchCount');
                            if (matchCountElem) {
                                matchCountElem.textContent = totalMatches + ' matches';
                            }
                        }
                    }
                );
            });
        });
    });
}

// Usage example:
// evaluateLocatorInAllFrames('your-locator-here');
