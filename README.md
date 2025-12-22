[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.md) [![Русский](https://img.shields.io/badge/lang-Русский-red.svg)](README.ru.md)

# Flux Node Manager

> **✅ COMPATIBILITY UPDATE**
>
> The application has been successfully tested and is fully functional on both **Legacy FluxOS** and the new **ArcaneOS**.
>
> *Note for users:* **Monitor Mode** can fully hide the node's web interface on both **ArcaneOS** and **Legacy FluxOS**. This allows you to focus purely on monitoring events via the full-screen log view.

**Professional monitoring and management tool for Flux Nodes.**

Flux Node Manager allows operators to monitor the status of their fleet in real-time and automatically enforce application policies (Blocklist) to maintain node health and security.

![Flux Node Manager Screenshot v1.1.0](assets/screenshot.png)

## Download & Installation

Latest Version: **v1.1.0**

**[Download from GitHub Releases](https://github.com/SfilD/flux-node-manager/releases/latest)**

You can choose:
*   **Portable (.zip):** No installation required. Just unzip and run `FluxNodeManager_Portable_x.y.z.exe`.
*   **Portable (.exe):** Single executable file for quick updates without extracting an archive.
*   **Installer (.exe):** Installs the application to your system and creates a desktop shortcut.

## Architecture

The application is built on Electron and follows a standard main/renderer process architecture, reinforced with modern security practices.

1.  **Main Process (`monitor-main.js`)**
    *   Acts as the backend of the application.
    *   Reads configuration from `settings.ini`.
    *   Manages application lifecycle, windows, and all IPC events.
    *   Performs node discovery by scanning IP addresses in parallel.
    *   Creates and manages `BrowserView` instances for each discovered node.
    *   **Enforces Policies:** Runs the main automation loop to stop applications matching the blocklist.
    *   Encrypts and stores sensitive tokens in memory using `safeStorage`.
    *   Broadcasts real-time authorization status updates.

2.  **Renderer Process (UI)**
    *   **Shell (`shell.html`, `shell-renderer.js`):** The main application window. Provides tab navigation with **status color indicators** (Green = OK), a quick access toolbar, and a dual-mode log viewer (**Login/Monitor Mode**). Communicates with the main process via a secure `contextBridge` (`window.electronAPI`).
    *   **Preloader (`preloader.html`, `preloader-renderer.js`):** A simple window displayed during the initial node discovery phase.

3.  **Preload Scripts**
    *   **`monitor-preload.js`:** Injected into the `BrowserView` of each Flux node. Its primary responsibility is to poll `localStorage` to detect the `zelidauth` token when a user logs in. It then sends this token to the main process to initiate the management cycle. It also injects CSS to hide extraneous UI elements from the node's webpage.
    *   **`shell-preload.js` & `preloader-preload.js`:** These scripts securely expose necessary IPC channels (`send`, `on`) to their respective renderer processes using `contextBridge`, in line with modern Electron security standards (`contextIsolation: true`).

## Used API Endpoints

The application interacts with the following Flux node API endpoints:

-   `GET /apps/listrunningapps`
    *   **Purpose:** Used both to verify that a node is alive during the discovery phase and to fetch the list of currently running applications for policy checks.
    *   **Authentication:** Not required.

-   `GET /apps/appremove?appname={appName}`
    *   **Purpose:** Sends the command to stop/clean up a specific application container from the node if it violates the policy.
    *   **Authentication:** **Required.** This request uses the `zelidauth` header with the token captured by `monitor-preload.js` to ensure only the node owner can perform this action.

## Troubleshooting

-   **Problem: No nodes are found on startup.**
    *   **Solution:**
        1.  Verify that the IP addresses in `settings.ini` are correct and accessible from your machine.
        2.  Check your internet connection.
        3.  Ensure that a firewall or antivirus is not blocking the application's network requests.

-   **Problem: Management cycle does not start for a specific node.**
    *   **Solution:** Ensure you have successfully logged into the Flux node's UI within the corresponding tab in the application. The management cycle only begins after a valid `zelidauth` token is detected.

-   **Problem: The application crashes or behaves unexpectedly.**
    *   **Solution:** Check the `session.log` file located in the application's root directory. For more detailed diagnostics, set `Debug = true` in `settings.ini` and restart the application to generate more verbose logs.

-   **Problem: Need to reset all application data/cache.**
    *   **Solution:** Run the included `clean-session.bat` script. This will completely clear the application's data directory (`%AppData%\flux-node-manager`), effectively resetting the app to its initial state.

## Development Workflow

This section describes the unique development and testing environment for the project.

-   **Development Environment:** Code is written and edited in a WSL (Windows Subsystem for Linux) environment, specifically the **Ubuntu-24.04** distribution.

-   **Execution and Testing Environment:** For actual execution and testing, the project files are copied to a VMware virtual machine running **Windows 10 Pro**.

- **Working Directory on Windows:** On the Windows VM, the project is located at `C:\Projects\flux-node-manager\`.



**Key Point:** All runtime commands (e.g., `npm start`) must be executed **only within the Windows 10 Pro environment** on the virtual machine, not in WSL.



## Feedback & Bug Reports



If you encounter any bugs, errors, or have suggestions for new features, please open an issue on our GitHub repository. This is the most effective way to reach the developer.



*   **Report a Bug / Request Feature:** [GitHub Issues](https://github.com/SfilD/flux-node-manager/issues)

## Support & Donations

This software is provided free of charge under the Apache 2.0 License. If you find it useful and wish to support its development, voluntary donations are highly appreciated.

**Crypto Addresses:**

*   **FLUX:** `t1RFqDyjAqH1gVgdowqfwRbmMxqgdiwD9dH`
*   **BTC:** `bc1q2r73psn8zznzazx97h9cl4xj2mlywxmpsgydrx`
*   **ETH / USDT (ERC20):** `0x75b3e6773cd61d35532bc82d70aa90aded2b0cb2`
*   **TRON / USDT (TRC20):** `TLhZaC6dCkni74FZKtcDCe12zLUdpJFTk6`
*   **TON / USDT (TON):** `UQB5XehHEvZmhxi6AP1lS1MMOatouQCerJld6IIjmg3wQktB`
