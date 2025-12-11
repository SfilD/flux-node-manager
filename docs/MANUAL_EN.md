# Flux Auto-Deleter - Quick Start Guide

## ⚠️ IMPORTANT: DISCLAIMER

**PLEASE READ CAREFULLY BEFORE USING THIS SOFTWARE.**

This software (`FluxAutoDeleter`) is designed to **AUTOMATICALLY PERMANENTLY DELETE** applications and data from your Flux Nodes.

1.  **Data Loss Risk:** The core function of this tool is to send "remove application" commands. Once deleted, an application **CANNOT BE RECOVERED** by this tool. All data associated with the deleted application may be lost forever.
2.  **User Responsibility:** You are solely responsible for the correctness of the `settings.ini` configuration file. Specifying an incorrect or too broad prefix in `TargetAppPrefixes` may lead to the unintended deletion of *all* or *critical* applications.
3.  **No Warranty:** The author(s) and contributors of this software accept **NO LIABILITY** for any direct, indirect, incidental, or consequential damages (including but not limited to data loss, lost profits, or node downtime) arising from the use or inability to use this program.

By running this software, you acknowledge that you understand these risks and agree to use it entirely at your own discretion.

---

## 1. Purpose

**Flux Auto-Deleter** is a desktop application for monitoring your Flux nodes. It allows you to track activity and, if necessary, automatically remove unwanted applications (according to your blocklist), ensuring control over your hardware resource usage.

## 2. Installation and Launch

No additional components are required to run the program.

1.  **Portable Version (ZIP Archive):**
    1.  Download and extract the `FluxAutoDeleter_Portable_X.X.X.zip` archive to a convenient folder (e.g., Desktop).
    2.  Inside, you will find the executable file `FluxAutoDeleter_Portable_X.X.X.exe` and the configuration file `settings.ini`.
    3.  Configure `settings.ini` (see the "Configuration" section below).
    4.  Run the `.exe` file.

2.  **Installer (Setup):**
    1.  Run the `FluxAutoDeleter_Setup_X.X.X.exe` file and follow the installation instructions.
    2.  After installation, a shortcut will appear on your desktop.
    3.  The `settings.ini` file will be located in the program's installation folder:
        *   **Current User:** `%LocalAppData%\Programs\FluxAutoDeleter`
        *   **All Users:** `%ProgramFiles%\FluxAutoDeleter`

## 3. Interface Overview

The application interface is intentionally simplified for maximum stability and security.

### Window Features
*   **Fixed Size:** The application window has a fixed size and **cannot be maximized** using the standard button. This ensures that the node web interface always displays correctly.
*   **Resizing:** If the default size does not suit you, you can change it manually in the `settings.ini` file (`WindowWidth` and `WindowHeight` parameters).

### Workspace
1.  **Tabs Panel (Left):** A list of all your nodes.
    *   **Naming Format:** `ID [IP:Port]`.
    *   **Example:** `IP01-Node01 [1.2.3.4:16126]`.
    *   Click on a tab to switch to that node.
2.  **Main Area (Right):** The web interface of the selected node (FluxOS). Here you log in and view node status.
3.  **Log Panel (Bottom):** A "black box" displaying all program actions.
    *   **Line Format:** `[Date Time][SOURCE] Message`
    *   **Source Legend:**
        *   `[DISCOVERY]`: Node scanning and verification process.
        *   `[MAIN]`: Application system messages.
        *   `[PRELOAD]`: Events inside the node's web page (login/logout detection).
        *   `[AUTO]`: Automatic deletion algorithm activity.
        *   `[API]`: Network request results.
    *   **Color Coding:**
        *   **Green text:** Safe application (will not be deleted).
        *   **Red text:** Target application (match found, will be deleted!).
        *   **Yellow text:** Application deletion process.

### Toolbar
Quick access buttons at the top of the window:

*   **Reset:** Forcibly reloads the current tab and wipes all session data (cache, cookies, auth). Useful if the node interface freezes or login/logout fails.
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

#### `TargetAppPrefixes` (Deletion Rules)
List the keywords to search for applications that should be deleted.

*   **How it works:** The application searches for the specified text **in any part of the name** of a running application (at the beginning, middle, or end).
*   **Case Sensitivity:** Case **MATTERS**. `Kaspa` and `kaspa` are different words to the program. Specify the name exactly as it appears in the Flux interface.

