// invalidAndMeme.js

import conn from '../client.js'; // Adjust the path if necessary
import pkg from '@whiskeysockets/baileys'; // Import the whole package
const { MessageMedia } = pkg; // Destructure MessageMedia from the imported package

// Handle invalid command responses
export const handleInvalidCommand = async (message) => {
    try {
        await conn.sendMessage(message.key.remoteJid, { text: 'Invalid command mate, please use options 1 to 5.' });
    } catch (error) {
        console.error("Error sending invalid command response:", error);
    }
};

// Handle meme command responses
export const handleMemeCommand = async (message) => {
    try {
        const memeMedia = MessageMedia.fromFilePath('./command/Zero.png'); // Adjust the path accordingly
        await conn.sendMessage(message.key.remoteJid, memeMedia);
    } catch (error) {
        console.error("Error sending meme response:", error);
    }
};
