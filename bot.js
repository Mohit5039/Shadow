const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const puppeteer = require('puppeteer');

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
            await page.waitForNavigation({ waitUntil: 'networkidle2' });

            console.log('Accessing the login frame...');
            const frame = page.frames().find(f => f.url().includes('student_login.php'));

            if (!frame) {
                console.error('Login frame not found');
                await browser.close();
                return;
            }

            console.log('Typing username and password...');
            await frame.type('input[name="uid"]', username);
            await frame.type('input[name="pwd"]', password);

            console.log('Logging in...');
            await frame.click('input[type="submit"]');

            await page.waitForNavigation({ waitUntil: 'networkidle2' });

            console.log('Fetching data...');
            const fetchedData = await frame.evaluate(() => {
                // Replace 'yourSelectorHere' with the actual selector you want to use
                return document.querySelector('yourSelectorHere')?.innerText || 'No data found';
            });

            message.reply(`Fetched data: ${fetchedData}`);
            await browser.close();
        } catch (error) {
            console.error('Error during data fetching:', error);
            message.reply('Error during data fetching. Please try again.');
        }
    }
});

client.initialize();