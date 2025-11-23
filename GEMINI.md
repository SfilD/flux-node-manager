# Gemini Project: flux-session-monitor

## Project Overview

This project is an Electron application named `flux-session-monitor` designed to monitor and manage applications running on Flux nodes. It automatically discovers Flux nodes on specified IP addresses, provides a tabbed interface to view each node's web UI, and runs an automated process to remove applications that match a defined prefix in the `settings.ini` file.

The application is built with Node.js and Electron, using `node-fetch` for API communication and `ini` for configuration management. A key architectural feature is the use of a pre-loader window that displays logs during the initial, potentially lengthy, node discovery phase before launching the main application window.

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

This will first launch a small pre-loader window to show the progress of node discovery, and then it will open the main application, which will display the discovered Flux nodes in a tabbed interface.

## Development Conventions

*   **Configuration:** The application is highly configurable through the `settings.ini` file. This file controls which IP addresses to scan for Flux nodes (`ScanIPs`), which application name prefixes to target for automatic deletion (`TargetAppPrefixes`), the automation interval, UI appearance (`FontName`, `FontSize`), and logging behavior.

*   **Main Process (`monitor-main.js`):** This is the core of the application. It manages the application lifecycle, including the pre-loader window, discovers nodes, creates the main window and `BrowserView`s for each node, and handles the automation logic for removing applications. It serves as the central hub for all IPC communication.

*   **UI (`shell.html`, `shell-renderer.js`):** The main shell of the application is a single page that creates a dynamic, auto-sizing vertical tab bar based on discovered nodes. It also features a log viewer panel that displays formatted, color-coded messages from all application processes. A "Reset Session" button is included as a troubleshooting tool to forcefully clear a node's session data.

*   **Authentication (`monitor-preload.js`):** A preload script is injected into each `BrowserView` (each Flux node's UI). It periodically polls the web page's `localStorage` for the `zelidauth` authentication token. When a login or logout is detected, it communicates the new authentication state (including the token) back to the main process. This enables the main process to perform authenticated API actions on behalf of the user. The script also injects CSS to hide superfluous UI elements from the original Flux interface.

*   **Logging:** The application features a comprehensive logging system. All logs from the main, renderer, and preload processes are collected, displayed in the main UI's log panel (with color-coding for app names), and saved to a file (`session.log` by default).

## Development Notes

*   **Flux API Definitions:** For analysis and reference, the complete Flux API specification (`fluxapi.json`) and a subset of used definitions (`used_api_definitions.json`) are located in the `~/Projects` directory. They are not part of the project's repository but are used for development context.
