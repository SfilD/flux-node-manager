# Gemini Code Understanding

## Project Overview

This project is a configurable, multi-node Electron application designed to automate the management of applications running on Flux instances. Its primary function is to monitor multiple Flux nodes simultaneously and automatically delete applications that match a list of predefined prefixes.

The application's architecture is centered around a `settings.ini` file, which dictates the entire configuration. For each Flux node defined in the settings, the application spawns a separate Electron browser window, loading the respective Flux UI. A preload script (`monitor-preload.js`) is injected into each page to capture the user's authentication token (`zelidauth`) from `localStorage` upon login. This token is then sent via IPC to the main Electron process (`monitor-main.js`).

Once a token is received for a specific node, the main process initiates an automation loop for that node. It periodically makes API calls to the Flux node to:
1.  List all running applications.
2.  Identify applications whose names contain any of the target prefixes defined in `settings.ini`.
3.  Automatically issue a command to remove any matching applications.

The application is designed to be resilient, handling user login/logout events and continuing its monitoring task without requiring a restart. All major parameters, including target application prefixes, automation interval, window sizes, and debug mode, are configurable through the `settings.ini` file.

## Key Files

*   `settings.ini`: The central configuration file. It defines the general behavior (target prefixes, automation interval, debug mode) and the list of Flux nodes to monitor, each with its own name and API/UI URLs.
*   `monitor-main.js`: The core of the application. It reads the `settings.ini` file, creates and manages the browser windows for each node, handles IPC communication, and contains the main automation logic for checking and deleting Flux applications.
*   `monitor-preload.js`: A script that runs in the context of each Flux web interface. It is responsible for detecting when a user has logged in, extracting the `zelidauth` authentication token, and passing it securely to the `monitor-main.js` process.
*   `package.json`: Defines the project's metadata, dependencies (`electron`, `node-fetch`, `ini`), and the main `start` script.

## Building and Running

### Prerequisites

*   Node.js and npm must be installed.

### Installation

1.  Install the project dependencies:
    ```bash
    npm install
    ```

### Configuration

1.  Edit the `settings.ini` file to configure the application:
    *   Under `[General]`, set the `TargetAppPrefixes` (comma-separated), `AutomationIntervalSeconds`, and `Debug` mode.
    *   Add or modify `[NodeX]` sections for each Flux node you want to monitor.

### Running the Application

To run the application, execute the following command in the project root:

```bash
npm start
```

This will launch an Electron window for each configured node. You must log in to the Flux web interface in each window to initiate the automated monitoring and deletion process for that node.

## Development Workflow

- **Development Environment:** Code is written and edited within the WSL (Windows Subsystem for Linux) environment, specifically the **Ubuntu-22.04** distribution.
- **Testing & Execution Environment:** For testing and final execution, the project files are copied to a **Windows 10 Pro** VMware virtual machine.
- **Working Directory on Windows:** The project is located at `C:\Projects\flux-auto-deleter\` on the Windows VM.
- **Critical Constraint:** All runtime and testing commands (e.g., `npm start`) **must be executed within the Windows 10 Pro environment**, not in WSL. This context is crucial for any file operations, command executions, or debugging tasks.

## Logging Conventions

Log messages are formatted to include a prefix and a timestamp for clarity: `[PREFIX][DD.MM.YYYY HH:MM] Message...`
- **[MAIN-nodeID]**: High-level events related to application control (login/logout, starting/stopping automation).
- **[AUTO-nodeID]**: Events related to the automation cycle itself (checking apps, listing found apps).
- **[API-nodeID]**: Events related to direct API calls (listing apps, removing apps).
- **[MONITOR-nodeID]**: Events from the preload script running in the browser context.
