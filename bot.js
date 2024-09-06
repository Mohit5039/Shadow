const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { performOcr, captureCaptchaImage, preprocessCaptchaImage, deleteFile } = require('./captcha');

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
                    const commandTimeout = 30000; // 30 seconds
                    const commandCollector = new Map(); // To store user responses

                    const handleUserResponse = async (nextMessage) => {
                        if (nextMessage.from === message.from) {
                            const command = nextMessage.body.trim();
                            switch (command) {
                                case '1':
                                    await nextMessage.reply('Fetching Attendance...');
                                    // Implement fetch attendance logic here
                                    break;
                                case '2':
                                    await nextMessage.reply('Fetching Result...');
                                    // Implement fetch result logic here
                                    break;
                                case '3':
                                    await nextMessage.reply('Fetching Admit Card...');
                                    // Implement fetch admit card logic here
                                    break;
                                case '4':
                                    await nextMessage.reply('Fetching Timetable...');
                                    // Implement fetch timetable logic here
                                    break;
                                case '5':
                                    await nextMessage.reply('Fetching Others...');
                                    // Implement fetch others logic here
                                    break;
                                case '0':
                                    // Send meme image
                                    const memePath = './command/0 meme.webp'; // Path to your meme image
                                    const memeMedia = MessageMedia.fromFilePath(memePath);
                                    await nextMessage.reply('Here is a meme for you!', memeMedia);
                                    break;
                                default:
                                    await nextMessage.reply('Bro, I only know counting till 5. Please press any number from 1 to 5.');
                                    break;
                            }
                            // Remove event listener after processing command
                            client.removeListener('message', handleUserResponse);
                        }
                    };

                    // Add event listener for user response
                    client.on('message', handleUserResponse);

                    // Set timeout to remove the event listener if no response is received
                    setTimeout(() => {
                        client.removeListener('message', handleUserResponse);
                        message.reply('No response received. Please try again.');
                    }, commandTimeout);

                    loginSuccess = true;
                    break; // Exit loop if login is successful
                } catch (error) {
                    console.error(`Attempt ${attempt + 1} failed:`, error);
                }

                attempt++;
                if (attempt < maxAttempts) {
                    // Re-enter credentials
                    await frame.evaluate(() => {
                        document.querySelector('input[name="uid"]').value = '';
                        document.querySelector('input[name="pwd"]').value = '';
                    });
                }
            }

            if (!loginSuccess) {
                // Manual CAPTCHA process
                console.log('All automated attempts failed. Requesting manual CAPTCHA input...');
                const captchaImagePath = 'captcha.png';
                const captchaImageBuffer = fs.readFileSync(captchaImagePath);

                await message.reply('Please solve the CAPTCHA and send the text back.');
                await message.reply({ content: 'CAPTCHA Image:', files: [captchaImageBuffer] });

                // Wait for manual CAPTCHA input with a timeout
                let manualCaptchaReceived = false;

                const manualCaptchaTimeout = setTimeout(() => {
                    if (!manualCaptchaReceived) {
                        message.reply('Manual CAPTCHA input timed out. Please try again.');
                    }
                }, 90000); // 90 seconds

                client.on('message', async response => {
                    if (response.from === message.from) {
                        const captchaText = response.body;
                        if (captchaText) {
                            manualCaptchaReceived = true;
                            clearTimeout(manualCaptchaTimeout);
                            await frame.type('input[name="cap"]', captchaText);
                            await frame.type('input[name="uid"]', username);
                            await frame.type('input[name="pwd"]', password);
                            await frame.click('input[type="submit"]');

                            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }); // 5 seconds timeout

                            loginSuccess = await frame.evaluate(() => {
                                return document.body.innerText.includes('Welcome');
                            });

                            if (loginSuccess) {
                                await message.reply(
                                    `Login successful!\n\nWhat would you like to fetch?\n` +
                                    `1) Attendance\n` +
                                    `2) Result\n` +
                                    `3) Admit Card\n` +
                                    `4) Timetable\n` +
                                    `5) Others`
                                );
                                // Handle user command
                                const commandTimeout = 30000; // 30 seconds
                                const commandCollector = new Map(); // To store user responses

                                const handleUserResponse = async (nextMessage) => {
                                    if (nextMessage.from === message.from) {
                                        const command = nextMessage.body.trim();
                                        switch (command) {
                                            case '1':
                                                await nextMessage.reply('Fetching Attendance...');
                                                // Implement fetch attendance logic here
                                                break;
                                            case '2':
                                                await nextMessage.reply('Fetching Result...');
                                                // Implement fetch result logic here
                                                break;
                                            case '3':
                                                await nextMessage.reply('Fetching Admit Card...');
                                                // Implement fetch admit card logic here
                                                break;
                                            case '4':
                                                await nextMessage.reply('Fetching Timetable...');
                                                // Implement fetch timetable logic here
                                                break;
                                            case '5':
                                                await nextMessage.reply('Fetching Others...');
                                                // Implement fetch others logic here
                                                break;
                                            case '0':
                                                // Send meme image
                                                const memePath = './command/0 meme.webp'; // Path to your meme image
                                                const memeMedia = MessageMedia.fromFilePath(memePath);
                                                await nextMessage.reply('Here is a meme for you!', memeMedia);
                                                break;
                                            default:
                                                await nextMessage.reply('Bro, I only know counting till 5. Please press any number from 1 to 5.');
                                                break;
                                        }
                                        // Remove event listener after processing command
                                        client.removeListener('message', handleUserResponse);
                                    }
                                };

                                // Add event listener for user response
                                client.on('message', handleUserResponse);

                                // Set timeout to remove the event listener if no response is received
                                setTimeout(() => {
                                    client.removeListener('message', handleUserResponse);
                                    message.reply('No response received. Please try again.');
                                }, commandTimeout);
                            } else {
                                await message.reply('Login failed with manual CAPTCHA. Please try again.');
                            }
                        } else {
                            await message.reply('No CAPTCHA text received. Please try again.');
                        }
                    }
                });
            }

            await browser.close();
        } catch (error) {
            console.error('Error during login process:', error);
            message.reply('An error occurred during the login process. Please try again later.');
        }
    }
});

client.initialize();
