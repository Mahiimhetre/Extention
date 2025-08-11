let lastDeletedLocator = null;
let lastDeletedIndex = null;
let undoTimeout = null;

function checkPageSupport() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs.length) {
            showNotSupportedBanner();
            return;
        }
        chrome.tabs.sendMessage(tabs[0].id, {action: "ping"}, function(response) {
            if (chrome.runtime.lastError || !response || response.status !== "ok") {
                showNotSupportedBanner();
            } else {
                hideNotSupportedBanner();
            }
        });
    });
}

// Initial setup
document.querySelector('.container').style.display = '';
initPanel();
checkPageSupport();

// Check page support every 200ms for faster response
setInterval(checkPageSupport, 200);

// Force check when sidepanel becomes visible
let lastActiveTabId = null;
setInterval(() => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs.length > 0 && tabs[0].id !== lastActiveTabId) {
            lastActiveTabId = tabs[0].id;
            checkPageSupport();
        }
    });
}, 100);

function showNotSupportedBanner() {
    const banner = document.getElementById('not-supported-banner');
    if (banner) {
        banner.style.display = 'block';
        banner.textContent = "This extension can't run on this page (e.g., Chrome system pages, the Web Store, or PDFs). Some features may not work.";
        banner.style.background = '#fff3cd';
        banner.style.color = '#856404';
        banner.style.border = '1px solid #ffeeba';
        banner.style.padding = '10px';
        banner.style.margin = '10px';
        banner.style.borderRadius = '5px';
        banner.style.fontSize = '1em';
        banner.style.textAlign = 'center';
        banner.style.zIndex = 1000;
    }
}

function hideNotSupportedBanner() {
    const banner = document.getElementById('not-supported-banner');
    if (banner) banner.style.display = 'none';
}

// Function to toggle capture mode hover status
function toggleCaptureMode(isOn) {
    if (isOn) {
        document.body.classList.add('capture-mode');
    } else {
        document.body.classList.remove('capture-mode');
    }
}

