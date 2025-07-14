// Resolution Builder with Live Updates and Persistence using Firebase

const preambulatoryClauses = [
  "Acknowledging", "Affirming", "Alarmed by", "Approving", "Aware of", "Bearing in mind",
  "Believing", "Confident", "Congratulating", "Contemplating", "Convinced", "Declaring",
  "Deeply concerned", "Deeply conscious", "Deeply disturbed", "Deeply regretting", "Desiring",
  "Emphasizing", "Expecting", "Expressing its appreciation", "Expressing its satisfaction",
  "Fulfilling", "Fully aware", "Further deploring", "Further recalling", "Guided by",
  "Having adopted", "Having considered", "Having devoted attention", "Having examined",
  "Having received", "Keeping in mind", "Noting with appreciation", "Noting with deep concern",
  "Noting with regret", "Noting with satisfaction", "Noting further", "Observing",
  "Pointing out", "Reaffirming", "Realizing", "Recalling", "Recognizing", "Referring",
  "Seeking", "Taking into consideration", "Taking note", "Viewing with appreciation", "Welcoming"
];

const operativeClauses = [
  "Accepts", "Affirms", "Approves", "Asks", "Authorizes", "Calls for", "Calls upon",
  "Condemns", "Confirms", "Decides", "Declares accordingly", "Demands", "Draws the attention",
  "Deplores", "Designates", "Encourages", "Endorses", "Emphasizes", "Expressing its appreciation",
  "Expressing its hope", "Expressing its satisfaction", "Further invites", "Further proclaims",
  "Further recommends", "Further requests", "Has resolved", "Hopes", "Invites", "Notes",
  "Proclaims", "Proposes", "Reaffirms", "Recommends", "Regrets", "Requests", "Seeks",
  "Solemnly affirms", "Strongly condemns", "Supports", "Suggests", "Takes note of",
  "Transmits", "Trusts", "Urges"
];

// Global state (data will be updated by Firebase listeners)
let committees = {}; // This will hold the real-time data from Firestore
let currentUser = {}; // Stores the logged-in user's role, committee, bloc, and Firebase UID

// Firebase listener unsubscribe functions to manage real-time updates
let unsubscribeCommitteeListener = null;
let unsubscribeBlocListener = null;
let timerInterval = null; // Keep track of the timer interval

/**
 * Sets up a real-time listener for the current user's committee data in Firestore.
 * This listener updates the `committees` global object and triggers UI updates
 * related to the committee's state (timer, editing lock).
 */
function setupCommitteeListener() {
  // Unsubscribe from any previous committee listener to avoid memory leaks
  if (unsubscribeCommitteeListener) {
    unsubscribeCommitteeListener();
    unsubscribeCommitteeListener = null;
  }

  // Only set up a listener if a committee is selected for the current user
  if (currentUser.committee) {
    const committeeRef = firebase.doc(window.db, 'committees', currentUser.committee);

    // onSnapshot provides real-time updates
    unsubscribeCommitteeListener = firebase.onSnapshot(committeeRef, (docSnap) => {
      if (docSnap.exists()) {
        // Update the local 'committees' object with the latest data
        committees[currentUser.committee] = docSnap.data();
        console.log("Committee data updated:", committees[currentUser.committee]);

        // Trigger UI updates based on the new committee data
        updateTimerDisplay();
        updateEditingPermissions();

        // Auto-start timer interval if the timer is running and not already started
        const timer = committees[currentUser.committee].timer;
        if (timer && timer.isRunning && !timerInterval) {
          startTimerInterval();
        }
      } else {
        // If committee data doesn't exist, initialize it in Firestore
        console.log(`Committee data for ${currentUser.committee} not found. Initializing...`);
        initializeCommitteeInFirestore(currentUser.committee);
      }
    }, (error) => {
      console.error("Error listening to committee changes:", error);
      // Handle error, e.g., show a message to the user
    });
  }
}

/**
 * Initializes a new committee document in Firestore if it doesn't exist.
 * This is called when a user tries to access a committee that has no data yet.
 * @param {string} committeeName The name of the committee to initialize.
 */
async function initializeCommitteeInFirestore(committeeName) {
  const committeeRef = firebase.doc(window.db, 'committees', committeeName);
  const initialCommitteeData = {
    blocs: {}, // Blocs will be sub-collections, but this can be a placeholder
    timer: { totalSeconds: 0, isRunning: false, startTime: null },
    isEditingLocked: false
  };
  try {
    await firebase.setDoc(committeeRef, initialCommitteeData, { merge: true });
    console.log(`Initialized committee: ${committeeName} in Firestore.`);
  } catch (error) {
    console.error("Error initializing committee in Firestore:", error);
  }
}

/**
 * Sets up a real-time listener for a specific bloc's data in Firestore.
 * This is used for delegates to see their bloc's resolution and comments,
 * and for chairs to view a selected bloc's details.
 * @param {string} committeeName The name of the committee.
 * @param {string} blocName The name of the bloc.
 */
