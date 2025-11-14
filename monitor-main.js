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
const TABS_HEIGHT = 41; // Height of the tab bar

// --- Global State ---
let mainWindow = null;
let activeViewId = null;
let NODES = []; // This will be populated dynamically

// --- Function Definitions ---

function log(prefix, ...args) {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  
  const timestamp = `[${day}.${month}.${year} ${hours}:${minutes}]`;
  
  if (prefix.toLowerCase().includes('error')) {
    console.error(`${timestamp}[${prefix}]`, ...args);
  } else {
    console.log(`${timestamp}[${prefix}]`, ...args);
  }
}

async function checkFluxNodeExistence(apiUrl) {
    try {
        const response = await fetch(`${apiUrl}/apps/listrunningapps`, {
            method: 'GET',
            timeout: 10000 // 10-second timeout for slower nodes
        });
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
        const exists = await checkFluxNodeExistence(apiUrl);

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
            discoveredNodes.push(node);
            log('DISCOVERY', `Found active node: ${node.name} at ${node.apiUrl}`);
        }
    }
    return discoveredNodes;
}

async function discoverAllNodes(ips) {
    log('DISCOVERY', 'Starting node discovery across all IPs...');
    let allFoundNodes = [];
    for (let i = 0; i < ips.length; i++) {
        const ip = ips[i];
        const ipPrefix = `IP${String(i + 1).padStart(2, '0')}`;
        const nodesOnThisIp = await discoverNodesOnIp(ip, ipPrefix);
        allFoundNodes = allFoundNodes.concat(nodesOnThisIp);
    }
    NODES = allFoundNodes; // Update the global NODES array
    log('DISCOVERY', `Total nodes found across all IPs: ${NODES.length}`);
}

async function clearAllCaches() {
    log('CACHE', 'Starting to clear all session caches...');
    for (const node of NODES) {
        try {
            const partition = `persist:${node.id}`;
            const ses = session.fromPartition(partition);
            // Clear specific storage types to avoid wiping login data (cookies, localStorage)
            await ses.clearStorageData({
                storages: ['appcache', 'cachestorage', 'shadercache']
            });
            log('CACHE', `Successfully cleared cache for partition: ${partition}`);
        } catch (error) {
            log('CACHE-Error', `Failed to clear cache for node ${node.id}:`, error);
        }
    }
    log('CACHE', 'Finished clearing all session caches.');
}

async function listRunningApps(node) {
    if (!node.token) {
        log(`API-${node.id}`, 'Error: Not logged in. Token is missing.');
        return null;
    }
    try {
        const response = await fetch(`${node.apiUrl}/apps/listrunningapps`, {
            method: 'GET',
            headers: { 'zelidauth': node.token }
        });
        const data = await response.json();
        if (DEBUG_MODE) {
          log(`API-${node.id}`, 'Running Apps:', JSON.stringify(data, null, 2));
        }
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
        const response = await fetch(`${node.apiUrl}/apps/appremove?appname=${appName}`, {
            method: 'GET',
            headers: { 'zelidauth': node.token }
        });
        return response;
    } catch (error) {
        log(`API-${node.id}-Error`, `Error removing app ${appName}:`, error);
        return null;
    }
}

