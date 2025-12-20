const tabsContainer = document.getElementById('tabs-container');
const logViewer = document.getElementById('log-viewer');
const logContent = document.getElementById('log-content');
const contentContainer = document.getElementById('content-container');
const appGrid = document.querySelector('.app-grid');

// Toolbar buttons
const btnReset = document.getElementById('btn-reset');
const btnLayout = document.getElementById('btn-layout');
const btnAbout = document.getElementById('btn-about');
const btnDocs = document.getElementById('btn-docs');
const btnSettings = document.getElementById('btn-settings');

let activeTabId = null;
let isDebugMode = false;
let isMonitorMode = false;

// --- Event Listeners ---

btnReset.addEventListener('click', () => {
    if (activeTabId) {
        console.log(`Requesting force refresh for node: ${activeTabId}`);
        window.electronAPI.send('force-refresh-node', { nodeId: activeTabId });
    }
});

btnLayout.addEventListener('click', () => {
    isMonitorMode = !isMonitorMode;
    if (isMonitorMode) {
        appGrid.classList.add('monitor-mode');
        btnLayout.textContent = 'Monitor Mode';
        btnLayout.style.backgroundColor = '#2f855a'; // Greenish
    } else {
        appGrid.classList.remove('monitor-mode');
        btnLayout.textContent = 'Login Mode';
        btnLayout.style.backgroundColor = '#4a5568'; // Standard
    }
    // sendContentBounds will be triggered by ResizeObserver
});

btnAbout.addEventListener('click', () => {
    window.electronAPI.send('show-about');
});

btnDocs.addEventListener('click', () => {
    window.electronAPI.send('open-docs');
});

btnSettings.addEventListener('click', () => {
    window.electronAPI.send('open-settings-file');
});

// --- Layout and Bounds Management ---

/**
 * Sends the precise bounds of the content area to the main process
 * so it can correctly position the BrowserView.
 */
function sendContentBounds() {
    const rect = contentContainer.getBoundingClientRect();
    window.electronAPI.send('update-view-bounds', {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
    });
}

/**
 * Recalculates and applies dynamic styles and layouts, such as font sizes
 * and the width of the tabs column based on its content.
 * @param {string} fontName The name of the font to apply.
 * @param {number} fontSize The base font size to apply.
 */
function updateThemeAndLayout(fontName, fontSize) {
    // 1. Apply Font Styles
    const bodyStyle = document.body.style;
    bodyStyle.fontFamily = `'${fontName}', monospace`;
    bodyStyle.fontSize = `${fontSize}pt`;

    // 2. Calculate Dynamic Tab Width, but only after fonts are loaded
    document.fonts.ready.then(() => {
        let maxWidth = 0;
        let widestTab = null;
        const tabs = tabsContainer.querySelectorAll('.tab');
        if (tabs.length === 0) return;

        // Find the widest tab
        tabs.forEach(tab => {
            if (tab.scrollWidth > maxWidth) {
                maxWidth = tab.scrollWidth;
                widestTab = tab;
            }
        });

        // Check if a scrollbar is visible
        const isOverflowing = tabsContainer.scrollHeight > tabsContainer.clientHeight;
        let scrollbarWidth = 0;
        if (isOverflowing) {
            scrollbarWidth = tabsContainer.offsetWidth - tabsContainer.clientWidth;
        }

        // Get the container's horizontal padding
        const containerStyle = window.getComputedStyle(tabsContainer);
        const containerPadding = parseInt(containerStyle.paddingLeft) + parseInt(containerStyle.paddingRight);

        // Get the widest tab's border width
        let tabBorderWidth = 0;
        if (widestTab) {
            const tabStyle = window.getComputedStyle(widestTab);
            tabBorderWidth = parseInt(tabStyle.borderLeftWidth) + parseInt(tabStyle.borderRightWidth);
        }

        // Set the container width, accounting for content, padding, and scrollbar
        const tabsColumn = document.getElementById('tabs-column');
        const newWidth = maxWidth + scrollbarWidth + containerPadding + tabBorderWidth + 2; // Add a 2px safety buffer
        
        // Apply width to element
        tabsColumn.style.width = `${newWidth}px`;
    });
}


// Observe the content area for resizes and notify main process
const resizeObserver = new ResizeObserver(() => {
    sendContentBounds();
});
resizeObserver.observe(contentContainer);


