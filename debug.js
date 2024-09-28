// debug.js

function activateDebugMode(message) {
    console.log(`Debug mode activated by ${message.from} at ${new Date()}`);
    //  logic 
}

function logDebugInfo(info) {
    console.log(`Debug Info: ${info}`);
}

function sendDebugInfoToUser(client, message, debugInfo) {
    client.sendMessage(message.from, `Debug Info: ${debugInfo}`);
}

module.exports = {
    activateDebugMode,
    logDebugInfo,
    sendDebugInfoToUser,
};