function initPanel() {
    const captureModeToggle = document.getElementById('captureModeToggle');
    const modeText = document.getElementById('modeText');
    const themeToggle = document.getElementById('themeToggle');
    const themeText = document.getElementById('themeText');
    const locatorInput = document.getElementById('locatorInput');
    const matchCount = document.getElementById('matchCount');

    // References to the locator value spans
    const idLocator = document.getElementById('idLocator');
    const nameLocator = document.getElementById('nameLocator');
    const cssLocator = document.getElementById('cssLocator');
    const relativeXPath = document.getElementById('relativeXPath');
    const absoluteXPath = document.getElementById('absoluteXPath');
    const playwrightLocator = document.getElementById('playwrightLocator');
    const jspathLocator = document.getElementById('jspathLocator');
    const jqueryLocator = document.getElementById('jqueryLocator');

    // References to the TABLE ROWS for each locator type
    const idLocatorRow = idLocator ? idLocator.closest('tr') : null;
    const nameLocatorRow = nameLocator ? nameLocator.closest('tr') : null;
    const cssLocatorRow = cssLocator ? cssLocator.closest('tr') : null;
    const relativeXPathRow = relativeXPath ? relativeXPath.closest('tr') : null;
    const absoluteXPathRow = absoluteXPath ? absoluteXPath.closest('tr') : null;
    const playwrightLocatorRow = playwrightLocator ? playwrightLocator.closest('tr') : null;
    const jspathLocatorRow = jspathLocator ? jspathLocator.closest('tr') : null;
    const jqueryLocatorRow = jqueryLocator ? jqueryLocator.closest('tr') : null;

    // References to the copy buttons for each locator type
    const copyCssLocatorButton = document.getElementById('copyCssLocatorButton');
    const copyRelativeXPathButton = document.getElementById('copyRelativeXPathButton');
    const copyAbsoluteXPathButton = document.getElementById('copyAbsoluteXPathButton');

    // Copy buttons for new locator types
    const copyIdLocatorButton = document.getElementById('copyIdLocatorButton');
    const copyNameLocatorButton = document.getElementById('copyNameLocatorButton');
    const copyPlaywrightLocatorButton = document.getElementById('copyPlaywrightLocatorButton');
    const copyJspathLocatorButton = document.getElementById('copyJspathLocatorButton');
    const copyJqueryLocatorButton = document.getElementById('copyJqueryLocatorButton');


    const messageArea = document.getElementById('messageArea');
    const statusBar = document.getElementById('statusBar');
    const interceptingMsg = document.getElementById('intercepting-msg');
    const savedXPathsList = document.getElementById('savedXPathsList'); 

    // Elements for XPath suggestions
    const xpathSuggestionsContainer = document.getElementById('xpathSuggestions');

    const clearLocatorButton = document.getElementById('clearLocatorButton'); // Reference to the "Clear Locator" button
    const saveEvaluatedLocatorButton = document.getElementById('saveEvaluatedLocatorButton'); // Reference to the "Save Evaluated Locator" button
    const evaluatedLocatorNameInput = document.getElementById('evaluatedLocatorNameInput');// Reference to the saved locator search input

    // Search input for saved locators
    const savedLocatorSearchInput = document.getElementById('savedLocatorSearchInput');
    let allSavedLocators = []; // Store all saved locators for filtering


    // Creating variables to store current generated locators (still used for generated list)
    let currentIdLocator = '';
    let currentNameLocator = '';
    let currentCssLocator = '';
    let currentRelativeXPath = '';
    let currentAbsoluteXPath = '';
    let currentPlaywrightLocator = '';
    let currentJspathLocator = '';
    let currentJqueryLocator = '';


    // State for suggestion navigation
    let currentSuggestionIndex = -1;
    let availableSuggestions = []; // Store the currently displayed suggestions


    function sendMessageToContentScript(action, payload = {}) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, { action, ...payload }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn('SIDEPANEL: Communication error:', chrome.runtime.lastError.message);
                        // Only show error for non-ping actions
                        if (action !== 'ping') {
                            showMessage('Communication error with webpage. Please ensure it\'s a regular page and refresh.', 'status-red');
                        }
                        
                        // Turn off capture mode when communication fails
                        if (action === 'toggleCaptureMode' && payload.enabled) {
                            captureModeToggle.checked = false;
                            modeText.textContent = 'Capture Mode: OFF (Ctrl+Shift+X)';
                            chrome.storage.local.set({ captureMode: false });
                        }
                    } else {
                        console.log('SIDEPANEL: Message sent successfully. Action:', action, 'Response:', response);
                    }
                });
            } else {
                console.warn('SIDEPANEL: No active tabs found to send message to.'); 
            }
        });
    }

    let debounceTimer;
    function debounce(func, delay) {
        return function (...args) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // Function to clear all locator outputs and hide their containers
    function clearAndHideAllLocators() {
        if (idLocator) idLocator.textContent = '';
        if (nameLocator) nameLocator.textContent = '';
        if (cssLocator) cssLocator.textContent = '';
        if (relativeXPath) relativeXPath.textContent = '';
        if (absoluteXPath) absoluteXPath.textContent = '';
        if (playwrightLocator) playwrightLocator.textContent = '';
        if (jspathLocator) jspathLocator.textContent = '';
        if (jqueryLocator) jqueryLocator.textContent = '';

        if (idLocatorRow) idLocatorRow.style.display = 'none';
        if (nameLocatorRow) nameLocatorRow.style.display = 'none';
        if (cssLocatorRow) cssLocatorRow.style.display = 'none';
        if (relativeXPathRow) relativeXPathRow.style.display = 'none';
        if (absoluteXPathRow) absoluteXPathRow.style.display = 'none';
        if (playwrightLocatorRow) playwrightLocatorRow.style.display = 'none';
        if (jspathLocatorRow) jspathLocatorRow.style.display = 'none';
        if (jqueryLocatorRow) jqueryLocatorRow.style.display = 'none';

        if (interceptingMsg) {
            interceptingMsg.textContent = '';
            interceptingMsg.style.display = 'none';
        }
        console.log('SIDEPANEL: All generated locator fields cleared and hidden.'); 
    }


    // Enhanced XPath syntax validation and smart error messages
    function validateXPath(xpath) {
        const errors = [];
        const suggestions = [];
        const tips = [];
        const warnings = [];
        
        // Critical syntax errors
        if (xpath.includes('[0]')) {
            errors.push('❌ XPath uses 1-based indexing! Use [1] instead of [0]');
        }
        if (xpath.includes('[@id=') && !xpath.match(/@id=['"][^'"]*['"]/) && !xpath.includes('="') && !xpath.includes("='")) {
            errors.push('❌ Attribute values must be quoted: [@id="value"]');
        }
        if (xpath.includes('[@') && !xpath.includes(']')) {
            errors.push('❌ Missing closing bracket ] for attribute filter');
        }
        if (xpath.includes('//[') && !xpath.match(/\/\/\w+\[/)) {
            errors.push('❌ Invalid syntax after //. Use //tagname[condition]');
        }
        
        // Advanced validation
        const unclosedParens = (xpath.match(/\(/g) || []).length - (xpath.match(/\)/g) || []).length;
        if (unclosedParens !== 0) {
            errors.push('❌ Unmatched parentheses in XPath expression');
        }
        
        // Performance warnings
        if (xpath.startsWith('/html/body') && xpath.length > 20) {
            warnings.push('⚠️ Long absolute XPath is fragile. Consider relative XPath with //');
        }
        if (xpath.includes('//*') || xpath.match(/\/\/\*\[/)) {
            warnings.push('⚠️ Wildcard (*) can be slow. Specify element type when possible');
        }
        if (xpath.match(/\/\/\w+\[\d+\]$/) && !xpath.includes('@')) {
            warnings.push('⚠️ Position-only selectors are brittle. Add attribute filters');
        }
        
        // Smart suggestions
        if (xpath.includes('[@class="') && xpath.match(/@class="[^"]*\s[^"]*"/)) {
            suggestions.push('💡 For multi-class elements, use contains(@class, "classname")');
        }
        if (xpath.includes('text()=') && !xpath.includes('normalize-space')) {
            suggestions.push('💡 Use normalize-space(text()) to handle whitespace properly');
        }
        if (xpath.match(/\[\d+\]/) && !xpath.includes('//')) {
            suggestions.push('💡 Make it relative: //' + xpath.replace(/^\//, ''));
        }
        if (xpath.includes('@id=') && !xpath.includes('contains')) {
            suggestions.push('💡 For partial ID match, use contains(@id, "partial")');
        }
        
        // Learning tips for beginners
        if (xpath === '//' || xpath === '/') {
            tips.push('📚 Add element type: //div, //input, //button');
        }
        if (xpath.length < 5 && xpath.includes('/')) {
            tips.push('📚 Try: //tagname[@attribute="value"]');
        }
        if (!xpath.includes('[') && xpath.length > 5 && xpath.includes('//')) {
            tips.push('💡 Add filters with []: //div[@class="example"]');
        }
        
        // Best practice tips
        if (xpath.includes('following-sibling') || xpath.includes('preceding-sibling')) {
            tips.push('🎯 Great use of sibling axes for navigation!');
        }
        if (xpath.includes('ancestor::') || xpath.includes('descendant::')) {
            tips.push('🎯 Advanced axis usage - excellent for complex navigation!');
        }
        
        return { errors, suggestions, tips, warnings };
    }
    
    // Enhanced error display with multiple message types
    function showXPathHelp(locator, errors, suggestions, tips, warnings) {
        let helpText = '';
        let statusClass = '';
        
        if (errors.length > 0) {
            helpText = errors[0];
            statusClass = 'status-red';
        } else if (warnings.length > 0) {
            helpText = warnings[0];
            statusClass = 'status-yellow';
        } else if (suggestions.length > 0) {
            helpText = suggestions[0];
            statusClass = 'status-blue';
        } else if (tips.length > 0) {
            helpText = tips[0];
            statusClass = 'status-green';
        }
        
        if (helpText) {
            showMessage(helpText, statusClass);
        }
    }
    
    // XPath step-by-step breakdown for learning
    function analyzeXPath(xpath) {
        if (!xpath.startsWith('/')) return null;
        
        const steps = [];
        const parts = xpath.split('/').filter(p => p);
        
        if (xpath.startsWith('//')) {
            steps.push('🔍 // = Search anywhere in document');
        } else {
            steps.push('📄 / = Start from document root');
        }
        
        parts.forEach((part, index) => {
            if (part === '') return;
            
            if (part.includes('[') && part.includes(']')) {
                const element = part.split('[')[0];
                const predicate = part.match(/\[([^\]]+)\]/)[1];
                
                steps.push(`🏷️ ${element} = Select ${element} element`);
                
                if (predicate.match(/^\d+$/)) {
                    steps.push(`🔢 [${predicate}] = Take the ${predicate}${getOrdinalSuffix(predicate)} match`);
                } else if (predicate.includes('@')) {
                    steps.push(`🏷️ [${predicate}] = Filter by attribute`);
                } else if (predicate.includes('text()')) {
                    steps.push(`📝 [${predicate}] = Filter by text content`);
                }
            } else {
                steps.push(`🏷️ ${part} = Select ${part} element`);
            }
        });
        
        return steps;
    }
    
    function getOrdinalSuffix(num) {
        const n = parseInt(num);
        if (n === 1) return 'st';
        if (n === 2) return 'nd';
        if (n === 3) return 'rd';
        return 'th';
    }
    
    // Update XPath breakdown display
    function updateXPathBreakdown(steps) {
        const xpathHelp = document.getElementById('xpathHelp');
        if (!xpathHelp) return;
        
        let breakdownSection = xpathHelp.querySelector('.breakdown-section');
        if (!breakdownSection) {
            breakdownSection = document.createElement('div');
            breakdownSection.className = 'breakdown-section help-section';
            xpathHelp.querySelector('.help-content').appendChild(breakdownSection);
        }
        
        breakdownSection.innerHTML = `
            <strong>🔍 XPath Breakdown:</strong><br>
            ${steps.map(step => `<div class="breakdown-step">${step}</div>`).join('')}
        `;
    }
    
    // Enhanced error display
    function showXPathHelp(locator, errors, suggestions) {
        let helpText = '';
        if (errors.length > 0) {
            helpText += '❌ ' + errors[0];
        } else if (suggestions.length > 0) {
            helpText += '💡 ' + suggestions[0];
        }
        
        if (helpText) {
            showMessage(helpText, errors.length > 0 ? 'status-red' : 'status-yellow');
        }
    }

    // Locator input event listener
    const debouncedEvaluateLocator = debounce(() => {
        const locator = locatorInput.value.trim();
        if (locator) {
            // XPath validation and breakdown for learning
            if (locator.startsWith('/') || locator.startsWith('(')) {
                const validation = validateXPath(locator);
                if (validation.errors.length > 0 || validation.warnings.length > 0 || validation.suggestions.length > 0 || validation.tips.length > 0) {
                    showXPathHelp(locator, validation.errors, validation.suggestions, validation.tips, validation.warnings);
                }
                
                // Show XPath breakdown for learning
                const breakdown = analyzeXPath(locator);
                if (breakdown && breakdown.length > 1) {
                    updateXPathBreakdown(breakdown);
                }
            }
            sendMessageToContentScript('evaluateLocator', { locator });
        } else {
            sendMessageToContentScript('clearHighlights');
            matchCount.textContent = '0 matches';
            clearAndHideAllLocators(); // Use the new function here
        }
    }, 150);

    // Add event listener for the locator input
    locatorInput.addEventListener('input', () => {
        currentSuggestionIndex = -1; // Reset suggestion index on new input
        xpathSuggestionsContainer.innerHTML = ''; // Clear previous suggestions and hide container immediately on new input
        xpathSuggestionsContainer.style.display = 'none';
        availableSuggestions = []; // Clear stored suggestions

        const query = locatorInput.value.trim();
        console.log('SIDEPANEL: locatorInput changed. Query:', query); 

        if (query.length > 0) {
            let suggestionTimeout;
            const DEBOUNCE_SUGGESTION_DELAY = 300;
            clearTimeout(suggestionTimeout);
            suggestionTimeout = setTimeout(() => {
                console.log('SIDEPANEL: Requesting suggestions for query:', query); 
                // Show suggestions container if it was hidden
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs.length > 0) {
                        chrome.tabs.sendMessage(tabs[0].id, { action: 'requestXPathSuggestions', query: query });
                    }
                });
            }, DEBOUNCE_SUGGESTION_DELAY);
        }

        debouncedEvaluateLocator();
    });

    // Keyboard navigation for suggestions
    locatorInput.addEventListener('keydown', (e) => {
        const suggestionItems = xpathSuggestionsContainer.querySelectorAll('.suggestion-item');
        if (suggestionItems.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault(); // Prevent cursor movement in input
                currentSuggestionIndex = (currentSuggestionIndex + 1) % suggestionItems.length;
                highlightSuggestion(suggestionItems);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault(); // Prevent cursor movement in input
                currentSuggestionIndex = (currentSuggestionIndex - 1 + suggestionItems.length) % suggestionItems.length;
                highlightSuggestion(suggestionItems);
            } else if (e.key === 'Enter') {
                e.preventDefault(); // Prevent form submission
                if (currentSuggestionIndex !== -1) {
                    // Select the highlighted suggestion
                    const selectedSuggestion = suggestionItems[currentSuggestionIndex].textContent;
                    locatorInput.value = selectedSuggestion;
                    hideSuggestions();
                    debouncedEvaluateLocator(); // Evaluate the selected suggestion
                    console.log('SIDEPANEL: Selected suggestion:', selectedSuggestion); 
                } else {
                    // If no suggestion is highlighted, just evaluate the current input
                    debouncedEvaluateLocator();
                    console.log('SIDEPANEL: Enter pressed, no suggestion highlighted. Evaluating current input.');
                }
            } else if (e.key === 'Escape') {
                e.preventDefault(); // Prevent browser default behavior
                hideSuggestions();
                console.log('SIDEPANEL: Escape pressed, hiding suggestions.'); 
            }
        } else if (e.key === 'Enter') {
            // If no suggestions are available, just evaluate the current input
            e.preventDefault(); // Prevent form submission
            debouncedEvaluateLocator();
            console.log('SIDEPANEL: Enter pressed, no suggestions available. Evaluating current input.'); 
        }
    });

    // Helper to highlight a suggestion
    function highlightSuggestion(items) {
        items.forEach((item, index) => {
            if (index === currentSuggestionIndex) {
                item.classList.add('selected-suggestion');
                item.scrollIntoView({ block: 'nearest' }); // Scroll to highlighted item
            } else {
                item.classList.remove('selected-suggestion');
            }
        });
    }

    // Helper to hide suggestions
    function hideSuggestions() {
        xpathSuggestionsContainer.innerHTML = '';
        xpathSuggestionsContainer.style.display = 'none';
        availableSuggestions = [];
        currentSuggestionIndex = -1;
    }

    // Add click listener for the Clear Locator Button
    if (clearLocatorButton) {
        clearLocatorButton.addEventListener('click', () => {
            locatorInput.value = ''; 
            sendMessageToContentScript('clearHighlights'); 
            matchCount.textContent = '0 matches';
            hideSuggestions(); 
        });
    }
    
    // Locator Help Toggle
    const xpathHelpToggle = document.getElementById('xpathHelpToggle');
    const xpathHelp = document.getElementById('xpathHelp');
    if (xpathHelpToggle && xpathHelp) {
        xpathHelpToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close hierarchy dropdown if open
            if (hierarchyDropdown) hierarchyDropdown.style.display = 'none';
            
            const isVisible = xpathHelp.style.display !== 'none';
            xpathHelp.style.display = isVisible ? 'none' : 'block';
            xpathHelpToggle.textContent = isVisible ? '❓' : '❌';
        });
        
        // Close help when clicking outside
        document.addEventListener('click', (e) => {
            if (!xpathHelp.contains(e.target) && !xpathHelpToggle.contains(e.target)) {
                xpathHelp.style.display = 'none';
                xpathHelpToggle.textContent = '❓';
            }
        });
        
        // Help navigation
        const helpNavBtns = xpathHelp.querySelectorAll('.help-nav-btn');
        const helpTabs = xpathHelp.querySelectorAll('.help-tab');
        
        helpNavBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetType = btn.dataset.type;
                
                // Update active button
                helpNavBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Update active tab
                helpTabs.forEach(tab => tab.classList.remove('active'));
                const targetTab = document.getElementById(targetType + '-help');
                if (targetTab) targetTab.classList.add('active');
            });
        });
    }

    // Listen for messages from content.js
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'locatorMatchCount') {
            matchCount.textContent = `${request.count} matches`;
        }
        if (request.action === 'clearTemporaryLocators') {
            if (request.temporary !== false) clearAndHideAllLocators();
        }
        if (request.action === 'clearLocatorInfo') {
            // Clear the locator display area in your UI
            clearAndHideAllLocators(); // Clear all locator fields
        }
        if (request.action === 'statusBar' && statusBar) {
            statusBar.textContent = request.text;
            console.log('SIDEPANEL: Status bar updated:', request.text);
        }
        
        if (request.action === 'elementCaptured' || request.action === 'showXPathInfo') {
            // Update status bar to show captured when element is clicked
            if (request.action === 'showXPathInfo' && statusBar && statusBar.textContent.includes('Hovering:')) {
                const capturedText = statusBar.textContent.replace('Hovering:', 'Captured:');
                statusBar.textContent = capturedText;
            }
            console.log('SIDEPANEL: Processing locator info for action:', request.action);
            console.log('SIDEPANEL: Incoming locator data:', {
                id: request.id,
                name: request.name,
                css: request.cssSelector,
                relativeXPath: request.relativeXPath,
                absoluteXPath: request.absoluteXPath,
                playwright: request.playwrightLocator,
                jspath: request.jspathLocator,
                jquery: request.jqueryLocator
            });
            console.log('SIDEPANEL: Match counts:', {
                id: request.idMatchCount,
                css: request.cssMatchCount,
                xpath: request.relativeXPathMatchCount
            });
            console.log('SIDEPANEL: Uniqueness flags:', {
                id: request.idUnique,
                css: request.cssUnique,
                xpath: request.relativeXPathUnique
            });
            
            // Show element hierarchy if available
            if (request.hierarchyData && request.permanent) {
                showElementHierarchy(request.hierarchyData);
            } else if (!request.permanent) {
                hideElementHierarchy();
            }

            // Update the display for captured locators
            currentIdLocator = request.id || '';
            currentNameLocator = request.name || '';
            currentCssLocator = request.cssSelector || '';
            currentRelativeXPath = request.relativeXPath || '';
            currentAbsoluteXPath = request.absoluteXPath || '';
            currentPlaywrightLocator = request.playwrightLocator || '';
            currentJspathLocator = request.jspathLocator || '';
            currentJqueryLocator = request.jqueryLocator || '';

            // Set content and show/hide table rows with match count and badge
            if (idLocator) {
                idLocator.textContent = currentIdLocator;
                if (idLocatorRow) idLocatorRow.style.display = currentIdLocator ? 'table-row' : 'none';
            }
            if (nameLocator) {
                nameLocator.textContent = currentNameLocator;
                if (nameLocatorRow) nameLocatorRow.style.display = currentNameLocator ? 'table-row' : 'none';
            }
            if (cssLocator) {
                cssLocator.textContent = currentCssLocator;
                if (cssLocatorRow) cssLocatorRow.style.display = currentCssLocator ? 'table-row' : 'none';
            }
            if (relativeXPath) {
                relativeXPath.textContent = currentRelativeXPath;
                if (relativeXPathRow) relativeXPathRow.style.display = currentRelativeXPath ? 'table-row' : 'none';
            }
            if (absoluteXPath) {
                absoluteXPath.textContent = currentAbsoluteXPath;
                if (absoluteXPathRow) absoluteXPathRow.style.display = currentAbsoluteXPath ? 'table-row' : 'none';
            }
            if (playwrightLocator) {
                playwrightLocator.textContent = currentPlaywrightLocator;
                if (playwrightLocatorRow) playwrightLocatorRow.style.display = currentPlaywrightLocator ? 'table-row' : 'none';
            }
            if (jspathLocator) {
                jspathLocator.textContent = currentJspathLocator;
                if (jspathLocatorRow) jspathLocatorRow.style.display = currentJspathLocator ? 'table-row' : 'none';
            }
            if (jqueryLocator) {
                jqueryLocator.textContent = currentJqueryLocator;
                if (jqueryLocatorRow) jqueryLocatorRow.style.display = currentJqueryLocator ? 'table-row' : 'none';
            }

            // Update match counts and uniqueness badges
            updateLocatorMatchCount('id', request.idMatchCount, request.idUnique);
            updateLocatorMatchCount('name', request.nameMatchCount, request.nameUnique);
            updateLocatorMatchCount('css', request.cssMatchCount, request.cssUnique);
            updateLocatorMatchCount('relative', request.relativeXPathMatchCount, request.relativeXPathUnique);
            updateLocatorMatchCount('absolute', request.absoluteXPathMatchCount, request.absoluteXPathUnique);
            updateLocatorMatchCount('playwright', request.playwrightMatchCount, request.playwrightUnique);
            updateLocatorMatchCount('jspath', request.jspathMatchCount, request.jspathUnique);
            updateLocatorMatchCount('jquery', request.jqueryMatchCount, request.jqueryUnique);
            
            // Show iframe indicator if element is in iframe
            if (request.inIframe) {
                showMessage('Element is inside an iframe 🖼️', 'iframe-info');
            }

            addGeneratedLocatorClickListeners();

            // Update message when element is captured but don't populate the locator input
            if (request.action === 'elementCaptured') {
                showMessage('Locator captured!', 'status-green');
                // Update status bar when element is captured - extract element info from statusBar text
                if (statusBar && statusBar.textContent.includes('Hovering:')) {
                    const hoveringText = statusBar.textContent;
                    const capturedText = hoveringText.replace('Hovering:', 'Captured:');
                    statusBar.textContent = capturedText;
                }
                // Removed auto-population of locatorInput.value
            }
            // This block is handled outside this if statement
            
            // If intercepting message is present, update it
            if (interceptingMsg) {
                if (request.interceptingMsg) {
                    interceptingMsg.textContent = request.interceptingMsg;
                    interceptingMsg.style.display = 'block';
                } else {
                    interceptingMsg.textContent = '';
                    interceptingMsg.style.display = 'none';
                }
            }
            
            // Add iframe indicators to locator rows
            addIframeIndicators(request);

            
        }
        
        // Handle captureModeChanged from content.js
        if (request.action === 'captureModeChanged') {
            console.log('SIDEPANEL: Received captureModeChanged. Enabled:', request.enabled);
            if (captureModeToggle) captureModeToggle.checked = !!request.enabled;
            if (modeText) modeText.textContent = `Capture Mode: ${request.enabled ? 'ON' : 'OFF'} (Ctrl+Shift+X)`;
            
            // Update hover status
            toggleCaptureMode(request.enabled);

           // Clear locator input and hide suggestions when capture mode changes
            if (!request.enabled) {
                // Don't update status bar when capture mode is turned off after capturing
                // Check if locators are empty before clearing
                if (!currentIdLocator && !currentNameLocator && !currentCssLocator && !currentRelativeXPath && !currentAbsoluteXPath && !currentPlaywrightLocator && !currentJspathLocator && !currentJqueryLocator) {
                     locatorInput.value = '';
                     hideSuggestions();
                     clearAndHideAllLocators();
                     if (statusBar) statusBar.textContent = 'Capture: OFF';
                     console.log('SIDEPANEL: Capture mode turned OFF, clearing all fields.'); 
                } else {
                    console.warn('SIDEPANEL: Capture mode turned OFF, but locators are present from a recent capture.');
                    // Keep the current status bar text showing captured element
                }
            } else { // If capture mode is turned ON, always clear previous state
                locatorInput.value = '';
                hideSuggestions();
                if (statusBar) statusBar.textContent = 'Capture: ON';
                // clearAndHideAllLocators();
                console.log('SIDEPANEL: Capture mode turned ON.'); 
            }
        }
        // Handle saved XPaths update from content.js
        if (request.action === 'xpathSuggestionsResult') {
            availableSuggestions = request.suggestions; // Store suggestions
            renderSuggestions(availableSuggestions); // Render and manage highlighting
        }
        if (request.action === 'showXPathInfo' && request.locators) {
            const locatorTypes = [
                'id', 'name', 'css', 'relativeXPath', 'absoluteXPath',
                'playwright', 'jspath', 'jquery'
            ];
            locatorTypes.forEach(type => {
                if (request.locators[type]) {
                    updateLocatorRow(type, request.locators[type]);
                }
            });
        }
    });

    // Function to show messages in the status bar
    function inferLocatorType(locatorString) {
        const trimmedLocator = locatorString.trim();

        if (trimmedLocator.startsWith('document.querySelector("') && trimmedLocator.endsWith('")')) {
            return 'JSPath (Query Selector)';
        }
        // 2. XPath
        if (trimmedLocator.startsWith('//') || trimmedLocator.startsWith('/') || trimmedLocator.startsWith('(')) {
            if (trimmedLocator.includes('[@id=')) return 'XPath (ID)';
            if (trimmedLocator.includes('[@name=')) return 'XPath (Name)';
            if (trimmedLocator.includes('text()=')) return 'XPath (Text)';
            if (trimmedLocator.includes('contains(@class')) return 'XPath (Class)';
            return 'XPath';
        }
        // 3. Playwright
        if (trimmedLocator.startsWith('text=')) return 'Playwright (Text)';
        if (trimmedLocator.startsWith('role=')) return 'Playwright (Role)';
        if (trimmedLocator.startsWith('css=')) return 'Playwright (CSS)';

        // 4. CSS Selector (includes jQuery)
        if (trimmedLocator.startsWith('#')) {
            return 'CSS Selector (ID)';
        }
        if (trimmedLocator.startsWith('.')) {
            return 'CSS Selector (Class)';
        }
        // Check for attribute selectors more robustly
        if (trimmedLocator.includes('[') && trimmedLocator.includes(']')) {
             if (trimmedLocator.includes('[name=')) return 'CSS Selector (Name)';
             if (trimmedLocator.includes('[data-')) return 'CSS Selector (Data Attribute)';
             if (trimmedLocator.includes('[href=')) return 'CSS Selector (Href Attribute)';
             if (trimmedLocator.includes('[type=')) return 'CSS Selector (Type Attribute)';
             return 'CSS Selector (Attribute)';
        }
        // Simple tag name (e.g., div, input)
        if (trimmedLocator.match(/^[a-zA-Z]+$/)) {
            return 'CSS Selector (Tag)';
        }
        // More complex CSS selectors (e.g., div > p, input[type="text"])
        if (trimmedLocator.includes('>') || trimmedLocator.includes('+') || trimmedLocator.includes('~') || trimmedLocator.includes(':')) {
            return 'CSS Selector';
        }

        // 5. jQuery Selector
        // Check for bare ID or Name patterns
        if (trimmedLocator.match(/^[a-zA-Z0-9_-]+$/)) {
            // For bare strings, we can't definitively say ID or Name without querying the DOM.
            // A generic but common type is best here.
            return 'Potential ID/Name';
        }

        return 'Unknown Locator Type';
    }


    // Function: Adds click listeners to generated locator spans
    function addGeneratedLocatorClickListeners() {
        const generatedLocators = [
            { element: idLocator, type: 'ID' },
            { element: nameLocator, type: 'Name' },
            { element: cssLocator, type: 'CSS Selector' },
            { element: relativeXPath, type: 'Relative XPath' },
            { element: absoluteXPath, type: 'Absolute XPath' },
            { element: playwrightLocator, type: 'Playwright Locator' },
            { element: jspathLocator, type: 'JSPath (Query Selector)' },
            { element: jqueryLocator, type: 'jQuery Locator' }
        ];

        generatedLocators.forEach(item => {
            if (item.element) {
                // Remove existing listener to prevent duplicates
                item.element.removeEventListener('click', item.element._clickHandler);

                // Store the handler on the element for easy removal later
                item.element._clickHandler = () => {
                    const locatorValue = item.element.textContent;
                    if (locatorValue && locatorValue !== 'N/A') {
                        locatorInput.value = locatorValue;
                        debouncedEvaluateLocator(); // Evaluate the locator
                        showMessage(`${item.type} loaded into evaluator!`, 'status-green');
                    } else {
                        showMessage(`No ${item.type} to evaluate!`, 'status-yellow');
                    }
                };
                item.element.addEventListener('click', item.element._clickHandler);
            }
        });
    }


    // Function to render suggestions in the dropdown
    function renderSuggestions(suggestions) {
        xpathSuggestionsContainer.innerHTML = '';
        if (suggestions && suggestions.length > 0) {
            console.log('SIDEPANEL: Rendering suggestions:', suggestions.length, 'items'); // DEBUG
            suggestions.forEach((sug, index) => {
                const div = document.createElement('div');
                div.classList.add('suggestion-item');
                div.textContent = sug;
                div.addEventListener('click', () => {
                    locatorInput.value = sug; // Apply suggestion to input
                    hideSuggestions();
                    debouncedEvaluateLocator();
                });
                // Add mouseover/mouseout for visual highlighting
                div.addEventListener('mouseover', () => {
                    currentSuggestionIndex = index;
                    highlightSuggestion(xpathSuggestionsContainer.querySelectorAll('.suggestion-item'));
                });
                div.addEventListener('mouseout', () => {
                    if (currentSuggestionIndex === index) {
                        currentSuggestionIndex = -1;
                        div.classList.remove('selected-suggestion');
                    }
                });
                xpathSuggestionsContainer.appendChild(div);
            });
            xpathSuggestionsContainer.style.display = 'block';
            // Highlight the first suggestion by default
            if (currentSuggestionIndex !== -1) {
                 highlightSuggestion(xpathSuggestionsContainer.querySelectorAll('.suggestion-item'));
            }
        } else {
            xpathSuggestionsContainer.style.display = 'none'; // Hide if no suggestions
        }
    }

    // Helper to update locator UI row
    function updateLocatorRow(locatorType, locatorData) {
        const locatorSpan = document.getElementById(locatorType + 'Locator');
        const matchCountSpan = document.getElementById(locatorType + 'MatchCount');
        const badgeSpan = document.getElementById(locatorType + 'Badge');
        locatorSpan.textContent = locatorData.value || '';
        matchCountSpan.textContent = locatorData.matchCount;
        matchCountSpan.classList.remove('unique', 'zero', 'multiple');
        badgeSpan.classList.remove('unique', 'zero', 'multiple');
        if (locatorData.matchCount === 1) {
            matchCountSpan.classList.add('unique');
            badgeSpan.textContent = 'Unique';
            badgeSpan.classList.add('unique');
        } else if (locatorData.matchCount === 0) {
            matchCountSpan.classList.add('zero');
            badgeSpan.textContent = 'Not Found';
            badgeSpan.classList.add('zero');
        } else {
            matchCountSpan.classList.add('multiple');
            badgeSpan.textContent = 'Multiple';
            badgeSpan.classList.add('multiple');
        }
    }

    // Helper to update match count and uniqueness for a locator type
    function updateLocatorMatchCount(locatorType, matchCount, isUnique) {
        const matchCountSpan = document.getElementById(locatorType + 'MatchCount');
        const badgeSpan = document.getElementById(locatorType + 'Badge');
        
        if (matchCountSpan) {
            matchCountSpan.textContent = matchCount || 0;
            matchCountSpan.classList.remove('unique', 'zero', 'multiple');
            
            if (matchCount === 1) {
                matchCountSpan.classList.add('unique');
            } else if (matchCount === 0) {
                matchCountSpan.classList.add('zero');
            } else {
                matchCountSpan.classList.add('multiple');
            }
        }
        
        if (badgeSpan) {
            badgeSpan.classList.remove('unique', 'zero', 'multiple');
            
            if (matchCount === 1) {
                badgeSpan.textContent = 'Unique';
                badgeSpan.classList.add('unique');
            } else if (matchCount === 0) {
                badgeSpan.textContent = 'Not Found';
                badgeSpan.classList.add('zero');
            } else {
                badgeSpan.textContent = 'Multiple';
                badgeSpan.classList.add('multiple');
            }
        }
    }

    // Hide suggestions when clicking outside the input/suggestions
    document.addEventListener('click', (event) => {
        if (!locatorInput.contains(event.target) && !xpathSuggestionsContainer.contains(event.target)) {
            hideSuggestions();
        }
    });


    // Load initial state and saved XPaths
    chrome.storage.local.get(['captureMode', 'isDarkTheme', 'savedXPaths'], (result) => {
        captureModeToggle.checked = !!result.captureMode;
        modeText.textContent = `Capture Mode: ${result.captureMode ? 'ON' : 'OFF'} (Ctrl+Shift+X)`;
        themeToggle.checked = !!result.isDarkTheme;
        themeText.textContent = `Theme: ${result.isDarkTheme ? 'Dark' : 'Light'}`;
        document.body.classList.toggle('dark-theme', !!result.isDarkTheme);
        
        // Initialize status bar
        if (statusBar) {
            statusBar.textContent = result.captureMode ? 'Capture: ON' : 'Capture: OFF';
        }

        // Move search input next to heading
        const savedSection = document.querySelector('.saved-xpaths-section');
        const sectionTitle = savedSection.querySelector('.section-title');
        const searchInput = document.getElementById('savedLocatorSearchInput');
        
        // Create header container
        const headerDiv = document.createElement('div');
        headerDiv.className = 'saved-locators-header';
        headerDiv.appendChild(sectionTitle);
        headerDiv.appendChild(searchInput);
        savedSection.insertBefore(headerDiv, savedSection.firstChild);

        allSavedLocators = result.savedXPaths || []; // Store all saved locators
        renderSavedXPaths(allSavedLocators); 
        clearAndHideAllLocators(); // Hide generated locators on initial load
        console.log('SIDEPANEL: Initial state loaded. Capture Mode:', result.captureMode, 'Theme:', result.isDarkTheme); 
    });

    // Capture mode toggle event listener
    captureModeToggle.addEventListener('change', () => {
        const enabled = captureModeToggle.checked;
        chrome.storage.local.set({ captureMode: enabled });
        modeText.textContent = `Capture Mode: ${enabled ? 'ON' : 'OFF'} (Ctrl+Shift+X)`;
        
        // Toggle hover status indicator
        toggleCaptureMode(enabled);
        
        // Force immediate status update
        if (statusBar) {
            statusBar.textContent = enabled ? 'Capture: ON' : 'Capture: OFF';
        }
        
        // Check if page is supported before sending messages (silent check)
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, {action: "ping"}, function(response) {
                    if (!chrome.runtime.lastError && response && response.status === "ok") {
                        // Page is supported, send toggle message with retry mechanism
                        // Send toggle message immediately
                        chrome.tabs.sendMessage(tabs[0].id, {action: 'toggleCaptureMode', enabled});
                        if (!enabled) {
                            chrome.tabs.sendMessage(tabs[0].id, {action: 'clearHighlights'});
                        }
                    } else {
                        // Page is unsupported, show message and turn off capture mode
                        if (enabled) {
                            showMessage('Cannot enable capture mode on this page type', 'status-yellow');
                            captureModeToggle.checked = false;
                            modeText.textContent = 'Capture Mode: OFF (Ctrl+Shift+X)';
                            chrome.storage.local.set({ captureMode: false });
                            if (statusBar) statusBar.textContent = 'Capture: OFF';
                        }
                    }
                });
            }
        });
        
        if (!enabled) {
            matchCount.textContent = '0 matches';
            clearAndHideAllLocators();
            if (statusBar) statusBar.textContent = 'Capture: OFF';
        }
        
        locatorInput.value = '';
        hideSuggestions();
        console.log('SIDEPANEL: Capture mode toggle changed to', enabled);
    });

    // Theme toggle event listener
    themeToggle.addEventListener('change', () => {
        const isDark = themeToggle.checked;
        chrome.storage.local.set({ isDarkTheme: isDark });
        themeText.textContent = `Theme: ${isDark ? 'Dark' : 'Light'}`;
        document.body.classList.toggle('dark-theme', isDark);
        console.log('SIDEPANEL: Theme toggle changed to Dark:', isDark);
    });

    // Copy CSS Locator Button
    if (copyCssLocatorButton) {
        copyCssLocatorButton.addEventListener('click', () => {
            const text = cssLocator.textContent;
            if (text && text !== 'N/A') {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                showMessage('CSS Selector copied!', 'status-green'); // Specific message
            } else {
                showMessage('No CSS Selector to copy!', 'status-yellow');
            }
        });
    }

    if (copyRelativeXPathButton) {
        copyRelativeXPathButton.addEventListener('click', () => {
            const text = relativeXPath.textContent;
            if (text && text !== 'N/A') {
                // Using a temporary textarea for document.execCommand('copy') for broader iFrame compatibility.
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                showMessage('Relative XPath copied!', 'status-green');
            } else {
                showMessage('No relative XPath to copy!', 'status-yellow');
            }
        });
    }
    if (copyAbsoluteXPathButton) {
        copyAbsoluteXPathButton.addEventListener('click', () => {
            const text = absoluteXPath.textContent;
            if (text && text !== 'N/A') {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                showMessage('Absolute XPath copied!', 'status-green');
            } else {
                showMessage('No absolute XPath to copy!', 'status-yellow');
            }
        });
    }

    // Copy button event listeners for new locator types
    if (copyIdLocatorButton) {
        copyIdLocatorButton.addEventListener('click', () => {
            const text = idLocator.textContent;
            if (text && text !== 'N/A') copyToClipboard(text, 'ID copied!');
            else showMessage('No ID to copy!', 'status-yellow');
        });
    }
    if (copyNameLocatorButton) {
        copyNameLocatorButton.addEventListener('click', () => {
            const text = nameLocator.textContent;
            if (text && text !== 'N/A') copyToClipboard(text, 'Name copied!');
            else showMessage('No Name to copy!', 'status-yellow');
        });
    }
    if (copyPlaywrightLocatorButton) {
        copyPlaywrightLocatorButton.addEventListener('click', () => {
            const text = playwrightLocator.textContent;
            if (text && text !== 'N/A') copyToClipboard(text, 'Playwright locator copied!');
            else showMessage('No Playwright locator to copy!', 'status-yellow');
        });
    }
    if (copyJspathLocatorButton) {
        copyJspathLocatorButton.addEventListener('click', () => {
            const text = jspathLocator.textContent;
            if (text && text !== 'N/A') copyToClipboard(text, 'JSPath locator copied!');
            else showMessage('No JSPath locator to copy!', 'status-yellow');
        });
    }
    if (copyJqueryLocatorButton) {
        copyJqueryLocatorButton.addEventListener('click', () => {
            const text = jqueryLocator.textContent;
            if (text && text !== 'N/A') copyToClipboard(text, 'jQuery locator copied!');
            else showMessage('No jQuery locator to copy!', 'status-yellow');
        });
    }

    // Helper for copy to clipboard
    function copyToClipboard(text, successMessage) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showMessage(successMessage, 'status-green');
    }

    function addGeneratedLocatorClickListeners() {
        const locatorTypes = [
            { id: 'idLocator', type: 'ID' },
            { id: 'nameLocator', type: 'Name' },
            { id: 'cssLocator', type: 'CSS Selector' },
            { id: 'relativeXPath', type: 'Relative XPath' },
            { id: 'absoluteXPath', type: 'Absolute XPath' },
            { id: 'playwrightLocator', type: 'Playwright Locator' },
            { id: 'jspathLocator', type: 'JSPath (Query Selector)' },
            { id: 'jqueryLocator', type: 'jQuery Locator' }
        ];
        locatorTypes.forEach(item => {
            const el = document.getElementById(item.id);
            if (el) {
                el.style.cursor = 'pointer';
                el.removeEventListener('click', el._locatorClickHandler);
                el._locatorClickHandler = () => {
                    const locatorValue = el.textContent.trim();
                    console.log('CLICKED', item.type, locatorValue);
                    if (locatorValue && locatorValue !== 'N/A') {
                        locatorInput.value = locatorValue;
                        debouncedEvaluateLocator();
                        showMessage(`${item.type} loaded into evaluator!`, 'status-green');
                    } else {
                        showMessage(`No ${item.type} to evaluate!`, 'status-yellow');
                    }
                };
                el.addEventListener('click', el._locatorClickHandler);
            }
        });
    }

    // Function to show messages in the status bar
    function saveEvaluatedLocator() {
        const locator = locatorInput.value;
        let locatorName = evaluatedLocatorNameInput.value.trim();
        const currentMatchCount = matchCount.textContent.match(/\d+/) ? parseInt(matchCount.textContent.match(/\d+/)[0]) : 0;
        
        const locatorType = inferLocatorType(locator); 
        const dateSaved = new Date().toISOString();

        if (!locator) {
            showMessage('Nothing to save. Please evaluate a locator first.', 'status-red');
            return;
        }

        // Determine if the name was provided by the user (i.e., not blank)
        let userProvidedName = !!locatorName; // True if locatorName is not empty after trim

        // If no name is provided by the user, generate a default name (Requirement 1)
        if (!userProvidedName) {
            locatorName = `Unnamed Locator - ${new Date().toLocaleString()}`;
        }

        chrome.storage.local.get(['savedXPaths'], (result) => {
            let savedXPaths = result.savedXPaths || [];
            let locatorFound = false;
            let message = '';
            let statusClass = '';

            savedXPaths = savedXPaths.map(item => {
                if (item.locator === locator) { // Found an existing locator with the same string
                    locatorFound = true;

                   // Check if the locator was already saved
                    const wasOriginalNameProvidedByUser = typeof item.wasNameProvidedByUser === 'boolean' ? item.wasNameProvidedByUser : true;

                    if (wasOriginalNameProvidedByUser === false) { // Original was saved without a user-provided name
                        if (userProvidedName) { // User is providing a name now
                            // Update the locator with the user-provided name
                            item.name = locatorName;
                            item.type = locatorType;
                            item.dateSaved = dateSaved;
                            item.wasNameProvidedByUser = true; // Mark as user-provided now
                            message = 'Locator name updated successfully!';
                            statusClass = 'status-green';
                            console.log('SIDEPANEL: Updated default-named locator to user-provided name:', item.id, item.name);
                        } else { 
                            message = 'Locator already saved without a specific name. No changes made.';
                            statusClass = 'status-yellow';
                            console.log('SIDEPANEL: Locator already exists with default name. No update needed.');
                        }
                    } else { 
                        if (item.name !== locatorName) { 
                            // User is trying to rename an existing locator with a user-provided name
                            message = 'Locator already saved with a custom name. Cannot rename this way.';
                            statusClass = 'status-red';
                            console.log('SIDEPANEL: Cannot rename locator with user-provided name.');
                            // We do NOT update item.name here if it was already user-provided.
                        } else { 
                            // User is trying to save with the exact same user-provided name
                            message = 'Locator already saved with this name. No changes made.';
                            statusClass = 'status-yellow';
                            console.log('SIDEPANEL: Locator already exists with same user-provided name. No update needed.');
                        }
                    }
                }
                return item;
            });

            if (!locatorFound) { 
                // If no existing locator was found, create a new one
                const newLocator = {
                    id: Date.now(),
                    locator: locator,
                    name: locatorName,
                    type: locatorType,
                    dateSaved: dateSaved,
                    matchCount: currentMatchCount,
                    wasNameProvidedByUser: userProvidedName // Store whether the name was provided by the user
                };
                savedXPaths.push(newLocator);
                message = 'Locator saved successfully!';
                statusClass = 'status-green';
                console.log('SIDEPANEL: New locator saved:', newLocator);
            }

            chrome.storage.local.set({ savedXPaths: savedXPaths }, () => {
                if (chrome.runtime.lastError) {
                    console.error('SIDEPANEL: Error saving locator:', chrome.runtime.lastError.message);
                    showMessage('Error saving locator! Check console.', 'status-red');
                } else {
                    showMessage(message, statusClass);
                    allSavedLocators = savedXPaths; 
                    renderSavedXPaths(allSavedLocators); 
                    // Clear the input fields after saving
                    if (statusClass !== 'status-red') {
                        //Clear the locator input and evaluated name input only if save was successful
                        evaluatedLocatorNameInput.value = '';
                    }
                }
            });
        });
    }

    // Add event listener for the Save Evaluated Locator button
    if (evaluatedLocatorNameInput && saveEvaluatedLocatorButton) {
        evaluatedLocatorNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                saveEvaluatedLocatorButton.click(); 
            }
        });
    }

    // Add click listener for the Save Evaluated Locator button
    if (saveEvaluatedLocatorButton) {
        saveEvaluatedLocatorButton.addEventListener('click', () => {
            saveEvaluatedLocator();
        });
    }

    // Function to render saved XPaths in the list
    function renderSavedXPaths(xpathsToRender) { 
        // Check if the savedXPathsList element exists
        savedXPathsList.innerHTML = ''; // Clear existing list
        if (xpathsToRender.length === 0) {
            savedXPathsList.innerHTML = '<p class="no-saved-xpaths">No saved locators yet.</p>';
            return;
        }

        xpathsToRender.forEach((xpathEntry, index) => {
            const xpathItem = document.createElement('div');
            xpathItem.classList.add('xpath-item');
            xpathItem.innerHTML = `
                <div class="xpath-item-header">
                    <span class="xpath-item-name">${xpathEntry.name}</span>
                    <button class="delete-xpath-button" data-id="${xpathEntry.id}" title="Delete Locator">✖</button>
                </div>
                <div class="xpath-item-content">
                    <div class="xpath-output-container">
                        <span class="output-label">${xpathEntry.type}:</span>
                        <span class="xpath-output" data-xpath-type="${xpathEntry.type.replace(/\s+/g, '-').toLowerCase()}">${xpathEntry.locator}</span>
                        ${xpathEntry.matchCount !== undefined ? `<span class="match-count" style="font-size: 7px; color: var(--secondary-text); margin-left: 5px;">(${xpathEntry.matchCount})</span>` : ''}
                        <button class="copy-button" data-copy-xpath="${xpathEntry.locator}" title="Copy Locator">
                            <svg class="icon-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                    </div>
                </div>
            `;
            savedXPathsList.appendChild(xpathItem);

            // Add click listener to the entire xpath item
            xpathItem.addEventListener('click', (e) => {
                // Don't trigger if clicking on delete or copy button
                if (e.target.closest('.delete-xpath-button') || e.target.closest('.copy-button')) {
                    return;
                }
                
                const locatorValue = xpathEntry.locator;
                if (locatorValue && locatorValue !== 'N/A') {
                    locatorInput.value = locatorValue; // Set the locator input value
                    sendMessageToContentScript('evaluateLocator', { locator: locatorValue });
                    showMessage(`'${xpathEntry.name}' highlighted on page`, 'status-green');
                    
                    // Highlight this item in the UI
                    const allItems = savedXPathsList.querySelectorAll('.xpath-item');
                    allItems.forEach(item => item.classList.remove('selected-item'));
                    xpathItem.classList.add('selected-item');
                }
            });
            
            // Add click listener to the locator value itself for backward compatibility
            const locatorOutputSpan = xpathItem.querySelector('.xpath-output');
            if (locatorOutputSpan) {
                locatorOutputSpan.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent triggering the parent click
                    const locatorValue = xpathEntry.locator;
                    if (locatorValue && locatorValue !== 'N/A') {
                        locatorInput.value = locatorValue; // Set the locator input value
                        sendMessageToContentScript('evaluateLocator', { locator: locatorValue });
                        showMessage(`'${xpathEntry.name}' highlighted on page`, 'status-green');
                    }
                });
            }
        });

        // Add event listeners to copy and delete buttons for saved XPaths
        savedXPathsList.querySelectorAll('.copy-button').forEach(button => {
            button.addEventListener('click', (e) => {
                // Get the locator from the saved data instead of the displayed text
                const xpathItem = button.closest('.xpath-item');
                const xpathId = xpathItem.querySelector('.delete-xpath-button').dataset.id;
                const savedLocator = allSavedLocators.find(l => l.id === parseInt(xpathId));
                
                if (savedLocator && savedLocator.locator) {
                    copyToClipboard(savedLocator.locator, 'Locator copied!');
                } else {
                    showMessage('Nothing to copy!', 'status-yellow');
                }
            });
        });

        savedXPathsList.querySelectorAll('.delete-xpath-button').forEach((button) => {
            button.addEventListener('click', (e) => {
                const idToDelete = parseInt(e.target.dataset.id);
                deleteLocatorById(idToDelete);
            });
        });
    }

    // Function to delete a locator by ID
    function deleteLocatorById(id) {
        const index = allSavedLocators.findIndex(l => l.id === id);
        if (index === -1) return;
        lastDeletedLocator = allSavedLocators[index];
        lastDeletedIndex = index;
        allSavedLocators.splice(index, 1);
        chrome.storage.local.set({ savedXPaths: allSavedLocators }, () => {
            renderSavedXPaths(allSavedLocators);
            showUndoButton();
        });
    }


    //function to undo the last deleted locator
    function showUndoButton() {
        const messageArea = document.getElementById('messageArea');
        messageArea.textContent = 'Locator deleted. ';
        const undoBtn = document.createElement('button');
        undoBtn.textContent = 'Undo';
        undoBtn.className = 'undo-btn';
        undoBtn.style.marginLeft = '5px';
        undoBtn.style.padding = '1px 6px';
        undoBtn.style.fontSize = '11px';
        undoBtn.style.backgroundColor = '#f0f0f0';
        undoBtn.style.border = '1px solid #ccc';
        undoBtn.style.borderRadius = '3px';
        undoBtn.style.cursor = 'pointer';
        undoBtn.onclick = function() {
            if (lastDeletedLocator && lastDeletedIndex !== null) {
                allSavedLocators.splice(lastDeletedIndex, 0, lastDeletedLocator);
                renderSavedXPaths(allSavedLocators);
                showMessage('Locator restored!', 'status-green');
                lastDeletedLocator = null;
                lastDeletedIndex = null;
                messageArea.innerHTML = '';
            }
        };
        messageArea.appendChild(undoBtn);
        clearTimeout(undoTimeout);
        undoTimeout = setTimeout(() => {
            messageArea.textContent = '';
            lastDeletedLocator = null;
            lastDeletedIndex = null;
        }, 5000);
    }
    
    const filterSavedLocators = debounce(() => { 
        const searchTerm = savedLocatorSearchInput.value.toLowerCase().trim();
        // Clear previous highlights
        sendMessageToContentScript('clearHighlights');
        
        if (searchTerm === '') {
            renderSavedXPaths(allSavedLocators);
            matchCount.textContent = '0 matches';
            return;
        }
        
        const filteredLocators = allSavedLocators.filter(locator => {
            const nameMatch = locator.name && locator.name.toLowerCase().includes(searchTerm);
            const locatorMatch = locator.locator && locator.locator.toLowerCase().includes(searchTerm);
            const typeMatch = locator.type && locator.type.toLowerCase().includes(searchTerm);
            return nameMatch || locatorMatch || typeMatch;
        });
        
        renderSavedXPaths(filteredLocators);
        
        // If we have exactly one filtered locator, evaluate and highlight it
        if (filteredLocators.length === 1) {
            const locator = filteredLocators[0].locator;
            sendMessageToContentScript('evaluateLocator', { locator });
            locatorInput.value = locator; // Set the locator in the input field
            showMessage(`Highlighting '${filteredLocators[0].name}'`, 'status-green');
        } else if (filteredLocators.length > 1) {
            matchCount.textContent = `${filteredLocators.length} locators found`;
        } else {
            matchCount.textContent = '0 matches';
        }
    }, 200); 

    // Add event listener for the search input
    if (savedLocatorSearchInput) { //
        savedLocatorSearchInput.addEventListener('input', filterSavedLocators); // Trigger filtering on input
    }

    // Element Hierarchy functionality
    let currentHierarchyData = null;
    const hierarchyDropdownToggle = document.getElementById('hierarchyDropdownToggle');
    const hierarchyDropdown = document.getElementById('hierarchyDropdown');
    const hierarchyTree = document.getElementById('hierarchyTree');
    const collapseAllBtn = document.getElementById('collapseAllBtn');
    const expandAllBtn = document.getElementById('expandAllBtn');

    function showElementHierarchy(elementData) {
        currentHierarchyData = elementData;
        if (hierarchyDropdownToggle) {
            hierarchyDropdownToggle.style.display = 'block';
            console.log('Hierarchy toggle shown');
        }
        renderHierarchyTree(elementData);
    }

    function hideElementHierarchy() {
        hierarchyDropdownToggle.style.display = 'none';
        hierarchyDropdown.style.display = 'none';
        currentHierarchyData = null;
    }

    if (hierarchyDropdownToggle && hierarchyDropdown) {
        hierarchyDropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close help popup if open
            if (xpathHelp) {
                xpathHelp.style.display = 'none';
                if (xpathHelpToggle) xpathHelpToggle.textContent = '❓';
            }
            
            const isVisible = hierarchyDropdown.style.display === 'block';
            hierarchyDropdown.style.display = isVisible ? 'none' : 'block';
        });
        
        // Close hierarchy dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!hierarchyDropdownToggle.contains(e.target) && !hierarchyDropdown.contains(e.target)) {
                hierarchyDropdown.style.display = 'none';
            }
        });
    }

    function renderHierarchyTree(data) {
        hierarchyTree.innerHTML = '';
        if (!data || !data.hierarchy) return;
        
        const tree = createHierarchyNode(data.hierarchy, data.targetIndex);
        hierarchyTree.appendChild(tree);
    }

    function createHierarchyNode(nodeData, targetIndex, currentIndex = 0) {
        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'hierarchy-node';
        
        const isTarget = currentIndex === targetIndex;
        if (isTarget) nodeDiv.classList.add('selected');
        
        // Add shadow DOM classes
        if (nodeData.isShadowHost) nodeDiv.classList.add('shadow-host');
        if (nodeData.isShadowChild) nodeDiv.classList.add('shadow-child');
        
        const hasChildren = nodeData.children && nodeData.children.length > 0;
        const toggle = hasChildren ? '▼' : '  ';
        
        // Perfect Shadow DOM indicators
        let shadowIndicator = '';
        let shadowDepthIndicator = '';
        
        if (nodeData.isShadowHost) {
            const mode = nodeData.shadowRootInfo?.mode || 'unknown';
            shadowIndicator = ` 🔒${mode === 'closed' ? '🔐' : ''}`;
        } else if (nodeData.isShadowChild) {
            const mode = nodeData.shadowMode || 'unknown';
            shadowIndicator = ` ⚡${mode === 'closed' ? '🔐' : ''}`;
        }
        
        if (nodeData.shadowDepth > 0) {
            shadowDepthIndicator = ` (depth: ${nodeData.shadowDepth})`;
        }
        
        nodeDiv.innerHTML = `
            <span class="hierarchy-toggle">${toggle}</span>
            <span class="hierarchy-element">&lt;${nodeData.tagName.toLowerCase()}</span>
            ${nodeData.attributes.map(attr => 
                `<span class="hierarchy-attribute"> ${attr.name}="${attr.value}"</span>`
            ).join('')}
            <span class="hierarchy-element">&gt;</span>
            ${shadowIndicator ? `<span class="shadow-indicator">${shadowIndicator}${shadowDepthIndicator}</span>` : ''}
            ${nodeData.textContent ? `<span class="hierarchy-text"> "${nodeData.textContent}"</span>` : ''}
        `;
        
        if (hasChildren) {
            const childrenDiv = document.createElement('div');
            childrenDiv.className = 'hierarchy-children';
            
            let childIndex = currentIndex + 1;
            nodeData.children.forEach(child => {
                const childNode = createHierarchyNode(child, targetIndex, childIndex);
                childrenDiv.appendChild(childNode);
                childIndex += countNodes(child);
            });
            
            nodeDiv.appendChild(childrenDiv);
            
            nodeDiv.querySelector('.hierarchy-toggle').addEventListener('click', (e) => {
                e.stopPropagation();
                nodeDiv.classList.toggle('collapsed');
                const toggleSpan = nodeDiv.querySelector('.hierarchy-toggle');
                toggleSpan.textContent = nodeDiv.classList.contains('collapsed') ? '▶' : '▼';
            });
        }
        
        nodeDiv.addEventListener('click', (e) => {
            if (e.target.classList.contains('hierarchy-toggle')) return;
            e.stopPropagation();
            
            // Generate locator for this element and highlight it
            const xpath = generateXPathFromHierarchy(nodeData, currentIndex, targetIndex);
            if (xpath) {
                locatorInput.value = xpath;
                sendMessageToContentScript('evaluateLocator', { locator: xpath });
                showMessage('Element highlighted from hierarchy', 'status-green');
            }
        });
        
        return nodeDiv;
    }

    function countNodes(nodeData) {
        let count = 1;
        if (nodeData.children) {
            nodeData.children.forEach(child => {
                count += countNodes(child);
            });
        }
        return count;
    }

    function generateXPathFromHierarchy(nodeData, nodeIndex, targetIndex) {
        // Simple XPath generation based on tag and attributes
        let xpath = `//${nodeData.tagName.toLowerCase()}`;
        
        // Add unique attributes if available
        const idAttr = nodeData.attributes.find(attr => attr.name === 'id');
        if (idAttr) {
            xpath += `[@id='${idAttr.value}']`;
        } else {
            const classAttr = nodeData.attributes.find(attr => attr.name === 'class');
            if (classAttr) {
                xpath += `[@class='${classAttr.value}']`;
            }
        }
        
        return xpath;
    }

    collapseAllBtn.addEventListener('click', () => {
        hierarchyTree.querySelectorAll('.hierarchy-node').forEach(node => {
            node.classList.add('collapsed');
            const toggle = node.querySelector('.hierarchy-toggle');
            if (toggle && toggle.textContent === '▼') {
                toggle.textContent = '▶';
            }
        });
    });

    expandAllBtn.addEventListener('click', () => {
        hierarchyTree.querySelectorAll('.hierarchy-node').forEach(node => {
            node.classList.remove('collapsed');
            const toggle = node.querySelector('.hierarchy-toggle');
            if (toggle && toggle.textContent === '▶') {
                toggle.textContent = '▼';
            }
        });
    });

    function setLocatorAndMatchCount(locatorType, locatorValue) {
        const locatorSpan = document.getElementById(locatorType + 'Locator');
        const matchCountSpan = document.getElementById(locatorType + 'MatchCount');
        locatorSpan.textContent = locatorValue || '';
        matchCountSpan.textContent = '';
        matchCountSpan.classList.remove('unique', 'zero', 'multiple');
        if (locatorValue) {
            matchCountSpan.classList.add('loading'); // Show spinner
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                chrome.tabs.sendMessage(
                    tabs[0].id,
                    { action: 'evaluateLocator', locator: locatorValue },
                    function(response) {
                        matchCountSpan.classList.remove('loading'); // Remove spinner
                        if (response && typeof response.count === 'number') {
                            matchCountSpan.textContent = response.count + ' match' + (response.count === 1 ? '' : 'es');
                            matchCountSpan.classList.remove('unique', 'zero', 'multiple');
                            if (response.count === 1) {
                                matchCountSpan.classList.add('unique');
                            } else if (response.count === 0) {
                                matchCountSpan.classList.add('zero');
                            } else {
                                matchCountSpan.classList.add('multiple');
                            }
                        } else {
                            matchCountSpan.textContent = '';
                            matchCountSpan.classList.remove('unique', 'zero', 'multiple');
                        }
                    }
                );
            });
        } else {
            matchCountSpan.classList.remove('loading', 'unique', 'zero', 'multiple');
        }
    }

    function showMessage(msg, statusClass = '') {
        messageArea.textContent = msg;
        messageArea.className = 'message-area';
        if (statusClass) messageArea.classList.add(statusClass);
        setTimeout(() => {
            messageArea.textContent = '';
            messageArea.className = 'message-area';
        }, 2000);
    }
    
    // Perfect shadow DOM information display
    function displayShadowInfo(shadowInfo) {
        if (!shadowInfo) return;
        
        if (shadowInfo.isInShadow) {
            const mode = shadowInfo.shadowMode || 'unknown';
            const pathInfo = shadowInfo.shadowPath?.length > 0 ? ` via ${shadowInfo.shadowPath.length} host(s)` : '';
            showMessage(`Shadow DOM (${mode}, depth: ${shadowInfo.shadowDepth})${pathInfo}`, 'shadow-info');
        }
        
        if (shadowInfo.isShadowHost) {
            const rootInfo = shadowInfo.shadowRootInfo;
            const mode = rootInfo?.mode || 'unknown';
            const childCount = rootInfo?.childElementCount || 0;
            showMessage(`Shadow Host (${mode}, ${childCount} children)`, 'shadow-info');
        }
    }
    
    // Perfect shadow DOM indicators for locator values
    function addShadowIndicators(locatorType, shadowAware, shadowMode) {
        const locatorSpan = document.getElementById(locatorType + 'Locator');
        if (locatorSpan && shadowAware) {
            locatorSpan.classList.add('shadow-aware');
            if (shadowMode === 'closed') {
                locatorSpan.classList.add('shadow-closed');
            }
        }
    }
    
    // Add iframe indicators to locator rows
    function addIframeIndicators(request) {
        const locatorTypes = ['css', 'relativeXPath', 'absoluteXPath', 'jquery'];
        locatorTypes.forEach(type => {
            const locatorSpan = document.getElementById(type + 'Locator');
            if (locatorSpan && request[type + 'InIframe']) {
                locatorSpan.classList.add('iframe-aware');
                locatorSpan.title = 'This locator targets an element inside an iframe';
            }
        });
    }
    
    // Enhanced message handler for shadow DOM
    function handleShadowMessage(data) {
        if (data.shadowInfo) {
            displayShadowInfo(data.shadowInfo);
            
            // Add shadow indicators to all locator types
            const shadowAware = data.shadowInfo.isInShadow;
            const shadowMode = data.shadowInfo.shadowMode;
            
            ['css', 'relativeXPath', 'absoluteXPath', 'jquery', 'playwright'].forEach(type => {
                addShadowIndicators(type, shadowAware, shadowMode);
            });
        }
    }

addGeneratedLocatorClickListeners();
} // End of initPanel function