# Gemini Code Assistant Context

## Project Overview

This project, `flux-auto-deleter`, is an Electron application designed to monitor and manage multiple FluxNodes. Its primary purpose is to automate the deletion of specific applications running on these nodes. The application discovers nodes by scanning a configurable list of IP addresses. It then provides a tabbed interface where each tab displays the web interface of a discovered FluxNode.

Once a user logs into a node through the provided interface, the application begins an automated cycle. It periodically checks the list of running applications on that node and automatically removes any applications whose names match a predefined list of prefixes.

## Key Technologies

- **Electron:** Used as the framework to build the cross-platform desktop application.
- **Node.js:** The underlying runtime for the application.
- **HTML/CSS/JavaScript:** Used for the application's shell and renderer processes.
- **node-fetch:** Used to make API calls to the FluxNodes.
- **ini:** Used for parsing the `settings.ini` configuration file.

## Architecture

The application consists of a main Electron process (`monitor-main.js`) and several renderer processes:
- **`shell.html` / `shell-renderer.js`:** This is the main UI of the application, providing the tab-like navigation to switch between different FluxNode views.
- **`preloader.html` / `preloader-renderer.js`:** A loading screen that is shown while the application discovers the FluxNodes on the network.
- **`monitor-preload.js`:** A preload script that is injected into the `BrowserView` of each FluxNode. It's responsible for intercepting authentication events and reporting them back to the main process.

The core logic resides in `monitor-main.js`. It handles node discovery, creation of `BrowserView`s, and the automation cycle for deleting applications. The application's behavior is heavily configured through the `settings.ini` file.

## Building and Running

The project is run directly from the source code using Electron. There is no build step defined in the `package.json` file.

**To Run the Application:**

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Run the Application:**
    ```bash
    npm start
    ```

**Development Workflow Note:**

The `README.md` file specifies a particular development workflow:
-   **Development:** Code is written and edited in a WSL (Windows Subsystem for Linux) environment.
-   **Execution:** The application is intended to be run and tested on a Windows 10 Pro virtual machine.

## Development Conventions

-   **Configuration:** All major settings are managed in the `settings.ini` file. This includes the IP addresses of the FluxNodes, the names of the applications to be deleted, and the interval for the automation cycle.
-   **Logging:** The application produces detailed logs in the UI and in a file named `session.log` (by default). Debug mode can be enabled in `settings.ini` for more verbose logging.
-   **Code Style:** The code style is consistent with standard JavaScript and Node.js practices.
