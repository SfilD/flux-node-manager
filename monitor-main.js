const { app, BrowserWindow, BrowserView, ipcMain, session } = require('electron');
const path = require('path');
const fetch = require('node-fetch');
const fs = require('fs');
const ini = require('ini');

// Suppress security warnings for local development (loading from http)
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

// Disable hardware acceleration to prevent rendering issues
app.disableHardwareAcceleration();

// --- Load Configuration from settings.ini ---
const config = ini.parse(fs.readFileSync(path.join(__dirname, 'settings.ini'), 'utf-8'));

const SCAN_IPS = (config.General.ScanIPs || '').split(',').map(ip => ip.trim()).filter(ip => ip);
const TARGET_APP_PREFIXES = (config.General.TargetAppPrefixes || '').split(',').map(p => p.trim()).filter(p => p.length > 0);
const AUTOMATION_INTERVAL = (parseInt(config.General.AutomationIntervalSeconds) || 60) * 1000;
const DEBUG_MODE = String(config.General.Debug).toLowerCase() === 'true';
const WINDOW_WIDTH = parseInt(config.General.WindowWidth) || 1200;
const WINDOW_HEIGHT = parseInt(config.General.WindowHeight) || 800;
const LOG_CLEAR_ON_START = String(config.General.LogClearOnStart).toLowerCase() === 'true';
const LOG_FILE = config.General.LogFile || 'session.log';
const FONT_NAME = config.General.FontName || 'Hack';
const FONT_SIZE = parseInt(config.General.FontSize) || 10;

// --- Global State ---
let preloaderWindow = null;
let mainWindow = null;
let activeViewId = null;
let NODES = []; // This will be populated dynamically
let logStream = null; // For file logging
let logHistory = []; // Persistent log history for the session

// --- Logging System ---

