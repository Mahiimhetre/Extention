// ===============================
// LocatorX Content Script
// ===============================
// This script runs in the context of the web page and provides element locator generation,
// highlighting, shadow DOM support, and communication with the extension's background/popup scripts.

// Content script initialized

// --- State Variables ---
let captureMode = false; // Whether capture mode is active for element selection
let lastHighlighted = null; // Last highlighted element reference
let lastTooltip = null; // Last tooltip element reference

// ===============================
// Shadow DOM Support Functions
// ===============================

/**
 * Checks if the given element is inside a shadow DOM.
 * @param {Element} element
 * @returns {boolean}
 */
function isShadowElement(element) {
    return element.getRootNode().nodeType === Node.DOCUMENT_FRAGMENT_NODE;
}

/**
 * Returns the shadow DOM depth of an element.
 * @param {Element} element
 * @returns {number}
 */
function getShadowDepth(element) {
    let depth = 0;
    let current = element;
    while (current) {
        const root = current.getRootNode();
        if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && root.host) {
            depth++;
            current = root.host;
        } else {
            break;
        }
    }
    return depth;
}

/**
 * Gets the shadow DOM mode ('open' or 'closed') for an element.
 * @param {Element} element
 * @returns {string|null}
 */
function getShadowMode(element) {
    const root = element.getRootNode();
    if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        return root.mode || 'closed';
    }
    return null;
}

/**
 * Checks if an element is a shadow host.
 * @param {Element} element
 * @returns {boolean}
 */
function isShadowHost(element) {
    return !!element.shadowRoot;
}

/**
 * Gets information about the shadow root of an element.
 * @param {Element} element
 * @returns {object|null}
 */
function getShadowRootInfo(element) {
    if (!isShadowHost(element)) return null;
    const shadowRoot = element.shadowRoot;
    return {
        mode: shadowRoot ? shadowRoot.mode : 'closed',
        accessible: !!shadowRoot,
        childElementCount: shadowRoot ? shadowRoot.children.length : 0
    };
}

/**
 * Builds the shadow DOM path for an element.
 * @param {Element} element
 * @returns {Array}
 */
function getShadowPath(element) {
    const path = [];
    let current = element;
    while (current) {
        const root = current.getRootNode();
        if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && root.host) {
            path.unshift({
                host: root.host,
                mode: root.mode || 'closed',
                depth: path.length
            });
            current = root.host;
        } else {
            break;
        }
    }
    return path;
}

// ===============================
// Helper Functions
// ===============================

/**
 * Escapes a string for use in an XPath string literal.
 * @param {string} str
 * @returns {string}
 */
function escapeXPathString(str) {
    if (str.includes("'") && str.includes('"')) {
        const parts = str.split("'").map(p => `'${p}'`);
        return `concat(${parts.join(", \"'\", ")})`;
    } else if (str.includes("'")) {
        return `"${str}"`;
    } else {
        return `'${str}'`;
    }
}

// ===============================
// Highlight CSS Injection
// ===============================

/**
 * Injects the highlight CSS into the page if not already present.
 */
function injectCss() {
    // Check if already injected
    if (document.querySelector('#locatorx-highlight-styles')) return;
    const link = document.createElement('link');
    link.id = 'locatorx-highlight-styles';
    link.href = chrome.runtime.getURL('src/highlight.css');
    link.type = 'text/css';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
}

injectCss();

/**
 * Removes all highlight classes and tooltips from the document.
 */
function clearHighlights() {
    document.querySelectorAll('.sh-highlight').forEach(el => el.classList.remove('sh-highlight'));
    document.querySelectorAll('.sh-highlight-main').forEach(el => el.classList.remove('sh-highlight-main'));
    document.querySelectorAll('.sh-highlight-blocker').forEach(el => el.classList.remove('sh-highlight-blocker'));
    // Remove all depth highlight classes
    for (let i = 0; i <= 5; i++) {
        document.querySelectorAll(`.sh-highlight-depth-${i}`).forEach(el => el.classList.remove(`sh-highlight-depth-${i}`));
    }
    document.querySelectorAll('.sh-xpath-tooltip').forEach(el => el.remove());
    lastHighlighted = null;
    lastTooltip = null;
}

// ===============================
// Highlighting Functions
// ===============================

/**
 * Applies nested highlighting to a list of elements based on their DOM depth.
 * @param {Element[]} elements
 */
function applyNestedHighlighting(elements) {
    if (elements.length === 0) return;
    // Calculate nesting depth for each element
    const elementDepths = elements.map(el => {
        let depth = 0;
        let current = el.parentElement;
        // Count how many of the matched elements are ancestors
        while (current) {
            if (elements.includes(current)) {
                depth++;
            }
            current = current.parentElement;
        }
        return { element: el, depth };
    });
    // Apply color classes based on depth
    elementDepths.forEach(({ element, depth }, index) => {
        const colorDepth = Math.min(depth, 5); // Max 6 colors (0-5)
        element.classList.add(`sh-highlight-depth-${colorDepth}`);
        lastHighlighted = element;
    });
}

/**
 * Scrolls the page to bring the element into view.
 * @param {Element} el
 */
