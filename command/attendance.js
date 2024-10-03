// handleAttendance.js

const handleAttendance = async (message, frame, client) => {
  console.log("Message received in handleAttendance:", message); // Debugging

  const userJID = message.key.remoteJid;

  const years = ["2021", "2022", "2023", "2024"]; // Updated to include 2024
  const semesters = ["1", "2"]; // Example semesters

  // Step 1: Ask for Year input
  await client.sendMessage(userJID, {
    text: `Please select your year:\n${years
      .map((y, index) => `${index + 1}) ${y}`)
      .join("\n")}`,
  });

  const yearResponse = await waitForUserResponse(userJID, client);
  const selectedYearIndex = parseInt(yearResponse.message.conversation.trim()) - 1;

  // Check if the selected year index is valid
  if (selectedYearIndex < 0 || selectedYearIndex >= years.length) {
    return; // Exit the function if the input is invalid
  }

  const selectedYear = years[selectedYearIndex];

  // Step 2: Ask for Semester input
  await client.sendMessage(userJID, {
    text: `Please select your semester:\n${semesters
      .map((s, index) => `${index + 1}) ${s}`)
      .join("\n")}`,
  });

  const semesterResponse = await waitForUserResponse(userJID, client);
  const selectedSemesterIndex = parseInt(semesterResponse.message.conversation.trim()) - 1;

  // Check if the selected semester index is valid
  if (selectedSemesterIndex < 0 || selectedSemesterIndex >= semesters.length) {
    return; // Exit the function if the input is invalid
  }

  const selectedSemester = semesters[selectedSemesterIndex];

  // Step 3: Navigate to attendance page after receiving both inputs
  console.log("Navigating to attendance page..."); // Debugging
  await frame.goto("https://www.imsnsit.org/imsnsit/", {
    waitUntil: "networkidle",
  });

  const attendanceFrame = frame
    .frames()
    .find((f) => f.url().includes("attendance_page.php")); // Adjust this to the correct URL

  if (!attendanceFrame) {
    console.error("Attendance frame not found"); // Debugging
    await client.sendMessage(userJID, { text: "Failed to load attendance page." });
    return;
  }

  console.log(`Selecting year: ${selectedYear}`); // Debugging
  await attendanceFrame.select("select#yearDropdown", selectedYear);
  console.log(`Selecting semester: ${selectedSemester}`); // Debugging
  await attendanceFrame.select("select#semesterDropdown", selectedSemester);

  console.log("Submitting attendance form..."); // Debugging
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
            // Check if the message content is empty
            if (nextMessage.message.conversation && nextMessage.message.conversation.trim() !== "") {
              client.ev.off("messages.upsert", listener);
              resolve(nextMessage);
              break; // Exit the loop once the message is found
            }
          }
        }
      }
    };

    client.ev.on("messages.upsert", listener);
  });
};

export default handleAttendance;
