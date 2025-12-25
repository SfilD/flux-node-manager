const { app, BrowserWindow, BrowserView, ipcMain, session, dialog, shell, safeStorage } = require('electron');
const path = require('path');

// Custom Modules
const ConfigManager = require('./src/config');
const Logger = require('./src/logger');
const { checkInternetConnection } = require('./src/utils');
const { listRunningApps, removeApp } = require('./src/flux-api');
const { discoverNodesOnIp } = require('./src/discovery');
const { getStrings } = require('./src/i18n');

// --- Path Resolution Helper ---
function resolveBasePath() {
    if (!app.isPackaged) return __dirname;
    if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
    return path.dirname(app.getPath('exe'));
}

const BASE_PATH = resolveBasePath();

// --- Configuration & Logging ---
const configManager = new ConfigManager(BASE_PATH);
const config = configManager.getSettings();

// Helper to send log to active window
const dispatchLogToUI = (message) => {
    const targetWindow = preloaderWindow || mainWindow;
    if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('log-message', message);
    }
};

const logger = new Logger(BASE_PATH, config, dispatchLogToUI);

// --- Global Error Handlers ---
process.on('uncaughtException', (error, origin) => {
    const strings = getStrings(app.getLocale()).dialogs.criticalError;
    const errorMsg = `${strings.message}${error.stack || error}`;
    logger.log('FATAL-ERROR', `An uncaught exception occurred: ${error.stack || error}`, origin);
    dialog.showErrorBox(strings.title, errorMsg);
    app.quit();
});

process.on('unhandledRejection', (reason) => {
    const strings = getStrings(app.getLocale()).dialogs.criticalError;
    const reasonMsg = `${strings.message}${reason.stack || reason}`;
    logger.log('FATAL-ERROR', 'An unhandled promise rejection occurred:', reasonMsg);
    dialog.showErrorBox(strings.title, reasonMsg);
    app.quit();
});

// App Config
app.disableHardwareAcceleration();
// Aggressive GPU disabling for VMs (VMware/VirtualBox) to prevent white/blank screens
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu-rasterization');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('log-level', '3');

// --- Global State ---
let preloaderWindow = null;
let mainWindow = null;
let NODES = []; 

// --- Application Logic ---

async function discoverAllNodes(ips) {
    logger.log('DISCOVERY', 'Starting node discovery across all IPs...');
    const discoveryPromises = ips.map((ip, index) => {
        const ipPrefix = `IP${String(index + 1).padStart(2, '0')}`;
        return discoverNodesOnIp(ip, ipPrefix, logger);
    });

    const resultsByIp = await Promise.all(discoveryPromises);
    NODES = resultsByIp.flat();
    logger.log('DISCOVERY', `Total nodes found across all IPs: ${NODES.length}`);
}

async function clearAllCaches() {
    logger.log('CACHE', 'Starting to clear all session caches...');
    for (const node of NODES) {
        try {
            const ses = session.fromPartition(`persist:${node.id}`);
            await ses.clearStorageData({ storages: ['appcache', 'cachestorage', 'shadercache'] });
            logger.log('CACHE', `Successfully cleared cache for partition: ${node.id}`);
        } catch (error) {
            logger.log('CACHE-Error', `Failed to clear cache for node ${node.id}:`, error);
        }
    }
    logger.log('CACHE', 'Finished clearing all session caches.');
}

async function handleNoNodesError() {
    logger.log('MAIN-Error', 'No active nodes found. Waiting for user action...');
    
    const locale = app.getLocale();
    const strings = getStrings(locale).dialogs.noNodes;
    const isRu = locale && locale.toLowerCase().startsWith('ru'); // Still need this for doc file selection logic below
    
    const { response } = await dialog.showMessageBox(preloaderWindow || null, {
        type: 'error',
        title: strings.title,
        message: strings.title,
        detail: strings.message,
        buttons: strings.buttons,
        defaultId: 0,
        cancelId: 2,
        noLink: true
    });

    if (response === 0) {
        shell.openPath(path.join(BASE_PATH, 'settings.ini'));
    } else if (response === 1) {
        const docName = isRu ? 'MANUAL_RU.md' : 'MANUAL_EN.md';
        shell.openPath(path.join(BASE_PATH, 'docs', docName));
    }
}

