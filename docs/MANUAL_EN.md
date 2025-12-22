# Flux Node Manager - User Guide

## ⚠️ IMPORTANT: DISCLAIMER

**PLEASE READ CAREFULLY BEFORE USING THIS SOFTWARE.**

This software (`FluxNodeManager`) provides tools for **AUTOMATIC MANAGEMENT AND CLEANUP** of applications (containers) from your Flux Nodes.

1.  **Resource Management:** The core function of this tool is to stop and clean up applications based on your policies. A stopped container **CANNOT BE RECOVERED** by this tool.
2.  **Owner Responsibility:** You are solely responsible for the correctness of the `settings.ini` configuration file. Specifying an incorrect prefix in `TargetAppPrefixes` may lead to the unintended stoppage of *all* or *critical* applications.
3.  **No Warranty:** The author(s) and contributors of this software accept **NO LIABILITY** for any direct, indirect, incidental, or consequential damages (including but not limited to node downtime) arising from the use of this tool.

By running this software, you acknowledge that you are the owner or authorized administrator of these nodes.

---

## 1. Purpose

**Flux Node Manager** is a professional desktop application for centralized monitoring and administration of your Flux Nodes. It allows you to:
*   Monitor authorization status and node availability in real-time.
*   Automatically enforce security policies (Blocklist) by stopping unwanted or "stuck" applications.
*   Free up system resources for priority tasks.

## 2. Installation and Launch

No additional components are required to run the program.

1.  **Portable Version (ZIP Archive):**
    1.  Download and extract the `FluxNodeManager_Portable_x.y.z.zip` archive to a convenient folder (e.g., Desktop).
    2.  Inside, you will find the executable file `FluxNodeManager_Portable_x.y.z.exe` and the configuration file `settings.ini`.
    3.  Configure `settings.ini` (see the "Configuration" section below).
    4.  Run the `.exe` file.

2.  **Portable Version (EXE):**
    *   Single file `FluxNodeManager_Portable_x.y.z.exe`. Useful for updates: simply replace the old `.exe` file with the new one in your application folder.

3.  **Installer (Setup):**
    1.  Run the `FluxNodeManager_Setup_x.y.z.exe` file and follow the installation instructions.
    2.  After installation, a shortcut will appear on your desktop.
    3.  The `settings.ini` file will be located in the program's installation folder:
        *   **Current User:** `%LocalAppData%\Programs\FluxNodeManager`
        *   **All Users:** `%ProgramFiles%\FluxNodeManager`

## 3. Interface Overview

The application interface is intentionally simplified for maximum stability and security.

### Window Features
*   **Fixed Size:** The application window has a fixed size and **cannot be maximized** using the standard button. This ensures that the node web interface always displays correctly.
*   **Resizing:** If the default size does not suit you, you can change it manually in the `settings.ini` file (`WindowWidth` and `WindowHeight` parameters).

### Workspace
The interface supports two display modes, toggled by a button in the top toolbar:

1.  **Login Mode:**
    *   **Tabs (Left):** List of nodes taking the full window height.
    *   **Node Window (Top Right):** Occupies 80% of the height. Intended for password entry and authorization.
    *   **Logs (Bottom Right):** A compact area (20% of height) for status monitoring.
2.  **Monitor Mode:**
    *   **Node Window:** Completely hidden to save space.
    *   **Logs:** Occupy **100%** of the right column, providing maximum visibility for events.

**Detailed Element Description:**
1.  **Tabs Panel (Left):** A list of all your nodes.
    *   **Status Indicators:** A colored dot indicates authorization status (🟢 Green = Authorized, ⚪ Grey = Not logged in).
    *   **Naming Format:** `ID [IP:Port]`.
    *   **Example:** `IP01-Node01 [1.2.3.4:16126]`.
    *   Click on a tab to switch to that node.
2.  **Main Area:** Displays the FluxOS web interface or hides it, depending on the selected mode.
3.  **Log Panel:** A "black box" displaying all program actions.
    *   **Line Format:** `[Date Time][SOURCE] Message`
    *   **Source Legend:**
        *   `[DISCOVERY]`: Node scanning and verification process.
        *   `[MAIN]`: Application system messages.
        *   `[PRELOAD]`: Events inside the node's web page (login/logout detection).
        *   `[AUTO]`: Automatic deletion algorithm activity.
        *   `[API]`: Network request results.
    *   **Color Coding:**
        *   **Green text:** Safe application (will remain running).
        *   **Red text:** Target application (match found, will be stopped!).
        *   **Yellow text:** Container cleanup process.

