const { ipcRenderer } = require('electron');

const logContainer = document.getElementById('log-container');

function addLogMessage(message) {
    const p = document.createElement('p');
    p.textContent = message;
    logContainer.appendChild(p);
    // Auto-scroll to the bottom
    logContainer.scrollTop = logContainer.scrollHeight;
}

ipcRenderer.on('initialize-preloader', (event, { logHistory, fontName, fontSize }) => {
    // Apply font styles to the entire window
    const bodyStyle = document.body.style;
    bodyStyle.fontFamily = `'${fontName}', monospace`;
    bodyStyle.fontSize = `${fontSize}pt`;

    // Populate with existing logs
    logHistory.forEach(addLogMessage);
});

ipcRenderer.on('log-message', (event, message) => {
    addLogMessage(message);
});