async function runAutomationCycle(node) {
    logger.log(`AUTO-${node.id}`, 'Cycle started.');

    if (!node.token) {
        logger.log(`AUTO-${node.id}`, 'Automation cycle skipped: Not logged in.');
        if (node.automationIntervalId) {
            clearInterval(node.automationIntervalId);
            node.automationIntervalId = null;
        }
        return;
    }

    const runningApps = await listRunningApps(node, logger);
    const count = runningApps.length;
    logger.log(`AUTO-${node.id}`, count === 0 ? 'Found 0 running applications.' : `Found ${count} running applications.`);

    const appNames = runningApps.map(app => {
        if (app.Names && app.Names.length > 0) {
            const name = app.Names[0].startsWith('/') ? app.Names[0].substring(1) : app.Names[0];
            const isTarget = config.TARGET_APP_PREFIXES.some(prefix => name.includes(prefix));
            return { name, isTarget };
        }
        return null;
    }).filter(n => n);

    appNames.forEach(app => logger.log(`AUTO-${node.id}`, `  - @@${app.isTarget ? 'RED' : 'GREEN'}@@${app.name}##`));

    for (const app of appNames) {
        if (app.isTarget) {
            const mainAppName = app.name.substring(app.name.lastIndexOf('_') + 1);
            logger.log(`AUTO-${node.id}`, `Policy match found: @@YELLOW@@${app.name}##. Enforcing cleanup...`);

            const removeResult = await removeApp(node, mainAppName, logger);
            
            if (removeResult.authError) {
                logger.log(`MAIN-${node.id}`, 'Authentication failed. Resetting...');
                await performNodeReset(node);
                break;
            } else if (!removeResult.success) {
                logger.log(`API-${node.id}-Error`, `Failed to clean up app @@YELLOW@@${mainAppName}##: ${removeResult.error}`);
            } else {
                logger.log(`AUTO-${node.id}`, `Successfully sent cleanup request for @@YELLOW@@${mainAppName}##.`);
            }
        }
    }
}

async function performNodeReset(node) {
    logger.log(`MAIN-${node.id}`, 'Performing full session reset...');
    
    if (node.automationIntervalId) {
        clearInterval(node.automationIntervalId);
        node.automationIntervalId = null;
    }
    node.token = null;

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-node-status', { nodeId: node.id, hasToken: false });
    }

    try {
        const ses = session.fromPartition(`persist:${node.id}`);
        await ses.clearStorageData({ storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage'] });
        logger.log(`MAIN-${node.id}`, 'Session data cleared. Reloading...');
        if (node.view) node.view.webContents.reload();
    } catch (error) {
        logger.log(`MAIN-${node.id}-Error`, `Failed to reset session: ${error}`);
    }
}

// --- Windows ---

async function showPreloaderAndDiscover() {
    const hasInternet = await checkInternetConnection();
    if (!hasInternet) {
        const strings = getStrings(app.getLocale()).dialogs.networkError;
        logger.log('MAIN-Error', 'No internet connection.');
        dialog.showErrorBox(strings.title, strings.message);
        app.quit();
        return;
    }

    preloaderWindow = new BrowserWindow({
        width: 680, height: 400, resizable: false, frame: false, alwaysOnTop: true,
        icon: path.join(__dirname, 'assets', 'icon.ico'),
        webPreferences: { preload: path.join(__dirname, 'preloader-preload.js'), contextIsolation: true, nodeIntegration: false }
    });

    preloaderWindow.loadFile('preloader.html');
    
    preloaderWindow.webContents.on('did-finish-load', async () => {
        preloaderWindow.webContents.send('initialize-preloader', {
            logHistory: logger.getHistory(),
            fontName: config.FONT_NAME,
            fontSize: config.FONT_SIZE
        });

        await discoverAllNodes(config.SCAN_IPS);
        await clearAllCaches();
        
        if (NODES.length === 0) {
            await handleNoNodesError();
            app.quit();
        } else {
            if (preloaderWindow && !preloaderWindow.isDestroyed()) preloaderWindow.close();
        }
    });

    preloaderWindow.on('closed', () => {
        preloaderWindow = null;
        if (NODES.length > 0) createMainWindow();
    });

    preloaderWindow.show();
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        title: `Flux Node Manager v${app.getVersion()}`,
        width: config.WINDOW_WIDTH, height: config.WINDOW_HEIGHT,
        resizable: false, maximizable: false,
        icon: path.join(__dirname, 'assets', 'icon.ico'),
        webPreferences: { preload: path.join(__dirname, 'shell-preload.js'), contextIsolation: true, nodeIntegration: false }
    });
    
    mainWindow.setMaxListeners(100);
    mainWindow.setMenu(null);
    mainWindow.loadFile('shell.html');
    if (config.DEBUG_MODE) mainWindow.webContents.openDevTools({ mode: 'detach' });

    mainWindow.webContents.on('did-finish-load', () => {
        logger.log('MAIN', 'Shell renderer finished loading.');
        mainWindow.webContents.send('initialize-ui', {
            appVersion: app.getVersion(),
            nodes: NODES.map(n => ({ id: n.id, name: n.name, uiUrl: n.uiUrl, hasToken: !!n.token })),
            activeId: NODES[0]?.id || null,
            debug: config.DEBUG_MODE,
            fontName: config.FONT_NAME,
            fontSize: config.FONT_SIZE,
            logHistory: logger.getHistory()
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
        
        view.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

        view.webContents.on('will-navigate', (event, targetUrl) => {
            if (targetUrl.startsWith('zel:')) {
                event.preventDefault();
                shell.openExternal(targetUrl);
                return;
            }
            const currentUrl = view.webContents.getURL();
            try {
                const targetObj = new URL(targetUrl);
                const currentObj = new URL(currentUrl);
                const isRoot = targetObj.pathname === '/' || targetObj.pathname === '/index.html';
                const isLogin = targetObj.pathname.startsWith('/id/');

                if (targetObj.origin !== currentObj.origin || (!isRoot && !isLogin)) {
                    event.preventDefault();
                    logger.logDebug(`NAV-${node.id}`, `Blocked navigation: ${targetUrl}`);
                }
            } catch (err) { event.preventDefault(); }
        });

        mainWindow.addBrowserView(view);
        view.setAutoResize({ width: true, height: true });
        view.webContents.loadURL(node.uiUrl);
        if (config.DEBUG_MODE) view.webContents.openDevTools({ mode: 'detach' });
        node.view = view;
    });

    if (NODES.length > 0) mainWindow.setTopBrowserView(NODES[0].view);
}

// --- IPC Handlers ---

ipcMain.on('show-about', async () => {
    const strings = getStrings(app.getLocale()).dialogs.about;
    const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: strings.title,
        message: 'Flux Node Manager',
        detail: `Version: ${app.getVersion()}\nAuthor: SfilD Labs\nDescription:\n${strings.description}`,
        buttons: strings.buttons,
        defaultId: 0,
        cancelId: 0
    });

    if (response === 1) {
        shell.openPath(path.join(BASE_PATH, 'LICENSE.txt'));
    }
});

