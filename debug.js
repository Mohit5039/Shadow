// debug.js

export function activateDebugMode(message) {
    console.log(`Debug mode activated by ${message.from} at ${new Date()}`);
    // logic
}

export function logDebugInfo(info) {
    console.log(`Debug Info: ${info}`);
}

export function sendDebugInfoToUser(client, message, debugInfo) {
    client.sendMessage(message.from, `Debug Info: ${debugInfo}`);
}