function scrollToElement(el) {
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// ===============================
// Locator Generation Functions
// ===============================

/**
 * Generates a CSS selector for the given element, supporting shadow DOM.
 * @param {Element} element
 * @returns {string}
 */
function generateShadowCssSelector(element) {
    if (!element || element.nodeType !== 1) return '';
    const shadowPath = getShadowPath(element);
    if (shadowPath.length > 0) {
        let selector = '';
        // Build the shadow path
        for (let i = 0; i < shadowPath.length; i++) {
            const host = shadowPath[i].host;
            const hostSelector = host.id ? `#${CSS.escape(host.id)}` : host.tagName.toLowerCase();
            selector += hostSelector + '::shadow ';
        }
        // Add the final element selector
        let elementSelector = element.tagName.toLowerCase();
        if (element.id) {
            elementSelector = `#${CSS.escape(element.id)}`;
        } else if (element.className) {
            const classList = Array.from(element.classList).filter(cls => !cls.startsWith('sh-highlight'));
            if (classList.length > 0) {
                elementSelector += `.${CSS.escape(classList[0])}`;
            }
        }
        return selector + elementSelector;
    }
    if (element.id) {
        return `#${CSS.escape(element.id)}`;
    }
    return element.tagName.toLowerCase();
}

/**
 * Generates a unique CSS selector for the given element.
 * @param {Element} element
 * @returns {string}
 */
function generateCssSelector(element) {
    if (!element || element.nodeType !== 1) return '';
    if (element.id && /^[a-zA-Z][\w-]*$/.test(element.id)) {
        const idSelector = `#${CSS.escape(element.id)}`;
        if (document.querySelectorAll(idSelector).length === 1) {
            return idSelector;
        }
    }
    const classList = Array.from(element.classList).filter(cls => !cls.startsWith('sh-highlight'));
    if (classList.length > 0) {
        for (const cls of classList.slice(0, 3)) {
            const selector = `.${CSS.escape(cls)}`;
            if (document.querySelectorAll(selector).length === 1) {
                return selector;
            }
        }
    }
    return getShortestCssPath(element);
}

/**
 * Builds the shortest unique CSS path for an element.
 * This function walks up the DOM tree from the given element, constructing a selector for each ancestor.
 * It tries to use IDs when available (and valid), otherwise uses tag names and :nth-child for uniqueness.
 * The function stops early if a unique selector is found at any point.
 * @param {Element} element - The DOM element to generate a unique CSS path for.
 * @returns {string} - The shortest unique CSS selector path for the element.
 */
function getShortestCssPath(element) {
    const path = [];
    let current = element;
    // Traverse up the DOM tree until reaching the root <html> element
    while (current && current !== document.documentElement) {
        let selector = current.tagName.toLowerCase();
        // Prefer using ID if available and valid, as it's unique in the document
        if (current.id && /^[a-zA-Z][\w-]*$/.test(current.id)) {
            selector = `#${CSS.escape(current.id)}`;
            path.unshift(selector);
            break; // ID is unique, so we can stop here
        }
        // If no ID, use :nth-child if there are siblings with the same tag name
        if (current.parentNode) {
            const siblings = Array.from(current.parentNode.children)
                .filter(sib => sib.tagName === current.tagName);
            if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += `:nth-child(${index})`;
            }
        }
        path.unshift(selector);
        // Test if the current path is unique in the document
        const testPath = path.join(' > ');
        if (document.querySelectorAll(testPath).length === 1) {
            return testPath;
        }
        current = current.parentNode;
    }
    // If no unique selector was found, return the full path
    return path.join(' > ');
}

// --- ID locator generation ---
// Attempts to generate a locator using the element's ID attribute, if it is unique and valid.
/**
 * Generates a locator using the element's ID attribute if it is unique and valid.
 * Returns the ID string if it is unique in the DOM, otherwise returns an empty string.
 * @param {Element} element
 * @returns {string}
 */
function generateIdLocator(element) {
    if (!element.id) return '';
    // Only allow valid IDs (must start with a letter)
    if (!/^[a-zA-Z][\w-]*$/.test(element.id)) return '';
    const root = element.getRootNode();
    const context = root.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? root : document;
    try {
        // Ensure the ID is unique within the context
        if (context.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1) {
            return element.id;
        }
    } catch (e) {
        return '';
    }
    return '';
}

// --- Name locator generation ---
// Generates a locator using the element's name attribute, if it is unique among form elements.
/**
 * Generates a locator using the element's name attribute if it is unique among form elements.
 * Returns the name string if it is unique, otherwise returns an empty string.
 * @param {Element} element
 * @returns {string}
 */
function generateNameLocator(element) {
    if (!element.name || !element.name.trim()) return '';
    const formElements = ['input', 'select', 'textarea', 'button'];
    if (!formElements.includes(element.tagName.toLowerCase())) return '';
    const root = element.getRootNode();
    const context = root.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? root : document;
    try {
        const nameSelector = `[name="${CSS.escape(element.name)}"]`;
        if (context.querySelectorAll(nameSelector).length === 1) {
            return element.name;
        }
    } catch (e) {
        return '';
    }
    return '';
}

// --- Playwright locator generation ---
// Attempts to generate a Playwright locator using test attributes, roles, or text content.
/**
 * Generates a Playwright locator string for the element.
 * Tries to use test attributes, ARIA roles, or text content for better stability.
 * Falls back to CSS selector if no better option is found.
 * @param {Element} element
 * @returns {string}
 */
function generatePlaywrightLocator(element) {
    const testAttrs = ['data-testid', 'data-test', 'data-cy'];
    for (const attr of testAttrs) {
        const val = element.getAttribute(attr);
        if (val) {
            return `[${attr}="${val}"]`;
        }
    }
    const role = element.getAttribute('role') || element.tagName.toLowerCase();
    const roleMap = {
        'button': 'button',
        'a': 'link', 
        'input': 'textbox',
        'select': 'combobox',
        'textarea': 'textbox'
    };
    if (roleMap[role] || element.getAttribute('role')) {
        const actualRole = element.getAttribute('role') || roleMap[role];
        const name = element.getAttribute('aria-label') || element.textContent?.trim();
        if (name && name.length < 50) {
            return `role=${actualRole}[name="${name}"]`;
        }
        return `role=${actualRole}`;
    }
    const interactiveElements = ['button', 'a', 'label'];
    if (interactiveElements.includes(element.tagName.toLowerCase())) {
        const text = element.textContent?.trim();
        if (text && text.length > 0 && text.length < 50) {
            return `text="${text}"`;
        }
    }
    if (element.tagName.toLowerCase() === 'input' && element.placeholder) {
        return `placeholder="${element.placeholder}"`;
    }
    const css = isShadowElement(element) ? generateShadowCssSelector(element) : generateCssSelector(element);
    return css || element.tagName.toLowerCase();
}

// --- Shadow-aware Playwright locator ---
// Generates a Playwright locator that works with shadow DOM elements by chaining .shadow() and .locator().
/**
 * Generates a Playwright locator string that supports shadow DOM traversal.
 * Chains .shadow() and .locator() for each shadow host in the path.
 * @param {Element} element
 * @returns {string}
 */
function generateShadowPlaywrightLocator(element) {
    if (!isShadowElement(element)) {
        return generatePlaywrightLocator(element);
    }
    const shadowPath = getShadowPath(element);
    if (shadowPath.length === 0) {
        return generatePlaywrightLocator(element);
    }
    // Start with the outermost host
    const firstHost = shadowPath[0].host;
    const hostSelector = firstHost.id ? `#${firstHost.id}` : firstHost.tagName.toLowerCase();
    let locatorChain = `page.locator('${hostSelector}')`;
    // Add shadow() for each level
    for (let i = 0; i < shadowPath.length; i++) {
        locatorChain += '.shadow()';
        if (i < shadowPath.length - 1) {
            const nextHost = shadowPath[i + 1].host;
            const nextSelector = nextHost.id ? `#${nextHost.id}` : nextHost.tagName.toLowerCase();
            locatorChain += `.locator('${nextSelector}')`;
        }
    }
    // Add final element selector
    let elementSelector = '';
    if (element.id) {
        elementSelector = `#${element.id}`;
    } else if (element.textContent && element.textContent.trim()) {
        elementSelector = `text="${element.textContent.trim()}"`;
    } else {
        elementSelector = element.tagName.toLowerCase();
    }
    return locatorChain + `.locator('${elementSelector}')`;
}

