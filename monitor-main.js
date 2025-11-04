const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fetch = require('node-fetch');

let zelidauth_token = null;
const TARGET_APP_PREFIX = "StuckContainer";


function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'monitor-preload.js'),
      sandbox: false
    }
  });

  mainWindow.loadURL('http://1.2.3.4:16126/');
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.on('zelidauth-token', async (event, token) => {
    if (zelidauth_token) return; // Prevent re-triggering

    zelidauth_token = token;
    console.log('[MAIN] Received zelidauth token. Starting automation...');
    
    // Run the automation loop every 60 seconds
    setInterval(async () => {
      console.log('[AUTOMATION] Checking for target applications to remove...');
      const appsResponse = await listRunningApps();
      if (appsResponse && appsResponse.status === 'success' && appsResponse.data) {
        for (const app of appsResponse.data) {
          if (app.Names && app.Names.length > 0) {
            let containerName = app.Names[0];
            if (containerName.startsWith('/')) {
              containerName = containerName.substring(1);
            }
            if (containerName.includes(TARGET_APP_PREFIX)) {
              // Extract the main app name, which starts with our prefix
              const mainAppName = containerName.substring(containerName.indexOf(TARGET_APP_PREFIX));
              console.log(`[AUTOMATION] Found target app component: ${containerName}. Attempting to remove main app: ${mainAppName}...`);
              await removeApp(mainAppName);
            }
          }
        }
      } else {
        console.log('[AUTOMATION] No running apps found or error retrieving list.');
      }
    }, 60000); // 60000 ms = 1 minute
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  app.quit();
});

// --- API Call Functions ---

const API_BASE_URL = 'http://1.2.3.4:16127';

async function listRunningApps() {
    if (!zelidauth_token) {
        console.log('[API] Error: Not logged in. zelidauth_token is missing.');
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/apps/listrunningapps`, {
            method: 'GET',
            headers: { 'zelidauth': zelidauth_token }
        });
        const data = await response.json();
        console.log('[API] Running Apps:', JSON.stringify(data, null, 2));
        return data;
    } catch (error) {
        console.error('[API] Error listing running apps:', error);
    }
}

async function removeApp(appName) {
    if (!zelidauth_token) {
        console.log('[API] Error: Not logged in. zelidauth_token is missing.');
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/apps/appremove?appname=${appName}`, {
            method: 'GET',
            headers: { 'zelidauth': zelidauth_token }
        });
        const data = await response.json();
        console.log(`[API] Remove response for ${appName}:`, JSON.stringify(data, null, 2));
        return data;
    } catch (error) {
        console.error(`[API] Error removing app ${appName}:`, error);
    }
}
