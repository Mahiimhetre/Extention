// Minimal iframe support for LocatorX extension
let iframeElements = new Map();
let isInIframe = window !== window.top;

// Iframe detection and setup
function initializeIframeSupport() {
    document.querySelectorAll('iframe').forEach(setupIframeListeners);
    
    new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.tagName === 'IFRAME') setupIframeListeners(node);
                    node.querySelectorAll?.('iframe').forEach(setupIframeListeners);
                }
            });
        });
    }).observe(document.body, { childList: true, subtree: true });
}

function setupIframeListeners(iframe) {
    if (iframeElements.has(iframe)) return;
    
    const selector = getIframeSelector(iframe);
    iframeElements.set(iframe, { selector, loaded: false });
    
    iframe.addEventListener('load', () => {
        try {
            const iframeDoc = iframe.contentDocument;
            if (iframeDoc) {
                iframeElements.get(iframe).loaded = true;
                injectIframeScript(iframe);
            }
        } catch (e) {
            iframeElements.get(iframe).crossOrigin = true;
        }
    });
}

function getIframeSelector(iframe) {
    if (iframe.id) return `iframe#${CSS.escape(iframe.id)}`;
    if (iframe.name) return `iframe[name="${CSS.escape(iframe.name)}"]`;
    if (iframe.src) {
        const filename = iframe.src.split('/').pop();
        if (filename) return `iframe[src*="${CSS.escape(filename)}"]`;
    }
    const index = Array.from(document.querySelectorAll('iframe')).indexOf(iframe);
    return `iframe:nth-of-type(${index + 1})`;
}

function injectIframeScript(iframe) {
    try {
        const iframeDoc = iframe.contentDocument;
        if (!iframeDoc) return;
        
        const script = iframeDoc.createElement('script');
        script.textContent = `
            window.isIframeContent = true;
            window.parentIframeSelector = '${getIframeSelector(iframe)}';
            
            function forwardToParent(eventType, data) {
                window.parent.postMessage({
                    type: 'iframe-event',
                    eventType: eventType,
                    data: data,
                    iframeSelector: window.parentIframeSelector
                }, '*');
            }
        `;
        iframeDoc.head.appendChild(script);
        
        const link = iframeDoc.createElement('link');
        link.href = chrome.runtime.getURL('highlight.css');
        link.type = 'text/css';
        link.rel = 'stylesheet';
        iframeDoc.head.appendChild(link);
    } catch (e) {
        // Cannot inject into iframe - likely cross-origin
    }
}

// Enhanced locator generation with iframe support
function getElementIframe(element) {
    let current = element;
    while (current && current !== document.documentElement) {
        if (current.ownerDocument && current.ownerDocument !== document) {
            for (let [iframe] of iframeElements) {
                if (iframe.contentDocument === current.ownerDocument) {
                    return iframe;
                }
            }
        }
        current = current.parentNode;
    }
    return null;
}

// Override original functions to add iframe support
const originalGenerateCssSelector = window.generateCssSelector;
window.generateCssSelector = function(element) {
    if (!element || element.nodeType !== 1) return '';
    
    const iframe = getElementIframe(element);
    let prefix = '';
    let context = document;
    
    if (iframe) {
        prefix = getIframeSelector(iframe) + ' >>> ';
        context = iframe.contentDocument;
    }
    
    return prefix + originalGenerateCssSelector.call(this, element);
};

const originalGenerateXPath = window.generateXPath;
window.generateXPath = function(element) {
    if (!element || element.nodeType !== 1) return { relative: '', absolute: '', shadowAware: false, inIframe: false };
    
    const iframe = getElementIframe(element);
    const result = originalGenerateXPath.call(this, element);
    
    if (iframe) {
        const prefix = getIframeSelector(iframe) + ' >>> ';
        return {
            relative: prefix + result.relative,
            absolute: prefix + result.absolute,
            shadowAware: result.shadowAware,
            inIframe: true
        };
    }
    
    return { ...result, inIframe: false };
};

const originalGetMatchCount = window.getMatchCount;
window.getMatchCount = function(locator, type) {
    if (!locator) return 0;
    
    if (locator.includes(' >>> ')) {
        const [iframeSelector, elementSelector] = locator.split(' >>> ');
        const iframe = document.querySelector(iframeSelector);
        
        if (!iframe?.contentDocument) return 0;
        
        const iframeDoc = iframe.contentDocument;
        
        if (type === 'css' || type === 'jquery') {
            return iframeDoc.querySelectorAll(elementSelector).length;
        }
        if (type === 'xpath' || type === 'relativeXPath' || type === 'absoluteXPath') {
            const result = iframeDoc.evaluate(elementSelector, iframeDoc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            return result.snapshotLength;
        }
        return 0;
    }
    
    return originalGetMatchCount.call(this, locator, type);
};

const originalEvaluateLocator = window.evaluateLocator;
window.evaluateLocator = function(locator) {
    if (!locator?.trim()) return [];
    
    if (locator.includes(' >>> ')) {
        const [iframeSelector, elementSelector] = locator.split(' >>> ');
        const iframe = document.querySelector(iframeSelector);
        
        if (!iframe?.contentDocument) return [];
        
        const iframeDoc = iframe.contentDocument;
        let matches = [];
        
        if (elementSelector.startsWith('/') || elementSelector.startsWith('(')) {
            const result = iframeDoc.evaluate(elementSelector, iframeDoc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            for (let i = 0; i < result.snapshotLength; i++) {
                matches.push(result.snapshotItem(i));
            }
        } else {
            matches = Array.from(iframeDoc.querySelectorAll(elementSelector));
        }
        
        return matches;
    }
    
    return originalEvaluateLocator.call(this, locator);
};

// Initialize iframe support
initializeIframeSupport();

// Listen for iframe events
window.addEventListener('message', (event) => {
    if (event.data.type === 'iframe-event') {
        // Handle iframe events
        if (window.handleIframeEvent) {
            window.handleIframeEvent(event.data);
        }
    }
});

// LocatorX iframe support initialized