function setupBlocListener(committeeName, blocName) {
  // Unsubscribe from any previous bloc listener
  if (unsubscribeBlocListener) {
    unsubscribeBlocListener();
    unsubscribeBlocListener = null;
  }

  if (committeeName && blocName) {
    const blocRef = firebase.doc(window.db, `committees/${committeeName}/blocs`, blocName);

    unsubscribeBlocListener = firebase.onSnapshot(blocRef, (docSnap) => {
      if (docSnap.exists()) {
        // Ensure the committee object exists locally
        if (!committees[committeeName]) {
          committees[committeeName] = { blocs: {} };
        } else if (!committees[committeeName].blocs) {
          committees[committeeName].blocs = {};
        }

        // Update the local 'committees' object with the latest bloc data
        committees[committeeName].blocs[blocName] = docSnap.data();
        console.log(`Bloc ${blocName} data updated:`, committees[committeeName].blocs[blocName]);

        // Trigger UI updates based on the new bloc data
        loadResolution();
        updateCommentsDisplay();
      } else {
        console.warn(`Bloc ${blocName} no longer exists in committee ${committeeName}.`);
        // If the bloc is deleted, clear the display and potentially log out the user
        document.getElementById("resolution-text").value = "";
        document.getElementById("comments-list").innerHTML = "";
        document.getElementById("forum").value = "";
        document.getElementById("question-of").value = "";
        document.getElementById("submitted-by").value = "";
        document.getElementById("co-submitted-by").value = "";
        currentUser.bloc = null; // Clear selected bloc for delegate
        currentUser.selectedBloc = null; // Clear selected bloc for chair
        displayMessageBox("Bloc Deleted", "The selected bloc no longer exists. Please select another or create a new one.");
        // Consider redirecting to login or bloc selection screen
      }
    }, (error) => {
      console.error("Error listening to bloc changes:", error);
      // Handle error
    });
  }
}

/**
 * Creates a new bloc document in Firestore.
 */
async function createBloc() {
  const name = document.getElementById("new-bloc-name").value.trim();
  const password = document.getElementById("new-bloc-password").value; // IMPORTANT: In production, hash this password!

  if (!name || !password) {
    displayMessageBox("Input Required", "Please enter both bloc name and password!");
    return;
  }

  const committee = currentUser.committee;
  const blocRef = firebase.doc(window.db, `committees/${committee}/blocs`, name);

  try {
    const blocSnap = await firebase.getDoc(blocRef); // Check if bloc name already exists
    if (blocSnap.exists()) {
      displayMessageBox("Bloc Exists", "Bloc name already exists!");
      return;
    }

    const newBlocData = {
      password: password, // Store hashed password in production
      members: [],
      resolution: {
        forum: "",
        questionOf: "",
        submittedBy: "",
        coSubmittedBy: "",
        preambulatoryClauses: [],
        operativeClauses: []
      },
      comments: [] // Comments will be stored as an array within the bloc document for simplicity
    };

    await firebase.setDoc(blocRef, newBlocData);
    console.log(`Bloc "${name}" created successfully in Firestore.`);

    // Update local state and UI
    if (!committees[committee].blocs) committees[committee].blocs = {};
    committees[committee].blocs[name] = newBlocData; // Update local cache immediately
    updateBlocDisplays();
    document.getElementById("new-bloc-name").value = "";
    document.getElementById("new-bloc-password").value = "";
    displayMessageBox("Success!", `Bloc "${name}" created successfully!`);
  } catch (error) {
    console.error("Error creating bloc:", error);
    displayMessageBox("Error", "Failed to create bloc: " + error.message);
  }
}

/**
 * Updates the display of existing blocs for chairs and available blocs for delegates.
 * Fetches bloc data from Firestore.
 */
async function updateBlocDisplays() {
  const committee = document.getElementById("committee").value || currentUser.committee;
  if (!committee) return;

  const committeeBlocsCollectionRef = firebase.collection(window.db, `committees/${committee}/blocs`);
  let blocDataFromFirestore = {};

  try {
    // FIX: Ensure firebase.getDocs is available through the global firebase object
    const querySnapshot = await firebase.getDocs(committeeBlocsCollectionRef);
    querySnapshot.forEach(doc => {
      blocDataFromFirestore[doc.id] = doc.data();
    });
    // Update the local 'committees' object with the fetched blocs
    if (!committees[committee]) committees[committee] = {};
    committees[committee].blocs = blocDataFromFirestore;
  } catch (error) {
    console.error("Error fetching blocs:", error);
    // Continue with potentially empty bloc list if fetch fails
  }

  // Update existing blocs display for chairs
  const existingBlocsDiv = document.getElementById("existing-blocs");
  if (existingBlocsDiv) {
    existingBlocsDiv.innerHTML = "<h4>Existing Blocs:</h4>";
    const blocNames = Object.keys(committees[committee].blocs || {}).sort(); // Sort bloc names
    blocNames.forEach(blocName => {
      const bloc = committees[committee].blocs[blocName];
      const blocDiv = document.createElement("div");
      blocDiv.innerHTML = `
        <strong>${blocName}</strong> - Members: ${bloc.members ? bloc.members.length : 0}
        <button onclick="viewBlocResolution('${blocName}')">View Resolution</button>
      `;
      existingBlocsDiv.appendChild(blocDiv);
    });
  }

  // Update available blocs dropdown for delegates
  const availableBlocsSelect = document.getElementById("available-blocs");
  if (availableBlocsSelect) {
    availableBlocsSelect.innerHTML = '<option value="">Select a bloc</option>';
    const blocNames = Object.keys(committees[committee].blocs || {}).sort(); // Sort bloc names
    blocNames.forEach(blocName => {
      const option = document.createElement("option");
      option.value = blocName;
      option.textContent = blocName;
      availableBlocsSelect.appendChild(option);
    });
  }

  // Update bloc selector for chairs in main interface
  const blocSelectorDiv = document.getElementById("bloc-selector");
  if (blocSelectorDiv && currentUser.role === "chair") {
    blocSelectorDiv.innerHTML = `
      <h4>Select Bloc to View:</h4>
      <select id="chair-bloc-select" onchange="onChairBlocSelect()">
        <option value="">Select a bloc</option>
        ${Object.keys(committees[committee].blocs || {}).sort().map(blocName => // Sort bloc names
          `<option value="${blocName}" ${currentUser.selectedBloc === blocName ? 'selected' : ''}>${blocName}</option>`
        ).join('')}
      </select>
    `;
  }
}

