// DebugAccess.js
let debugMode = false; // Initialize debug mode state
const debugAccessList = ['917340295092', '919548636336']; // WhatsApp numbers with debug access

function stripDomain(userNumber) {
    return userNumber.split('@')[0]; // Remove everything after '@'
}

function isDebugUser(userNumber) {
    const strippedNumber = stripDomain(userNumber); // Strip the domain
    return debugAccessList.includes(strippedNumber);
}

function activateDebugMode(message) {
    debugMode = true;
    console.log(`Debug mode activated by ${message.from} at ${new Date()}`); // Log the activation
}

function deactivateDebugMode() {
    debugMode = false;
}

function logDebugInfo(message) {
    if (debugMode) {
        console.log(`Debug Info: User ${message.from} invoked debug at ${new Date()}`);
    }
}

// Export the functions for use in bot.js
module.exports = {
    isDebugUser,
    activateDebugMode,
    deactivateDebugMode,
    logDebugInfo,
};
