const { ipcRenderer } = require('electron');

// --- Argument Parsing ---
let nodeId = 'unknown';
const nodeIdArg = process.argv.find(arg => arg.startsWith('--node-id='));
if (nodeIdArg) {
    nodeId = nodeIdArg.split('=')[1];
}

// --- Logging System ---
function log(message) {
    ipcRenderer.send('log-info-from-preload', { nodeId, message });
}

function logDebug(message) {
    // Let the main process decide if it should be displayed
    ipcRenderer.send('log-debug-from-preload', { nodeId, message });
}

function logState(context) {
    let state = `----- [${context}] -----\n`;
    state += `Timestamp: ${new Date().toISOString()}\n`;

    state += '\n--- localStorage ---\n';
    try {
        const ls = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            ls[key] = localStorage.getItem(key);
        }
        state += JSON.stringify(ls, null, 2);
    } catch (e) {
        state += `Error reading localStorage: ${e.message}`;
    }

    state += '\n\n--- sessionStorage ---\n';
    try {
        const ss = {};
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            ss[key] = sessionStorage.getItem(key);
        }
        state += JSON.stringify(ss, null, 2);
    } catch (e) {
        state += `Error reading sessionStorage: ${e.message}`;
    }
    
    state += `\n\n--- Cookies ---\n${document.cookie || '(empty)'}\n`;
    state += `----- End of [${context}] -----`;
    logDebug(state);
}

// --- Main Logic ---

function setupKioskMode() {
    window.addEventListener('click', (event) => {
        const target = event.target;

        // 1. Allow Login Button (in menu)
        if (target.closest('.vertical-nav-login-button')) return;

        // 2. Allow Interactions within Dialogs/Overlays (Login forms, confirmations)
        if (target.closest('.v-overlay__content') || target.closest('.v-dialog')) return;

        // 3. Allow Logout Button
        const btn = target.closest('button');
        if (btn) {
            const txt = btn.textContent.trim().toLowerCase();
            if (txt === 'logout' || btn.querySelector('.tabler-logout')) return;
            // Also allow 'Login' buttons inside content area if they weren't caught by overlay check
            if (txt.includes('login') || txt.includes('zelcore')) return;
        }

        // 4. Allow Inputs (for manual token entry)
        if (target.closest('input') || target.closest('textarea')) return;

        // 5. BLOCK Navigation Links and Menu Items
        if (target.closest('a') || 
            target.closest('.v-list-item') || 
            target.closest('.v-chip--link')
           ) {
            // Check if it is a ZelCore link (allow it to bubble up to will-navigate or shell.openExternal)
            const link = target.closest('a');
            if (link && link.href && link.href.startsWith('zel:')) return;

            // logDebug('UI: Blocked navigation interaction.'); // Uncomment for debugging
            event.preventDefault();
            event.stopPropagation();
        }
    }, true); // Capture phase
    log('Kiosk mode (UI blocking) enabled.');
}

function hideSideMenu() {
    try {
        const style = document.createElement('style');
        style.type = 'text/css';
        const menuSelector = '.main-menu';
        const menuToggleSelector = '.feather-menu';
        const bookmarkSelector = '.bookmark-wrapper';
        const themeSwitchSelector = '.feather-sun';
        const finalIconSelector = '[data-v-2ed358b2]';
        const githubLinkSelector = 'a[href="https://github.com/runonflux/flux"]';
        const fluxAiButtonSelector = '#flux-ai-button'; // New ArcaneOS element
        style.textContent = `
      ${menuSelector} { display: none !important; }
      ${menuToggleSelector} { display: none !important; }
      ${bookmarkSelector} { display: none !important; }
      ${themeSwitchSelector} { display: none !important; }
      ${finalIconSelector} { display: none !important; }
      ${githubLinkSelector} { display: none !important; }
      ${fluxAiButtonSelector} { display: none !important; }
    `;
        document.head.appendChild(style);
        log('Injected CSS to hide UI elements.');
    } catch (e) {
        log(`Error injecting CSS: ${e.message}`);
    }
}

function initializeMonitor() {
    hideSideMenu();
    setupKioskMode();
    log('Preload script injected. Monitoring authentication state...');
    let lastSentToken = null;

    const checkAuthState = () => {
        const currentToken = localStorage.getItem('zelidauth');
        
        if (currentToken && currentToken !== lastSentToken) {
            log('Login detected or token changed.');
            logState('Post-Login State');
            ipcRenderer.send('auth-state-changed', { nodeId: nodeId, loggedIn: true, token: currentToken });
            log('Auth state [LOGGED IN] sent to main process.');
            lastSentToken = currentToken;
        } 
        else if (!currentToken && lastSentToken !== null) {
            log('Logout detected.');
            logState('Post-Logout State');
            ipcRenderer.send('auth-state-changed', { nodeId: nodeId, loggedIn: false, token: null });
            log('Auth state [LOGGED OUT] sent to main process.');
            lastSentToken = null;
        }
    };

    const checkFluxOSVersion = () => {
        try {
            const spans = document.querySelectorAll('span');
            let versionElement = null;
            for (const span of spans) {
                if (span.textContent && span.textContent.includes('FluxOS v')) {
                    versionElement = span;
                    break;
                }
            }
    
            if (versionElement) {
                const currentVersionText = versionElement.textContent.trim();
                
                // Ignore incomplete version strings (e.g. just "FluxOS v" while loading)
                if (currentVersionText.length < 10) return;

                const lastKnownVersion = localStorage.getItem('last_known_flux_version');
    
                if (lastKnownVersion && lastKnownVersion !== currentVersionText) {
                    log(`FluxOS version change detected! Old: ${lastKnownVersion}, New: ${currentVersionText}`);
                    ipcRenderer.send('fluxos-version-changed', { 
                        nodeId: nodeId, 
                        oldVersion: lastKnownVersion, 
                        newVersion: currentVersionText 
                    });
                }
                
                if (lastKnownVersion !== currentVersionText) {
                    localStorage.setItem('last_known_flux_version', currentVersionText);
                }
            }
        } catch (e) {
            logDebug(`Error checking FluxOS version: ${e.message}`);
        }
    };

    // Check on page load fully
    window.addEventListener('load', () => {
        log('Page fully loaded. Performing initial state log.');
        logState('Initial State (After Load)');
        checkFluxOSVersion();
        checkAuthState();
    });

    // Check periodically for changes in localStorage
    // Increased interval to 3000ms to reduce CPU load with many active nodes
    setInterval(() => {
        checkAuthState();
        checkFluxOSVersion();
    }, 3000);
}

window.addEventListener('DOMContentLoaded', initializeMonitor);