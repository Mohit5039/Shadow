export const state = {
  attendanceMode: false,
  isInAttendanceMode: false,
  selectedYear: null,
};

const years = ["2021", "2022", "2023", "2024"];
const semesters = ["1", "2", "3", "4", "5", "6", "7", "8"];

const handleAttendance = async (message, frame, client) => {
  const userJID = message.key.remoteJid;

  if (!state.isInAttendanceMode) {
    state.isInAttendanceMode = true;
    await client.sendMessage(userJID, { text: "Entering attendance mode." });
  }

  // Get year input
  let selectedYearValue = await getValidInput(userJID, client, years, "year");
  if (selectedYearValue === 'exit') {
    state.isInAttendanceMode = false;
    return;
  }
  state.selectedYear = selectedYearValue;

  // Get semester input
  let selectedSemester = await getValidInput(userJID, client, semesters, "semester");
  if (selectedSemester === 'exit') {
    state.isInAttendanceMode = false;
    state.selectedYear = null;
    return;
  }

  // Confirm year and semester selection
  const confirm = await confirmSelection(userJID, client, state.selectedYear, selectedSemester);
  if (!confirm) {
    state.selectedYear = null;
    state.isInAttendanceMode = false;
    await client.sendMessage(userJID, { text: "Selection cancelled. Exiting attendance mode." });
    return;
  }

  // Navigate and fetch data
  try {
    await handleAttendanceNavigation(frame, userJID, client, state.selectedYear, selectedSemester);
    await client.sendMessage(userJID, { text: "Attendance data fetched successfully." });
  } catch (error) {
    console.error("Error fetching attendance data:", error);
    await client.sendMessage(userJID, { text: "Error fetching attendance data. Please try again later." });
  }

  // Reset state after completing attendance process
  state.isInAttendanceMode = false;
  state.selectedYear = null;
};

const getValidInput = async (userJID, client, validOptions, inputType) => {
  let validInput = null;
  let attempts = 0;
  const maxAttempts = 3;

  while (!validInput && attempts < maxAttempts) {
    attempts++;
    await client.sendMessage(userJID, {
      text: `Please select your ${inputType}:\n${validOptions
        .map((opt, index) => `${index + 1}) ${opt}`)
        .join("\n")}\n0) Return to main menu`,
    });

    try {
      const userResponse = await waitForUserResponse(userJID, client);
      const responseValue = userResponse.message.conversation.trim();

      if (responseValue === "0") return 'exit';

      const selectedIndex = parseInt(responseValue) - 1;
      if (validOptions[selectedIndex]) {
        validInput = validOptions[selectedIndex];
      }
      // Do nothing for invalid selections, just wait for new input
    } catch (error) {
      console.error("Error getting user input:", error);
      await client.sendMessage(userJID, { text: "No response received. Please try again." });
    }
  }

  if (!validInput) {
    await client.sendMessage(userJID, { text: "Maximum attempts reached. Exiting attendance mode." });
    return 'exit';
  }

  return validInput;
};


const confirmSelection = async (userJID, client, selectedYear, selectedSemester) => {
  let confirmed = false;
  let attempts = 0;
  const maxAttempts = 3;

  while (!confirmed && attempts < maxAttempts) {
    attempts++;
    await client.sendMessage(userJID, {
      text: `You have selected:\nYear: ${selectedYear}\nSemester: ${selectedSemester}\n\nPress 'y' to confirm or 'n' to reselect.`,
    });

    try {
      const confirmationResponse = await waitForUserResponse(userJID, client);
      const confirmation = confirmationResponse.message.conversation.trim().toLowerCase();
      if (confirmation === 'y') {
        confirmed = true;
      } else if (confirmation === 'n') {
        return false;
      } else {
        await client.sendMessage(userJID, { text: "Invalid input. Please enter 'y' or 'n'." });
      }
    } catch (error) {
      console.error("Error getting confirmation:", error);
      await client.sendMessage(userJID, { text: "No response received. Please try again." });
    }
  }

  if (!confirmed) {
    await client.sendMessage(userJID, { text: "Maximum attempts reached. Cancelling selection." });
    return false;
  }

  return true;
};

const waitForUserResponse = async (userJID, client, timeout = 60000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('User did not respond within 60 seconds.'));
    }, timeout);

    const messageListener = (m) => {
      if (m.messages && m.messages.length > 0) {
        const message = m.messages[0];
        if (message.key.remoteJid === userJID) {
          clearTimeout(timer);
          client.ev.off('messages.upsert', messageListener);
          resolve(message);
        }
      }
    };

    client.ev.on('messages.upsert', messageListener);
  });
};

const handleAttendanceNavigation = async (frame, userJID, client, selectedYear, selectedSemester) => {
  await frame.goto("https://www.imsnsit.org/imsnsit/", { waitUntil: "networkidle" });
  await frame.select("select#yearDropdown", selectedYear);
  await frame.select("select#semesterDropdown", selectedSemester);
  await frame.click("button#submitAttendance");
  await frame.waitForSelector("#attendanceData", { timeout: 5000 });
};

export default handleAttendance;