*Example:*
If you specify `TargetAppPrefixes = Folding,Test`, the application will delete:
*   `FoldingAtHome` (contains "Folding")
*   `MyTestApp` (contains "Test")
*   `New-folding-node` (contains "folding" — **WILL NOT DELETE** because the case does not match "Folding")

*Pro Tip:*
To find the exact application name, open your node's address in a browser: `http://YOUR_NODE_IP:PORT/apps/localapps` (where PORT is your usual web interface port, e.g., 16126, 16136).
Go to the **Local Apps** section, find the target application, copy its name from the **Name** column, and paste it into `settings.ini`.

```ini
TargetAppPrefixes = StuckContainer,MaliciousApp,TestApp
```

#### `AutomationIntervalSeconds`
The interval in seconds between checks. Recommended value: 300 (5 minutes).
```ini
AutomationIntervalSeconds = 300
```

## 6. Login

To allow the application to manage a node, you must authorize yourself in the Flux web interface.

1.  Launch Flux Auto-Deleter.
2.  Wait for the tabs with your nodes to load.
3.  Switch to the tab of the desired node.
4.  You will see the standard FluxOS login screen.

**Login Methods:**

1.  **Automated Login (ZelCore installed on this PC):**
    1.  Click the **Fingerprint icon** (Login with Zelcore).
    2.  The system will ask for permission to open the ZelCore application. Allow this action.
    3.  In the ZelCore window that opens, click the "Sign and Send" button.
    4.  You will be automatically logged into FluxOS.

2.  **Manual Login (ZelCore on another computer/device):**
    *It is recommended to use ZelCore installed on a PC for security reasons.*
    This section contains three fields: **Message**, **Address**, and **Signature**.

    1.  Open **ZelCore** on your device.
    2.  Go to the **Apps** section and select **Flux ID**.
    3.  Click the first blue button at the top labeled **"Sign message"**.
    4.  **Important:** Toggle the switch to select **"Sign with Flux ID"** (default is "Sign with coin").
    5.  Click the **Copy** button to copy your Flux ID and paste it into the **Address** field in the Flux Auto-Deleter login window.
    6.  In the Flux Auto-Deleter login window, copy the content of the **Message** field.
    7.  Paste this text into ZelCore in the **"Message to sign"** field and click the blue **Sign message** button.
    8.  Enter your d2FA PIN code.
    9.  The "Message Signature" window will appear. Copy the resulting signature (by clicking the copy icon).
    10. Paste this string into the **Signature** field in the Flux Auto-Deleter login window.
    11. Click the large blue **Login** button.

    If everything is done correctly and the message has not expired, you will be logged in.

**Once you are logged in:**
*   A message **"Received LOGIN notification"** or **"Token detected"** will appear in the application logs (bottom panel).
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
    *(e.g., `Get-FileHash FluxAutoDeleter_Portable_1.0.0.zip`)*
3.  Compare the resulting hash with the one in `checksums.txt`. They must match exactly.

## 9. Uninstalling

*   **Portable Version:** Simply delete the application folder.
*   **Installer:** Use the standard Windows uninstaller ("Settings" -> "Apps").

**Full Data Cleanup:**
The application stores session data (node authorization) in a separate system folder. If you want to completely remove all traces or reset all authorizations, run the included `clean-session.bat` script or manually delete the following folder:

*   **Path:** `%AppData%\flux-session-monitor`
    *(Usually `C:\Users\USERNAME\AppData\Roaming\flux-session-monitor`)*

## 10. Troubleshooting

**Issue:** Authentication failures or automatic deletion stops working.
**Symptoms:**
*   You successfully signed the message in ZelCore, but the node's web interface does not respond, and authorization does not occur.
*   The node's web interface shows that you are authorized, but automation is not working.
*   The application stopped removing target apps on a specific node without visible reasons.
*   The application tries to remove the same app in every cycle but fails (often happens after a FluxOS version update).

**Solution:**
A common cause is a FluxOS version update (e.g., from v7.2.0 to v7.3.0) or session cache corruption. The old token becomes invalid, even though the session looks active.

1.  **Try Tab Reset:** Open the tab of the problematic node and click the **Reset** button on the top toolbar. This will clear cookies/cache for this node and reload it. Then re-login.
2.  **Full Reset:** If the above doesn't help or the app is crashing, close the application and run the `clean-session.bat` file located in the application folder. This will safely wipe all cached data and session files. Restart the application and log in again.