ipcMain.on('open-docs', () => {
    const locale = app.getLocale();
    const docName = (locale && locale.toLowerCase().startsWith('ru')) ? 'MANUAL_RU.md' : 'MANUAL_EN.md';
    shell.openPath(path.join(BASE_PATH, 'docs', docName));
});

ipcMain.on('open-settings-file', () => {
    shell.openPath(path.join(BASE_PATH, 'settings.ini'));
});

ipcMain.on('update-view-bounds', (event, bounds) => {
    NODES.forEach(n => { if (n.view) n.view.setBounds(bounds); });
});

ipcMain.on('switch-view', (event, nodeId) => {
    const node = NODES.find(n => n.id === nodeId);
    if (node) mainWindow.setTopBrowserView(node.view);
});

ipcMain.on('force-refresh-node', async (event, { nodeId }) => {
    const node = NODES.find(n => n.id === nodeId);
    if (node) await performNodeReset(node);
});

ipcMain.on('log-info-from-preload', (event, { nodeId, message }) => logger.log(`PRELOAD-${nodeId}`, message));
ipcMain.on('log-debug-from-preload', (event, { nodeId, message }) => logger.logDebug(`PRELOAD-${nodeId}`, message));

ipcMain.on('auth-state-changed', (event, authState) => {
    const node = NODES.find(n => n.id === authState.nodeId);
    if (!node) return;

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-node-status', { nodeId: node.id, hasToken: authState.loggedIn });
    }

    if (authState.loggedIn) {
        logger.log(`MAIN-${node.id}`, 'Received LOGIN notification.');
        if (safeStorage.isEncryptionAvailable()) {
            node.token = safeStorage.encryptString(authState.token);
        } else {
            node.token = authState.token;
        }

        if (!node.automationIntervalId) {
            setTimeout(() => {
                runAutomationCycle(node);
                node.automationIntervalId = setInterval(() => runAutomationCycle(node), config.AUTOMATION_INTERVAL);
            }, 5000);
        }
    } else {
        logger.log(`MAIN-${node.id}`, 'Received LOGOUT notification.');
        node.token = null;
        if (node.automationIntervalId) {
            clearInterval(node.automationIntervalId);
            node.automationIntervalId = null;
        }
    }
});

ipcMain.on('fluxos-version-changed', (event, { nodeId, oldVersion, newVersion }) => {
    const node = NODES.find(n => n.id === nodeId);
    if (!node) return;
    logger.log(`MAIN-${node.id}`, `WARNING: FluxOS updated from ${oldVersion} to ${newVersion}. Forcing logout.`);
    node.token = null;
    if (node.automationIntervalId) {
        clearInterval(node.automationIntervalId);
        node.automationIntervalId = null;
    }
});

// --- App Lifecycle ---

app.whenReady().then(showPreloaderAndDiscover);

app.on('before-quit', () => logger.close());
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) showPreloaderAndDiscover(); });