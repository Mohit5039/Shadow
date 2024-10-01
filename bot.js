import pkg from '@whiskeysockets/baileys';
const { makeWASocket, MessageMedia, useMultiFileAuthState } = pkg; // Destructure from the default export

import qrcode from 'qrcode-terminal';
import { chromium } from 'playwright'; // Import Playwright
import fs from 'fs';
import path from 'path';
import { performOcr, captureCaptchaImage, preprocessCaptchaImage, deleteFile } from './captcha.js'; // Ensure to add .js extension

// Import command handlers
import handleAttendance from './command/attendance.js';
import handleResult from './command/result.js';
import handleAdmitCard from './command/admitCard.js';
import handleTimetable from './command/timetable.js';
import handleOthers from './command/others.js';
import { handleInvalidCommand, handleMemeCommand } from './command/invalidAndMeme.js';
import { isDebugUser, logDebugInfo } from './DebugAccess.js';
import { activateDebugMode } from './debug.js';

// Initialize the client using makeWASocket with multi-file auth state
const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
const client = makeWASocket({
    printQRInTerminal: true,
    auth: state,
    
});

// Handle QR code generation
client.ev.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

// Handle client readiness
client.ev.on('connection.update', (update) => {
    const { connection } = update;
    if (connection === 'open') {
        console.log('Client is ready!');
    }
});

// Save credentials when updated
client.ev.on('creds.update', saveCreds);

let debugMode = false; // Initialize debug mode