// --- JSPath locator generation ---
// Generates a JSPath locator using document.querySelector for the element.
/**
 * Generates a JSPath locator using document.querySelector for the element.
 * Returns a string that can be evaluated in the browser console.
 * @param {Element} element
 * @returns {string}
 */
function generateJSPathLocator(element) {
    const cssSelector = isShadowElement(element) ? generateShadowCssSelector(element) : generateCssSelector(element);
    if (!cssSelector) return '';
    const escapedSelector = cssSelector.replace(/"/g, '\\"');
    return `document.querySelector("${escapedSelector}")`;
}

// --- jQuery locator generation ---
// Generates a jQuery-style locator for the element, using CSS selectors or :contains for text.
/**
 * Generates a jQuery-style locator for the element.
 * Uses CSS selectors or :contains for text content if appropriate.
 * @param {Element} element
 * @returns {string}
 */
function generateJQueryLocator(element) {
    const css = isShadowElement(element) ? generateShadowCssSelector(element) : generateCssSelector(element);
    if (css) return css;
    const interactiveElements = ['button', 'a', 'span', 'div'];
    if (interactiveElements.includes(element.tagName.toLowerCase())) {
        const text = element.textContent?.trim();
        if (text && text.length > 0 && text.length < 30) {
            return `${element.tagName.toLowerCase()}:contains("${text}")`;
        }
    }
    return element.tagName.toLowerCase();
}

// --- XPath generation ---
// Attempts to generate both relative and absolute XPath locators for the element.
// Uses ID, stable attributes, or text content for a shorter XPath.
/**
 * Generates both relative and absolute XPath locators for the element.
 * Tries to use ID, stable attributes, or text content for a shorter XPath if possible.
 * Returns an object with relative and absolute XPath strings.
 * @param {Element} element
 * @returns {{relative: string, absolute: string, shadowAware?: boolean}}
 */
function generateXPath(element) {
    if (!element || element.nodeType !== 1) return { relative: '', absolute: '', shadowAware: false };

    // Try using ID if unique and valid
    if (element.id && /^[a-zA-Z][\w-]*$/.test(element.id)) {
        const idXpath = `//*[@id=${escapeXPathString(element.id)}]`;
        try {
            const result = document.evaluate(idXpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            if (result.snapshotLength === 1 && result.snapshotItem(0) === element) {
                return { relative: idXpath, absolute: getAbsoluteXPath(element) };
            }
        } catch (e) {
            // Continue
        }
    }

    // Try stable attributes
    const stableAttrs = ['data-testid', 'data-test', 'data-cy', 'name'];
    for (const attr of stableAttrs) {
        const val = element.getAttribute(attr);
        if (val && val.trim()) {
            const xpath = `//*[@${attr}=${escapeXPathString(val)}]`;
            try {
                const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                if (result.snapshotLength === 1 && result.snapshotItem(0) === element) {
                    return { relative: xpath, absolute: getAbsoluteXPath(element) };
                }
            } catch (e) {
                continue;
            }
        }
    }

    // Try text content for common interactive elements
    const interactiveElements = ['button', 'a', 'span', 'label'];
    if (interactiveElements.includes(element.tagName.toLowerCase())) {
        const text = element.textContent?.trim();
        if (text && text.length > 0 && text.length < 50) {
            const xpath = `//${element.tagName.toLowerCase()}[normalize-space(text())=${escapeXPathString(text)}]`;
            try {
                const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                if (result.snapshotLength === 1 && result.snapshotItem(0) === element) {
                    return { relative: xpath, absolute: getAbsoluteXPath(element) };
                }
            } catch (e) {
                // Continue
            }
        }
    }

    // Try to build the shortest unique path
    const shortest = getShortestUniquePath(element);
    if (shortest) return { relative: shortest, absolute: getAbsoluteXPath(element) };

    // Fallback to absolute XPath
    return { relative: getAbsoluteXPath(element), absolute: getAbsoluteXPath(element) };

    // --- Helper for shortest unique XPath ---
    function getShortestUniquePath(el) {
        const segments = [];
        while (el && el.nodeType === 1 && el !== document.body) {
            let tag = el.tagName.toLowerCase();
            let siblings = Array.from(el.parentNode ? el.parentNode.children : []).filter(sib => sib.tagName === el.tagName);
            let idx = siblings.length > 1 ? `[${1 + siblings.indexOf(el)}]` : '';
            segments.unshift(`${tag}${idx}`);
            const partialXpath = '//' + segments.join('/');
            const result = document.evaluate(partialXpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            if (result.snapshotLength === 1 && result.snapshotItem(0) === element) {
                return partialXpath;
            }
            el = el.parentNode;
        }
        return null;
    }

    // --- Helper for absolute XPath ---
    function getAbsoluteXPath(el) {
        if (!el || el.nodeType !== 1) return '';
        let path = '';
        while (el && el.nodeType === 1) {
            let tag = el.tagName.toLowerCase();
            let siblings = Array.from(el.parentNode ? el.parentNode.children : []).filter(sib => sib.tagName === el.tagName);
            let idx = siblings.length > 1 ? `[${1 + siblings.indexOf(el)}]` : '';
            path = `/${tag}${idx}${path}`;
            el = el.parentNode;
        }
        return path;
    }
}

// Shadow-aware XPath generation
/**
 * Generates shadow-aware XPath locators for elements inside shadow DOM.
 * Returns an object with shadow-aware flags and shadow info if applicable.
 * @param {Element} element
 * @returns {{relative: string, absolute: string, shadowAware: boolean, shadowMode?: string, shadowDepth?: number}}
 */
function generateShadowXPath(element) {
    if (!element || element.nodeType !== 1) return { relative: '', absolute: '', shadowAware: false };
    
    if (isShadowElement(element)) {
        const mode = getShadowMode(element);
        const depth = getShadowDepth(element);
        
        return {
            relative: '',
            absolute: '',
            shadowAware: true,
            shadowMode: mode,
            shadowDepth: depth
        };
    }
    
    return generateXPath(element);
}

// --- Match count evaluation ---
/**
 * Returns the number of elements matched by a locator of a given type.
 * Supports CSS, XPath, id, name, JSPath, and Playwright locators.
 * @param {string} locator
 * @param {string} type
 * @returns {number}
 */
function getMatchCount(locator, type) {
    try {
        if (!locator) return 0;
        if (type === 'css' || type === 'jquery') {
            return document.querySelectorAll(locator).length;
        }
        if (type === 'xpath' || type === 'relativeXPath' || type === 'absoluteXPath') {
            const result = document.evaluate(locator, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            return result.snapshotLength;
        }
        if (type === 'id') {
            return document.querySelectorAll(`#${CSS.escape(locator)}`).length;
        }
        if (type === 'name') {
            return document.querySelectorAll(`[name="${CSS.escape(locator)}"]`).length;
        }
        if (type === 'jspath') {
            const match = locator.match(/^document\.querySelector\("(.*)"\)$/);
            if (match) {
                return document.querySelectorAll(match[1]).length;
            }
        }
        if (type === 'playwright') {
            if (locator.startsWith('page.locator(') && locator.includes('.shadow()')) {
                return evaluatePlaywrightShadowLocator(locator);
            }
            if (locator.startsWith('text=')) {
                const textToFind = locator.substring(5).replace(/^['"](.*)[']$/, '$1');
                return Array.from(document.querySelectorAll('*')).filter(el =>
                    el.innerText && el.innerText.trim().includes(textToFind)
                ).length;
            }
            if (locator.startsWith('role=')) {
                const roleToFind = locator.substring(5).replace(/^['"](.*)[']$/, '$1');
                return document.querySelectorAll(`[role="${CSS.escape(roleToFind)}"]`).length;
            }
            return document.querySelectorAll(locator).length;
        }
    } catch (e) {
        return 0;
    }
    return 0;
}

// --- Shadow-aware match count ---
/**
 * Returns the number of elements matched by a locator inside shadow DOM.
 * Handles shadow-aware selectors and Playwright shadow locators.
 * @param {string} locator
 * @param {string} type
 * @returns {number}
 */
function getShadowMatchCount(locator, type) {
    try {
        if (!locator) return 0;
        
        if (type === 'css' || type === 'jquery') {
            if (locator.includes('::shadow')) {
                return evaluateShadowSelector(locator).length;
            }
            
            // For non-shadow selectors in shadow context, search all shadow roots
            let count = 0;
            function searchShadowRoots(root) {
                root.querySelectorAll('*').forEach(el => {
                    if (el.shadowRoot) {
                        try {
                            count += el.shadowRoot.querySelectorAll(locator).length;
                            searchShadowRoots(el.shadowRoot);
                        } catch (e) {
                            // Invalid selector
                        }
                    }
                });
            }
            searchShadowRoots(document);
            return count;
        }
        
        if (type === 'relativeXPath' || type === 'absoluteXPath') {
            return 0; // XPath doesn't work in shadow DOM
        }
        
        if (type === 'jspath') {
            return 0; // JSPath doesn't work in shadow DOM
        }
        
        if (type === 'playwright') {
            if (locator.startsWith('page.locator(') && locator.includes('.shadow()')) {
                return evaluatePlaywrightShadowLocator(locator);
            }
        }
        
        return getMatchCount(locator, type);
    } catch (e) {
        return 0;
    }
}

// --- Shadow selector evaluation ---
/**
 * Evaluates a shadow DOM selector (with ::shadow) and returns matching elements.
 * @param {string} selector
 * @returns {Element[]}
 */
function evaluateShadowSelector(selector) {
    const matches = [];
    
    try {
        const parts = selector.split('::shadow');
        if (parts.length < 2) return matches;
        
        let currentElements = Array.from(document.querySelectorAll(parts[0].trim()));
        
        for (let i = 1; i < parts.length; i++) {
            const newElements = [];
            const shadowSelector = parts[i].trim();
            
            currentElements.forEach(host => {
                const shadowRoot = host.shadowRoot;
                if (shadowRoot) {
                    try {
                        if (i === parts.length - 1) {
                            // Last part - select the actual elements
                            newElements.push(...Array.from(shadowRoot.querySelectorAll(shadowSelector)));
                        } else {
                            // Intermediate part - select shadow hosts
                            newElements.push(...Array.from(shadowRoot.querySelectorAll(shadowSelector)));
                        }
                    } catch (e) {
                        // Invalid selector
                    }
                }
            });
            
            currentElements = newElements;
        }
        
        matches.push(...currentElements);
    } catch (e) {
        console.warn('Shadow selector evaluation failed:', e);
    }
    
    return matches;
}

// --- Generate all locators for an element ---
/**
 * Generates all supported locator types for a given element.
 * Returns an object with locator values, match counts, and uniqueness flags.
 * @param {Element} element
 * @returns {object}
 */
function generateAllLocators(element) {
    if (!element || element.nodeType !== 1) {
        return {};
    }

    const idLocator = generateIdLocator(element);
    const nameLocator = generateNameLocator(element);
    const cssSelector = isShadowElement(element) ? generateShadowCssSelector(element) : generateCssSelector(element);
    const xpaths = isShadowElement(element) ? generateShadowXPath(element) : generateXPath(element);
    const playwrightLocator = isShadowElement(element) ? generateShadowPlaywrightLocator(element) : generatePlaywrightLocator(element);
    const jspathLocator = isShadowElement(element) ? '/* Not supported in Shadow DOM */' : generateJSPathLocator(element);
    const jqueryLocator = isShadowElement(element) ? generateShadowCssSelector(element) : generateJQueryLocator(element);

    const isInShadow = isShadowElement(element);
    const matchCountFn = isInShadow ? getShadowMatchCount : getMatchCount;
    
    const locators = {
        id: {
            value: idLocator || '',
            matchCount: matchCountFn(idLocator, 'id'),
        },
        name: {
            value: nameLocator || '',
            matchCount: matchCountFn(nameLocator, 'name'),
        },
        css: {
            value: cssSelector || '',
            matchCount: matchCountFn(cssSelector, 'css'),
            shadowAware: isInShadow
        },
        relativeXPath: {
            value: xpaths.relative || '',
            matchCount: xpaths.shadowAware ? 0 : matchCountFn(xpaths.relative, 'relativeXPath'),
            shadowAware: xpaths.shadowAware || false
        },
        absoluteXPath: {
            value: xpaths.absolute || '',
            matchCount: xpaths.shadowAware ? 0 : matchCountFn(xpaths.absolute, 'absoluteXPath'),
            shadowAware: xpaths.shadowAware || false
        },
        playwright: {
            value: playwrightLocator || '',
            matchCount: matchCountFn(playwrightLocator, 'playwright'),
        },
        jspath: {
            value: jspathLocator || '',
            matchCount: matchCountFn(jspathLocator, 'jspath'),
        },
        jquery: {
            value: jqueryLocator || '',
            matchCount: matchCountFn(jqueryLocator, 'jquery'),
            shadowAware: isInShadow
        }
    };

    for (const key in locators) {
        locators[key].isUnique = locators[key].matchCount === 1;
    }

    return locators;
}

// Element blocking detection
function isBlocked(element) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const topEl = document.elementFromPoint(centerX, centerY);
    if (topEl !== element) {
        const blockerXpaths = generateXPath(topEl);
        return { blocker: topEl, blockerXpaths };
    }
    return null;
}

// Locator evaluation
function evaluateLocator(locator) {
    let matches = [];
    try {
        if (!locator || locator.trim() === '') {
            return [];
        }

        if (locator.includes('::shadow')) {
            matches = evaluateShadowSelector(locator);
            if (matches.length > 0) {
                scrollToElement(matches[0]);
                return matches;
            }
        }

        if (locator.startsWith('/') || locator.startsWith('(')) {
            const result = document.evaluate(locator, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            for (let i = 0; i < result.snapshotLength; i++) {
                matches.push(result.snapshotItem(i));
            }
        }
        else if (locator.startsWith('#') || locator.startsWith('.') || locator.includes('[') || locator.match(/^[a-zA-Z]+$/)) {
            if (locator === '.' || locator === '#') {
                console.warn(`CONTENT: Invalid CSS selector: "${locator}"`);
                return [];
            }
            matches = Array.from(document.querySelectorAll(locator));
            
            document.querySelectorAll('*').forEach(el => {
                if (el.shadowRoot) {
                    try {
                        matches.push(...Array.from(el.shadowRoot.querySelectorAll(locator)));
                    } catch (e) {
                        // Invalid selector
                    }
                }
            });
        }
        else if (locator.startsWith('text=')) {
            const textToFind = locator.substring(5).replace(/^['"](.*)[']$/, '$1');
            matches = Array.from(document.querySelectorAll('*')).filter(el =>
                el.innerText && el.innerText.trim().includes(textToFind)
            );
        }
        else if (locator.startsWith('role=')) {
            const roleToFind = locator.substring(5).replace(/^['"](.*)[']$/, '$1');
            matches = Array.from(document.querySelectorAll(`[role="${CSS.escape(roleToFind)}"]`));
        }
        else if (document.getElementById(locator)) {
            matches.push(document.getElementById(locator));
        }
        else if (document.getElementsByName(locator).length > 0) {
            matches.push(...Array.from(document.getElementsByName(locator)));
        }
        else {
            try {
                const tagMatches = Array.from(document.querySelectorAll(locator));
                if (tagMatches.length > 0) {
                    matches = tagMatches;
                } else {
                    matches = Array.from(document.querySelectorAll('*')).filter(el =>
                        el.textContent && el.textContent.trim().toLowerCase().includes(locator.toLowerCase())
                    );
                }
            } catch (e) {
                matches = Array.from(document.querySelectorAll('*')).filter(el =>
                    el.textContent && el.textContent.trim().toLowerCase().includes(locator.toLowerCase())
                );
            }
        }

    } catch (e) {
        console.error("CONTENT: Error evaluating locator:", e);
    }
    if (matches.length > 0) {
        scrollToElement(matches[0]);
    }
    return matches;
}

// Event handlers
function processElementForLocators(el, opts = {}) {
    const locators = generateAllLocators(el);
    const blockerInfo = isBlocked(el);
    const isShadow = isShadowElement(el);
    let hierarchyData = undefined;
    let shadowInfo = undefined;
    let permanent = opts.permanent || false;
    let temporary = opts.temporary || false;

    if (isShadow) {
        hierarchyData = buildElementHierarchy(el);
        shadowInfo = {
            isInShadow: true,
            shadowDepth: getShadowDepth(el),
            shadowMode: getShadowMode(el),
            shadowPath: getShadowPath(el),
            isShadowHost: isShadowHost(el),
            shadowRootInfo: getShadowRootInfo(el)
        };
        permanent = true;
        temporary = false;
    }

    clearHighlights();
    el.classList.add('sh-highlight-main');
    lastHighlighted = el;

    if (blockerInfo && blockerInfo.blocker) {
        blockerInfo.blocker.classList.add('sh-highlight-blocker');
    }

    try {
        if (chrome.runtime && chrome.runtime.id) {
            chrome.runtime.sendMessage({
                action: 'showXPathInfo',
                id: locators.id?.value || '',
                name: locators.name?.value || '',
                cssSelector: locators.css?.value || '',
                relativeXPath: locators.relativeXPath?.value || '',
                absoluteXPath: locators.absoluteXPath?.value || '',
                playwrightLocator: locators.playwright?.value || '',
                jspathLocator: locators.jspath?.value || '',
                jqueryLocator: locators.jquery?.value || '',
                idMatchCount: locators.id?.matchCount || 0,
                nameMatchCount: locators.name?.matchCount || 0,
                cssMatchCount: locators.css?.matchCount || 0,
                relativeXPathMatchCount: locators.relativeXPath?.matchCount || 0,
                absoluteXPathMatchCount: locators.absoluteXPath?.matchCount || 0,
                playwrightMatchCount: locators.playwright?.matchCount || 0,
                jspathMatchCount: locators.jspath?.matchCount || 0,
                jqueryMatchCount: locators.jquery?.matchCount || 0,
                idUnique: locators.id?.isUnique || false,
                nameUnique: locators.name?.isUnique || false,
                cssUnique: locators.css?.isUnique || false,
                relativeXPathUnique: locators.relativeXPath?.isUnique || false,
                absoluteXPathUnique: locators.absoluteXPath?.isUnique || false,
                playwrightUnique: locators.playwright?.isUnique || false,
                jspathUnique: locators.jspath?.isUnique || false,
                jqueryUnique: locators.jquery?.isUnique || false,
                temporary,
                permanent,
                hierarchyData,
                shadowInfo
            });

            if (opts.statusBarText) {
                chrome.runtime.sendMessage({
                    action: 'statusBar',
                    text: opts.statusBarText
                });
            }
        }
    } catch (e) {
        // Could not send locator message
    }
}

function handleHover(e) {
    if (!captureMode || elementCaptured) return;
    
    // Debounce hover events to improve performance
    clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
        processHoverEvent(e);
    }, 50); // 50ms debounce
}

function processHoverEvent(e) {
    let el = e.target;
    // Use composedPath for shadow DOM elements, match click logic (original revert)
    if (e.composedPath && e.composedPath().length > 0) {
        el = e.composedPath()[0];
        if (el && el.nodeType === Node.TEXT_NODE) {
            el = el.parentElement;
        }
    }
    if (!(el instanceof HTMLElement)) return;

    if (isShadowElement(el)) {
        // Use capture strategy for shadow DOM elements
        const locators = generateAllLocators(el);
        const hierarchyData = buildElementHierarchy(el);
        const blockerInfo = isBlocked(el);
        const shadowInfo = {
            isInShadow: true,
            shadowDepth: getShadowDepth(el),
            shadowMode: getShadowMode(el),
            shadowPath: getShadowPath(el),
            isShadowHost: isShadowHost(el),
            shadowRootInfo: getShadowRootInfo(el)
        };
        clearHighlights();
        el.classList.add('sh-highlight-main');
        lastHighlighted = el;
        if (blockerInfo && blockerInfo.blocker) {
            blockerInfo.blocker.classList.add('sh-highlight-blocker');
        }
        try {
            if (chrome.runtime && chrome.runtime.id) {
                const messageData = {
                    action: 'showXPathInfo',
                    id: locators.id?.value || '',
                    name: locators.name?.value || '',
                    cssSelector: locators.css?.value || '',
                    relativeXPath: locators.relativeXPath?.value || '',
                    absoluteXPath: locators.absoluteXPath?.value || '',
                    playwrightLocator: locators.playwright?.value || '',
                    jspathLocator: locators.jspath?.value || '',
                    jqueryLocator: locators.jquery?.value || '',
                    idMatchCount: locators.id?.matchCount || 0,
                    nameMatchCount: locators.name?.matchCount || 0,
                    cssMatchCount: locators.css?.matchCount || 0,
                    relativeXPathMatchCount: locators.relativeXPath?.matchCount || 0,
                    absoluteXPathMatchCount: locators.absoluteXPath?.matchCount || 0,
                    playwrightMatchCount: locators.playwright?.matchCount || 0,
                    jspathMatchCount: locators.jspath?.matchCount || 0,
                    jqueryMatchCount: locators.jquery?.matchCount || 0,
                    idUnique: locators.id?.isUnique || false,
                    nameUnique: locators.name?.isUnique || false,
                    cssUnique: locators.css?.isUnique || false,
                    relativeXPathUnique: locators.relativeXPath?.isUnique || false,
                    absoluteXPathUnique: locators.absoluteXPath?.isUnique || false,
                    playwrightUnique: locators.playwright?.isUnique || false,
                    jspathUnique: locators.jspath?.isUnique || false,
                    jqueryUnique: locators.jquery?.isUnique || false,
                    permanent: true,
                    hierarchyData,
                    shadowInfo
                };
                chrome.runtime.sendMessage(messageData);
                chrome.runtime.sendMessage({
                    action: 'statusBar',
                    text: `Hovering: ${el.tagName.toLowerCase()}${el.id ? ' #' + el.id : ''}${el.className && !el.className.includes('sh-highlight') ? ' .' + el.className.split(' ')[0] : ''}`
                });
            }
        } catch (e) {
            // Could not send hover/capture shadow message
        }
    } else {
        processElementForLocators(el, {
            temporary: true,
            statusBarText: `Hovering: ${el.tagName.toLowerCase()}${el.id ? ' #' + el.id : ''}${el.className && !el.className.includes('sh-highlight') ? ' .' + el.className.split(' ')[0] : ''}`
        });
    }
}

function handleMouseOut(e) {
    if (!captureMode || elementCaptured) return;

    clearHighlights();
    try {
        if (chrome.runtime && chrome.runtime.id) {
            chrome.runtime.sendMessage({ action: 'clearTemporaryLocators' });
        }
    } catch (e) {
        // Could not send clear message
    }
}

// Element hierarchy builder
function buildElementHierarchy(targetElement) {
    const hierarchy = [];
    let current = targetElement;
    let targetIndex = 0;
    
    while (current && current !== document.documentElement) {
        const nodeData = {
            tagName: current.tagName,
            attributes: Array.from(current.attributes || []).map(attr => ({
                name: attr.name,
                value: attr.value.length > 50 ? attr.value.substring(0, 50) + '...' : attr.value
            })),
            textContent: current.childNodes.length === 1 && current.firstChild?.nodeType === 3 
                ? current.textContent.trim().substring(0, 30) : null,
            children: [],
            isShadowHost: isShadowHost(current),
            isShadowChild: isShadowElement(current),
            shadowDepth: getShadowDepth(current),
            shadowMode: getShadowMode(current),
            shadowPath: getShadowPath(current),
            shadowRootInfo: getShadowRootInfo(current)
        };
        
        if (hierarchy.length > 0) {
            nodeData.children = [hierarchy[0]];
        }
        
        if (current.parentNode) {
            const siblings = Array.from(current.parentNode.children)
                .filter(sibling => sibling !== current)
                .slice(0, 3)
                .map(sibling => ({
                    tagName: sibling.tagName,
                    attributes: Array.from(sibling.attributes || []).slice(0, 2).map(attr => ({
                        name: attr.name,
                        value: attr.value.length > 20 ? attr.value.substring(0, 20) + '...' : attr.value
                    })),
                    textContent: sibling.childNodes.length === 1 && sibling.firstChild?.nodeType === 3 
                        ? sibling.textContent.trim().substring(0, 20) : null,
                    children: []
                }));
            
            if (siblings.length > 0) {
                nodeData.children = [...siblings, ...nodeData.children];
            }
        }
        
        hierarchy.unshift(nodeData);
        
        if (current.parentNode && current.parentNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            current = current.parentNode.host;
        } else {
            current = current.parentNode;
        }
        targetIndex++;
    }
    
    return { hierarchy: hierarchy[0] || null, targetIndex };
}

let elementCaptured = false;
let hoverTimeout = null; // Debounce timeout for hover events

function handleClick(e) {
    if (!captureMode) return;
    
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    let el = e.target;
    
    // Use composedPath for shadow DOM elements
    if (e.composedPath && e.composedPath().length > 0) {
        el = e.composedPath()[0];
        
        if (el.nodeType === Node.TEXT_NODE) {
            el = el.parentElement;
        }
    }
    
    // Check for closed shadow DOM and show message
    if (el.shadowRoot === null && el.hasAttribute && 
        (el.classList?.contains('shadow-container') || el.id?.includes('shadowHost'))) {
        
        // Update status bar for closed shadow DOM
        try {
            if (chrome.runtime && chrome.runtime.id) {
                chrome.runtime.sendMessage({
                    action: 'statusBar',
                    text: `Captured: ${el.tagName.toLowerCase()}${el.id ? ' #' + el.id : ''} (Closed Shadow DOM - internal elements not accessible)`
                });
                
                chrome.runtime.sendMessage({
                    action: 'elementCaptured',
                    interceptingMsg: '⚠️ Closed Shadow DOM - Internal elements cannot be accessed'
                });
            }
        } catch (e) {
            // Could not send closed shadow DOM message
        }
    }
    
    if (!(el instanceof HTMLElement)) return;

    const locators = generateAllLocators(el);
    const hierarchyData = buildElementHierarchy(el);
    const blockerInfo = isBlocked(el);

    const locatorData = {
        id: locators.id?.value || '',
        name: locators.name?.value || '',
        cssSelector: locators.css?.value || '',
        relativeXPath: locators.relativeXPath?.value || '',
        absoluteXPath: locators.absoluteXPath?.value || '',
        playwrightLocator: locators.playwright?.value || '',
        jspathLocator: locators.jspath?.value || '',
        jqueryLocator: locators.jquery?.value || ''
    };

    const matchCounts = {
        idMatchCount: locators.id?.matchCount || 0,
        nameMatchCount: locators.name?.matchCount || 0,
        cssMatchCount: locators.css?.matchCount || 0,
        relativeXPathMatchCount: locators.relativeXPath?.matchCount || 0,
        absoluteXPathMatchCount: locators.absoluteXPath?.matchCount || 0,
        playwrightMatchCount: locators.playwright?.matchCount || 0,
        jspathMatchCount: locators.jspath?.matchCount || 0,
        jqueryMatchCount: locators.jquery?.matchCount || 0
    };

    const uniquenessFlags = {
        idUnique: locators.id?.isUnique || false,
        nameUnique: locators.name?.isUnique || false,
        cssUnique: locators.css?.isUnique || false,
        relativeXPathUnique: locators.relativeXPath?.isUnique || false,
        absoluteXPathUnique: locators.absoluteXPath?.isUnique || false,
        playwrightUnique: locators.playwright?.isUnique || false,
        jspathUnique: locators.jspath?.isUnique || false,
        jqueryUnique: locators.jquery?.isUnique || false
    };

    clearHighlights();
    el.classList.add('sh-highlight-main');
    lastHighlighted = el;

    if (blockerInfo && blockerInfo.blocker) {
        blockerInfo.blocker.classList.add('sh-highlight-blocker');
    }

    try {
        if (chrome.runtime && chrome.runtime.id) {
            const messageData = {
                action: 'showXPathInfo',
                ...locatorData,
                ...matchCounts,
                ...uniquenessFlags,
                hierarchyData: hierarchyData,
                shadowInfo: {
                    isInShadow: isShadowElement(el),
                    shadowDepth: getShadowDepth(el),
                    shadowMode: getShadowMode(el),
                    shadowPath: getShadowPath(el),
                    isShadowHost: isShadowHost(el),
                    shadowRootInfo: getShadowRootInfo(el)
                },
                permanent: true
            };
            chrome.runtime.sendMessage(messageData);

            // Update status bar to show captured element before turning off capture mode
            // Skip regular status update if it's closed shadow DOM (handled separately)
            if (!(el.shadowRoot === null && el.hasAttribute && 
                  (el.classList?.contains('shadow-container') || el.id?.includes('shadowHost')))) {
                chrome.runtime.sendMessage({
                    action: 'statusBar',
                    text: `Captured: ${el.tagName.toLowerCase()}${el.id ? ' #' + el.id : ''}${el.className && !el.className.includes('sh-highlight') ? ' .' + el.className.split(' ')[0] : ''}`
                });
            }
            
            elementCaptured = true;
            captureMode = false;
            chrome.runtime.sendMessage({ action: 'captureModeChanged', enabled: false });
            // Broadcast capture mode off to all frames
            chrome.runtime.sendMessage({ action: 'broadcastCaptureModeOff' });
        }
    } catch (e) {
        // Could not send click message
        captureMode = false;
    }
}

// Message listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    
    if (msg.action === 'ping') {
        sendResponse({status: "ok"});
        return true;
    }
    
    if (msg.action === 'keyboardToggle') {
        captureMode = !captureMode;
        elementCaptured = false; // Always reset captured flag on keyboard toggle
        if (!captureMode) {
            clearHighlights();
        }
        chrome.runtime.sendMessage({ action: 'captureModeChanged', enabled: captureMode });
    }
    
    if (msg.action === 'toggleCaptureMode') {
        captureMode = msg.enabled;
        elementCaptured = false; // Reset captured flag whenever mode is toggled
        if (!captureMode) {
            clearHighlights();
        }
        chrome.runtime.sendMessage({ action: 'captureModeChanged', enabled: captureMode });
    }

    if (msg.action === 'evaluateLocator') {
        clearHighlights();
        const matches = evaluateLocator(msg.locator);
        
        // Apply nested highlighting based on DOM depth
        applyNestedHighlighting(matches);
        
        chrome.runtime.sendMessage({ action: 'locatorMatchCount', count: matches.length });
        
        if (typeof sendResponse === 'function') {
            sendResponse({ count: matches.length });
        }
        return true;
    }

    if (msg.action === 'clearHighlights') {
        clearHighlights();
    }
    
    if (msg.action === 'requestXPathSuggestions') {
        const suggestions = generateAllLocatorSuggestions(msg.query);
        chrome.runtime.sendMessage({ 
            action: 'xpathSuggestionsResult', 
            suggestions: suggestions,
            query: msg.query
        });
    }
});