// --- Log Viewer Functions ---

/**
 * Adds a new message to the log viewer, parsing custom color tags.
 * @param {string} message The log message to add.
 */
function addLogMessage(message) {
    const p = document.createElement('p');
    const colorRegex = /@@(RED|GREEN|YELLOW)@@(.*?)##/g;
    let lastIndex = 0;
    let match;

    while ((match = colorRegex.exec(message)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
            p.appendChild(document.createTextNode(message.substring(lastIndex, match.index)));
        }
        
        // Add the colored span
        const [, colorName, text] = match;
        const span = document.createElement('span');
        span.textContent = text;
        
        if (colorName === 'RED') {
            span.style.color = '#ff6b6b'; // A lighter red
        } else if (colorName === 'GREEN') {
            span.style.color = '#69f0ae'; // A light green
        } else if (colorName === 'YELLOW') {
            span.style.color = '#ffd700'; // Gold-like yellow
        }
        
        p.appendChild(span);
        lastIndex = colorRegex.lastIndex;
    }

    // Add any remaining text after the last match
    if (lastIndex < message.length) {
        p.appendChild(document.createTextNode(message.substring(lastIndex)));
    }

    logContent.appendChild(p);
    logViewer.scrollTop = logViewer.scrollHeight; // Auto-scroll wrapper
}

// --- IPC Listeners ---

window.electronAPI.on('initialize-ui', (data) => {
    const { appVersion, nodes, activeId, debug, fontName, fontSize, logHistory } = data;
    
    if (appVersion) {
        document.title = `Flux Node Manager v${appVersion}`;
    }

    isDebugMode = debug;

    // Populate log viewer with history
    logContent.innerHTML = '';
    logHistory.forEach(addLogMessage);

    // Clear existing tabs
    tabsContainer.innerHTML = '';
    
    nodes.forEach((node) => {
        const tab = document.createElement('div');
        tab.id = `tab-${node.id}`;
        tab.className = 'tab';

        // Status Dot
        const statusDot = document.createElement('span');
        statusDot.className = 'status-dot';
        if (node.hasToken) {
            statusDot.classList.add('online');
        }
        tab.appendChild(statusDot);

        const address = node.uiUrl.replace('http://', '');
        // Add text node after the dot
        tab.appendChild(document.createTextNode(`${node.name} [${address}]`));

        if (node.id === activeId) {
            tab.classList.add('active');
        }
        
        tab.addEventListener('click', () => {
            if (activeTabId === node.id) return;

            if (activeTabId) {
                document.getElementById(`tab-${activeTabId}`).classList.remove('active');
            }
            tab.classList.add('active');
            activeTabId = node.id;
            window.electronAPI.send('switch-view', node.id);
        });

        tabsContainer.appendChild(tab);
    });

    activeTabId = activeId;

    // Apply styles and calculate layouts
    updateThemeAndLayout(fontName, fontSize);
});

window.electronAPI.on('log-message', (message) => {
    addLogMessage(message);
});

window.electronAPI.on('update-node-status', (data) => {
    const { nodeId, hasToken } = data;
    const tab = document.getElementById(`tab-${nodeId}`);
    if (tab) {
        const dot = tab.querySelector('.status-dot');
        if (dot) {
            if (hasToken) {
                dot.classList.add('online');
            } else {
                dot.classList.remove('online');
            }
        }
    }
});

// --- Console Override ---
const originalConsoleLog = console.log;
const originalConsoleDebug = console.debug;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function getTimestamp() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `[${day}.${month}.${year} ${hours}:${minutes}]`;
}

console.log = (...args) => {
    const message = `${getTimestamp()}[UI] ${args.join(' ')}`;
    addLogMessage(message);
    originalConsoleLog.apply(console, args);
};

console.debug = (...args) => {
    if (isDebugMode) {
        const message = `${getTimestamp()}[UI-Debug] ${args.join(' ')}`;
        addLogMessage(message);
    }
    originalConsoleDebug.apply(console, args);
};

console.error = (...args) => {
    const message = `${getTimestamp()}[UI-Error] ${args.join(' ')}`;
    addLogMessage(message);
    originalConsoleError.apply(console, args);
};

console.warn = (...args) => {
    const message = `${getTimestamp()}[UI-Warn] ${args.join(' ')}`;
    addLogMessage(message);
    originalConsoleWarn.apply(console, args);
};