// Handle incoming messages
client.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message.message) return; // Check if message is not empty

    console.log('Message received:', message.message.conversation);

    // Debug command
    if (message.message.conversation === '/debug') {
        if (isDebugUser(message.key.remoteJid)) {
            activateDebugMode(message); // Pass the message object
            await client.sendMessage(message.key.remoteJid, { text: 'Debug mode activated. Welcome fatass. Hope you are doing great.' });
            console.log('Debug mode activated for:', message.key.remoteJid);
        } else {
            await client.sendMessage(message.key.remoteJid, { text: 'Ni**a, you are not part of the squad' });
            console.log('Unauthorized debug access attempt by:', message.key.remoteJid);
        }
        return;
    }

    // Respond to ping
    if (message.message.conversation === 'ping') {
        await client.sendMessage(message.key.remoteJid, { text: 'pong' });
        console.log('Responding to ping...');
    }

    // Existing login command and other message handling...
    if (message.message.conversation.startsWith('/login')) {
        const [_, username, password] = message.message.conversation.split(' ');

        if (!username || !password) {
            await client.sendMessage(message.key.remoteJid, { text: 'Please provide both username and password.' });
            return;
        }

        try {
            const browser = await chromium.launch({ headless: false }); // Use Playwright's Chromium
            const page = await browser.newPage();

            console.log('Navigating to login page...');
            await page.goto('https://www.imsnsit.org/imsnsit/', { waitUntil: 'networkidle' });

            console.log('Clicking on Student Login...');
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('input, button, a'));
                const studentLoginButton = buttons.find(btn => btn.textContent.includes('Student Login'));
                if (studentLoginButton) {
                    studentLoginButton.click();
                } else {
                    console.error('Student Login button not found');
                }
            });

            console.log('Waiting for navigation to complete...');
            await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 }); // 5 seconds timeout

            console.log('Accessing the login frame...');
            const frames = page.frames();
            const frame = frames.find(f => f.url().includes('student_login.php'));

            if (!frame) {
                console.error('Login frame not found');
                await browser.close();
                return;
            }

            const maxAttempts = 3;
            let attempt = 0;
            let loginSuccess = false;

            while (attempt < maxAttempts) {
                try {
                    // Capture and preprocess CAPTCHA image
                    const captchaImagePath = 'captcha.png';
                    const preprocessedCaptchaPath = 'preprocessed_captcha.png';

                    await captureCaptchaImage(frame, 'img#captchaimg', captchaImagePath);
                    await preprocessCaptchaImage(captchaImagePath, preprocessedCaptchaPath);
                    const captchaText = await performOcr(preprocessedCaptchaPath);

                    // Delete old files
                    await deleteFile(captchaImagePath);
                    await deleteFile(preprocessedCaptchaPath);

                    console.log('Typing username and password...');
                    await frame.fill('input[name="cap"]', captchaText);
                    await frame.fill('input[name="uid"]', username);
                    await frame.fill('input[name="pwd"]', password);
                    await frame.click('input[type="submit"]');

                    // Send login successful message with options
                    await client.sendMessage(message.key.remoteJid,
                        { text: `Login successful!\n\nWhat would you like to fetch?\n` +
                            `1) Attendance\n` +
                            `2) Result\n` +
                            `3) Admit Card\n` +
                            `4) Timetable\n` +
                            `5) Others` }
                    );

                    // Handle user command
                    const commandTimeout = 120000; // 120 seconds
                    const handleUserResponse = async (nextMessage) => {
                        if (nextMessage.key.remoteJid === message.key.remoteJid) {
                            const command = nextMessage.message.conversation.trim();
                            switch (command) {
                                case '1':
                                    await handleAttendance(nextMessage, frame, client);
                                    break;
                                case '2':
                                    await handleResult(nextMessage, frame);
                                    break;
                                case '3':
                                    await handleAdmitCard(nextMessage, frame);
                                    break;
                                case '4':
                                    await handleTimetable(nextMessage, frame);
                                    break;
                                case '5':
                                    await handleOthers(nextMessage, frame);
                                    break;
                                case '0':
                                    await handleMemeCommand(nextMessage);
                                    break;
                                default:
                                    await handleInvalidCommand(nextMessage);
                                    break;
                            }
                            client.removeListener('messages.upsert', handleUserResponse);
                        }
                    };

                    client.ev.on('messages.upsert', handleUserResponse);

                    setTimeout(() => {
                        client.removeListener('messages.upsert', handleUserResponse);
                        client.sendMessage(message.key.remoteJid, { text: 'That\'s your 2 min timeout; log in again if you want to fetch more data from IMS.' });
                    }, commandTimeout);

                    loginSuccess = true;
                    break;
                } catch (error) {
                    console.error(`Attempt ${attempt + 1} failed:`, error);
                }

                attempt++;
                if (attempt < maxAttempts) {
                    await frame.evaluate(() => {
                        document.querySelector('input[name="cap"]').value = ''; // Clear CAPTCHA input
                    });
                }
            }

            // New Code Starts Here: Manual Captcha Handling
            if (!loginSuccess) {
                // Capture captcha image to send to user
                await captureCaptchaImage(frame, 'img#captchaimg', captchaImagePath);
                await client.sendMessage(message.key.remoteJid, { text: 'Please solve the CAPTCHA below:' });
                
                // Read the image file and send it as a media message
                const media = MessageMedia.fromFilePath(captchaImagePath);
                await client.sendMessage(message.key.remoteJid, media);
                
                // Wait for user input
                const captchaResponseListener = async (nextMessage) => {
                    if (nextMessage.key.remoteJid === message.key.remoteJid) {
                        const userInput = nextMessage.message.conversation.trim();
                        
                        // Fill in user input and submit
                        await frame.fill('input[name="cap"]', userInput);
                        await frame.click('input[type="submit"]');
                        
                        // Check for successful login based on page content or URL
                        const loginSuccessful = await page.evaluate(() => {
                            // Replace this condition with a check specific to the successful login state
                            return document.body.innerText.includes('Successful Login Message or Element');
                        });

                        if (loginSuccessful) {
                            await client.sendMessage(message.key.remoteJid, { text: 'Login successful! What would you like to fetch?' });
                            // Handle further commands as before...
                        } else {
                            await client.sendMessage(message.key.remoteJid, { text: 'Your CAPTCHA input was incorrect. Please try again.' });

                            // Send a new captcha image
                            await captureCaptchaImage(frame, 'img#captchaimg', captchaImagePath);
                            const newMedia = MessageMedia.fromFilePath(captchaImagePath);
                            await client.sendMessage(message.key.remoteJid, newMedia);
                        }

                        client.removeListener('messages.upsert', captchaResponseListener); // Cleanup listener
                    }
                };
                client.ev.on('messages.upsert', captchaResponseListener); // Listen for user CAPTCHA response
            }

            await browser.close(); // Close the browser after the process
        } catch (error) {
            console.error('Error during login:', error);
            await client.sendMessage(message.key.remoteJid, { text: 'An error occurred during the login process. Please try again later.' });
        }
    }
});

// Handle other incoming messages or commands...

// Start the client
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