// Advanced and robust locator suggestion engine
function generateAllLocatorSuggestions(query) {
    const suggestions = new Map(); // Use Map to store suggestions with scores
    const lowerQuery = query.toLowerCase().trim();
    
    if (!lowerQuery || lowerQuery.length < 1) return [];
    
    // Smart pattern detection
    const isXPath = query.startsWith('/') || query.startsWith('(');
    const isCSS = query.startsWith('#') || query.startsWith('.') || query.includes('[');
    const isPlaywright = query.startsWith('text=') || query.startsWith('role=');
    
    // Context-aware pattern generation
    if (isXPath) {
        generateXPathSuggestions(query, suggestions);
    } else if (isCSS) {
        generateCSSSuggestions(query, suggestions);
    } else if (isPlaywright) {
        generatePlaywrightSuggestions(query, suggestions);
    } else {
        // Generate all types for ambiguous queries
        generateSmartSuggestions(query, suggestions);
    }
    
    // Find and rank matching elements
    rankElementMatches(query, suggestions);
    
    // Sort by relevance score and return top suggestions
    return Array.from(suggestions.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([suggestion]) => suggestion)
        .slice(0, 12);
}

// Generate XPath-specific suggestions
function generateXPathSuggestions(query, suggestions) {
    const patterns = [
        query + '[@id]',
        query + '[@class]',
        query + '[text()]',
        query + '[contains(@class, "")]',
        query + '[contains(text(), "")]',
        query + '[1]',
        query + '/following-sibling::*',
        query + '/parent::*'
    ];
    
    patterns.forEach(pattern => suggestions.set(pattern, 8));
}

