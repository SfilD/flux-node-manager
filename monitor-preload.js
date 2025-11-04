const { ipcRenderer } = require('electron');

// --- Debug Utility ---
const DEBUG = true;
function log() {
  if (DEBUG) {
    const args = ['[MONITOR]'];
    for (let i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }
    console.log.apply(console, args);
  }
}

function logState(context) {
    if (!DEBUG) return;
    console.log(`
----- [${context}] -----`);
    console.log('Timestamp:', new Date().toISOString());

    console.log('\n--- localStorage ---');
    try {
        const ls = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            ls[key] = localStorage.getItem(key);
        }
        console.log(JSON.stringify(ls, null, 2));
    } catch (e) {
        console.log(`Error reading localStorage: ${e.message}`);
    }

    console.log('\n--- sessionStorage ---');
    try {
        const ss = {};
        for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            ss[key] = sessionStorage.getItem(key);
        }
        console.log(JSON.stringify(ss, null, 2));
    } catch (e) {
        console.log(`Error reading sessionStorage: ${e.message}`);
    }

    console.log('\n--- Cookies ---');
    console.log(document.cookie || '(empty)');
    console.log(`----- End of [${context}] -----
`);
}


// --- Main Logic ---

function initializeMonitor() {
    log('Preload script injected. Waiting for page to load...');

    const checkForLoginAndSendToken = () => {
        const zelidauth = localStorage.getItem('zelidauth');
        const logoutButton = document.querySelector('a[href="#/logout"]') || Array.from(document.querySelectorAll('button')).find(btn => btn.innerText.trim().toLowerCase() === 'logout');

        if (zelidauth && logoutButton) {
            log('Login detected!');
            logState('Post-Login State');
            ipcRenderer.send('zelidauth-token', zelidauth);
            log('Auth token sent to main process.');
            return true; // Signal that we are done
        }
        return false; // Not logged in yet
    };

    // Set an interval to periodically check for the login state.
    const monitorInterval = setInterval(() => {
        if (checkForLoginAndSendToken()) {
            // Once the token is found and sent, we can stop checking.
            clearInterval(monitorInterval);
            log('Monitor is now idle.');
        }
    }, 2000); // Check every 2 seconds

    window.addEventListener('load', () => {
        log('Page fully loaded. Performing initial state log.');
        logState('Initial State (After Load)');
    });
}

window.addEventListener('DOMContentLoaded', initializeMonitor);