async function runAutomationCycle(node) {
  log(`AUTO-${node.id}`, 'Cycle started.');
  log(`AUTO-${node.id}`, 'Checking for target applications to remove...');
  const appsResponse = await listRunningApps(node);

  if (appsResponse && appsResponse.status === 'success' && appsResponse.data) {
    log(`AUTO-${node.id}`, `Found ${appsResponse.data.length} running applications:`);
    const appNames = appsResponse.data.map(app => {
        if (app.Names && app.Names.length > 0) {
            let containerName = app.Names[0];
            if (containerName.startsWith('/')) {
                return containerName.substring(1);
            }
            return containerName;
        }
        return null;
    }).filter(name => name !== null);

    appNames.forEach(name => {
        log(`AUTO-${node.id}`, `  - ${name}`);
    });

    if (DEBUG_MODE) {
        log(`AUTO-${node.id}`, 'Raw application data:', JSON.stringify(appsResponse.data, null, 2));
    }

    for (const app of appsResponse.data) {
      if (app.Names && app.Names.length > 0) {
        let containerName = app.Names[0];
        if (containerName.startsWith('/')) {
          containerName = containerName.substring(1);
        }
        const prefixMatch = TARGET_APP_PREFIXES.find(prefix => containerName.includes(prefix));
        if (prefixMatch) {
          // Correctly extract the main app name, which is the part before the first underscore.
          // const mainAppName = containerName.split('_')[0];
          const mainAppName = containerName.substring(containerName.lastIndexOf('_') + 1);
          log(`AUTO-${node.id}`, `Found target app component: ${containerName} (prefix: ${prefixMatch}). Attempting to remove main app: ${mainAppName}...`);
          
          const removeResponse = await removeApp(node, mainAppName);

          if (removeResponse && !removeResponse.ok) {
            if (removeResponse.status === 401 || removeResponse.status === 403) {
              log(`MAIN-${node.id}`, 'Authentication failed during removeApp. Token is invalid. Pausing automation.');
              clearInterval(node.automationIntervalId);
              node.automationIntervalId = null;
              node.token = null;
              break;
            }
          } else if (removeResponse && removeResponse.ok) {
             if (DEBUG_MODE) {
                const responseText = await removeResponse.text();
                log(`API-${node.id}`, `Raw remove response for ${mainAppName}:`, responseText);
                try {
                    const jsonStrings = responseText.split('}{');
                    const parsedObjects = [];
                    jsonStrings.forEach((jsonStr, index) => {
                        let currentJson = jsonStr;
                        if (index > 0) { currentJson = '{' + currentJson; }
                        if (index < jsonStrings.length - 1) { currentJson = currentJson + '}'; }
                        try {
                            const data = JSON.parse(currentJson);
                            parsedObjects.push(data);
                            log(`API-${node.id}`, `Parsed step ${parsedObjects.length} for ${mainAppName}:`, JSON.stringify(data, null, 2));
                        } catch (parseError) {
                            log(`API-${node.id}-Error`, `Failed to parse step ${index + 1} of remove response for ${mainAppName}. Error: ${parseError.message}. Part: ${currentJson}`);
                        }
                    });
                    if (parsedObjects.length > 0) {
                        log(`API-${node.id}`, `Final status for ${mainAppName}:`, JSON.stringify(parsedObjects[parsedObjects.length - 1], null, 2));
                    }
                } catch (e) {
                    log(`API-${node.id}-Error`, `General error processing remove response for ${mainAppName}. Error: ${e.message}`);
                }
             } else {
                await removeResponse.text();
             }
          }
        }
      }
    }
  } else if (node.token) {
    log(`AUTO-${node.id}`, 'Could not retrieve running apps. API might be down.');
  }
}

async function createApp() {
    await discoverAllNodes(SCAN_IPS);
    await clearAllCaches();

    if (NODES.length === 0) {
        log('MAIN-Error', 'No active Flux nodes found on any specified IPs. Shutting down.');
        app.quit();
        return;
    }

    mainWindow = new BrowserWindow({
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('shell.html');
    if (DEBUG_MODE) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.webContents.on('did-finish-load', () => {
        log('MAIN', 'Shell renderer finished loading. Sending tab info.');
        mainWindow.webContents.send('initialize-tabs', { 
            nodes: NODES.map(n => ({ id: n.id, name: n.name })), 
            activeId: activeViewId 
        });
    });

    NODES.forEach(node => {
        const view = new BrowserView({
            webPreferences: {
                preload: path.join(__dirname, 'monitor-preload.js'),
                partition: `persist:${node.id}`,
                additionalArguments: [`--node-id=${node.id}`, `--debug-mode=${DEBUG_MODE}`],
                sandbox: false
            }
        });
        
        mainWindow.addBrowserView(view);
        view.setBounds({ x: 0, y: TABS_HEIGHT, width: WINDOW_WIDTH, height: WINDOW_HEIGHT - TABS_HEIGHT });
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

// --- App Lifecycle ---

app.whenReady().then(createApp);

ipcMain.on('switch-view', (event, nodeId) => {
    const node = NODES.find(n => n.id === nodeId);
    if (node) {
        mainWindow.setTopBrowserView(node.view);
        activeViewId = nodeId;
    }
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

app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
        createApp();
    }
});

app.on('window-all-closed', function () {
    app.quit();
});