### Privacy Note (ArcaneOS)
In the new ArcaneOS interface, Flux enables "Analytics Cookies" by default upon first login or after a reset.
To disable telemetry:
1.  Click the **"Manage Cookies"** button (green text in the bottom status bar).
2.  In the "Cookie Preferences" window, disable **"Analytics Cookies"**.
3.  Click "Only Necessary" or "Accept".
*Note: This setting is stored in your local browser cache and may reset if you use the "Reset" button or clear session data using the `clean-session.bat` script.*

### Toolbar
Quick access buttons at the top of the window:

*   **Reset:** Forcibly reloads the current tab and wipes all session data (cache, cookies, auth). Useful if the node interface freezes or login/logout fails.
*   **Login / Monitor Mode:** Toggles the layout between authorization mode and full-screen log monitoring.
*   **Settings:** Opens the `settings.ini` file in your default text editor.
*   **Docs:** Opens this user manual.
*   **About:** Shows the application version and license information.

## 4. System Requirements

System resource usage depends directly on the number of monitored nodes (tabs).
Each node is a separate browser tab consuming approximately **100-150 MB** of RAM.

**Recommendations:**
*   **1-8 nodes:** Minimum 2 GB RAM, dual-core CPU.
*   **9-20 nodes:** Minimum 4 GB RAM, quad-core CPU.
*   **20+ nodes:** 8 GB+ RAM recommended.

*Warning: Running a large number of nodes on weak hardware may slow down your system.*

## 5. Configuration (`settings.ini`)

Before using the application, you must configure the `settings.ini` file located next to the program. Open it with any text editor (Notepad, Notepad++).

#### `ScanIPs`
A list of IP addresses for your Flux nodes.

**Important:** Do not use spaces between addresses.

*Example:*
```ini
ScanIPs = 1.2.3.4,5.6.7.8,9.10.11.12
```

#### `TargetAppPrefixes` (Application Blocklist / Policy Enforcement)
List the keywords to search for applications that are prohibited by the node owner's policy.

*   **How it works:** The application searches for the specified text **in any part of the name** of a running application (at the beginning, middle, or end).
*   **Case Sensitivity:** Case **MATTERS**. `TestApp` and `testapp` are different words to the program. Specify the name exactly as it appears in the Flux interface.

*Example:*
If you specify `TargetAppPrefixes = Stuck,Test`, the application will stop:
*   `StuckContainer_v1` (contains "Stuck")
*   `MyTestApp` (contains "Test")
*   `new-stuck-node` (contains "stuck" - **WILL NOT STOP** because the case does not match "Stuck")

*Pro Tip:*
To find the exact container name, open your node's address in a browser: `http://YOUR_NODE_IP:PORT/apps/localapps`.
Go to the **Local Apps** section, find the target application, copy its name from the **Name** column, and paste it into `settings.ini`.

```ini
TargetAppPrefixes = StuckContainer,MaliciousApp,TestApp
```

#### `AutomationIntervalSeconds`
The interval in seconds between checks. Recommended value: 300 (5 minutes).
```ini
AutomationIntervalSeconds = 300
```

#### `MaxLogFileSizeMB`
The maximum size of the log file in megabytes. When reached, the file is rotated (renamed to `.old` and a new one is started). Min value: 1.
```ini
MaxLogFileSizeMB = 10
```

## 6. Login

To allow the application to manage a node, you must authorize yourself in the Flux web interface.

1.  Launch Flux Node Manager.
2.  Wait for the tabs with your nodes to load.
3.  Switch to the tab of the desired node.

The login process depends on your FluxOS version.

### A. New Interface (ArcaneOS / FluxOS v5+)

**How to Log In:**
1.  Locate the **Login** button at the very **bottom of the main left menu**. Click it.
2.  A generic login window will appear with options (Google, Apple ID, Wallets, Manual).
3.  Choose your preferred method (we recommend **Wallets** or **Manual**):

    *   **Method 1: Wallets -> ZelCore (Automatic)**
        *   Click the **Wallets** button.
        *   Select **ZelCore** from the list (ZelCore, SSP, WalletConnect, MetaMask).
        *   The system will ask for permission to open the ZelCore application. Click **Open**.
        *   In the ZelCore window, click **"Sign and Send"**.
        *   You will be logged in automatically.

    *   **Method 2: Manual (If ZelCore is on another device)**
        *   Click the **Manual** button in the login window.
        *   You will see fields for **Login Phrase** (Message) and **Signature**.
        *   Open **ZelCore** on your device -> **Apps** -> **Flux ID**.
        *   Click **"Sign message"**. Ensure **"Sign with Flux ID"** is selected.
        *   Copy the **Login Phrase** from the app to ZelCore's "Message to sign" field.
        *   Sign it with your PIN.
        *   Copy the resulting **Signature** from ZelCore and paste it into the **Signature** field in the app.
        *   Click **Login**.

    *   *Note: Other methods (Google, Apple ID, MetaMask, SSP) may work but have not been explicitly verified with this tool.*

