const { contextBridge, ipcRenderer } = require('electron');

// Define a list of valid channels for IPC communication to enhance security
const validSendChannels = [
    'app-quit', 'app-relaunch', 'show-about', 'open-docs', 'open-settings-file', 
    'force-refresh-node', 'update-view-bounds', 'switch-view'
];
const validReceiveChannels = ['initialize-ui', 'log-message'];

// Expose a safe, limited API to the renderer process for the main shell
contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * Send a message to the main process via a secure channel.
     * @param {string} channel - The IPC channel to send the message on.
     * @param {any} data - The data to send.
     */
    send: (channel, data) => {
        if (validSendChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    /**
     * Subscribe to a message from the main process on a secure channel.
     * @param {string} channel - The IPC channel to listen on.
     * @param {Function} callback - The function to call when a message is received.
     */
    on: (channel, callback) => {
        if (validReceiveChannels.includes(channel)) {
            // Deliberately strip the event object from the callback arguments
            // to prevent renderer from accessing the sender.
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    }
});