/**
 * Handles the selection of a bloc by a chair.
 * Sets up a real-time listener for the selected bloc.
 */
function onChairBlocSelect() {
  const selectedBloc = document.getElementById("chair-bloc-select").value;
  if (selectedBloc) {
    viewBlocResolution(selectedBloc);
  } else {
    // Clear resolution display when no bloc selected
    document.getElementById("resolution-text").value = "";
    document.getElementById("comments-list").innerHTML = "";
    document.getElementById("forum").value = "";
    document.getElementById("question-of").value = "";
    document.getElementById("submitted-by").value = "";
    document.getElementById("co-submitted-by").value = "";
    // Unsubscribe from previous bloc listener if a bloc is deselected
    if (unsubscribeBlocListener) {
      unsubscribeBlocListener();
      unsubscribeBlocListener = null;
    }
    currentUser.selectedBloc = null; // Clear chair's selected bloc
    document.getElementById("user-info").textContent = `${currentUser.role.toUpperCase()} – ${currentUser.committee.toUpperCase()}`;
  }
}

/**
 * Sets the current selected bloc for a chair and starts listening to its data.
 * @param {string} blocName The name of the bloc to view.
 */
function viewBlocResolution(blocName) {
  if (currentUser.role !== "chair") return;

  currentUser.selectedBloc = blocName;
  document.getElementById("user-info").textContent =
    `${currentUser.role.toUpperCase()} – ${currentUser.committee.toUpperCase()} – Viewing: ${blocName}`;

  // Set up real-time listener for the selected bloc's data
  setupBlocListener(currentUser.committee, currentUser.selectedBloc);
}

/**
 * Toggles the display of delegate-specific bloc containers and chair password field
 * based on the selected role.
 */
function handleRoleChange() {
  const role = document.getElementById("role").value;
  const delegateBlocContainer = document.getElementById("delegate-bloc-container");
  const chairPasswordDiv = document.getElementById("chair-password");

  if (role === "chair") {
    if (delegateBlocContainer) delegateBlocContainer.style.display = "none";
    if (chairPasswordDiv) chairPasswordDiv.style.display = "block";
  } else {
    if (delegateBlocContainer) delegateBlocContainer.style.display = "block";
    if (chairPasswordDiv) chairPasswordDiv.style.display = "none";
    updateBlocDisplays(); // Update available blocs when delegate is selected
  }
  checkBlocSelection();
}

/**
 * Inserts a preambulatory or operative clause into the current bloc's resolution in Firestore.
 * @param {string} clause The text of the clause to insert.
 * @param {string} type The type of clause ("preambulatory" or "operative").
 */
async function insertClause(clause, type) {
  if (currentUser.role === "delegate" && committees[currentUser.committee].isEditingLocked) {
    displayMessageBox("Editing Locked", "Editing is currently locked by the chair!");
    return;
  }

  const committee = currentUser.committee;
  const blocName = currentUser.bloc || currentUser.selectedBloc;
  if (!blocName || !committees[committee] || !committees[committee].blocs || !committees[committee].blocs[blocName]) {
    console.warn("No active bloc selected or bloc data not loaded.");
    displayMessageBox("No Bloc Selected", "Please select or join a bloc first.");
    return;
  }

  const blocRef = firebase.doc(window.db, `committees/${committee}/blocs`, blocName);
  let updateData = {};

  if (type === "preambulatory") {
    updateData = {
      'resolution.preambulatoryClauses': firebase.arrayUnion(`*${clause}*`)
    };
  } else {
    // For operative clauses, we need to get the current count to number them correctly
    const blocSnap = await firebase.getDoc(blocRef);
    const currentOperativeClauses = blocSnap.data().resolution.operativeClauses || [];
    const operativeNumber = currentOperativeClauses.length + 1;
    updateData = {
      'resolution.operativeClauses': firebase.arrayUnion(`${operativeNumber}. _${clause}_`)
    };
  }

  try {
    await firebase.updateDoc(blocRef, updateData);
    console.log(`Clause inserted into bloc ${blocName}.`);
    // The onSnapshot listener for the bloc will automatically call updateResolutionDisplay()
  } catch (error) {
    console.error("Error inserting clause:", error);
    displayMessageBox("Error", "Failed to insert clause: " + error.message);
  }
}

