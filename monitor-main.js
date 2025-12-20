const { app, BrowserWindow, BrowserView, ipcMain, session, dialog, shell, safeStorage } = require('electron');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');
const ini = require('ini');
const net = require('net');
const dns = require('dns');

// --- Global Error Handlers ---
process.on('uncaughtException', (error, origin) => {
    const errorMsg = `An uncaught exception occurred: ${error.stack || error}`;
    log('FATAL-ERROR', errorMsg, origin);
    dialog.showErrorBox('Critical Error / Критическая ошибка', 'A critical, unrecoverable error occurred. The application will now close.\n\nПроизошла критическая, неустранимая ошибка. Приложение будет закрыто.\n\nError details / Детали ошибки:\n' + errorMsg);
    app.quit();
});

process.on('unhandledRejection', (reason) => {
    const reasonMsg = reason.stack || reason;
    log('FATAL-ERROR', 'An unhandled promise rejection occurred:', reasonMsg);
    dialog.showErrorBox('Critical Error / Критическая ошибка', 'A critical, unrecoverable error occurred. The application will now close.\n\nПроизошла критическая, неустранимая ошибка. Приложение будет закрыто.\n\nError details / Детали ошибки:\n' + reasonMsg);
    app.quit();
});

// Disable hardware acceleration to prevent rendering issues
app.disableHardwareAcceleration();

// Suppress non-fatal Chromium logs (like SSL handshake informational errors)
app.commandLine.appendSwitch('log-level', '3');

// --- Path Resolution Helper ---
function resolveBasePath() {
    // 1. Development Environment (Top priority to ensure 'npm start' works exactly as before)
    if (!app.isPackaged) {
        return __dirname;
    }
    // 2. Portable App (Electron Builder specific environment variable)
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
        return process.env.PORTABLE_EXECUTABLE_DIR;
    }
    // 3. Installed / Unpacked Executable
    // Use the directory of the executable itself to find side-by-side files
    return path.dirname(app.getPath('exe'));
}

const BASE_PATH = resolveBasePath();

// --- Load Configuration from settings.ini ---
let config;
try {
    const configPath = path.join(BASE_PATH, 'settings.ini');
    config = ini.parse(fs.readFileSync(configPath, 'utf-8'));
} catch (error) {
    console.error(`Failed to load settings.ini from ${BASE_PATH}. Using empty config. Error:`, error);
    config = { General: {} };
}

const SCAN_IPS = (config.General.ScanIPs || '')
    .split(',')
    .map(ip => ip.trim())
    .filter(ip => {
        if (ip && net.isIP(ip)) {
            return true;
        }
        if (ip) { // Log only if the value is not empty
            log('CONFIG-Warning', `Invalid IP address format in settings.ini ignored: '${ip}'`);
        }
        return false;
    });
const TARGET_APP_PREFIXES = (config.General.TargetAppPrefixes || '').split(',').map(p => p.trim()).filter(p => p.length > 0);

let automationIntervalSeconds = parseInt(config.General.AutomationIntervalSeconds, 10) || 60;
if (automationIntervalSeconds < 60) {
    log('CONFIG-Warning', 'AutomationIntervalSeconds was set below the minimum of 60s and has been adjusted to 60s.');
    automationIntervalSeconds = 60;
}
const AUTOMATION_INTERVAL = automationIntervalSeconds * 1000;

const DEBUG_MODE = String(config.General.Debug).toLowerCase() === 'true';
const WINDOW_WIDTH = Math.max(parseInt(config.General.WindowWidth) || 1300, 1300);
const WINDOW_HEIGHT = Math.max(parseInt(config.General.WindowHeight) || 850, 850);
const LOG_CLEAR_ON_START = String(config.General.LogClearOnStart).toLowerCase() === 'true';
const LOG_FILE = config.General.LogFile || 'session.log';
const FONT_NAME = config.General.FontName || 'Hack';
const FONT_SIZE = parseInt(config.General.FontSize) || 10;
const MAX_LOG_HISTORY = parseInt(config.General.MaxLogHistory) || 1000;

// --- Global State ---
let preloaderWindow = null;
let mainWindow = null;
let NODES = []; // This will be populated dynamically
let logStream = null; // For file logging
let logHistory = []; // Persistent log history for the session