// Generate CSS-specific suggestions
function generateCSSSuggestions(query, suggestions) {
    const patterns = [
        query + ':first-child',
        query + ':last-child',
        query + ':nth-child(1)',
        query + ' > *',
        query + ' + *',
        query + ':hover',
        query + ':focus',
        query + '[data-testid]'
    ];
    
    patterns.forEach(pattern => suggestions.set(pattern, 7));
}

// Generate Playwright-specific suggestions
function generatePlaywrightSuggestions(query, suggestions) {
    if (query.startsWith('text=')) {
        const text = query.substring(5);
        suggestions.set(`text="${text}"`, 9);
        suggestions.set(`text=/${text}/i`, 8);
    } else if (query.startsWith('role=')) {
        const role = query.substring(5);
        suggestions.set(`role=${role}[name]`, 8);
        suggestions.set(`role=${role}[checked]`, 7);
    }
}

// Generate smart suggestions for ambiguous queries
function generateSmartSuggestions(query, suggestions) {
    const lowerQuery = query.toLowerCase();
    
    // High-priority exact matches
    suggestions.set(`#${query}`, 10);
    suggestions.set(`.${query}`, 9);
    suggestions.set(`[name="${query}"]`, 9);
    suggestions.set(`[data-testid="${query}"]`, 9);
    
    // XPath suggestions
    suggestions.set(`//*[@id="${query}"]`, 8);
    suggestions.set(`//button[text()="${query}"]`, 8);
    suggestions.set(`//*[contains(@class, "${query}")]`, 7);
    suggestions.set(`//*[contains(text(), "${query}")]`, 7);
    
    // Playwright suggestions
    suggestions.set(`text="${query}"`, 8);
    suggestions.set(`placeholder="${query}"`, 7);
    
    // Context-based suggestions
    if (lowerQuery.includes('btn') || lowerQuery.includes('button')) {
        suggestions.set('button', 6);
        suggestions.set('role=button', 6);
        suggestions.set('//button', 5);
    }
    
    if (lowerQuery.includes('input') || lowerQuery.includes('field')) {
        suggestions.set('input', 6);
        suggestions.set('role=textbox', 6);
        suggestions.set('//input', 5);
    }
    
    if (lowerQuery.includes('link')) {
        suggestions.set('a', 6);
        suggestions.set('role=link', 6);
        suggestions.set('//a', 5);
    }
}

