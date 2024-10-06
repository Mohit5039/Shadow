export const state = {
  attendanceMode: false,
  isInAttendanceMode: false, // TRACK IF THE BOT IS IN ATTENDANCE SELECTION MODE
  selectedYear: null, // KEEP TRACK OF YEAR ONCE SELECTED
};

const years = ["2021", "2022", "2023", "2024"]; // YEAR OPTIONS
const semesters = ["1", "2", "3", "4", "5", "6", "7", "8"]; // SEMESTER OPTIONS

const handleAttendance = async (message, frame, client) => {
  //console.log("Message received in handleAttendance:", message); // DEBUGGING

  const userJID = message.key.remoteJid;

  // If not in attendance mode, enter it
  if (!state.isInAttendanceMode) {
    state.isInAttendanceMode = true;
    await client.sendMessage(userJID, { text: "Entering attendance mode." });
  }

  // Start with year selection
  const selectedYearValue = await getYearInput(userJID, client, years);
  if (selectedYearValue === 'exit') {
    state.isInAttendanceMode = false;
    return;
  }
  state.selectedYear = selectedYearValue;

  // Move to semester selection
  const selectedSemester = await getSemesterInput(userJID, client, semesters);
  if (selectedSemester === 'exit') {
    state.isInAttendanceMode = false;
    state.selectedYear = null;
    return;
  }

  // Navigate and fetch data
  await handleAttendanceNavigation(frame, userJID, client, state.selectedYear, selectedSemester);
  
  // Reset state after completing attendance process
  state.isInAttendanceMode = false;
  state.selectedYear = null;
};

///////////////////////////////////////
const waitForUserResponse = async (userJID, client, timeout = 60000) => {
  return new Promise((resolve, reject) => {
      // Set a timer to reject the promise after the specified timeout
      const timer = setTimeout(() => {
          reject(new Error('User did not respond within 60 seconds.'));
      }, timeout);

      // Function to handle incoming messages
      const messageListener = (message) => {
          if (message.key.remoteJid === userJID) {
              clearTimeout(timer); // Clear the timer on success
              client.ev.off('messages.upsert', messageListener); // Remove the listener
              resolve(message); // Resolve with the message
          }
      };

      // Add the message listener to the client
      client.ev.on('messages.upsert', (m) => {
          // Handle the case when a message is received
          if (m.messages && m.messages.length > 0) {
              m.messages.forEach(msg => messageListener(msg));
          }
      });
  });
};

//////////////////////////////////////////////////////
// FUNCTION FOR YEAR INPUT HANDLING
const getYearInput = async (userJID, client, years) => {
  let selectedYear = null;
  while (!selectedYear) {
    await client.sendMessage(userJID, {
      text: `Please select your year:\n${years
        .map((y, index) => `${index + 1}) ${y}`)
        .join("\n")}\n0) Return to main menu`,
    });
    const yearResponse = await waitForUserResponse(userJID, client);
    const selectedYearIndex = parseInt(yearResponse.message.conversation.trim()) - 1;
    if (selectedYearIndex === -1) return 'exit'; // EXIT TO MAIN MENU
    if (selectedYearIndex >= 0 && selectedYearIndex < years.length) {
      selectedYear = years[selectedYearIndex]; // VALID YEAR SELECTED
    } else {
      await client.sendMessage(userJID, { text: "Invalid selection. Please try again." });
    }
  }
  return selectedYear;
};

// FUNCTION FOR SEMESTER INPUT HANDLING
const getSemesterInput = async (userJID, client, semesters) => {
  let selectedSemester = null;
  while (!selectedSemester) {
    await client.sendMessage(userJID, {
      text: `Please select your semester:\n${semesters
        .map((s, index) => `${index + 1}) ${s}`)
        .join("\n")}\n0) Return to main menu\ny) Go back to year selection`,
    });
    const semesterResponse = await waitForUserResponse(userJID, client);
    const selectedSemesterInput = semesterResponse.message.conversation.trim();
    if (selectedSemesterInput === '0') return 'exit'; // EXIT TO MAIN MENU
    if (selectedSemesterInput === 'y') return 'retryYear'; // RETRY YEAR SELECTION
    const selectedSemesterIndex = parseInt(selectedSemesterInput) - 1;
    if (selectedSemesterIndex >= 0 && selectedSemesterIndex < semesters.length) {
      selectedSemester = semesters[selectedSemesterIndex]; // VALID SEMESTER SELECTED
    } else {
      await client.sendMessage(userJID, { text: "Invalid selection. Please try again." });
    }
  }
  return selectedSemester;
};

// FUNCTION TO HANDLE NAVIGATION AFTER SELECTION
const handleAttendanceNavigation = async (frame, userJID, client, selectedYear, selectedSemester) => {
  console.log("Navigating to attendance page..."); // DEBUGGING

  // NAVIGATE TO ATTENDANCE PAGE AFTER RECEIVING BOTH INPUTS
  await frame.goto("https://www.imsnsit.org/imsnsit/", {
    waitUntil: "networkidle",
  });

  // HANDLE SELECTIONS
  console.log(`Selecting year: ${selectedYear}`); // DEBUGGING
  await attendanceFrame.select("select#yearDropdown", selectedYear);
  console.log(`Selecting semester: ${selectedSemester}`); // DEBUGGING
  await attendanceFrame.select("select#semesterDropdown", selectedSemester);

  // SUBMIT ATTENDANCE FORM
  console.log("Submitting attendance form..."); // DEBUGGING
  await attendanceFrame.click("button#submitAttendance");
  await attendanceFrame.waitForSelector("#attendanceData", { timeout: 5000 });
};

// FUNCTION TO HANDLE INVALID COMMAND OR UNEXPECTED INPUTS


export default handleAttendance;
