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
import { isDebugUser } from './DebugAccess.js';
import { activateDebugMode } from './debug.js';
import { state } from './command/attendance.js'; 

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
        if (!Array.isArray(messages) || messages.length === 0) {
            console.log('Received empty messages array');
            return;
        }

        const message = messages[0];
        if (!message) {
            console.log('Received undefined message');
            return;
        }

        // Log the entire message object for debugging
        console.log('Received message object:', JSON.stringify(message, null, 2));

        // Extract the message content
        let messageContent = '';
        if (message.message?.conversation) {
            messageContent = message.message.conversation;
        } else if (message.message?.extendedTextMessage?.text) {
            messageContent = message.message.extendedTextMessage.text;
        } else if (message.message?.imageMessage?.caption) {
            messageContent = message.message.imageMessage.caption;
        }

        if (!messageContent) {
            console.log('Received empty message content');
            return;
        }

        console.log('Message received:', messageContent);

        // Debug command
        if (messageContent === '/debug') {
            if (isDebugUser(message.key.remoteJid)) {
                activateDebugMode(message);
                await client.sendMessage(message.key.remoteJid, { text: 'Debug mode activated. Welcome!' });
                console.log('Debug mode activated for:', message.key.remoteJid);
            } else {
                await client.sendMessage(message.key.remoteJid, { text: 'Unauthorized access' });
                console.log('Unauthorized debug access attempt by:', message.key.remoteJid);
            }
            return;
        }

        // Respond to ping
        if (messageContent === 'ping') {
            await client.sendMessage(message.key.remoteJid, { text: 'pong' });
            console.log('Responding to ping...');
            return;
        }

        // Login command
        if (messageContent.startsWith('/login')) {
            const [_, username, password] = messageContent.split(' ');

            if (!username || !password) {
                await client.sendMessage(message.key.remoteJid, { text: 'Please provide both username and password.' });
                return;
            }

            try {
                const browser = await chromium.launch({ headless: false });
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
                await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 });

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
                        await client.sendMessage(message.key.remoteJid, { 
                            text: 'Login successful!\n\nWhat would you like to fetch?\n1) Attendance\n2) Result\n3) Admit Card\n4) Timetable\n5) Others' 
                        });

                        // Handle user command
                        const commandTimeout = 120000; // 120 seconds
                        const handleUserResponse = async (nextMessage) => {
                            if (!nextMessage || !Array.isArray(nextMessage.messages) || nextMessage.messages.length === 0) {
                                console.error('No messages found in nextMessage:', nextMessage);
                                return;
                            }
                        
                            const userMessage = nextMessage.messages[0];
                            const key = userMessage.key;
                        
                            if (key.remoteJid === message.key.remoteJid) {
                                const command = userMessage.message?.conversation?.trim() 
                                                || userMessage.message?.extendedTextMessage?.text?.trim(); 
                                
                                if (!command) {
                                    console.error('Command is undefined or empty');
                                    return; // Exit if no command
                                }
                        
                                if (state.isInAttendanceMode) {
                                    await handleAttendance(userMessage, frame, client);
                                    return;
                                }
                        
                                // Process valid commands
                                switch (command) {
                                    case '1':
                                        state.attendanceMode = true;
                                        state.isInAttendanceMode = true;
                                        await handleAttendance(userMessage, frame, client);
                                        break;
                                    case '2':
                                        await handleResult(userMessage, client);
                                        break;
                                    case '3':
                                        await handleAdmitCard(userMessage, client);
                                        break;
                                    case '4':
                                        await handleTimetable(userMessage, client);
                                        break;
                                    case '5':
                                        await handleOthers(userMessage, client);
                                        break;
                                    case '0':
                                        state.attendanceMode = false;
                                        state.isInAttendanceMode = false;
                                        await client.sendMessage(message.key.remoteJid, { text: 'Returning to main features...' });
                                        break;
                                    default:
                                        // Removed the message to the user for invalid commands
                                        // Just wait for the next input
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

                        loginSuccess = true; // Exit loop on success
                        break; // Exit the login attempt loop
                    } catch (error) {
                        console.error('Login attempt failed:', error);
                        await client.sendMessage(message.key.remoteJid, { text: `Login attempt ${attempt + 1} failed. ${maxAttempts - attempt - 1} attempts remaining.` });
                        attempt++;
                    }
                }

                if (!loginSuccess) {
                    await client.sendMessage(message.key.remoteJid, { text: 'Login failed after maximum attempts. Please try again later.' });
                }

                await browser.close();
            } catch (error) {
                console.error('Error during login process:', error);
                await client.sendMessage(message.key.remoteJid, { text: 'An error occurred during login. Please try again.' });
            }
            return;
        }

        // Handle other messages if necessary...
    });

    return client;
}

startClient();