// Fuzzy matching algorithm
function fuzzyMatch(str, pattern) {
    const strLower = str.toLowerCase();
    const patternLower = pattern.toLowerCase();
    
    if (strLower.includes(patternLower)) return 10;
    
    let score = 0;
    let patternIndex = 0;
    
    for (let i = 0; i < strLower.length && patternIndex < patternLower.length; i++) {
        if (strLower[i] === patternLower[patternIndex]) {
            score += 1;
            patternIndex++;
        }
    }
    
    return patternIndex === patternLower.length ? score : 0;
}

// Rank element matches with intelligent scoring
function rankElementMatches(query, suggestions) {
    try {
        const elements = document.querySelectorAll('*');
        const lowerQuery = query.toLowerCase();
        
        Array.from(elements).forEach(el => {
            let maxScore = 0;
            const locators = generateAllLocators(el);
            
            // Score each locator type
            Object.entries(locators).forEach(([type, locator]) => {
                if (!locator?.value) return;
                
                let score = 0;
                const value = locator.value.toLowerCase();
                
                // Exact match bonus
                if (value === lowerQuery) score += 15;
                
                // Fuzzy match score
                score += fuzzyMatch(value, lowerQuery);
                
                // Uniqueness bonus
                if (locator.isUnique) score += 5;
                
                // Type-specific bonuses
                if (type === 'id' && el.id) score += 3;
                if (type === 'css' && value.length < 30) score += 2;
                if (type === 'name' && el.name) score += 3;
                
                // Element context bonus
                if (el.tagName) {
                    const tag = el.tagName.toLowerCase();
                    if (lowerQuery.includes(tag)) score += 2;
                }
                
                if (score > maxScore) {
                    maxScore = score;
                    if (score > 5) {
                        suggestions.set(locator.value, score);
                    }
                }
            });
            
            // Text content matching
            if (el.textContent) {
                const text = el.textContent.trim();
                if (text.length < 50 && fuzzyMatch(text, lowerQuery) > 3) {
                    suggestions.set(`text="${text}"`, fuzzyMatch(text, lowerQuery) + 2);
                    suggestions.set(`//*[text()="${text}"]`, fuzzyMatch(text, lowerQuery) + 1);
                }
            }
        });
        
        // Add shadow DOM and iframe suggestions
        addAdvancedSuggestions(query, suggestions);
        
    } catch (e) {
        console.warn('Error in element ranking:', e);
    }
}