function setupFileLogger() {
    const logFilePath = path.join(__dirname, LOG_FILE);
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

// Central dispatcher for all log messages
function dispatchLog(message, isDebug = false) {
    if (isDebug && !DEBUG_MODE) {
        return;
    }
    
    logHistory.push(message);

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

// Standard-level log
function log(prefix, ...args) {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timestamp = `[${day}.${month}.${year} ${hours}:${minutes}]`;
    
    const message = `${timestamp}[${prefix}] ${args.map(arg => (typeof arg === 'object' && arg !== null) ? JSON.stringify(arg) : String(arg)).join(' ')}`;
    dispatchLog(message, false);
}

// Debug-level log
function logDebug(prefix, ...args) {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timestamp = `[${day}.${month}.${year} ${hours}:${minutes}]`;

    const message = `${timestamp}[${prefix}] ${args.map(arg => (typeof arg === 'object' && arg !== null) ? JSON.stringify(arg, null, 2) : String(arg)).join(' ')}`;
    dispatchLog(message, true);
}

// --- Application Lifecycle Functions ---

async function checkFluxNodeExistence(apiUrl) {
    try {
        await fetch(`${apiUrl}/apps/listrunningapps`, { method: 'GET', timeout: 10000 });
        return true;
    } catch (error) {
        return false;
    }
}

async function discoverNodesOnIp(ip, ipPrefix) {
    log('DISCOVERY', `Scanning IP: ${ip} with prefix ${ipPrefix}`);
    const discoveredNodes = [];
    const baseUiPort = 16126;
    const maxNodesPerIp = 8;

    for (let i = 0; i < maxNodesPerIp; i++) {
        const uiPort = baseUiPort + (i * 10);
        const apiPort = uiPort + 1;
        const apiUrl = `http://${ip}:${apiPort}`;
        
        log('DISCOVERY', `Checking for node at ${apiUrl}...`);
        if (await checkFluxNodeExistence(apiUrl)) {
            const nodeNumber = i + 1;
            const paddedNodeNumber = String(nodeNumber).padStart(2, '0');
            discoveredNodes.push({
                id: `${ipPrefix}-node${paddedNodeNumber}`,
                name: `${ipPrefix}-Node${paddedNodeNumber}`,
                uiUrl: `http://${ip}:${uiPort}`,
                apiUrl: apiUrl,
                view: null,
                token: null,
                automationIntervalId: null
            });
            log('DISCOVERY', `Found active node: ${ipPrefix}-Node${paddedNodeNumber}`);
        }
    }
    return discoveredNodes;
}

async function discoverAllNodes(ips) {
    log('DISCOVERY', 'Starting node discovery across all IPs...');
    let allFoundNodes = [];
    for (let i = 0; i < ips.length; i++) {
        const nodesOnThisIp = await discoverNodesOnIp(ips[i], `IP${String(i + 1).padStart(2, '0')}`);
        allFoundNodes = allFoundNodes.concat(nodesOnThisIp);
    }
    NODES = allFoundNodes;
    log('DISCOVERY', `Total nodes found across all IPs: ${NODES.length}`);
}

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

function showPreloaderAndDiscover() {
    setupFileLogger();

    preloaderWindow = new BrowserWindow({
        width: 680,
        height: 400,
        resizable: false,
        frame: false,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
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
        
        // When done, close the preloader
        if (preloaderWindow && !preloaderWindow.isDestroyed()) {
            preloaderWindow.close();
        }
    });

    preloaderWindow.on('closed', () => {
        preloaderWindow = null;
        createMainWindow();
    });

    preloaderWindow.show();
}

function createMainWindow() {
    if (NODES.length === 0) {
        log('MAIN-Error', 'No active Flux nodes found. Shutting down.');
        app.quit();
        return;
    }

    mainWindow = new BrowserWindow({
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        resizable: false,
        maximizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.setMenu(null);
    mainWindow.loadFile('shell.html');
    if (DEBUG_MODE) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.webContents.on('did-finish-load', () => {
        log('MAIN', 'Shell renderer finished loading. Sending initial data.');
        mainWindow.webContents.send('initialize-ui', { 
            nodes: NODES.map(n => ({ id: n.id, name: n.name, uiUrl: n.uiUrl })), 
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
                additionalArguments: [`--node-id=${node.id}`]
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
        activeViewId = NODES[0].id;
    }
}

async function listRunningApps(node) {
    if (!node.token) {
        log(`API-${node.id}`, 'Error: Not logged in. Token is missing.');
        return null;
    }
    try {
        const response = await fetch(`${node.apiUrl}/apps/listrunningapps`, { method: 'GET', headers: { 'zelidauth': node.token } });
        const data = await response.json();
        logDebug(`API-${node.id}`, 'Running Apps:', data);
        return data;
    } catch (error) {
        log(`API-${node.id}-Error`, 'Error listing running apps:', error);
        return null;
    }
}

async function removeApp(node, appName) {
    if (!node.token) {
        log(`API-${node.id}`, 'Error: Not logged in. Token is missing.');
        return null;
    }
    try {
        return await fetch(`${node.apiUrl}/apps/appremove?appname=${appName}`, { method: 'GET', headers: { 'zelidauth': node.token } });
    } catch (error) {
        log(`API-${node.id}-Error`, `Error removing app ${appName}:`, error);
        return null;
    }
}

async function runAutomationCycle(node) {
    log(`AUTO-${node.id}`, 'Cycle started.');
    const appsResponse = await listRunningApps(node);

    if (appsResponse && appsResponse.status === 'success' && appsResponse.data) {
        // --- Happy Path: API call succeeded ---
        const count = appsResponse.data.length;
        if (count === 0) {
            log(`AUTO-${node.id}`, 'Found 0 running application.');
        } else {
            log(`AUTO-${node.id}`, `Found ${count === 1 ? '1 running application' : `${count} running applications`}:`);
        }

        const appNames = appsResponse.data.map(app => {
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

        logDebug(`AUTO-${node.id}`, 'Raw application data:', appsResponse.data);

        for (const app of appNames) {
            if (app.isTarget) {
                const mainAppName = app.name.substring(app.name.lastIndexOf('_') + 1);
                log(`AUTO-${node.id}`, `Found target: ${app.name}. Removing main app: ${mainAppName}...`);

                const removeResponse = await removeApp(node, mainAppName);
                if (removeResponse && !removeResponse.ok && (removeResponse.status === 401 || removeResponse.status === 403)) {
                    log(`MAIN-${node.id}`, 'Authentication failed during removeApp. Token is invalid. Pausing automation.');
                    clearInterval(node.automationIntervalId);
                    node.automationIntervalId = null;
                    node.token = null;
                    break; // Exit the loop
                }
            }
        }
    } else {
        // --- Unhappy Path: API call failed or returned status: "error" ---
        if (node.token) {
            // If we think we have a token, but the API fails, the token is likely expired.
            log(`MAIN-${node.id}`, 'Authentication failed (API status not success). Token is likely invalid. Pausing automation.');
            clearInterval(node.automationIntervalId);
            node.automationIntervalId = null;
            node.token = null;
        } else {
            // This case should not be reached often in a running cycle, but good for safety.
            log(`AUTO-${node.id}`, 'Could not retrieve running apps (not logged in).');
        }
    }
}

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
        activeViewId = nodeId;
    }
});

ipcMain.on('force-refresh-node', async (event, { nodeId }) => {
    const node = NODES.find(n => n.id === nodeId);
    if (!node) {
        log('MAIN-Error', `Attempted to refresh non-existent node: ${nodeId}`);
        return;
    }

    log('MAIN', `Force refresh requested for node ${node.id}`);
    try {
        const ses = session.fromPartition(`persist:${node.id}`);
        await ses.clearStorageData({
            storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
        });
        log('MAIN', `Session data cleared for ${node.id}. Reloading view...`);
        node.view.webContents.reload();
    } catch (error) {
        log('MAIN-Error', `Failed to force refresh node ${node.id}:`, error);
    }
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

    if (authState.loggedIn) {
        log(`MAIN-${node.id}`, 'Received LOGIN notification.');
        node.token = authState.token;
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
});