// --- Logging System ---

/**
 * Sets up the file stream for logging session output to a file.
 */
function setupFileLogger() {
    const logFilePath = path.join(BASE_PATH, LOG_FILE);
    const writeMode = LOG_CLEAR_ON_START ? 'w' : 'a';
    try {
        logStream = fs.createWriteStream(logFilePath, { flags: writeMode });
        logStream.on('error', (err) => {
            console.error('Log stream error:', err);
            logStream = null;
        });
    } catch (err) {
        console.error('Failed to setup file logger:', err);
    }
}

/**
 * Central dispatcher for all log messages. It pushes messages to a history array,
 * sends them to the UI, and writes them to a file. It also enforces a maximum log size.
 * @param {string} message The log message to dispatch.
 * @param {boolean} [isDebug=false] Whether the message is a debug-level message.
 */
function dispatchLog(message, isDebug = false) {
    if (isDebug && !DEBUG_MODE) {
        return;
    }
    
    logHistory.push(message);

    // Enforce the max log history size
    if (logHistory.length > MAX_LOG_HISTORY) {
        logHistory.shift(); // Removes the oldest element from the beginning
    }

    // 1. Send to the active UI
    const targetWindow = preloaderWindow || mainWindow;
    if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('log-message', message);
    }
    
    // 2. Write to file
    if (logStream) {
        logStream.write(`[${new Date().toISOString()}] ${message}\n`);
    }
}

/**
 * Masks sensitive data within an object or array before logging.
 * Recursively checks for keys containing sensitive keywords and replaces their values.
 * @param {any} data The data to sanitize.
 * @returns {any} The sanitized data.
 */
function maskSensitiveData(data) {
    if (data === null || typeof data !== 'object') {
        return data;
    }

    // Create a deep copy to avoid mutating original objects
    const clonedData = JSON.parse(JSON.stringify(data));

    const sensitiveKeywords = ['token', 'password', 'signature', 'zelidauth', 'zelid', 'loginphrase'];

    // Recursive function to traverse and mask
    function recurse(current) {
        if (current === null || typeof current !== 'object') {
            return;
        }

        if (Array.isArray(current)) {
            current.forEach(item => recurse(item));
        } else {
            for (const key in current) {
                if (Object.prototype.hasOwnProperty.call(current, key)) {
                    const lowerKey = key.toLowerCase();
                    if (sensitiveKeywords.some(keyword => lowerKey.includes(keyword))) {
                        current[key] = '[REDACTED]';
                    } else {
                        recurse(current[key]);
                    }
                }
            }
        }
    }

    recurse(clonedData);
    return clonedData;
}


/**
 * Formats and dispatches a standard-level log message.
 * @param {string} prefix The prefix to identify the log source (e.g., 'MAIN', 'API-Error').
 * @param {...any} args The rest of the message parts to log.
 */
function log(prefix, ...args) {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timestamp = `[${day}.${month}.${year} ${hours}:${minutes}]`;
    
    const message = `${timestamp}[${prefix}] ${args.map(arg => (typeof arg === 'object' && arg !== null) ? JSON.stringify(maskSensitiveData(arg)) : String(arg)).join(' ')}`;
    dispatchLog(message, false);
}

/**
 * Formats and dispatches a debug-level log message. Only logs if DEBUG_MODE is true.
 * @param {string} prefix The prefix to identify the log source.
 * @param {...any} args The rest of the message parts to log.
 */
function logDebug(prefix, ...args) {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timestamp = `[${day}.${month}.${year} ${hours}:${minutes}]`;

    const message = `${timestamp}[${prefix}] ${args.map(arg => (typeof arg === 'object' && arg !== null) ? JSON.stringify(maskSensitiveData(arg), null, 2) : String(arg)).join(' ')}`;
    dispatchLog(message, true);
}

/**
 * A wrapper for the fetch API that adds a timeout.
 * @param {string} url The URL to fetch.
 * @param {object} [options={}] Fetch options.
 * @param {number} [timeout=10000] The timeout in milliseconds.
 * @returns {Promise<Response>} A promise that resolves with the fetch Response object.
 * @throws {Error} Throws an error if the request times out or fails.
 */
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Request timeout');
        }
        throw error;
    }
}

