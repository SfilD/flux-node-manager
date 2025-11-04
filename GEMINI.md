# Gemini Code Understanding

## Project Overview

This project is an Electron application designed to automate the management of applications running on a Flux instance. Its primary function is to monitor for and automatically delete specific applications that match a predefined prefix.

The application works by loading the Flux web interface in a browser window. A preload script (`monitor-preload.js`) is injected into the page to capture the user's authentication token (`zelidauth`) from `localStorage` upon login. This token is then sent to the main Electron process (`monitor-main.js`).

Once authenticated, the main process enters a loop, periodically making API calls to the Flux node to:
1.  List all running applications.
2.  Identify applications whose names contain the target prefix, `StuckContainer`.
3.  Automatically issue a command to remove any matching applications.

## Key Files

*   `monitor-main.js`: The core of the application. It manages the Electron window, handles IPC communication with the preload script, and contains the main automation logic for checking and deleting Flux applications.
*   `monitor-preload.js`: A script that runs in the context of the Flux web interface. It is responsible for detecting when a user has logged in, extracting the `zelidauth` authentication token, and passing it securely to the `monitor-main.js` process.
*   `package.json`: Defines the project's metadata, dependencies (`electron`, `node-fetch`), and scripts. The key script is `start`, which executes the application.
*   `index.html`: A simple HTML file that appears to be a placeholder or a remnant of a previous development stage. The application's primary interface is the live Flux web UI, which is loaded directly.

## Building and Running

### Prerequisites

*   Node.js and npm must be installed.

### Installation

1.  Install the project dependencies:
    ```bash
    npm install
    ```

### Running the Application

To run the application, execute the following command in the project root:

```bash
npm start
```

This will launch the Electron window and load the Flux login page. You must log in to the Flux web interface to initiate the automated monitoring and deletion process.

### Development Workflow

- **Development Environment:** Code is written and edited within the WSL (Windows Subsystem for Linux) environment, specifically the **Ubuntu-22.04** distribution.
- **Testing & Execution Environment:** For testing and final execution, the project files are copied to a **Windows 10 Pro** VMware virtual machine.
- **Working Directory on Windows:** The project is located at `C:\Projects\flux-auto-deleter\` on the Windows VM.
- **Critical Constraint:** All runtime and testing commands (e.g., `npm start`) **must be executed within the Windows 10 Pro environment**, not in WSL. This context is crucial for any file operations, command executions, or debugging tasks.

## Development Conventions

*   **Authentication:** The application relies on capturing the `zelidauth` token from the Flux web interface's `localStorage`.
*   **Targeting:** The automation logic specifically targets applications where the container name includes the prefix `StuckContainer`.
*   **API Interaction:** The application communicates with the Flux API (hardcoded to `http://1.2.3.4:16127`) for listing and removing applications.
*   **Logging:** The preload script includes a `DEBUG` flag, which, when enabled, provides detailed logs in the developer console regarding the state of `localStorage`, `sessionStorage`, and cookies.
