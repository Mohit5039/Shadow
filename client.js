// client.js

import { makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { writeFileSync } from 'fs';
import path from 'path';

// Use Multi-File Authentication State
const { state, saveCreds } = await useMultiFileAuthState('./auth_info'); // Directory for storing credentials

// Create the WhatsApp socket connection
const conn = makeWASocket({
    printQRInTerminal: true,
    auth: state,
});

// Save credentials whenever they are updated
conn.ev.on('creds.update', saveCreds);

// Handle connection events
conn.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
        // Handle connection close events
        if ((lastDisconnect.error)?.output?.statusCode !== 401) {
            // Reconnect logic if the disconnection is not due to authentication issues
            console.log('Connection closed. Reconnecting...');
            reconnect();
        } else {
            console.log('Connection closed due to authentication error. Please check your credentials.');
        }
    } else if (connection === 'open') {
        console.log('Connection opened successfully!');
    }
});

// Reconnect function
async function reconnect() {
    try {
        console.log('Attempting to reconnect...');
        const newConn = makeWASocket({
            printQRInTerminal: true,
            auth: state,
        });
        newConn.ev.on('creds.update', saveCreds);
        newConn.ev.on('connection.update', (update) => {
            const { connection } = update;
            if (connection === 'open') {
                console.log('Reconnected successfully!');
            }
        });
        return newConn; // Return the new connection instance
    } catch (error) {
        console.error('Error during reconnection:', error);
        // Optional: Implement a retry mechanism with a delay
        setTimeout(reconnect, 5000); // Try reconnecting after 5 seconds
    }
}

export default conn; // Export the connection instance