// --- Application Lifecycle Functions ---

/**
 * Checks for a basic internet connection by attempting a DNS lookup.
 * @returns {Promise<boolean>} A promise that resolves to true if the lookup is successful, false otherwise.
 */
async function checkInternetConnection() {
    return new Promise(resolve => {
        dns.lookup('google.com', err => {
            if (err && err.code === 'ENOTFOUND') {
                resolve(false);
            }
            else {
                resolve(true);
            }
        });
    });
}

/**
 * Checks if a Flux node exists and is responsive at a given API URL.
 * @param {string} apiUrl The base API URL of the node to check.
 * @returns {Promise<boolean>} A promise that resolves to true if the node is responsive, false otherwise.
 */
async function checkFluxNodeExistence(apiUrl) {
    try {
        await fetchWithTimeout(`${apiUrl}/apps/listrunningapps`, { 
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        }, 10000);
        return true;
    } catch (error) {
        logDebug('DISCOVERY-Check', `Node check failed for ${apiUrl}: ${error.message}`);
        return false;
    }
}

/**
 * Scans a single IP address for all possible Flux nodes (up to 8).
 * @param {string} ip The IP address to scan.
 * @param {string} ipPrefix A prefix for generating unique node IDs.
 * @returns {Promise<object[]>} A promise that resolves to an array of found node objects.
 */
async function discoverNodesOnIp(ip, ipPrefix) {
    log('DISCOVERY', `Scanning IP: ${ip} with prefix ${ipPrefix}`);
    const promises = [];
    const baseUiPort = 16126;
    const maxNodesPerIp = 8;

    for (let i = 0; i < maxNodesPerIp; i++) {
        const uiPort = baseUiPort + (i * 10);
        const apiPort = uiPort + 1;
        const apiUrl = `http://${ip}:${apiPort}`;
        
        log('DISCOVERY', `Checking for node at ${apiUrl}...`);
        
        const promise = checkFluxNodeExistence(apiUrl).then(exists => {
            if (exists) {
                const nodeNumber = i + 1;
                const paddedNodeNumber = String(nodeNumber).padStart(2, '0');
                const node = {
                    id: `${ipPrefix}-node${paddedNodeNumber}`,
                    name: `${ipPrefix}-Node${paddedNodeNumber}`,
                    uiUrl: `http://${ip}:${uiPort}`,
                    apiUrl: apiUrl,
                    view: null,
                    token: null,
                    automationIntervalId: null
                };
                log('DISCOVERY', `Found active node: ${node.name}`);
                return node;
            }
            return null;
        });
        promises.push(promise);
    }

    const results = await Promise.all(promises);
    return results.filter(node => node !== null);
}

/**
 * Discovers all nodes on all IPs specified in the configuration by running scans in parallel.
 * @param {string[]} ips An array of IP addresses to scan.
 */
async function discoverAllNodes(ips) {
    log('DISCOVERY', 'Starting node discovery across all IPs...');
    const discoveryPromises = ips.map((ip, index) => {
        const ipPrefix = `IP${String(index + 1).padStart(2, '0')}`;
        return discoverNodesOnIp(ip, ipPrefix);
    });

    const resultsByIp = await Promise.all(discoveryPromises);
    NODES = resultsByIp.flat(); // Flatten the array of arrays

    log('DISCOVERY', `Total nodes found across all IPs: ${NODES.length}`);
}

/**
 * Clears the cache for all discovered node sessions.
 */
async function clearAllCaches() {
    log('CACHE', 'Starting to clear all session caches...');
    for (const node of NODES) {
        try {
            const ses = session.fromPartition(`persist:${node.id}`);
            await ses.clearStorageData({ storages: ['appcache', 'cachestorage', 'shadercache'] });
            log('CACHE', `Successfully cleared cache for partition: ${node.id}`);
        } catch (error) {
            log('CACHE-Error', `Failed to clear cache for node ${node.id}:`, error);
        }
    }
    log('CACHE', 'Finished clearing all session caches.');
}