/**
 * Updates the resolution preview textarea based on the current bloc's data.
 * This function is called by the `onSnapshot` listener.
 */
function updateResolutionDisplay() {
  const committee = currentUser.committee;
  const blocName = currentUser.bloc || currentUser.selectedBloc;
  if (!blocName || !committees[committee] || !committees[committee].blocs || !committees[committee].blocs[blocName]) {
    document.getElementById("resolution-text").value = ""; // Clear if no bloc selected or data missing
    return;
  }

  const resolution = committees[committee].blocs[blocName].resolution;
  let resolutionText = "";

  // Add preambulatory clauses
  if (resolution.preambulatoryClauses && resolution.preambulatoryClauses.length > 0) {
    resolutionText += resolution.preambulatoryClauses.join(",\n\n") + ",\n\n";
  }

  // Add operative clauses
  if (resolution.operativeClauses && resolution.operativeClauses.length > 0) {
    const operativeText = resolution.operativeClauses.map((clause, index) => {
      const isLast = index === resolution.operativeClauses.length - 1;
      return clause + (isLast ? "." : ";");
    }).join("\n\n");
    resolutionText += operativeText;
  }

  document.getElementById("resolution-text").value = resolutionText;
}

/**
 * Saves the header fields (forum, question of, submitted by, co-submitted by)
 * to the current bloc's resolution in Firestore.
 */
async function saveResolution() {
  // Check editing lock before saving
  if (currentUser.role === "delegate" && committees[currentUser.committee].isEditingLocked) {
      // Do not save, and perhaps give a visual cue that changes won't be saved
      console.warn("Attempted to save resolution while editing is locked.");
      return;
  }

  const committee = currentUser.committee;
  const blocName = currentUser.bloc || currentUser.selectedBloc;
  if (!blocName || !committees[committee] || !committees[committee].blocs || !committees[committee].blocs[blocName]) {
    console.warn("No active bloc to save resolution to.");
    return;
  }

  const blocRef = firebase.doc(window.db, `committees/${committee}/blocs`, blocName);
  const resolutionData = {
    'resolution.forum': document.getElementById("forum").value,
    'resolution.questionOf': document.getElementById("question-of").value,
    'resolution.submittedBy': document.getElementById("submitted-by").value,
    'resolution.coSubmittedBy': document.getElementById("co-submitted-by").value
  };

  try {
    await firebase.updateDoc(blocRef, resolutionData);
    console.log(`Resolution header fields saved for bloc ${blocName}.`);
    // The onSnapshot listener for the bloc will automatically update the display
  } catch (error) {
    console.error("Error saving resolution fields:", error);
    // displayMessageBox("Error", "Failed to save resolution fields: " + error.message); // Too frequent, log instead
  }
}

/**
 * Loads the resolution header fields into the input fields.
 * This function is called by the `onSnapshot` listener for the bloc.
 */
function loadResolution() {
  const committee = currentUser.committee;
  const blocName = currentUser.bloc || currentUser.selectedBloc;
  if (!blocName || !committees[committee] || !committees[committee].blocs || !committees[committee].blocs[blocName]) {
    // Clear fields if no bloc data is available (e.g., initial load or bloc deleted)
    document.getElementById("forum").value = "";
    document.getElementById("question-of").value = "";
    document.getElementById("submitted-by").value = "";
    document.getElementById("co-submitted-by").value = "";
    return;
  }

  const resolution = committees[committee].blocs[blocName].resolution;
  document.getElementById("forum").value = resolution.forum || "";
  document.getElementById("question-of").value = resolution.questionOf || "";
  document.getElementById("submitted-by").value = resolution.submittedBy || "";
  document.getElementById("co-submitted-by").value = resolution.coSubmittedBy || "";

  updateResolutionDisplay(); // Also update the main resolution text area
}

/**
 * Adds a new comment to the current bloc's comments array in Firestore.
 */
async function addComment() {
  if (currentUser.role !== "chair") return;

  const commentText = document.getElementById("comment-input").value.trim();
  if (!commentText) return;

  const committee = currentUser.committee;
  const blocName = currentUser.selectedBloc;
  if (!blocName || !committees[committee] || !committees[committee].blocs || !committees[committee].blocs[blocName]) {
    displayMessageBox("No Bloc Selected", "Please select a bloc first to add comments!");
    return;
  }

  const blocRef = firebase.doc(window.db, `committees/${committee}/blocs`, blocName);
  const newComment = {
    text: commentText,
    timestamp: firebase.serverTimestamp(), // Use Firestore server timestamp
    chair: currentUser.id || "Chair" // Store chair's UID or a generic name
  };

  try {
    // Use arrayUnion to add the new comment to the array
    await firebase.updateDoc(blocRef, {
      comments: firebase.arrayUnion(newComment)
    });
    document.getElementById("comment-input").value = "";
    console.log("Comment added successfully.");
    // The onSnapshot listener for the bloc will automatically call updateCommentsDisplay()
  } catch (error) {
    console.error("Error adding comment:", error);
    displayMessageBox("Error", "Failed to add comment: " + error.message);
  }
}

/**
 * Updates the display of comments for the current bloc.
 * This function is called by the `onSnapshot` listener.
 */
