import pkg from '@whiskeysockets/baileys';
import { DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { chromium } from 'playwright'; 
import fs from 'fs';
import path from 'path';

// Import Playwright helpers for CAPTCHA handling
import { performOcr, captureCaptchaImage, preprocessCaptchaImage, deleteFile } from './captcha.js';

// Import command handlers
import handleAttendance from './command/attendance.js';
import handleResult from './command/result.js';
import handleAdmitCard from './command/admitCard.js';
import handleTimetable from './command/timetable.js';
import handleOthers from './command/others.js';
import { handleInvalidCommand, handleMemeCommand } from './command/invalidAndMeme.js';
import { isDebugUser } from './DebugAccess.js';
import { activateDebugMode } from './debug.js';

const { makeWASocket, MessageMedia, useMultiFileAuthState } = pkg;

async function startClient() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const client = makeWASocket({
        printQRInTerminal: true,
        auth: state,
    });

    // Handle QR code generation
    client.ev.on('qr', (qr) => {
        qrcode.generate(qr, { small: true });
    });

    // Handle client readiness
    client.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to:', lastDisconnect?.error?.output?.payload.message || 'unknown reason');

            if (shouldReconnect) {
                console.log('Attempting to reconnect...');
                startClient();  // Reconnect on unexpected closure
            } else {
                console.log('Session expired or user logged out.');
            }
        } else if (connection === 'open') {
            console.log('Client is connected and ready!');
        }
    });

    // Save credentials when updated
    client.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    client.ev.on('messages.upsert', async ({ messages }) => {
        const message = messages[0];
        if (!message.message) return; // Check if message is not empty

        console.log('Message received:', message.message.conversation);

        // Debug command
        if (message.message.conversation === '/debug') {
            if (isDebugUser(message.key.remoteJid)) {
                activateDebugMode(message); // Pass the message object
                await client.sendMessage(message.key.remoteJid, { text: 'Debug mode activated. Welcome!' });
                console.log('Debug mode activated for:', message.key.remoteJid);
            } else {
                await client.sendMessage(message.key.remoteJid, { text: 'Unauthorized access' });
                console.log('Unauthorized debug access attempt by:', message.key.remoteJid);
            }
            return;
        }

        // Respond to ping
        if (message.message.conversation === 'ping') {
            await client.sendMessage(message.key.remoteJid, { text: 'pong' });
            console.log('Responding to ping...');
            return; // Exit to avoid processing further
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
                            if (!nextMessage || !Array.isArray(nextMessage.messages) || nextMessage.messages.length === 0) {
                                console.error('No messages found in nextMessage:', nextMessage);
                                return; // Exit if no valid message is found
                            }

                            const message = nextMessage.messages[0]; // Access the first message
                            const key = message.key; // Get the message key

                            if (!key || !key.remoteJid) {
                                console.error('Invalid message structure or missing remoteJid:', message);
                                return; // Exit if the structure is not valid
                            }

                            // Check if the message comes from the same user
                            if (key.remoteJid === message.key.remoteJid) {
                                const command = message.message?.conversation?.trim(); // Optional chaining to safely access conversation
                                if (!command) {
                                    console.error('Command is undefined or empty');
                                    return; // Exit if command is not valid
                                }

                                switch (command) {
                                    case '1':
                                        await handleAttendance(message, frame, client);
                                        break;
                                    case '2':
                                        await handleResult(message, frame);
                                        break;
                                    case '3':
                                        await handleAdmitCard(message, frame);
                                        break;
                                    case '4':
                                        await handleTimetable(message, frame);
                                        break;
                                    case '5':
                                        await handleOthers(message, frame);
                                        break;
                                    case '0':
                                        await handleMemeCommand(message);
                                        break;
                                    default:
                                        await handleInvalidCommand(message);
                                        break;
                                }
                            }
                        };

                        // Register the listener for the next message
                        const responseListener = (chatUpdate) => {
                            const messages = chatUpdate.messages;
                            if (messages && messages.length > 0) {
                                handleUserResponse(chatUpdate);
                            }
                        };

                        // Set timeout for the command response
                        const timeoutId = setTimeout(() => {
                            client.removeListener('messages.upsert', responseListener);
                            client.sendMessage(message.key.remoteJid, { text: 'That\'s your 2 min timeout; log in again if you want to fetch more data from IMS.' });
                        }, commandTimeout);

                        client.ev.on('messages.upsert', responseListener);

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

                // Manual Captcha Handling
                if (!loginSuccess) {
                    // Capture captcha image to send to user
                    const captchaImagePath = 'captcha.png';

                    await captureCaptchaImage(frame, 'img#captchaimg', captchaImagePath);
                    await client.sendMessage(message.key.remoteJid, { text: 'Login failed. Please solve this CAPTCHA: ' });
                    await client.sendMessage(message.key.remoteJid, MessageMedia.fromFilePath(captchaImagePath));
                }

                await browser.close();
            } catch (error) {
                console.error('Error during login process:', error);
                await client.sendMessage(message.key.remoteJid, { text: 'Error during login process. Please try again.' });
            }
            return; // Exit after processing login
        }
    });
}

startClient();