**How to Log Out:**
1.  Click the button with the **FluxOS logo** (or your avatar) in the **top-right corner** of the window.
2.  A small dropdown menu will appear showing your ZelID.
3.  Click the red **Logout** button.

---

### B. Legacy Interface (Standard FluxOS)

**How to Log In:**
1.  You will see the standard login screen with a fingerprint icon.
2.  **Automatic:** Click the **Fingerprint icon** (Login with Zelcore) -> Open ZelCore -> Sign and Send.
3.  **Manual:** Click "Login manually" (if available) or use the specific manual login section provided by the legacy interface, copying the Message and pasting the Signature.

**How to Log Out:**
*   The "Logout" button is located in the top-right corner of the node's main web interface window.

---

**Once you are logged in:**
*   A message **"Received LOGIN notification"** will appear in the application logs (bottom panel).
*   The automatic application deletion cycle will start after 5 seconds.

## 7. Updating the Application

We plan to release new versions with improvements and fixes.

*   **Portable Version:**
    Simply download the new archive. You can replace the old `.exe` file with the new one, keeping your existing `settings.ini`.

*   **Installer (Setup):**
    When installing a new version over an old one, the `settings.ini` file may be overwritten with the default one.
    **Recommended:** Back up your `settings.ini` before running the update installer, and then restore it (or copy your settings) after installation is complete.

## 8. Integrity Check (Checksums)

To ensure that the downloaded files are not corrupted or tampered with, you can verify their SHA-256 checksums against the `checksums.txt` file provided with the release.

**How to verify on Windows:**
1.  Open PowerShell in the folder containing the file.
2.  Run the command:
    ```powershell
    Get-FileHash FILENAME -Algorithm SHA256
    ```
    *(e.g., `Get-FileHash FluxNodeManager_Portable_x.y.z.zip`)*
3.  Compare the resulting hash with the one in `checksums.txt`. They must match exactly.

## 9. Uninstalling

*   **Portable Version:** Simply delete the application folder.
*   **Installer:** Use the standard Windows uninstaller ("Settings" -> "Apps").

**Full Data Cleanup:**
The application stores session data (node authorization) in a separate system folder. If you want to completely clear all traces or reset all authorizations, perform one of the following actions:

1.  **Automatically:** Run the included `clean-session.bat` script.
    > **Note:** The script works in both CMD and PowerShell. Administrator privileges are NOT required, but you **must close the application** before running the script.

2.  **Manually:** Delete the following folder:
    *   **Path:** `%AppData%\flux-node-manager`
        *(Usually `C:\Users\USERNAME\AppData\Roaming\flux-node-manager`)*

## 10. Troubleshooting

**Issue:** Authentication failures or automatic cleanup stops working.
**Symptoms:**
*   You successfully signed the message in ZelCore, but the node's web interface does not respond, and authorization does not occur.
*   The node's web interface shows that you are authorized, but automation is not working.
*   The application stopped stopping target apps on a specific node without visible reasons.
*   The application tries to stop the same app in every cycle but fails (often happens after a FluxOS version update).

**Solution:**
A common cause is a FluxOS version update (e.g., from v7.x.x to v8.0.0 ArcaneOS) or session cache corruption. The old token becomes invalid, even though the session looks active.

1.  **Try Tab Reset:** Open the tab of the problematic node and click the **Reset** button on the top toolbar. This will clear cookies/cache for this node and reload it. Then re-login.
2.  **Full Reset:** If the above doesn't help or the app is crashing, close the application and run the `clean-session.bat` file located in the application folder. This will safely wipe all cached data and session files. Restart the application and log in again.

## 11. Feedback

Found a bug? Have a feature request?
Please report it via **[GitHub Issues](https://github.com/SfilD/flux-auto-deleter/issues)**.

## 12. Support & Donations

This software is Freeware. If you find it useful and want to support the developer, you can donate to the following addresses:

*   **FLUX:** `t1RFqDyjAqH1gVgdowqfwRbmMxqgdiwD9dH`
*   **BTC:** `bc1q2r73psn8zznzazx97h9cl4xj2mlywxmpsgydrx`
*   **ETH / USDT (ERC20):** `0x75b3e6773cd61d35532bc82d70aa90aded2b0cb2`
*   **TRON / USDT (TRC20):** `TLhZaC6dCkni74FZKtcDCe12zLUdpJFTk6`
*   **TON / USDT (TON):** `UQB5XehHEvZmhxi6AP1lS1MMOatouQCerJld6IIjmg3wQktB`