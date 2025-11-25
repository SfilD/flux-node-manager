window.addEventListener('DOMContentLoaded', () => {
    console.log('Preloader DOM fully loaded and parsed.');
    
    const logViewer = document.getElementById('log-container');
    let isInitialized = false;

    if (!logViewer) {
        console.error('FATAL: Could not find log-viewer element in preloader.html');
        return;
    }

    function addLogMessage(message) {
        const p = document.createElement('p');
        p.textContent = message;
        logViewer.appendChild(p);

        // Keep scrolled to the bottom
        logViewer.scrollTop = logViewer.scrollHeight;
    }

    // Listen for log messages from the main process via the secure API
    window.electronAPI.on('log-message', (message) => {
        addLogMessage(message);
    });

    // Initialize the UI with data from the main process
    window.electronAPI.on('initialize-preloader', (data) => {
        if (isInitialized) return;

        // Apply font settings
        document.body.style.fontFamily = `'${data.fontName}', monospace`;
        document.body.style.fontSize = `${data.fontSize}pt`;
        
        // Clear the log viewer and populate with historical logs
        logViewer.innerHTML = '';
        data.logHistory.forEach(addLogMessage);
        
        isInitialized = true;
    });

    console.log('Preloader event listeners attached.');
});
