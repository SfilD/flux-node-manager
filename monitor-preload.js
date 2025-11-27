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
        style.textContent = `
      ${menuSelector} { display: none !important; }
      ${menuToggleSelector} { display: none !important; }
      ${bookmarkSelector} { display: none !important; }
      ${themeSwitchSelector} { display: none !important; }
      ${finalIconSelector} { display: none !important; }
      ${githubLinkSelector} { display: none !important; }
    `;
        document.head.appendChild(style);
        log('Injected CSS to hide UI elements.');
    } catch (e) {
        log(`Error injecting CSS: ${e.message}`);
    }
}

function initializeMonitor() {
    hideSideMenu();
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

    setInterval(checkAuthState, 2000);

    window.addEventListener('load', () => {
        log('Page fully loaded. Performing initial state log.');
        logState('Initial State (After Load)');
        checkAuthState();
    });
}

window.addEventListener('DOMContentLoaded', initializeMonitor);

