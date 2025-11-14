# Gemini Project: flux-auto-deleter

## Project Overview

This project is an Electron application named `flux-session-monitor` designed to monitor and manage applications running on Flux nodes. It automatically discovers Flux nodes on specified IP addresses, provides a tabbed interface to view each node's web UI, and runs an automated process to remove applications that match a defined prefix in the `settings.ini` file.

The application is built with Node.js and Electron, using `node-fetch` for API communication and `ini` for configuration management.

## Building and Running

### Dependencies

*   Node.js
*   npm

### Installation

To install the dependencies, run the following command in the project root directory:

```bash
npm install
```

### Running the Application

According to the `README.md`, the application is developed in a WSL environment but must be run on a Windows 10 machine.

To start the application, use the following command in the project directory on the Windows machine:

```bash
npm start
```

This will launch the Electron application, which will then proceed to discover and display the configured Flux nodes.

## Development Conventions

*   **Configuration:** The application is configured through the `settings.ini` file. This file controls which IP addresses to scan for Flux nodes (`ScanIPs`), which application name prefixes to target for automatic deletion (`TargetAppPrefixes`), the automation interval, and other settings.
*   **Main Process:** The core logic resides in `monitor-main.js`. This file manages the Electron application lifecycle, discovers nodes, creates the main window and BrowserViews for each node, and handles the automation logic for removing applications.
*   **UI:** The main shell of the application is defined in `shell.html` and controlled by `shell-renderer.js`. This creates the tabbed navigation to switch between different Flux node views.
*   **Authentication:** The `monitor-preload.js` script is injected into each BrowserView. It monitors the session for login/logout events and communicates the authentication state (including the auth token) back to the main process. This token is then used to perform authenticated API actions, such as listing and removing applications.
*   **Logging:** The application includes logging to the console with timestamps and prefixes for different modules (e.g., `DISCOVERY`, `API`, `AUTO`).