// Add advanced suggestions for shadow DOM and iframes
function addAdvancedSuggestions(query, suggestions) {
    const lowerQuery = query.toLowerCase();
    
    // Shadow DOM suggestions
    if (lowerQuery.includes('shadow')) {
        suggestions.set('#host::shadow element', 6);
        suggestions.set('page.locator("#host").shadow().locator("element")', 6);
    }
    
    // Iframe suggestions
    if (lowerQuery.includes('iframe') || lowerQuery.includes('frame')) {
        suggestions.set('iframe#frameId >>> element', 6);
        suggestions.set('iframe[name="frameName"] >>> element', 5);
    }
    
    // Common test patterns
    if (lowerQuery.includes('test')) {
        suggestions.set('[data-testid*="test"]', 7);
        suggestions.set('[data-test*="test"]', 6);
        suggestions.set('[data-cy*="test"]', 6);
    }
}

// Event listeners
document.addEventListener('mouseover', handleHover, true);
document.addEventListener('mouseout', handleMouseOut, true);
document.addEventListener('click', handleClick, true);
document.addEventListener('mousedown', (e) => {
    if (captureMode) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    }
}, true);
document.addEventListener('mouseup', (e) => {
    if (captureMode) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    }
}, true);

// Initialize capture mode from storage
chrome.storage.local.get(['captureMode'], (result) => {
    captureMode = result.captureMode || false;
});