/**
 * Handles the "No Nodes Found" error with an interactive dialog.
 * Allows the user to open settings or documentation before quitting.
 */
async function handleNoNodesError() {
    const errorTitle = 'No Nodes Found / Узлы не найдены';
    const errorMessage = `No active Flux nodes were found. Please check the following:
1. The IP addresses in settings.ini are correct.
2. Your internet connection is stable.
3. A firewall or antivirus is not blocking the application's outgoing connections.

--------------------------------------------------

Активные узлы Flux не найдены. Пожалуйста, проверьте следующее:
1. IP-адреса в файле settings.ini указаны верно.
2. Ваше интернет-соединение стабильно.
3. Брандмауэр или антивирус не блокируют исходящие соединения приложения.`;

    log('MAIN-Error', 'No active nodes found. Waiting for user action...');

    const locale = app.getLocale();
    const isRu = locale && locale.toLowerCase().startsWith('ru');
    
    const buttons = isRu 
        ? ['Открыть настройки', 'Открыть инструкцию', 'Выход'] 
        : ['Open Settings', 'Open Docs', 'Exit'];

    // Use preloaderWindow as parent if available, otherwise null
    const parentWindow = (preloaderWindow && !preloaderWindow.isDestroyed()) ? preloaderWindow : null;

    const { response } = await dialog.showMessageBox(parentWindow, {
        type: 'error',
        title: errorTitle,
        message: errorTitle,
        detail: errorMessage,
        buttons: buttons,
        defaultId: 0,
        cancelId: 2,
        noLink: true
    });

    if (response === 0) { // Settings
        const settingsPath = path.join(BASE_PATH, 'settings.ini');
        await shell.openPath(settingsPath);
    } else if (response === 1) { // Docs
        let docFileName = 'MANUAL_EN.md';
        if (isRu) {
            docFileName = 'MANUAL_RU.md';
        }
        const docPath = path.join(BASE_PATH, 'docs', docFileName);
        await shell.openPath(docPath);
    }
}

/**
 * Creates and shows a preloader window while node discovery runs in the background.
 * Quits the app if no internet connection is found.
 */