function updateCommentsDisplay() {
  const committee = currentUser.committee;
  const blocName = currentUser.bloc || currentUser.selectedBloc;
  const commentsDiv = document.getElementById("comments-list");
  commentsDiv.innerHTML = "";

  if (!blocName || !committees[committee] || !committees[committee].blocs || !committees[committee].blocs[blocName]) {
    return; // No bloc selected or data not loaded
  }

  const comments = committees[committee].blocs[blocName].comments || [];

  // Sort comments by timestamp (Firestore Timestamp objects need .toDate() for comparison)
  comments.sort((a, b) => {
    const timeA = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : new Date(0);
    const timeB = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : new Date(0);
    return timeA - timeB;
  });

  comments.forEach(comment => {
    const commentDiv = document.createElement("div");
    commentDiv.className = "comment";
    // Format timestamp for display
    const displayTime = comment.timestamp ?
      (comment.timestamp.toDate ? comment.timestamp.toDate().toLocaleTimeString() : new Date(comment.timestamp).toLocaleTimeString())
      : 'N/A';

    commentDiv.innerHTML = `
      <div class="comment-time">${displayTime} - ${comment.chair}</div>
      <div class="comment-text">${comment.text}</div>
    `;
    commentsDiv.appendChild(commentDiv);
  });
}

/**
 * Toggles the editing lock status for the current committee in Firestore.
 * Only chairs can perform this action.
 */
async function toggleLock() {
  if (currentUser.role !== "chair") return;

  const committee = currentUser.committee;
  const committeeRef = firebase.doc(window.db, 'committees', committee);
  const currentLockState = committees[committee].isEditingLocked;

  try {
    await firebase.updateDoc(committeeRef, {
      isEditingLocked: !currentLockState
    });
    console.log(`Editing lock toggled to: ${!currentLockState}`);
    // The onSnapshot listener for the committee will automatically update the UI
  } catch (error) {
    console.error("Error toggling lock:", error);
    displayMessageBox("Error", "Failed to toggle editing lock: " + error.message);
  }
}

/**
 * Updates the UI elements' disabled state based on editing permissions.
 * This function is called by the `onSnapshot` listener.
 */
function updateEditingPermissions() {
  const committee = currentUser.committee;
  if (!committee || !committees[committee]) return;

  const isDelegate = currentUser.role === "delegate";
  const isLocked = committees[committee].isEditingLocked;
  // Delegates cannot edit if locked, chairs can always edit.
  const canEdit = !isLocked || !isDelegate;

  document.getElementById("forum").disabled = !canEdit;
  document.getElementById("question-of").disabled = !canEdit;
  document.getElementById("submitted-by").disabled = !canEdit;
  document.getElementById("co-submitted-by").disabled = !canEdit;

  const clauseButtons = document.querySelectorAll("#preambulatory-buttons button, #operative-buttons button");
  clauseButtons.forEach(btn => btn.disabled = !canEdit);

  // Update lock button text and color
  const lockBtn = document.getElementById("lock-toggle");
  if (lockBtn) { // Ensure button exists before trying to update
    lockBtn.textContent = isLocked ? "🔓 Unlock" : "🔒 Lock";
    lockBtn.style.backgroundColor = isLocked ? "#dc3545" : "#28a745";
  }
}

/**
 * Sets the total time for the timer in Firestore.
 * Only chairs can perform this action.
 */
async function setTimer() {
  if (currentUser.role !== "chair") return;

  const minutes = parseInt(prompt("Enter minutes:")) || 0;
  const seconds = parseInt(prompt("Enter seconds:")) || 0;

  if (isNaN(minutes) || isNaN(seconds) || minutes < 0 || seconds < 0) {
      displayMessageBox("Invalid Input", "Please enter valid positive numbers for minutes and seconds.");
      return;
  }

  const committee = currentUser.committee;
  const committeeRef = firebase.doc(window.db, 'committees', committee);

  const newTimerState = {
    totalSeconds: minutes * 60 + seconds,
    isRunning: false,
    startTime: null
  };

  try {
    await firebase.updateDoc(committeeRef, {
      timer: newTimerState
    });
    console.log("Timer set successfully.");
    // The onSnapshot listener will update the UI
  } catch (error) {
    console.error("Error setting timer:", error);
    displayMessageBox("Error", "Failed to set timer: " + error.message);
  }
}

/**
 * Starts the timer for the current committee in Firestore.
 * Only chairs can perform this action.
 */
async function startTimer() {
  if (currentUser.role !== "chair") return;

  const committee = currentUser.committee;
  const committeeRef = firebase.doc(window.db, 'committees', committee);
  const timer = committees[committee].timer;

  if (timer.isRunning) {
    console.log("Timer already running.");
    displayMessageBox("Timer Status", "Timer is already running.");
    return;
  }
  if (timer.totalSeconds <= 0) {
    console.log("No time set for timer.");
    displayMessageBox("Timer Status", "Please set a timer duration first.");
    return;
  }

  try {
    await firebase.updateDoc(committeeRef, {
      'timer.isRunning': true,
      'timer.startTime': firebase.serverTimestamp() // Use server timestamp for accuracy
    });
    console.log("Timer started.");
    // The onSnapshot listener will update the UI and trigger startTimerInterval
  } catch (error) {
    console.error("Error starting timer:", error);
    displayMessageBox("Error", "Failed to start timer: " + error.message);
  }
}

