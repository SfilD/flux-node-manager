# Gemini Code Context: flux-node-manager

## Project Overview

**Flux Node Manager** is a professional Electron-based desktop application designed for Flux Node operators. Its primary function is to monitor the status of a fleet of nodes in real-time and automatically **enforce application policies (Blocklist)** to maintain node health, security, and system stability.

**Key Features:**
*   **Multi-Node Monitoring:** Tabbed interface to manage multiple nodes simultaneously with status color indicators.
*   **Policy Enforcement:** Automatically **stops/cleans up** specific application containers (defined by prefix) once an operator has authenticated on the node.
*   **Secure Token Handling:** Uses `safeStorage` to encrypt authentication tokens in memory; sensitive data is never stored on disk.
*   **ArcaneOS & Legacy Support:** Fully compatible with both Legacy FluxOS and the new ArcaneOS.
*   **Monitor Mode:** Offers a "Kiosk" experience that hides extraneous UI elements of the node's web interface for focused event monitoring.

## Architecture

The application follows a standard Electron main/renderer architecture with strict security boundaries:

1.  **Main Process (`monitor-main.js`)**
    *   **Role:** Backend / Orchestrator.
    *   **Responsibilities:**
        *   Manages node discovery via parallel IP scanning.
        *   Runs the automation cycle to check running apps against the configured Blocklist.
        *   Handles encrypted token storage and broadcasts authorization state changes.
        *   Logs critical events to `session.log`.

2.  **Renderer Processes (UI)**
    *   **Shell (`shell.html`, `shell-renderer.js`):** The primary UI. Manages node tabs, real-time logging, and "Monitor Mode" transitions.
    *   **Preloader (`preloader.html`, `preloader-renderer.js`):** Displays progress during the initial node scanning phase.

3.  **Preload Scripts**
    *   **`monitor-preload.js`:** Injected into Node views. Detects `zelidauth` tokens and applies CSS overrides for a clean UI.
    *   **`shell-preload.js`:** Securely bridges IPC communication for the main window.

## Building and Running

**Prerequisites:**
*   Node.js (LTS)
*   Windows 10/11 (Target Environment)

**Installation:**
```bash
npm install
```

**Configuration:**
Application behavior is driven by `settings.ini` (to be created from `settings.dist.ini`).
*   `ScanIPs`: List of Flux node addresses.
*   `TargetAppPrefixes`: Prefixes for applications to be managed/stopped.
*   `AutomationIntervalSeconds`: Frequency of policy checks (min 60s).

**Running (Development):**
*Note: Must be executed in the Windows environment.*
```bash
npm start
```

**Building for Distribution:**
*Note: Must be executed in the Windows environment.*
```bash
npm run dist
```

## Release Workflow

**Prerequisites:**
*   GitHub CLI (`gh`) is installed and authenticated in WSL (`gh auth status` to check).
*   Active account: **SfilD**.

**Process:**
1.  **Preparation (WSL):**
    *   Bump version in `package.json`.
    *   Run `node sync-version.js` to update READMEs.
    *   Commit and push changes to `main`.
2.  **Build (Windows VM):**
    *   Run `npm run dist` to generate artifacts in `dist/`.
3.  **Publish (WSL):**
    *   Use `gh` to create a tag and upload assets from the `dist/` directory.
    ```bash
    gh release create vX.X.X dist/FluxNodeManager_Setup_X.X.X.exe dist/FluxNodeManager_Portable_X.X.X.exe dist/FluxNodeManager_Portable_X.X.X.zip dist/checksums.txt --title "vX.X.X - <Short Description>" --notes "<Detailed Release Notes>"
    ```

## Development Conventions

*   **Security First:** Context isolation is mandatory. All IPC must pass through defined `contextBridge` channels.
*   **API Ethics:** The app uses `listrunningapps` for checks and `appremove` for policy enforcement.
*   **Health Focus:** The goal of automation is always "maintaining node health". Avoid terms like "destructive deletion" in favor of "policy-based cleanup".
*   **Stability:** Use `fetchWithTimeout` for all network requests to prevent UI hangs during discovery or API calls.
*   **Environment:** Development occurs in WSL (Ubuntu), but execution and testing are strictly for Windows 10 Pro.

## Directory Structure

*   `monitor-main.js`: Core logic and automation loop.
*   `monitor-preload.js`: UI modifications and auth detection for nodes.
*   `shell-renderer.js`: Logic for the main management interface.
*   `settings.dist.ini`: Configuration template.
*   `docs/`: User manuals in English and Russian.