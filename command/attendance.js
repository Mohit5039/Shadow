const puppeteer = require('puppeteer');

const handleAttendance = async (message, frame, client) => {
    // Provide dropdowns for year and semester
    const years = ['2021', '2022', '2023']; // Example years
    const semesters = ['1', '2']; // Example semesters

    // Send message to user with year dropdown options
    await message.reply(`Please select your year:\n${years.map((y, index) => `${index + 1}) ${y}`).join('\n')}`);
    
    // Wait for user response for year
    const yearResponse = await waitForUserResponse(message.from, client);
    const selectedYear = years[parseInt(yearResponse.body.trim()) - 1];

    // Send message to user with semester dropdown options
    await message.reply(`Please select your semester:\n${semesters.map((s, index) => `${index + 1}) ${s}`).join('\n')}`);
    
    // Wait for user response for semester
    const semesterResponse = await waitForUserResponse(message.from, client);
    const selectedSemester = semesters[parseInt(semesterResponse.body.trim()) - 1];

    // Navigate to attendance page
    console.log('Navigating to attendance page...');
    await frame.goto('https://www.imsnsit.org/imsnsit/', { waitUntil: 'networkidle2' });

    // Re-fetch frame after navigation to avoid detached frame errors
    const attendanceFrame = frame.frames().find(f => f.url().includes('attendance_page.php')); // Adjust this to the correct URL

    if (!attendanceFrame) {
        console.error('Attendance frame not found');
        await message.reply('Failed to load attendance page.');
        return;
    }

    // Select the options for year and semester in the dropdown
    console.log(`Selecting year: ${selectedYear}`);
    await attendanceFrame.select('select#yearDropdown', selectedYear);
    console.log(`Selecting semester: ${selectedSemester}`);
    await attendanceFrame.select('select#semesterDropdown', selectedSemester);

    // Submit the form to fetch attendance data
    console.log('Submitting attendance form...');
    await attendanceFrame.click('button#submitAttendance');

    // Wait for attendance data to load
    await attendanceFrame.waitForSelector('#attendanceData', { timeout: 5000 });
    const attendanceData = await attendanceFrame.evaluate(() => {
        return document.querySelector('#attendanceData').innerText;
    });

    // Send attendance data back to the user
    await message.reply(`Your attendance data:\n${attendanceData}`);
};

// Helper function to wait for user response
const waitForUserResponse = (user, client) => {
    return new Promise((resolve) => {
        const listener = async (nextMessage) => {
            if (nextMessage.from === user) {
                client.removeListener('message', listener);
                resolve(nextMessage);
            }
        };
        client.on('message', listener);
    });
};

module.exports = handleAttendance;