async function showPreloaderAndDiscover() {
    setupFileLogger();

    const hasInternet = await checkInternetConnection();
    if (!hasInternet) {
        log('MAIN-Error', 'No internet connection or DNS lookup failed. Please check your network. Shutting down.');
        dialog.showErrorBox('Network Error / Ошибка сети', 'No internet connection or DNS lookup failed. Please check your network settings.\n\nОтсутствует подключение к интернету или ошибка DNS. Пожалуйста, проверьте настройки сети.');
        app.quit();
        return;
    }

    preloaderWindow = new BrowserWindow({
        width: 680,
        height: 400,
        resizable: false,
        frame: false,
        alwaysOnTop: true,
        icon: path.join(__dirname, 'assets', 'icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preloader-preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    preloaderWindow.loadFile('preloader.html');
    
    preloaderWindow.webContents.on('did-finish-load', async () => {
        // First, show the history so the user sees something
        preloaderWindow.webContents.send('initialize-preloader', {
            logHistory,
            fontName: FONT_NAME,
            fontSize: FONT_SIZE
        });

        // Now, do the heavy lifting
        await discoverAllNodes(SCAN_IPS);
        await clearAllCaches();
        
        if (NODES.length === 0) {
            // Handle error without closing preloader immediately
            await handleNoNodesError();
            app.quit();
        } else {
            // When done, close the preloader
            if (preloaderWindow && !preloaderWindow.isDestroyed()) {
                preloaderWindow.close();
            }
        }
    });

    preloaderWindow.on('closed', () => {
        preloaderWindow = null;
        // Only create main window if nodes exist
        if (NODES.length > 0) {
            createMainWindow();
        }
    });

    preloaderWindow.show();
}

/**
 * Creates the main application window and attaches a BrowserView for each discovered node.
 */
function createMainWindow() {
    // Note: The NODES check is now done in showPreloaderAndDiscover to prevent premature closing.
    
    const appVersion = app.getVersion();

    mainWindow = new BrowserWindow({
        title: `Flux Auto-Deleter v${appVersion}`,
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        resizable: false,
        maximizable: false,
        icon: path.join(__dirname, 'assets', 'icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'shell-preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    
    // Increase listener limit to prevent warnings when many nodes (BrowserViews) are attached
    mainWindow.setMaxListeners(100);

    mainWindow.setMenu(null);
    mainWindow.loadFile('shell.html');
    if (DEBUG_MODE) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.webContents.on('did-finish-load', () => {
        log('MAIN', 'Shell renderer finished loading. Sending initial data.');
        mainWindow.webContents.send('initialize-ui', { 
            appVersion: app.getVersion(),
            nodes: NODES.map(n => ({ 
                id: n.id, 
                name: n.name, 
                uiUrl: n.uiUrl,
                hasToken: !!n.token // Send initial auth status
            })),
            activeId: NODES.length > 0 ? NODES[0].id : null,
            debug: DEBUG_MODE,
            fontName: FONT_NAME,
            fontSize: FONT_SIZE,
            logHistory: logHistory
        });
    });

    NODES.forEach(node => {
        const view = new BrowserView({
            webPreferences: {
                preload: path.join(__dirname, 'monitor-preload.js'),
                partition: `persist:${node.id}`,
                contextIsolation: true,
                nodeIntegration: false,
                additionalArguments: [`--node-id=${node.id}`]
            }
        });
        
        // Set a standard Chrome User-Agent to avoid reCAPTCHA issues
        view.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // --- Navigation Security ---
        // 1. Block new windows (popups, target="_blank")
        view.webContents.setWindowOpenHandler(({ url }) => {
            logDebug(`NAV-${node.id}`, `Blocked new window attempt: ${url}`);
            return { action: 'deny' };
        });

        // 2. Restrict navigation to the same origin AND specific paths
        view.webContents.on('will-navigate', (event, targetUrl) => {
            // Allow ZelCore deep links
            if (targetUrl.startsWith('zel:')) {
                logDebug(`NAV-${node.id}`, `Allowing ZelCore navigation: ${targetUrl}`);
                event.preventDefault();
                shell.openExternal(targetUrl);
                return;
            }

            const currentUrl = view.webContents.getURL();
            try {
                const targetUrlObj = new URL(targetUrl);
                const currentUrlObj = new URL(currentUrl);

                // 1. Block different origins (external sites)
                if (targetUrlObj.origin !== currentUrlObj.origin) {
                    event.preventDefault();
                    log(`NAV-${node.id}`, `Blocked external navigation to: ${targetUrl}`);
                    return;
                }

                // 2. Strict Path Whitelist for internal navigation
                // Allow root ('/') and login callbacks ('/id/...')
                // Adjust this list if other critical paths are discovered
                const isRoot = targetUrlObj.pathname === '/' || targetUrlObj.pathname === '/index.html';
                const isLogin = targetUrlObj.pathname.startsWith('/id/');
                
                if (!isRoot && !isLogin) {
                    event.preventDefault();
                    log(`NAV-${node.id}`, `Blocked internal navigation to restricted path: ${targetUrl}`);
                }

            } catch (err) {
                event.preventDefault();
                log(`NAV-${node.id}`, 'Blocked invalid URL navigation');
            }
        });

        mainWindow.addBrowserView(view);
        view.setAutoResize({ width: true, height: true });
        view.webContents.loadURL(node.uiUrl);

        if (DEBUG_MODE) {
            view.webContents.openDevTools({ mode: 'detach' });
        }
        node.view = view;
    });

    if (NODES.length > 0) {
        mainWindow.setTopBrowserView(NODES[0].view);
    }
}

/**
 * Fetches the list of running applications from a node.
 * @param {object} node The node object.
 * @returns {Promise<object[]>} A promise that resolves to an array of running application objects, or an empty array on failure.
 */
async function listRunningApps(node) {
    // This is a public endpoint, no token is needed.
    try {
        const response = await fetchWithTimeout(`${node.apiUrl}/apps/listrunningapps`, { method: 'GET' });
        
        if (!response.ok) {
            log(`API-${node.id}-Error`, `Error listing running apps: HTTP status ${response.status}`);
            return []; // Return empty array on HTTP error
        }

        const data = await response.json();
        logDebug(`API-${node.id}`, 'Running Apps:', data);

        if (data.status === 'success' && Array.isArray(data.data)) {
            return data.data; // Return the actual array of apps
        }
        
        log(`API-${node.id}-Error`, 'API call to list apps did not return a success status or valid data.');
        return []; // Return empty array if the response JSON is not what we expect

    } catch (error) {
        log(`API-${node.id}-Error`, 'Error listing running apps:', error.message);
        return []; // Return empty array on network/timeout error
    }
}

/**
 * Sends a request to remove a specific application from a node.
 * @param {object} node The node object, containing the encrypted token.
 * @param {string} appName The name of the application to remove.
 * @returns {Promise<object>} A promise that resolves to an object indicating success or failure.
 */
async function removeApp(node, appName) {
    if (!node.token) {
        const errorMsg = 'Not logged in. Token is missing.';
        log(`API-${node.id}`, `Error: ${errorMsg}`);
        return { success: false, error: errorMsg, authError: true };
    }
    try {
        let decryptedToken;
        if (Buffer.isBuffer(node.token)) {
            decryptedToken = safeStorage.decryptString(node.token);
        } else {
            // This is a fallback for environments where safeStorage is not available
            // or if the token was stored as plaintext.
            decryptedToken = node.token;
        }

        const response = await fetchWithTimeout(`${node.apiUrl}/apps/appremove?appname=${appName}`, { method: 'GET', headers: { 'zelidauth': decryptedToken } });

        if (!response.ok) {
            const isAuthError = response.status === 401 || response.status === 403;
            const errorMsg = `HTTP error! Status: ${response.status}`;
            log(`API-${node.id}-Error`, errorMsg);
            return { success: false, error: errorMsg, authError: isAuthError };
        }

        // Successful removal might not return a JSON body, but just an OK status.
        const responseText = await response.text();
        logDebug(`API-${node.id}`, `Successfully removed app ${appName}. Server response: ${responseText}`);

        // Try to parse the response as JSON to check for "soft" errors (200 OK but error body)
        try {
            const jsonResponse = JSON.parse(responseText);
            if (jsonResponse.status === 'error') {
                const errorData = jsonResponse.data || {};
                const errorCode = errorData.code;
                const errorMessage = errorData.message || JSON.stringify(errorData);

                if (errorCode === 401 || errorCode === 403 || (typeof errorMessage === 'string' && errorMessage.toLowerCase().includes('unauthorized'))) {
                    log(`API-${node.id}-Error`, 'Soft-fail: API returned 200 OK but body contains Unauthorized error.');
                    return { success: false, error: errorMessage, authError: true };
                }
                
                return { success: false, error: errorMessage, authError: false };
            }
        } catch (e) {
            // Response is not JSON, assume success (simple text response)
        }

        return { success: true, data: responseText };

    } catch (error) {
        log(`API-${node.id}-Error`, `Error removing app ${appName}:`, error.message);
        return { success: false, error: error.message, authError: false };
    }
}

/**
 * Runs a single automation cycle for a given node: fetches running apps, identifies targets, and removes them.
 * @param {object} node The node object to run the cycle on.
 */
async function runAutomationCycle(node) {
    log(`AUTO-${node.id}`, 'Cycle started.');

    // 1. First, ensure we have a token.
    if (!node.token) {
        log(`AUTO-${node.id}`, 'Automation cycle skipped: Not logged in.');
        if (node.automationIntervalId) {
            clearInterval(node.automationIntervalId);
            node.automationIntervalId = null;
        }
        return;
    }

    // 2. Now, get the list of running apps. This is a public endpoint.
    const runningApps = await listRunningApps(node);
    
    // --- Happy Path: API call succeeded ---
    const count = runningApps.length;
    if (count === 0) {
        log(`AUTO-${node.id}`, 'Found 0 running applications.');
    } else {
        log(`AUTO-${node.id}`, `Found ${count === 1 ? '1 running application' : `${count} running applications`}:`);
    }

    const appNames = runningApps.map(app => {
        if (app.Names && app.Names.length > 0) {
            const name = app.Names[0].startsWith('/') ? app.Names[0].substring(1) : app.Names[0];
            const isTarget = TARGET_APP_PREFIXES.some(prefix => name.includes(prefix));
            return { name, isTarget };
        }
        return null;
    }).filter(name => name !== null);

    appNames.forEach(app => {
        const color = app.isTarget ? 'RED' : 'GREEN';
        log(`AUTO-${node.id}`, `  - @@${color}@@${app.name}##`);
    });

    logDebug(`AUTO-${node.id}`, 'Raw application data:', runningApps);

    // 4. Perform the removal logic, which requires the (now validated) token.
    for (const app of appNames) {
        if (app.isTarget) {
            const mainAppName = app.name.substring(app.name.lastIndexOf('_') + 1);
            log(`AUTO-${node.id}`, `Found target: @@YELLOW@@${app.name}##. Removing main app: @@YELLOW@@${mainAppName}##...`);

            const removeResult = await removeApp(node, mainAppName);
            
            // Check if the removal failed due to an authentication error
            if (removeResult.authError) {
                log(`MAIN-${node.id}`, 'Authentication failed (Token Invalid). Initiating Auto-Reset to Login Screen...');
                await performNodeReset(node);
                break; // Exit the loop for this cycle
            } else if (!removeResult.success) {
                // Log other, non-auth-related errors
                log(`API-${node.id}-Error`, `Failed to remove app @@YELLOW@@${mainAppName}##: ${removeResult.error}`);
            } else {
                log(`AUTO-${node.id}`, `Successfully sent removal request for @@YELLOW@@${mainAppName}##.`);
            }
        }
    }
}

/**
 * Performs a complete reset of the node's session and state.
 * Clears cookies, storage, resets token, stops automation, updates UI, and reloads the view.
 * @param {object} node - The node object to reset.
 */
async function performNodeReset(node) {
    log(`MAIN-${node.id}`, 'Performing full session reset...');
    
    // 1. Stop Automation & Clear Token
    if (node.automationIntervalId) {
        clearInterval(node.automationIntervalId);
        node.automationIntervalId = null;
    }
    node.token = null;

    // 2. Notify UI immediately (Set Dot to Grey)
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-node-status', { 
            nodeId: node.id, 
            hasToken: false 
        });
    }

    // 3. Clear Session & Reload
    try {
        const ses = session.fromPartition(`persist:${node.id}`);
        await ses.clearStorageData({
            storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
        });
        log(`MAIN-${node.id}`, 'Session data cleared. Reloading view to Login screen...');
        if (node.view) node.view.webContents.reload();
    } catch (error) {
        log(`MAIN-${node.id}-Error`, `Failed to reset session: ${error}`);
    }
}

// New IPC Handlers for Toolbar
ipcMain.on('show-about', async () => {
    const appVersion = app.getVersion(); // Get version from package.json directly
    const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'About Flux Node Manager',
        message: 'Flux Node Manager',
        detail: `Version: ${appVersion}\nAuthor: ${require('./package.json').author}\nDescription: ${require('./package.json').description}`,
        buttons: ['OK', 'View License'],
        defaultId: 0,
        cancelId: 0
    });

    if (response === 1) { // 'View License' clicked
        const licensePath = path.join(BASE_PATH, 'LICENSE.txt');
        shell.openPath(licensePath).then((err) => {
            if (err) {
                log('MAIN-Error', `Failed to open LICENSE.txt at ${licensePath}: ${err}`);
            } else {
                log('MAIN', `Opened LICENSE.txt: ${licensePath}`);
            }
        });
    }
});

ipcMain.on('open-docs', () => {
    const locale = app.getLocale();
    let docFileName = 'MANUAL_EN.md'; // Default to English

    if (locale && locale.toLowerCase().startsWith('ru')) {
        docFileName = 'MANUAL_RU.md';
    }

    log('MAIN', `User requested docs. System locale: ${locale}. Opening: ${docFileName}`);

    const readmePath = path.join(BASE_PATH, 'docs', docFileName);
    shell.openPath(readmePath).then((err) => {
        if (err) {
            log('MAIN-Error', `Failed to open documentation at ${readmePath}: ${err}`);
        } else {
            log('MAIN', `Opened documentation: ${readmePath}`);
        }
    });
});

ipcMain.on('open-settings-file', () => {
    const settingsPath = path.join(BASE_PATH, 'settings.ini');
    shell.openPath(settingsPath).then((err) => {
        if (err) {
            log('MAIN-Error', `Failed to open settings.ini at ${settingsPath}: ${err}`);
        } else {
            log('MAIN', `Opened settings.ini: ${settingsPath}`);
        }
    });
});

// --- App Lifecycle Listeners ---

app.whenReady().then(showPreloaderAndDiscover);

app.on('before-quit', () => {
    if (logStream) {
        log('MAIN', 'Closing log stream...');
        logStream.end();
        logStream = null;
    }
});

app.on('window-all-closed', () => app.quit());

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        showPreloaderAndDiscover();
    }
});