/**
 * Manages the client-side timer display.
 * This interval runs locally but calculates time based on Firestore data.
 */
function startTimerInterval() {
  // Clear any existing interval to prevent multiple timers running
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  timerInterval = setInterval(() => {
    const committee = currentUser.committee;
    // Ensure committee data and timer exist before proceeding
    if (!committee || !committees[committee] || !committees[committee].timer) {
      clearInterval(timerInterval);
      timerInterval = null;
      return;
    }

    const timer = committees[committee].timer;

    if (!timer.isRunning) {
      clearInterval(timerInterval);
      timerInterval = null;
      return;
    }

    // Calculate remaining time based on the initial totalSeconds and startTime from Firestore
    const now = Date.now();
    const startTimeMillis = timer.startTime ? (timer.startTime.toDate ? timer.startTime.toDate().getTime() : timer.startTime) : now;
    const elapsedSeconds = Math.floor((now - startTimeMillis) / 1000);
    let remainingSeconds = timer.totalSeconds - elapsedSeconds;

    if (remainingSeconds <= 0) {
      remainingSeconds = 0;
      // If time is up, update Firestore to stop the timer
      const committeeRef = firebase.doc(window.db, 'committees', committee);
      firebase.updateDoc(committeeRef, {
        'timer.isRunning': false,
        'timer.totalSeconds': 0 // Ensure it's 0 on completion
      }).then(() => {
        console.log("Timer ended and updated in Firestore.");
        if (currentUser.role === "chair") {
          // Use a custom message box instead of alert()
          displayMessageBox("Time's up!", "The allocated time for the committee has ended.");
        }
      }).catch(error => {
        console.error("Error stopping timer in Firestore:", error);
      });

      clearInterval(timerInterval);
      timerInterval = null;
    }
    updateTimerDisplay(remainingSeconds); // Update display with calculated remaining time
  }, 1000);
}

/**
 * Pauses the timer for the current committee in Firestore.
 * Only chairs can perform this action.
 */
async function pauseTimer() {
  if (currentUser.role !== "chair") return;

  const committee = currentUser.committee;
  const committeeRef = firebase.doc(window.db, 'committees', committee);
  const timer = committees[committee].timer;

  if (timer.isRunning) {
    // Calculate remaining time at the point of pause
    const now = Date.now();
    const startTimeMillis = timer.startTime ? (timer.startTime.toDate ? timer.startTime.toDate().getTime() : timer.startTime) : now;
    const elapsedSeconds = Math.floor((now - startTimeMillis) / 1000);
    const remaining = Math.max(0, timer.totalSeconds - elapsedSeconds);

    try {
      await firebase.updateDoc(committeeRef, {
        'timer.isRunning': false,
        'timer.totalSeconds': remaining, // Update totalSeconds to the remaining time
        'timer.startTime': null // Clear start time
      });
      console.log("Timer paused.");
      // The onSnapshot listener will update the UI and stop the interval
    } catch (error) {
      console.error("Error pausing timer:", error);
      displayMessageBox("Error", "Failed to pause timer: " + error.message);
    }
  } else {
      displayMessageBox("Timer Status", "Timer is not running.");
  }
}

/**
 * Resets the timer for the current committee in Firestore.
 * Only chairs can perform this action.
 */
async function resetTimer() {
  if (currentUser.role !== "chair") return;

  const committee = currentUser.committee;
  const committeeRef = firebase.doc(window.db, 'committees', committee);

  try {
    await firebase.updateDoc(committeeRef, {
      timer: {
        totalSeconds: 0,
        isRunning: false,
        startTime: null
      }
    });
    console.log("Timer reset.");
    // The onSnapshot listener will update the UI and clear the interval
  } catch (error) {
    console.error("Error resetting timer:", error);
    displayMessageBox("Error", "Failed to reset timer: " + error.message);
  }
}

/**
 * Updates the timer display on the UI.
 * @param {number|null} forceRemainingSeconds Optional: if provided, use this value for display.
 */
