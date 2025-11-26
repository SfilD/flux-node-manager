# Gemini Code Context: flux-auto-deleter

## Project Overview

This project, `flux-auto-deleter`, is an Electron-based desktop application designed to monitor and manage "Flux nodes" on a local network. Its primary function is to automatically log into these nodes and periodically remove specific, predefined applications. The application provides a multi-tabbed interface where each tab displays the web UI of a discovered Flux node, with an aggregated logging panel to show real-time activity.

**Key Technologies:**
- **Framework:** Electron
- **Languages:** JavaScript (Node.js)
- **Configuration:** INI file (`settings.ini`)
- **Dependencies:** `electron`, `node-fetch`, `ini`

**Architecture:**
The application consists of three main parts:
1.  **Main Process (`monitor-main.js`):** The backend of the Electron app. It handles node discovery, window management, and the core automation logic. It reads settings from `settings.ini` to discover nodes by scanning specified IP addresses. For each discovered node, it creates an Electron `BrowserView`. It now uses modern Electron security practices with `contextIsolation` enabled.
2.  **Renderer Process (`shell.html`, `shell-renderer.js`):** The main UI of the application. It displays a tab for each discovered node, a log viewer, and a quick access toolbar. It communicates with the main process via a secure `contextBridge`.
3.  **Preload Scripts:**
    *   `monitor-preload.js`: Injected into the web content of each Flux node's UI (`BrowserView`). Its crucial role is to monitor the node's `localStorage` for an authentication token (`zelidauth`). When a token is found, it sends it to the main process, enabling the automation cycle. It also injects CSS to hide unwanted UI elements.
    *   `shell-preload.js` & `preloader-preload.js`: Securely expose IPC functionality to their respective renderer processes using `contextBridge`.

## Building and Running

The development workflow specifies that coding occurs in a WSL environment, but the application is intended to be run and tested on a Windows 10 Pro virtual machine.

- **Installation:**
  ```bash
  npm install
  ```

- **Running the Application:**
  The `package.json` file defines a `start` script. This command should be executed in the project's root directory on the Windows 10 Pro environment.
  ```bash
  npm start
  ```

- **Configuration:**
  All runtime behavior is controlled by `settings.ini`. Before running the application, you must configure:
  - `ScanIPs`: A comma-separated list of IP addresses to scan for Flux nodes.
  - `TargetAppPrefixes`: Comma-separated names or prefixes of applications to be automatically removed.
  - `AutomationIntervalSeconds`: The time in seconds between each application removal cycle.

## Development Conventions

- **Configuration Management:** All configuration is centralized in `settings.ini`. There are no hardcoded secrets or settings in the source code.
- **Inter-Process Communication (IPC):** The application relies on Electron's `contextBridge` for secure IPC between the main process, the renderer process, and the preload scripts.
- **UI:** The UI is kept simple, with the main window acting as a "shell" that hosts the web content of the nodes. The `monitor-preload.js` script actively hides parts of the original web UI to create a more integrated experience.
- **Error Handling:** Network requests are wrapped in a `fetchWithTimeout` utility to prevent hangs, and API call responses are validated to ensure stability.
- **Asynchronous Operations:** Node discovery is performed in parallel using `Promise.all` for a significantly faster startup.
