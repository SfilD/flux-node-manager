# Gemini Code Understanding

## Project Overview

This project is a configurable, single-window, multi-session Electron application designed to automate the management of applications running on Flux instances. Its core feature is the **automatic discovery** of nodes. On startup, the application scans a specified IP address for active Flux nodes based on a known port scheme.

For each discovered node, the application creates a tab within its single window. Each tab's content is rendered in a separate `BrowserView` with an isolated session (`partition`), ensuring that logins and cookies are kept separate for each node.

A preload script (`monitor-preload.js`) is injected into each `BrowserView` to capture the user's authentication token (`zelidauth`) from `localStorage` upon login. This token is then sent via IPC to the main Electron process (`monitor-main.js`).

Once a token is received for a specific node, the main process initiates an automation loop for that node. It periodically makes API calls to the Flux node to:
1.  List all running applications.
2.  Identify applications whose names contain any of the target prefixes defined in `settings.ini`.
3.  Automatically issue a command to remove any matching applications.

## Key Files

*   `settings.ini`: The central configuration file. It defines the `ScanIP` for the auto-discovery process, as well as general behavior like target prefixes and automation intervals.
*   `monitor-main.js`: The core of the application. It performs the node discovery on startup, creates the main window and all `BrowserView`s, handles IPC communication, and contains the main automation logic.
*   `monitor-preload.js`: A script that runs in the context of each `BrowserView`. It is responsible for detecting login/logout events, hiding the sidebar menu, and passing the `zelidauth` token to the main process.
*   `shell.html`, `shell.css`, `shell-renderer.js`: These files constitute the application's main UI shell, providing the tabbed interface for navigating between discovered nodes.
*   `package.json`: Defines the project's metadata, dependencies, and the `start` script.

## Building and Running

### Prerequisites

*   Node.js and npm must be installed.

### Installation

1.  Install the project dependencies:
    ```bash
    npm install
    ```

### Configuration

1.  Edit the `settings.ini` file to configure the application.
    *   Under `[General]`, set the `ScanIP` to the IP address of the machine hosting your Flux nodes.
    *   Configure other parameters like `TargetAppPrefixes` and `AutomationIntervalSeconds` as needed.

### Running the Application

To run the application, execute the following command in the project root:

```bash
npm start
```

This will launch a single Electron window and begin scanning for active nodes. Tabs will be created for each discovered node. You must log in to the Flux web interface in each tab to initiate the automated monitoring for that node.

## Development Workflow

- **Development Environment:** Code is written and edited within the WSL (Windows Subsystem for Linux) environment, specifically the **Ubuntu-22.04** distribution.
- **Testing & Execution Environment:** For testing and final execution, the project files are copied to a **Windows 10 Pro** VMware virtual machine.
- **Working Directory on Windows:** The project is located at `C:\Projects\flux-auto-deleter\` on the Windows VM.
- **Critical Constraint:** All runtime and testing commands (e.g., `npm start`) **must be executed within the Windows 10 Pro environment**, not in WSL.

## Logging Conventions

Log messages are formatted as `[DD.MM.YYYY HH:MM][PREFIX] Message...`
- **[DISCOVERY]**: Events related to the initial node scanning process.
- **[MAIN-nodeID]**: High-level events related to application control.
- **[AUTO-nodeID]**: Events related to the automation cycle.
- **[API-nodeID]**: Events related to direct API calls.
- **[MONITOR-nodeID]**: Events from the preload script.