// Cleanup event listeners on page unload
window.addEventListener('beforeunload', () => {
    clearTimeout(hoverTimeout);
    clearHighlights();
    document.removeEventListener('mouseover', handleHover, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.removeEventListener('click', handleClick, true);
});

// Load iframe support
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadIframeSupport);
} else {
    loadIframeSupport();
}

function loadIframeSupport() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/content-iframe.js');
    document.head.appendChild(script);
}

// Add Playwright shadow locator match counting
function evaluatePlaywrightShadowLocator(locator) {
    try {
        const parts = locator.split('.shadow()');
        if (parts.length < 2) return 0;
        
        const firstMatch = parts[0].match(/page\.locator\(['"](.*?)['"]\)/);
        if (!firstMatch) return 0;
        
        let currentElements = Array.from(document.querySelectorAll(firstMatch[1]));
        
        for (let i = 1; i < parts.length; i++) {
            const newElements = [];
            
            currentElements.forEach(host => {
                if (host.shadowRoot) {
                    if (i === parts.length - 1) {
                        const finalMatch = parts[i].match(/\.locator\(['"](.*?)['"]\)/);
                        if (finalMatch) {
                            newElements.push(...Array.from(host.shadowRoot.querySelectorAll(finalMatch[1])));
                        }
                    } else {
                        const nextMatch = parts[i].match(/\.locator\(['"](.*?)['"]\)/);
                        if (nextMatch) {
                            newElements.push(...Array.from(host.shadowRoot.querySelectorAll(nextMatch[1])));
                        }
                    }
                }
            });
            
            currentElements = newElements;
        }
        
        return currentElements.length;
    } catch (e) {
        return 0;
    }
}
