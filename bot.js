const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { performOcr, captureCaptchaImage, preprocessCaptchaImage, deleteFile } = require('./captcha');

// Import command handlers
const handleAttendance = require('./command/attendance');
const handleResult = require('./command/result');
const handleAdmitCard = require('./command/admitCard');
const handleTimetable = require('./command/timetable');
const handleOthers = require('./command/others');
const { handleInvalidCommand, handleMemeCommand } = require('./command/invalidAndMeme');

const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('message', async message => {
    console.log('Message received:', message.body);

    if (message.body === 'ping') {
        message.reply('pong');
        console.log('Responding to ping...');
    }

    if (message.body.startsWith('/login')) {
        const [_, username, password] = message.body.split(' ');

        if (!username || !password) {
            message.reply('Please provide both username and password.');
            return;
        }

        try {
            const browser = await puppeteer.launch({ headless: false });
            const page = await browser.newPage();

            console.log('Navigating to login page...');
            await page.goto('https://www.imsnsit.org/imsnsit/', { waitUntil: 'networkidle2' });

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
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }); // 5 seconds timeout

            console.log('Accessing the login frame...');
            const frame = page.frames().find(f => f.url().includes('student_login.php'));

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
                    await frame.type('input[name="cap"]', captchaText);
                    await frame.type('input[name="uid"]', username);
                    await frame.type('input[name="pwd"]', password);
                    await frame.click('input[type="submit"]');

                    // Send login successful message with options
                    await message.reply(
                        `Login successful!\n\nWhat would you like to fetch?\n` +
                        `1) Attendance\n` +
                        `2) Result\n` +
                        `3) Admit Card\n` +
                        `4) Timetable\n` +
                        `5) Others`
                    );

                    // Handle user command
                    const commandTimeout = 120000; // 120 seconds
                    const handleUserResponse = async (nextMessage) => {
                        if (nextMessage.from === message.from) {
                            const command = nextMessage.body.trim();
                            switch (command) {
                                case '1':
                                    await handleAttendance(nextMessage, frame);
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
                            client.removeListener('message', handleUserResponse);
                        }
                    };

                    client.on('message', handleUserResponse);

                    setTimeout(() => {
                        client.removeListener('message', handleUserResponse);
                        message.reply('Thats your 2 min timeout login again for if you want to fetch more data from ims .');
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

            if (!loginSuccess) {
                await message.reply('Login failed after multiple attempts. Please try again.');
            }

            await browser.close();
        } catch (error) {
            console.error('Login error:', error);
            await message.reply('An error occurred during login. Please try again.');
        }
    }
});

client.initialize();
