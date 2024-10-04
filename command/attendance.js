let isInAttendanceMode = false; // Track if the bot is in attendance selection mode
let selectedYear = null; // Keep track of year once selected

const handleAttendance = async (message, frame, client) => {
  console.log("Message received in handleAttendance:", message); // Debugging

  const userJID = message.key.remoteJid;

  // Updated year options as per your website's pull-down menu
  const years = ["2022-23", "2021-22", "2023-24", "2024-25", "2025-26", "2026-27", "2026-28"];
  const semesters = ["1", "2", "3", "4", "5", "6", "7", "8"]; // All 8 semesters

  // Check if the input is in attendance mode first
  if (isInAttendanceMode) {
    const userInput = message.message.conversation.trim();

    // Step 1: If year is not yet selected, move to year selection
    if (!selectedYear) {
      const selectedYearValue = await getYearInput(userJID, client, years);
      if (selectedYearValue === 'exit') {
        isInAttendanceMode = false; // Reset state and exit
        return;
      }
      selectedYear = selectedYearValue; // Store the selected year
      // After selecting year, directly go to semester selection
      const selectedSemester = await getSemesterInput(userJID, client, semesters);
      if (selectedSemester === 'exit') {
        isInAttendanceMode = false; // Reset state and exit
        selectedYear = null; // Reset year for next usage
        return;
      }

      // Step 3: Once both year and semester are selected, navigate and fetch data
      await handleAttendanceNavigation(frame, userJID, client, selectedYear, selectedSemester);
      isInAttendanceMode = false; // Reset state after completing attendance process
      selectedYear = null; // Reset year for next usage
    } else {
      // If year is already selected, continue with semester selection
      const selectedSemester = await getSemesterInput(userJID, client, semesters);
      if (selectedSemester === 'exit') {
        isInAttendanceMode = false; // Reset state and exit
        return;
      }

      // Step 3: Once both year and semester are selected, navigate and fetch data
      await handleAttendanceNavigation(frame, userJID, client, selectedYear, selectedSemester);
      isInAttendanceMode = false; // Reset state after completing attendance process
      selectedYear = null; // Reset year for next usage
    }
    return; // Exit after handling attendance input
  }

  // Check if user input triggers attendance mode
  if (message.message.conversation.trim() === '1') {
    isInAttendanceMode = true; // Enter attendance mode
    // Directly move to year selection without unnecessary message
    const selectedYearValue = await getYearInput(userJID, client, years);
    if (selectedYearValue === 'exit') {
      isInAttendanceMode = false; // Reset state and exit
      return;
    }
    selectedYear = selectedYearValue; // Store the selected year
    return; // Exit after processing the initial selection
  }

  // If not in attendance mode, do nothing or handle invalid command
  await handleInvalidCommand(message); // Ensure it falls back if something unexpected occurs
};

// Function for year input handling
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

    if (selectedYearIndex === -1) return 'exit'; // Exit to main menu
    if (selectedYearIndex >= 0 && selectedYearIndex < years.length) {
      selectedYear = years[selectedYearIndex]; // Valid year selected
    } else {
      await client.sendMessage(userJID, { text: "Invalid selection. Please try again." });
    }
  }
  return selectedYear;
};

// Function for semester input handling
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

    if (selectedSemesterInput === '0') return 'exit'; // Exit to main menu
    if (selectedSemesterInput === 'y') return 'retryYear'; // Retry year selection

    const selectedSemesterIndex = parseInt(selectedSemesterInput) - 1;

    if (selectedSemesterIndex >= 0 && selectedSemesterIndex < semesters.length) {
      selectedSemester = semesters[selectedSemesterIndex]; // Valid semester selected
    } else {
      await client.sendMessage(userJID, { text: "Invalid selection. Please try again." });
    }
  }
  return selectedSemester;
};

// Function to handle navigation after selection
const handleAttendanceNavigation = async (frame, userJID, client, selectedYear, selectedSemester) => {
  console.log("Navigating to attendance page...");

  await frame.goto("https://www.imsnsit.org/imsnsit/", {
    waitUntil: "networkidle",
  });

  const attendanceFrame = frame
    .frames()
    .find((f) => f.url().includes("attendance_page.php")); // Adjust this to the correct URL

  if (!attendanceFrame) {
    console.error("Attendance frame not found");
    await client.sendMessage(userJID, { text: "Failed to load attendance page." });
    return;
  }

  console.log(`Selecting year: ${selectedYear}`);
  await attendanceFrame.select("select#yearDropdown", selectedYear);
  console.log(`Selecting semester: ${selectedSemester}`);
  await attendanceFrame.select("select#semesterDropdown", selectedSemester);

  console.log("Submitting attendance form...");
  await attendanceFrame.click("button#submitAttendance");

  await attendanceFrame.waitForSelector("#attendanceData", { timeout: 5000 });
  const attendanceData = await attendanceFrame.evaluate(() => {
    return document.querySelector("#attendanceData").innerText;
  });

  await client.sendMessage(userJID, { text: `Your attendance data:\n${attendanceData}` });
};

// Helper function to wait for user response
const waitForUserResponse = (user, client) => {
  return new Promise((resolve) => {
    const listener = async (update) => {
      const messages = update.messages;

      if (Array.isArray(messages) && messages.length > 0) {
        for (const nextMessage of messages) {
          if (nextMessage.key.remoteJid === user) {
            if (nextMessage.message.conversation && nextMessage.message.conversation.trim() !== "") {
              client.ev.off("messages.upsert", listener);
              resolve(nextMessage);
              break;
            }
          }
        }
      }
    };

    client.ev.on("messages.upsert", listener);
  });
};

// Function to handle invalid command or unexpected inputs
const handleInvalidCommand = async (message) => {
  await client.sendMessage(message.key.remoteJid, { text: "Invalid command. Please try again." });
};

export default handleAttendance;
