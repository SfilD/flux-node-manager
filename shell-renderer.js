const { ipcRenderer } = require('electron');

const tabsContainer = document.getElementById('tabs-container');
const logViewer = document.getElementById('log-viewer');
const contentContainer = document.getElementById('content-container');
const refreshButton = document.getElementById('force-refresh-button');
let activeTabId = null;
let isDebugMode = false;

// --- Event Listeners ---

refreshButton.addEventListener('click', () => {
    if (activeTabId) {
        console.log(`Requesting force refresh for node: ${activeTabId}`);
        ipcRenderer.send('force-refresh-node', { nodeId: activeTabId });
    }
});

// --- Layout and Bounds Management ---

// Sends the precise bounds of the content area to the main process
function sendContentBounds() {
    const rect = contentContainer.getBoundingClientRect();
    ipcRenderer.send('update-view-bounds', {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
    });
}

// Recalculates and applies dynamic styles and layouts
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
        tabsColumn.style.width = `${newWidth}px`;
    });
}


// Observe the content area for resizes and notify main process
const resizeObserver = new ResizeObserver(() => {
    sendContentBounds();
});
resizeObserver.observe(contentContainer);


// --- Log Viewer Functions ---

function addLogMessage(message) {
    const p = document.createElement('p');
    const colorRegex = /\@\@(RED|GREEN)\@\@(.*?)\#\#/g;
    let lastIndex = 0;
    let match;

    while ((match = colorRegex.exec(message)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
            p.appendChild(document.createTextNode(message.substring(lastIndex, match.index)));
        }
        
        // Add the colored span
        const [fullMatch, colorName, text] = match;
        const span = document.createElement('span');
        span.textContent = text;
        
        if (colorName === 'RED') {
            span.style.color = '#ff6b6b'; // A lighter red
        } else if (colorName === 'GREEN') {
            span.style.color = '#69f0ae'; // A light green
        }
        
        p.appendChild(span);
        lastIndex = colorRegex.lastIndex;
    }

    // Add any remaining text after the last match
    if (lastIndex < message.length) {
        p.appendChild(document.createTextNode(message.substring(lastIndex)));
    }

    logViewer.appendChild(p);
    logViewer.scrollTop = logViewer.scrollHeight; // Auto-scroll
}

// --- IPC Listeners ---

ipcRenderer.on('initialize-ui', (event, data) => {
    const { nodes, activeId, debug, fontName, fontSize, logHistory } = data;
    isDebugMode = debug;

    // Populate log viewer with history
    logViewer.innerHTML = '';
    logHistory.forEach(addLogMessage);

    // Clear existing tabs
    tabsContainer.innerHTML = '';
    
    nodes.forEach((node) => {
        const tab = document.createElement('div');
        tab.id = `tab-${node.id}`;
        tab.className = 'tab';
        const address = node.uiUrl.replace('http://', '');
        tab.textContent = `${node.name} [${address}]`;

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
            ipcRenderer.send('switch-view', node.id);
        });

        tabsContainer.appendChild(tab);
    });

    activeTabId = activeId;

    // Apply styles and calculate layouts
    updateThemeAndLayout(fontName, fontSize);
});

ipcRenderer.on('log-message', (event, message) => {
    addLogMessage(message);
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