function updateTimerDisplay(forceRemainingSeconds = null) {
  const committee = currentUser.committee;
  if (!committee || !committees[committee] || !committees[committee].timer) {
    document.getElementById("timer").textContent = "00:00";
    return;
  }

  const timer = committees[committee].timer;
  let totalSeconds = 0;

  if (forceRemainingSeconds !== null) {
    totalSeconds = forceRemainingSeconds;
  } else if (timer.isRunning && timer.startTime) {
    // Calculate remaining time based on Firestore's startTime and totalSeconds
    const now = Date.now();
    const startTimeMillis = timer.startTime.toDate ? timer.startTime.toDate().getTime() : timer.startTime;
    const elapsedSeconds = Math.floor((now - startTimeMillis) / 1000);
    totalSeconds = Math.max(0, timer.totalSeconds - elapsedSeconds);
  } else {
    totalSeconds = timer.totalSeconds;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  document.getElementById("timer").textContent = display;
}

/**
 * Exports the current resolution to a PDF (via print functionality).
 */
function exportToPDF() {
  const committee = currentUser.committee;
  const blocName = currentUser.bloc || currentUser.selectedBloc;
  if (!blocName || !committees[committee] || !committees[committee].blocs || !committees[committee].blocs[blocName]) {
    displayMessageBox("No Resolution", "No resolution data available to export!");
    return;
  }

  const resolution = committees[committee].blocs[blocName].resolution;
  const resolutionText = document.getElementById("resolution-text").value;

  // Create a printable version
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>Resolution - ${blocName}</title>
        <style>
          body { font-family: 'Times New Roman', serif; margin: 2cm; }
          .header { text-align: center; margin-bottom: 2cm; }
          .field { margin-bottom: 0.5cm; }
          .resolution { white-space: pre-line; line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>RESOLUTION</h1>
        </div>
        <div class="field"><strong>FORUM:</strong> ${resolution.forum || ''}</div>
        <div class="field"><strong>QUESTION OF:</strong> ${resolution.questionOf || ''}</div>
        <div class="field"><strong>SUBMITTED BY:</strong> ${resolution.submittedBy || ''}</div>
        <div class="field"><strong>CO-SUBMITTED BY:</strong> ${resolution.coSubmittedBy || ''}</div>
        <hr>
        <div class="resolution">${resolutionText}</div>
        <script>window.print(); window.close();</script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

/**
 * Handles user login (chair or delegate) and transitions to the editor.
 * Authenticates with Firebase and sets up appropriate listeners.
 */
async function enterEditor() {
  const role = document.getElementById("role").value;
  const committee = document.getElementById("committee").value;
  const code = document.getElementById("committee-code").value;

  const validCodes = {
    "unep": "un#p26", "security": "$ecur!ty", "ecosoc": "ec0s0c",
    "unesco": "un3sco2026", "nato": "n@t0", "who": "wh022",
    "hrc": "#rc24", "unwomen": "wom(26)"
  };

  if (validCodes[committee] !== code) {
    displayMessageBox("Login Error", "Wrong committee code!");
    return;
  }

  // Use the Firebase auth user provided by the Canvas environment's initial authentication
  const user = window.auth.currentUser;
  if (!user) {
    // This should ideally not happen if authenticateFirebase() ran successfully in index.html
    displayMessageBox("Authentication Error", "No active Firebase user found. Please refresh.");
    return;
  }

  let userRole = role; // Store the role from selection

  if (role === "chair") {
    const chairPassword = document.getElementById("chair-password-input").value;
    if (chairPassword !== "resolutions@26") {
      displayMessageBox("Login Error", "Invalid chair password!");
      return;
    }
    // Chair login successful, assign current authenticated UID
    currentUser = { role: userRole, committee: committee, id: user.uid };
  } else { // Delegate
    const selectedBloc = document.getElementById("available-blocs").value;
    const blocPassword = document.getElementById("bloc-password").value;

    if (!selectedBloc) {
      displayMessageBox("Login Error", "Delegates must select a bloc!");
      return;
    }
    if (!blocPassword) {
      displayMessageBox("Login Error", "Please enter the bloc password!");
      return;
    }

    // Fetch bloc data from Firestore to verify password
    const blocRef = firebase.doc(window.db, `committees/${committee}/blocs`, selectedBloc);
    let blocSnap;
    try {
      blocSnap = await firebase.getDoc(blocRef);
    } catch (error) {
      console.error("Error fetching bloc for password check:", error);
      displayMessageBox("Login Error", "Failed to retrieve bloc data. Please try again.");
      return;
    }

    if (!blocSnap.exists() || blocSnap.data().password !== blocPassword) {
      displayMessageBox("Login Error", "Invalid bloc name or password!");
      return;
    }

    // Delegate login successful, assign current authenticated UID and bloc
    currentUser = { role: userRole, committee: committee, id: user.uid, bloc: selectedBloc };

    // Add delegate's UID to the bloc's members array in Firestore
    const blocMembersRef = firebase.doc(window.db, `committees/${committee}/blocs`, currentUser.bloc);
    const blocData = (await firebase.getDoc(blocMembersRef)).data();
    if (blocData && !blocData.members.includes(currentUser.id)) {
      try {
        await firebase.updateDoc(blocMembersRef, {
          members: firebase.arrayUnion(currentUser.id)
        });
        console.log(`Delegate ${currentUser.id} added to bloc ${currentUser.bloc}.`);
      } catch (error) {
        console.error("Error adding delegate to bloc members:", error);
        // This might not be a critical error to stop login, but good to log
      }
    }
    // Set up real-time listener for the delegate's bloc
    setupBlocListener(currentUser.committee, currentUser.bloc);
  }

  // Update user info display
  let userInfoText = `${currentUser.role.toUpperCase()} – ${currentUser.committee.toUpperCase()}`;
  if (currentUser.bloc) {
      userInfoText += ` – BLOC: ${currentUser.bloc}`;
  } else if (currentUser.selectedBloc) {
      userInfoText += ` – Viewing: ${currentUser.selectedBloc}`;
  }
  document.getElementById("user-info").textContent = userInfoText;

  // Transition UI
  document.getElementById("login-container").style.display = "none";
  document.getElementById("editor-container").style.display = "block";

  // Setup role-specific interface elements
  setupRoleInterface();
  // Update bloc displays (will fetch from Firestore)
  updateBlocDisplays();

  // Setup real-time listener for the committee's global state
  setupCommitteeListener();
}

/**
 * Adjusts UI elements based on the current user's role (chair/delegate).
 */
function setupRoleInterface() {
  const isChair = currentUser.role === "chair";

  // Chair-specific controls visibility
  document.getElementById("set-timer").style.display = isChair ? "inline" : "none";
  document.getElementById("start-timer").style.display = isChair ? "inline" : "none";
  document.getElementById("pause-timer").style.display = isChair ? "inline" : "none";
  document.getElementById("reset-timer").style.display = isChair ? "inline" : "none";
  document.getElementById("lock-toggle").style.display = isChair ? "inline" : "none";

  const commentInput = document.getElementById("comment-input");
  const addCommentBtn = document.getElementById("add-comment");
  if (commentInput) commentInput.style.display = isChair ? "inline-flex" : "none";
  if (addCommentBtn) addCommentBtn.style.display = isChair ? "inline-flex" : "none";


  const chairControls = document.getElementById("chair-controls");
  const blocSelector = document.getElementById("bloc-selector");

  if (isChair) {
    chairControls.style.display = "block";
    blocSelector.style.display = "block";

    // Update lock button state based on current committee data
    const committee = currentUser.committee;
    const lockBtn = document.getElementById("lock-toggle");
    if (lockBtn && committees[committee]) {
      lockBtn.textContent = committees[committee].isEditingLocked ? "🔓 Unlock" : "🔒 Lock";
      lockBtn.style.backgroundColor = committees[committee].isEditingLocked ? "#dc3545" : "#28a745";
    }
  } else {
    chairControls.style.display = "none";
    blocSelector.style.display = "none";
  }
}

/**
 * Checks if a delegate has selected a bloc and enables/disables the enter button accordingly.
 */
function checkBlocSelection() {
  const selectedBloc = document.getElementById("available-blocs").value;
  const enterButton = document.getElementById("enter-button");
  const role = document.getElementById("role").value;

  if (role === "delegate") {
    enterButton.disabled = !selectedBloc; // Disable if no bloc selected
  } else {
    enterButton.disabled = false; // Always enabled for chairs
  }
}

/**
 * Custom message box function to replace alert() and confirm().
 * Creates a simple modal for displaying messages.
 * @param {string} title The title of the message box.
 * @param {string} message The message content.
 * @param {function} onConfirm Optional callback for a "Confirm" button.
 */
function displayMessageBox(title, message, onConfirm = null) {
  const existingBox = document.getElementById('message-box-modal');
  if (existingBox) existingBox.remove(); // Remove any existing box

  const modal = document.createElement('div');
  modal.id = 'message-box-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center;
    z-index: 1000;
  `;

  const box = document.createElement('div');
  box.style.cssText = `
    background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    max-width: 400px; text-align: center; font-family: Arial, sans-serif;
  `;

  const h3 = document.createElement('h3');
  h3.textContent = title;
  h3.style.cssText = 'margin-top: 0; color: #333;';

  const p = document.createElement('p');
  p.textContent = message;
  p.style.cssText = 'margin-bottom: 20px; color: #555;';

  const closeButton = document.createElement('button');
  closeButton.textContent = 'OK';
  closeButton.style.cssText = `
    padding: 10px 20px; border: none; border-radius: 5px; background: #007BFF; color: white;
    cursor: pointer; font-size: 1rem;
  `;
  closeButton.onclick = () => modal.remove();

  box.appendChild(h3);
  box.appendChild(p);
  box.appendChild(closeButton);

  if (onConfirm) {
    const confirmButton = document.createElement('button');
    confirmButton.textContent = 'Confirm';
    confirmButton.style.cssText = `
      padding: 10px 20px; border: none; border-radius: 5px; background: #28a745; color: white;
      cursor: pointer; font-size: 1rem; margin-right: 10px;
    `;
    confirmButton.onclick = () => {
      onConfirm();
      modal.remove();
    };
    box.insertBefore(confirmButton, closeButton);
  }

  modal.appendChild(box);
  document.body.appendChild(modal);
}

// Initial setup when the window loads
window.onload = () => {
  // Initialize clause buttons
  const preambContainer = document.getElementById("preambulatory-buttons");
  preambulatoryClauses.forEach(c => {
    const btn = document.createElement("button");
    btn.innerText = c;
    btn.onclick = () => insertClause(c, "preambulatory");
    preambContainer.appendChild(btn);
  });

  const operContainer = document.getElementById("operative-buttons");
  operativeClauses.forEach(c => {
    const btn = document.createElement("button");
    btn.innerText = c;
    btn.onclick = () => insertClause(c, "operative");
    operContainer.appendChild(btn);
  });

  // Attach event listeners
  document.getElementById("role").addEventListener("change", handleRoleChange);
  document.getElementById("committee").addEventListener("change", updateBlocDisplays);

  // Initial calls to set up UI based on default selections
  handleRoleChange();
  checkBlocSelection();

  // Auto-save on input changes for header fields
  const inputs = ["forum", "question-of", "submitted-by", "co-submitted-by"];
  inputs.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener("input", saveResolution);
    }
  });

  // The main real-time updates for committee and bloc data are now handled by
  // setupCommitteeListener and setupBlocListener, which are triggered after successful login.
  // The timer display itself is updated by startTimerInterval which is also triggered by onSnapshot.
};