ipcMain.on('update-view-bounds', (event, bounds) => {
    logDebug('MAIN', 'Received new bounds for views:', bounds);
    NODES.forEach(node => {
        if (node.view) node.view.setBounds(bounds);
    });
});

ipcMain.on('switch-view', (event, nodeId) => {
    const node = NODES.find(n => n.id === nodeId);
    if (node) {
        mainWindow.setTopBrowserView(node.view);
    }
});

ipcMain.on('force-refresh-node', async (event, { nodeId }) => {
    const node = NODES.find(n => n.id === nodeId);
    if (!node) {
        log('MAIN-Error', `Attempted to refresh non-existent node: ${nodeId}`);
        return;
    }

    log('MAIN', `Force refresh requested for node ${node.id}`);
    await performNodeReset(node);
});

ipcMain.on('log-info-from-preload', (event, { nodeId, message }) => {
    log(`PRELOAD-${nodeId}`, message);
});

ipcMain.on('log-debug-from-preload', (event, { nodeId, message }) => {
    logDebug(`PRELOAD-${nodeId}`, message);
});

ipcMain.on('auth-state-changed', (event, authState) => {
    const node = NODES.find(n => n.id === authState.nodeId);
    if (!node) return;

    // Notify UI about status change
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-node-status', { 
            nodeId: node.id, 
            hasToken: authState.loggedIn 
        });
    }

    if (authState.loggedIn) {
        log(`MAIN-${node.id}`, 'Received LOGIN notification.');
        
        if (safeStorage.isEncryptionAvailable()) {
            node.token = safeStorage.encryptString(authState.token);
            logDebug(`MAIN-${node.id}`, 'Token encrypted and stored.');
        } else {
            log('MAIN-Warning', 'SafeStorage is not available. Storing token in plaintext. This is not recommended.');
            node.token = authState.token; // Fallback for environments without encryption
        }

        if (!node.automationIntervalId) {
            log(`MAIN-${node.id}`, 'Starting automation in 5 seconds...');
            setTimeout(() => {
                log(`MAIN-${node.id}`, 'Initial automation cycle starting now.');
                runAutomationCycle(node);
                node.automationIntervalId = setInterval(() => runAutomationCycle(node), AUTOMATION_INTERVAL);
            }, 5000);
        }
    } else {
        log(`MAIN-${node.id}`, 'Received LOGOUT notification.');
        node.token = null;
        if (node.automationIntervalId) {
            log(`MAIN-${node.id}`, 'Stopping automation...');
            clearInterval(node.automationIntervalId);
            node.automationIntervalId = null;
        }
    }
}); // Corrected missing brace

ipcMain.on('fluxos-version-changed', (event, { nodeId, oldVersion, newVersion }) => {
    const node = NODES.find(n => n.id === nodeId);
    if (!node) return;

    log(`MAIN-${node.id}`, `WARNING: FluxOS updated from @@YELLOW@@${oldVersion}## to @@YELLOW@@${newVersion}##.`);
    log(`MAIN-${node.id}`, 'This usually invalidates the current session token. Forcing logout state.');

    // Force invalidation of the token
    node.token = null;
    
    // Stop automation
    if (node.automationIntervalId) {
        clearInterval(node.automationIntervalId);
        node.automationIntervalId = null;
    }
    
    log(`MAIN-${node.id}`, 'Automation paused. Please re-login manually via ZelCore.');
});