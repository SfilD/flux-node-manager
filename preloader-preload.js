const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe, limited API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Expose a method for the renderer to listen to messages from the main process
    on: (channel, callback) => {
        const validChannels = ['log-message', 'initialize-preloader'];
        if (validChannels.includes(channel)) {
            // Deliberately strip event as it includes `sender`
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    }
});
