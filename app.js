// app.js
// Resolution Builder with Live Updates and Persistence using Firebase Firestore

// --- Firebase Global Variables (Initialized in index.html) ---
// These are now accessed via the global `firebase` object or `window.db`, `window.auth`, `window.appId`
let db; // Firestore instance
let auth; // Auth instance
let userId; // Current user's ID
let appId; // Application ID for Firestore paths (now set in index.html)
let isAuthReady = false; // Flag to ensure Firebase Auth is ready

// --- Clause Definitions (unchanged) ---
const preambulatoryClauses = [
  "Acknowledging", "Affirming", "Alarmed by", "Approving", "Aware of", "Bearing in mind",
  "Believing", "Confident", "Congratulating", "Contemplating", "Convinced", "Declaring",
  "Deeply concerned", "Deeply conscious", "Deeply disturbed", "Deeply regretting", "Desiring",
  "Emphasizing", "Expecting", "Expressing its appreciation", "Expressing its satisfaction",
  "Fulfilling", "Fully aware", "Further deploring", "Further recalling", "Guided by",
  "Having adopted", "Having considered", "Having devoted attention", "Having examined",
  "Having received", "Keeping in mind",
  "Noting with appreciation", "Noting with deep concern",
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

// --- Application State (now largely derived from Firebase) ---
let currentUser = {}; // { role, committee, bloc?, selectedBloc?, id? }
let committeeListeners = {}; // To store Firestore unsubscribe functions for committee data
let blocListeners = {}; // To store Firestore unsubscribe functions for bloc data

// --- Firebase Security Rules Reminder ---
// IMPORTANT: You MUST set up Firestore Security Rules in your Firebase console
// to control read/write access. Use the `appId` defined in index.html.
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // This rule allows any authenticated user to read and write
    // to all documents and subcollections under the 'public/data' path
    // within your specific application's artifact space.
    // Ensure 'pyleamun-app' matches the window.appId in your index.html
    match /artifacts/{appId}/public/data/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
*/

// --- Initialization and Authentication ---
document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ DOM fully loaded');
  // Get Firebase instances from window scope (set by index.html script module)
  db = window.db;
  auth = window.auth;
  appId = window.appId;
  console.log("App loaded. Initializing Firebase...");

  // Sign in to Firebase Auth anonymously.
  try {
    await auth.signInAnonymously();
    console.log("Anonymous sign-in attempt successful.");
  } catch (error) {
    console.error("Firebase Auth Error during signInAnonymously:", error);
    alert("Authentication Error: " + error.message + ". Please refresh.");
  }

  // Listen for auth state changes
  auth.onAuthStateChanged((user) => {
    if (user) {
      userId = user.uid;
      isAuthReady = true;
      console.log("Firebase Auth Ready. User ID:", userId);
      // Now that auth is ready, proceed with app initialization
      initializeUI();
    } else {
      userId = null;
      isAuthReady = false;
      console.log("No Firebase user logged in (onAuthStateChanged).");
      // Handle logout or unauthenticated state if necessary
    }
  });
});

// --- Core UI Initialization (called after Firebase Auth is ready) ---
function initializeUI() {
  console.log("initializeUI called. Firebase should be ready.");
  // Populate clause buttons
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

  // Event listeners for login fields
  document.getElementById("role").addEventListener("change", handleRoleChange);
  document.getElementById("committee").addEventListener("change", updateBlocDisplays);
  document.getElementById("available-blocs").addEventListener("change", checkBlocSelection);
  document.getElementById("enter-button").addEventListener("click", enterEditor); // Added event listener for enter button

  // Chair controls buttons
  document.getElementById("create-bloc-button").addEventListener("click", createBloc); // Added event listener for create bloc button
  document.getElementById("lock-toggle").addEventListener("click", toggleLock);
  document.getElementById("set-timer").addEventListener("click", setTimer);
  document.getElementById("start-timer").addEventListener("click", startTimer);
  document.getElementById("pause-timer").addEventListener("click", pauseTimer);
  document.getElementById("reset-timer").addEventListener("click", resetTimer);
  document.getElementById("export-pdf").addEventListener("click", exportToPDF);
  document.getElementById("add-comment").addEventListener("click", addComment);


  handleRoleChange(); // Initial setup based on default role
  checkBlocSelection(); // Initial check for delegate bloc selection

  // Auto-save on input changes for resolution header fields
  const inputs = ["forum", "question-of", "submitted-by", "co-submitted-by"];
  inputs.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener("input", saveResolution);
    }
  });

  // Start a local interval for timer display (actual timer logic is Firebase-driven)
  // This just ensures the local display ticks down even if no Firestore change occurs
  setInterval(() => {
    if (currentUser.committee && isAuthReady) {
      // Re-fetch committee data to ensure local state is fresh
      const committeeRef = db.collection(`artifacts/${appId}/public/data/committees`).doc(currentUser.committee);
      committeeRef.get().then(docSnap => {
        if (docSnap.exists) {
          const timer = docSnap.data().timer;
          if (timer && timer.isRunning && timer.startTime) {
            const elapsed = Math.floor((Date.now() - timer.startTime) / 1000);
            const remaining = Math.max(0, timer.totalSeconds - elapsed);
            updateTimerDisplay(remaining);
          } else {
            updateTimerDisplay(timer ? timer.totalSeconds : 0);
          }
        }
      }).catch(error => console.error("Error fetching committee for timer display:", error));
    }
  }, 1000);
}

// --- Firebase Data Operations ---

/**
 * Ensures a committee document exists in Firestore.
 * If not, it creates it with default values.
 * @param {string} committeeId
 */
async function ensureCommitteeExists(committeeId) {
  if (!isAuthReady) {
    console.warn("ensureCommitteeExists: Firebase not ready.");
    return;
  }
  const committeeRef = db.collection(`artifacts/${appId}/public/data/committees`).doc(committeeId);
  try {
    const docSnap = await committeeRef.get();
    if (!docSnap.exists) {
      console.log(`Committee ${committeeId} does not exist. Creating...`);
      await committeeRef.set({
        isEditingLocked: false,
        timer: { totalSeconds: 0, isRunning: false, startTime: null }
      });
      console.log(`Committee ${committeeId} initialized in Firestore.`);
    } else {
      console.log(`Committee ${committeeId} already exists.`);
    }
  } catch (e) {
    console.error("Error ensuring committee exists:", e);
  }
}

/**
 * Creates a new bloc document in Firestore.
 */
async function createBloc() {
  console.log("createBloc called.");
  if (!isAuthReady) {
    alert("Firebase authentication not ready. Please wait a moment and try again.");
    console.warn("createBloc: Firebase not ready.");
    return;
  }
  const name = document.getElementById("new-bloc-name").value.trim();
  const password = document.getElementById("new-bloc-password").value;

  if (!name || !password) {
    alert("Please enter both bloc name and password!");
    return;
  }

  const committeeId = currentUser.committee;
  if (!committeeId) {
    alert("Please select a committee first!");
    return;
  }

  const blocRef = db.collection(`artifacts/${appId}/public/data/committees/${committeeId}/blocs`).doc(name);
  console.log(`Attempting to create bloc at path: artifacts/${appId}/public/data/committees/${committeeId}/blocs/${name}`);

  try {
    const docSnap = await blocRef.get();
    if (docSnap.exists) {
      alert("Bloc name already exists!");
      console.warn("createBloc: Bloc name already exists.");
      return;
    }

    await blocRef.set({
      password: password,
      members: [], // Members can be tracked here if needed, but not strictly for collaboration
      resolution: {
        forum: "",
        questionOf: "",
        submittedBy: "",
        coSubmittedBy: "",
        preambulatoryClauses: [],
        operativeClauses: []
      }
    });

    alert(`Bloc "${name}" created successfully!`);
    console.log(`Bloc "${name}" successfully created in Firestore.`);
    document.getElementById("new-bloc-name").value = "";
    document.getElementById("new-bloc-password").value = "";
    // updateBlocDisplays will be triggered by the onSnapshot listener
  } catch (e) {
    console.error("Error creating bloc in Firestore:", e);
    alert("Failed to create bloc: " + e.message);
  }
}

/**
 * Updates the display of existing blocs for chairs and available blocs for delegates.
 * This is now driven by a Firestore snapshot listener.
 */
function updateBlocDisplays() {
  console.log("updateBlocDisplays called.");
  if (!isAuthReady) {
    console.warn("updateBlocDisplays: Firebase not ready.");
    return;
  }
  const committeeId = document.getElementById("committee").value || currentUser.committee;
  if (!committeeId) {
    console.log("updateBlocDisplays: No committee selected yet.");
    return;
  }
  console.log(`updateBlocDisplays: Current committeeId: ${committeeId}`);

  // Unsubscribe from previous bloc listeners if committee changes
  if (blocListeners.unsubscribeBlocs) {
    console.log("updateBlocDisplays: Unsubscribing from previous bloc listener.");
    blocListeners.unsubscribeBlocs();
    blocListeners = {};
  }

  const blocsCollectionRef = db.collection(`artifacts/${appId}/public/data/committees/${committeeId}/blocs`);
  console.log(`updateBlocDisplays: Setting up listener for blocs at path: artifacts/${appId}/public/data/committees/${committeeId}/blocs`);

  const userAtSnapshot = { ...currentUser }; // freeze currentUser at time of listener setup
blocListeners.unsubscribeBlocs = blocsCollectionRef.onSnapshot((snapshot) => {
  console.log("🔍 userAtSnapshot:", userAtSnapshot);
    console.log("updateBlocDisplays: Received new bloc snapshot.");
    const existingBlocsDiv = document.getElementById("existing-blocs");
    const availableBlocsSelect = document.getElementById("available-blocs");
    if (!availableBlocsSelect) console.warn("❌ available-blocs select not found in DOM!");
    const chairBlocSelect = document.getElementById("chair-bloc-select");
    if (!chairBlocSelect) console.warn("❌ chair-bloc-select not found in DOM!");

    // Always clear existing options before populating
    if (existingBlocsDiv) existingBlocsDiv.innerHTML = "<h4>Existing Blocs:</h4>";
    if (availableBlocsSelect) availableBlocsSelect.innerHTML = '<option value="">Select a bloc</option>';
    if (chairBlocSelect) chairBlocSelect.innerHTML = '<option value="">Select a bloc</option>';

    if (snapshot.empty) {
        console.log("updateBlocDisplays: No blocs found for this committee.");
    }

    snapshot.forEach(docSnap => {
      const blocName = docSnap.id;
      const blocData = docSnap.data();
      console.log(`updateBlocDisplays: Found bloc: ${blocName}`, blocData);

      // Chair's existing blocs display
      if (existingBlocsDiv && userAtSnapshot.role === "chair")
        const blocDiv = document.createElement("div");
        blocDiv.innerHTML = `
          <strong>${blocName}</strong> - Members: ${blocData.members ? blocData.members.length : 0}
          <button onclick="viewBlocResolution('${blocName}')">View Resolution</button>
        `;
        existingBlocsDiv.appendChild(blocDiv);
      }

      // Delegate's available blocs dropdown
      if (availableBlocsSelect && userAtSnapshot.role === "delegate")
        const option = document.createElement("option");
        option.value = blocName;
        option.textContent = blocName;
        availableBlocsSelect.appendChild(option);
        console.log(`updateBlocDisplays: Appended option for delegate: ${blocName}`); // New log to confirm append
      }

      // Chair's select bloc to view dropdown
      if (chairBlocSelect && userAtSnapshot.role === "chair")
        const option = document.createElement("option");
        option.value = blocName;
        option.textContent = blocName;
        chairBlocSelect.appendChild(option);
      }
    });

    // Log the final state of the delegate dropdown after the loop
    if (availableBlocsSelect && userAtSnapshot.role === "delegate")
        console.log("updateBlocDisplays: Delegate dropdown innerHTML after update:", availableBlocsSelect.innerHTML);
    }


    // If a bloc was previously selected by chair, try to re-select it
    if (currentUser.role === "chair" && currentUser.selectedBloc && chairBlocSelect) {
      chairBlocSelect.value = currentUser.selectedBloc;
    }
  }, (error) => {
    console.error("Error listening to blocs collection:", error);
  });
}

/**
 * Handles chair selecting a bloc to view.
 * Sets up listeners for that specific bloc's data.
 */
function onChairBlocSelect() {
  console.log("onChairBlocSelect called.");
  const selectedBloc = document.getElementById("chair-bloc-select").value;
  if (selectedBloc) {
    viewBlocResolution(selectedBloc);
  } else {
    console.log("onChairBlocSelect: No bloc selected, clearing display.");
    // Clear resolution display when no bloc selected
    document.getElementById("resolution-text").value = "";
    document.getElementById("comments-list").innerHTML = "";
    document.getElementById("forum").value = "";
    document.getElementById("question-of").value = "";
    document.getElementById("submitted-by").value = "";
    document.getElementById("co-submitted-by").value = "";

    // Unsubscribe from previous bloc listeners if no bloc is selected
    if (blocListeners.unsubscribeResolution) blocListeners.unsubscribeResolution();
    if (blocListeners.unsubscribeComments) blocListeners.unsubscribeComments();
    blocListeners = {}; // Clear all bloc listeners
    currentUser.selectedBloc = null; // Clear selected bloc in state
  }
}

/**
 * Sets up real-time listeners for a specific bloc's resolution and comments.
 * @param {string} blocName
 */
function viewBlocResolution(blocName) {
  console.log(`viewBlocResolution called for bloc: ${blocName}`);
  if (!isAuthReady || currentUser.role !== "chair") {
    console.warn("viewBlocResolution: Firebase not ready or not a chair.");
    return;
  }

  currentUser.selectedBloc = blocName;
  document.getElementById("user-info").textContent =
    `${currentUser.role.toUpperCase()} – ${currentUser.committee.toUpperCase()} – Viewing: ${blocName}`;

  // Unsubscribe from previous bloc listeners if they exist
  if (blocListeners.unsubscribeResolution) {
    console.log("viewBlocResolution: Unsubscribing from previous resolution listener.");
    blocListeners.unsubscribeResolution();
  }
  if (blocListeners.unsubscribeComments) {
    console.log("viewBlocResolution: Unsubscribing from previous comments listener.");
    blocListeners.unsubscribeComments();
  }

  const blocRef = db.collection(`artifacts/${appId}/public/data/committees/${currentUser.committee}/blocs`).doc(blocName);
  const commentsCollectionRef = db.collection(`artifacts/${appId}/public/data/committees/${currentUser.committee}/blocs/${blocName}/comments`);
  console.log(`viewBlocResolution: Setting up listener for resolution at path: artifacts/${appId}/public/data/committees/${currentUser.committee}/blocs/${blocName}`);
  console.log(`viewBlocResolution: Setting up listener for comments at path: artifacts/${appId}/public/data/committees/${currentUser.committee}/blocs/${blocName}/comments`);


  // Listen for resolution changes
  blocListeners.unsubscribeResolution = blocRef.onSnapshot((docSnap) => {
    console.log("viewBlocResolution: Received new resolution snapshot.");
    if (docSnap.exists) {
      const resolutionData = docSnap.data().resolution;
      if (resolutionData) {
        document.getElementById("forum").value = resolutionData.forum || "";
        document.getElementById("question-of").value = resolutionData.questionOf || "";
        document.getElementById("submitted-by").value = resolutionData.submittedBy || "";
        document.getElementById("co-submitted-by").value = resolutionData.coSubmittedBy || "";
        updateResolutionDisplay(resolutionData);
      }
    } else {
      console.warn(`Bloc ${blocName} resolution not found.`);
      // Clear display if bloc disappears
      document.getElementById("resolution-text").value = "";
      document.getElementById("forum").value = "";
      document.getElementById("question-of").value = "";
      document.getElementById("submitted-by").value = "";
      document.getElementById("co-submitted-by").value = "";
    }
  }, (error) => {
    console.error("Error listening to resolution:", error);
  });

  // Listen for comments changes
  blocListeners.unsubscribeComments = commentsCollectionRef.orderBy('timestamp').onSnapshot((snapshot) => {
    console.log("viewBlocResolution: Received new comments snapshot.");
    updateCommentsDisplay(snapshot.docs.map(doc => doc.data()));
  }, (error) => {
    console.error("Error listening to comments:", error);
  });
}

/**
 * Handles role change in the login screen.
 * @returns {void}
 */
function handleRoleChange() {
  console.log("handleRoleChange called.");
  const role = document.getElementById("role").value;
  const delegateBlocContainer = document.getElementById("delegate-bloc-container");
  const chairPasswordDiv = document.getElementById("chair-password");

  if (role === "chair") {
    updateBlocDisplays(); // ✅ Call after password check
    if (delegateBlocContainer) delegateBlocContainer.style.display = "none";
    if (chairPasswordDiv) chairPasswordDiv.style.display = "block";
  } else {
    if (delegateBlocContainer) delegateBlocContainer.style.display = "block";
    if (chairPasswordDiv) chairPasswordDiv.style.display = "none";
    updateBlocDisplays(); // Update available blocs when delegate is selected
  }
  checkBlocSelection(); // Re-evaluate enter button state
}

/**
 * Inserts a clause into the current resolution and updates Firestore.
 * @param {string} clause
 * @param {'preambulatory' | 'operative'} type
 */
async function insertClause(clause, type) {
  console.log(`insertClause called: ${clause}, type: ${type}`);
  if (!isAuthReady) {
    console.warn("insertClause: Firebase not ready.");
    return;
  }
  const committeeId = currentUser.committee;
  const blocName = currentUser.bloc || currentUser.selectedBloc;

  if (!committeeId || !blocName) {
    alert("Please select a committee and bloc first!");
    return;
  }

  const committeeDocRef = db.collection(`artifacts/${appId}/public/data/committees`).doc(committeeId);
  try {
    const committeeSnap = await committeeDocRef.get();
    if (committeeSnap.exists && committeeSnap.data().isEditingLocked && currentUser.role === "delegate") {
      alert("Editing is currently locked by the chair!");
      console.warn("insertClause: Editing locked by chair.");
      return;
    }
  } catch (e) {
    console.error("Error checking lock status in insertClause:", e);
    alert("Could not check editing lock status.");
    return;
  }

  const blocRef = db.collection(`artifacts/${appId}/public/data/committees/${committeeId}/blocs`).doc(blocName);
  console.log(`insertClause: Updating bloc at path: ${blocRef.path}`);

  try {
    await db.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(blocRef);
      if (!docSnap.exists) {
        throw new Error("Bloc does not exist!");
      }

      const currentResolution = docSnap.data().resolution || { preambulatoryClauses: [], operativeClauses: [] };
      let updatedPreambulatory = currentResolution.preambulatoryClauses || [];
      let updatedOperative = currentResolution.operativeClauses || [];

      if (type === "preambulatory") {
        updatedPreambulatory.push(`*${clause}*`);
      } else {
        const operativeNumber = updatedOperative.length + 1;
        updatedOperative.push(`${operativeNumber}. _${clause}_`);
      }

      transaction.update(blocRef, {
        'resolution.preambulatoryClauses': updatedPreambulatory,
        'resolution.operativeClauses': updatedOperative
      });
      console.log("insertClause: Transaction for clause update committed.");
    });
    // UI update will be handled by the onSnapshot listener for the resolution
  } catch (e) {
    console.error("Error inserting clause in transaction:", e);
    alert("Failed to insert clause: " + e.message);
  }
}

/**
 * Updates the resolution display based on provided resolution data.
 * This function is called by the onSnapshot listener.
 * @param {object} resolutionData
 */
function updateResolutionDisplay(resolutionData) {
  // console.log("updateResolutionDisplay called with data:", resolutionData);
  let resolutionText = "";

  if (resolutionData) {
    // Add preambulatory clauses
    if (resolutionData.preambulatoryClauses && resolutionData.preambulatoryClauses.length > 0) {
      resolutionText += resolutionData.preambulatoryClauses.join(",\n\n") + ",\n\n";
    }

    // Add operative clauses
    if (resolutionData.operativeClauses && resolutionData.operativeClauses.length > 0) {
      const operativeText = resolutionData.operativeClauses.map((clause, index) => {
        const isLast = index === resolutionData.operativeClauses.length - 1;
        return clause + (isLast ? "." : ";");
      }).join("\n\n");
      resolutionText += operativeText;
    }
  }

  document.getElementById("resolution-text").value = resolutionText;
}

/**
 * Saves header fields of the resolution to Firestore.
 */
async function saveResolution() {
  // console.log("saveResolution called.");
  if (!isAuthReady) {
    console.warn("saveResolution: Firebase not ready.");
    return;
  }
  const committeeId = currentUser.committee;
  const blocName = currentUser.bloc || currentUser.selectedBloc;

  if (!committeeId || !blocName) return;

  const committeeDocRef = db.collection(`artifacts/${appId}/public/data/committees`).doc(committeeId);
  try {
    const committeeSnap = await committeeDocRef.get();
    if (committeeSnap.exists && committeeSnap.data().isEditingLocked && currentUser.role === "delegate") {
      // Don't alert here, as it's called on every input. updateEditingPermissions handles disabling.
      return;
    }
  } catch (e) {
    console.error("Error checking lock status for saveResolution:", e);
    return;
  }

  const blocRef = db.collection(`artifacts/${appId}/public/data/committees/${committeeId}/blocs`).doc(blocName);

  try {
    await blocRef.update({
      'resolution.forum': document.getElementById("forum").value,
      'resolution.questionOf': document.getElementById("question-of").value,
      'resolution.submittedBy': document.getElementById("submitted-by").value,
      'resolution.coSubmittedBy': document.getElementById("co-submitted-by").value
    });
    // console.log("saveResolution: Header fields updated.");
    // UI update handled by onSnapshot listener
  } catch (e) {
    console.error("Error saving resolution header:", e);
    // alert("Failed to save resolution header: " + e.message); // Too frequent for auto-save
  }
}

/**
 * Adds a comment to the current bloc's comments in Firestore.
 */
async function addComment() {
  console.log("addComment called.");
  if (!isAuthReady || currentUser.role !== "chair") {
    console.warn("addComment: Firebase not ready or not a chair.");
    return;
  }

  const commentText = document.getElementById("comment-input").value.trim();
  if (!commentText) return;

  const committeeId = currentUser.committee;
  const blocName = currentUser.selectedBloc;
  if (!blocName || !committeeId) {
    alert("Please select a bloc first!");
    return;
  }

  const commentsCollectionRef = db.collection(`artifacts/${appId}/public/data/committees/${committeeId}/blocs/${blocName}/comments`);

  try {
    await commentsCollectionRef.add({
      text: commentText,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(), // Use server timestamp
      chair: currentUser.id || "Chair" // Use Firebase Auth UID
    });
    document.getElementById("comment-input").value = "";
    console.log("addComment: Comment successfully added.");
    // UI update handled by onSnapshot listener
  } catch (e) {
    console.error("Error adding comment to Firestore:", e);
    alert("Failed to add comment: " + e.message);
  }
}

/**
 * Updates the comments display based on provided comments data.
 * This function is called by the onSnapshot listener.
 * @param {Array<object>} comments
 */
function updateCommentsDisplay(comments) {
  // console.log("updateCommentsDisplay called with comments:", comments);
  const commentsDiv = document.getElementById("comments-list");
  commentsDiv.innerHTML = "";

  // Sort by timestamp. Firestore serverTimestamp() will be a Timestamp object.
  comments.sort((a, b) => {
    const timeA = a.timestamp ? a.timestamp.toDate() : new Date(0); // Convert Timestamp to Date
    const timeB = b.timestamp ? b.timestamp.toDate() : new Date(0);
    return timeA - timeB;
  });

  comments.forEach(comment => {
    const commentDiv = document.createElement("div");
    commentDiv.className = "comment";
    // Convert Firestore Timestamp to local time string for display
    const localTime = comment.timestamp ? comment.timestamp.toDate().toLocaleTimeString() : 'N/A';
    commentDiv.innerHTML = `
      <div class="comment-time">${localTime} - ${comment.chair}</div>
      <div class="comment-text">${comment.text}</div>
    `;
    commentsDiv.appendChild(commentDiv);
  });
}

/**
 * Toggles the editing lock status for the current committee in Firestore.
 */
async function toggleLock() {
  console.log("toggleLock called.");
  if (!isAuthReady || currentUser.role !== "chair") {
    console.warn("toggleLock: Firebase not ready or not a chair.");
    return;
  }

  const committeeId = currentUser.committee;
  if (!committeeId) return;

  const committeeRef = db.collection(`artifacts/${appId}/public/data/committees`).doc(committeeId);
  try {
    const docSnap = await committeeRef.get();
    if (docSnap.exists) {
      const currentLockStatus = docSnap.data().isEditingLocked || false;
      await committeeRef.update({ isEditingLocked: !currentLockStatus });
      console.log(`toggleLock: Lock status updated to ${!currentLockStatus}.`);
      // UI update handled by onSnapshot listener for committee data
    }
  } catch (e) {
    console.error("Error toggling lock in Firestore:", e);
    alert("Failed to toggle lock: " + e.message);
  }
}

/**
 * Updates the UI elements' disabled state based on editing permissions.
 * This is called by the onSnapshot listener for committee data.
 * @param {boolean} isEditingLocked
 */
function updateEditingPermissions(isEditingLocked) {
  // console.log("updateEditingPermissions called with isEditingLocked:", isEditingLocked);
  const isDelegate = currentUser.role === "delegate";
  const canEdit = !isDelegate || !isEditingLocked;

  document.getElementById("forum").disabled = !canEdit;
  document.getElementById("question-of").disabled = !canEdit;
  document.getElementById("submitted-by").disabled = !canEdit;
  document.getElementById("co-submitted-by").disabled = !canEdit;

  const clauseButtons = document.querySelectorAll("#preambulatory-buttons button, #operative-buttons button");
  clauseButtons.forEach(btn => btn.disabled = !canEdit);

  const lockBtn = document.getElementById("lock-toggle");
  if (lockBtn) { // Ensure button exists before trying to update it
    lockBtn.textContent = isEditingLocked ? "🔓 Unlock" : "🔒 Lock";
    lockBtn.style.backgroundColor = isEditingLocked ? "#dc3545" : "#28a745";
  }
}

/**
 * Sets the timer duration for the current committee in Firestore.
 */
async function setTimer() {
  console.log("setTimer called.");
  if (!isAuthReady || currentUser.role !== "chair") {
    console.warn("setTimer: Firebase not ready or not a chair.");
    return;
  }

  const minutes = parseInt(prompt("Enter minutes:")) || 0;
  const seconds = parseInt(prompt("Enter seconds:")) || 0;

  const committeeId = currentUser.committee;
  if (!committeeId) return;

  const committeeRef = db.collection(`artifacts/${appId}/public/data/committees`).doc(committeeId);
  try {
    await committeeRef.update({
      timer: {
        totalSeconds: minutes * 60 + seconds,
        isRunning: false,
        startTime: null
      }
    });
    console.log(`setTimer: Timer set to ${minutes}m ${seconds}s.`);
    // UI update handled by onSnapshot listener
  } catch (e) {
    console.error("Error setting timer in Firestore:", e);
    alert("Failed to set timer: " + e.message);
  }
}

/**
 * Starts the timer for the current committee in Firestore.
 */
async function startTimer() {
  console.log("startTimer called.");
  if (!isAuthReady || currentUser.role !== "chair") {
    console.warn("startTimer: Firebase not ready or not a chair.");
    return;
  }

  const committeeId = currentUser.committee;
  if (!committeeId) return;

  const committeeRef = db.collection(`artifacts/${appId}/public/data/committees`).doc(committeeId);
  try {
    const docSnap = await committeeRef.get();
    if (docSnap.exists) {
      const timer = docSnap.data().timer;
      if (timer && timer.totalSeconds > 0 && !timer.isRunning) {
        await committeeRef.update({
          timer: {
            totalSeconds: timer.totalSeconds, // Keep current totalSeconds
            isRunning: true,
            startTime: Date.now() // Record start time
          }
        });
        console.log("startTimer: Timer started.");
        // UI update handled by onSnapshot listener
      } else {
        console.log("startTimer: Timer already running or totalSeconds is 0.");
      }
    }
  } catch (e) {
    console.error("Error starting timer in Firestore:", e);
    alert("Failed to start timer: " + e.message);
  }
}

/**
 * Pauses the timer for the current committee in Firestore.
 */
async function pauseTimer() {
  console.log("pauseTimer called.");
  if (!isAuthReady || currentUser.role !== "chair") {
    console.warn("pauseTimer: Firebase not ready or not a chair.");
    return;
  }

  const committeeId = currentUser.committee;
  if (!committeeId) return;

  const committeeRef = db.collection(`artifacts/${appId}/public/data/committees`).doc(committeeId);
  try {
    const docSnap = await committeeRef.get();
    if (docSnap.exists) {
      const timer = docSnap.data().timer;
      if (timer && timer.isRunning) {
        const elapsed = Math.floor((Date.now() - timer.startTime) / 1000);
        const remaining = Math.max(0, timer.totalSeconds - elapsed);
        await committeeRef.update({
          timer: {
            totalSeconds: remaining, // Save remaining time
            isRunning: false,
            startTime: null
          }
        });
        console.log("pauseTimer: Timer paused.");
        // UI update handled by onSnapshot listener
      }
    }
  } catch (e) {
    console.error("Error pausing timer in Firestore:", e);
    alert("Failed to pause timer: " + e.message);
  }
}

/**
 * Resets the timer for the current committee in Firestore.
 */
async function resetTimer() {
  console.log("resetTimer called.");
  if (!isAuthReady || currentUser.role !== "chair") {
    console.warn("resetTimer: Firebase not ready or not a chair.");
    return;
  }

  const committeeId = currentUser.committee;
  if (!committeeId) return;

  const committeeRef = db.collection(`artifacts/${appId}/public/data/committees`).doc(committeeId);
  try {
    await committeeRef.update({
      timer: {
        totalSeconds: 0,
        isRunning: false,
        startTime: null
      }
    });
    console.log("resetTimer: Timer reset.");
    // UI update handled by onSnapshot listener
  } catch (e) {
    console.error("Error resetting timer in Firestore:", e);
    alert("Failed to reset timer: " + e.message);
  }
}

/**
 * Updates the timer display based on provided total seconds.
 * This is called by the onSnapshot listener for committee data.
 * @param {number} totalSeconds
 */
function updateTimerDisplay(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  document.getElementById("timer").textContent = display;
}

/**
 * Exports the current resolution to a PDF (via print dialog).
 */
async function exportToPDF() {
  console.log("exportToPDF called.");
  const committeeId = currentUser.committee;
  const blocName = currentUser.bloc || currentUser.selectedBloc;
  if (!blocName || !committeeId) {
    alert("No resolution to export!");
    return;
  }

  const blocRef = db.collection(`artifacts/${appId}/public/data/committees/${committeeId}/blocs`).doc(blocName);
  try {
    const docSnap = await blocRef.get();
    if (!docSnap.exists || !docSnap.data().resolution) {
      alert("No resolution data found for this bloc!");
      return;
    }
    const resolution = docSnap.data().resolution;
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
  } catch (e) {
    console.error("Error exporting PDF:", e);
    alert("Failed to export PDF: " + e.message);
  }
}

/**
 * Handles user login and sets up the editor interface.
 */
async function enterEditor() {
  console.log("enterEditor called.");
  if (!isAuthReady) {
    alert("Firebase authentication not ready. Please wait a moment and try again.");
    console.warn("enterEditor: Firebase not ready.");
    return;
  }

  const role = document.getElementById("role").value;
  const committee = document.getElementById("committee").value;
  const code = document.getElementById("committee-code").value;
  const validCodes = {
    "unep": "un#p26", "security": "$ecur!ty", "ecosoc": "ec0s0c",
    "unesco": "un3sco2026", "nato": "n@t0", "who": "wh022",
    "hrc": "#rc24", "unwomen": "wom(26)"
  };

  if (validCodes[committee] !== code) {
    alert("Wrong committee code!");
    console.warn("enterEditor: Wrong committee code.");
    return;
  }

  if (role === "chair") {
    updateBlocDisplays(); // ✅ Call after password check
    const chairPassword = document.getElementById("chair-password-input").value;
    if (chairPassword !== "resolutions@26") {
      alert("Invalid chair password!");
      console.warn("enterEditor: Invalid chair password.");
      return;
    }
  }

  let userInfoText = `${role.toUpperCase()} – ${committee.toUpperCase()} – User ID: ${userId}`; // Display Firebase UID

  currentUser = { role, committee, id: userId }; // Store Firebase UID

  if (role === "delegate") {
    const selectedBloc = document.getElementById("available-blocs").value;
    const blocPassword = document.getElementById("bloc-password").value;

    if (!selectedBloc) {
      alert("Delegates must select a bloc!");
      console.warn("enterEditor: Delegate must select a bloc.");
      return;
    }

    if (!blocPassword) {
      alert("Please enter the bloc password!");
      console.warn("enterEditor: Please enter bloc password.");
      return;
    }

    const blocRef = db.collection(`artifacts/${appId}/public/data/committees/${committee}/blocs`).doc(selectedBloc);
    try {
      const docSnap = await blocRef.get();
      if (!docSnap.exists || docSnap.data().password !== blocPassword) {
        alert("Invalid bloc password!");
        console.warn("enterEditor: Invalid bloc password.");
        return;
      }
      // Add delegate to bloc's members (optional, for tracking)
      const currentMembers = docSnap.data().members || [];
      if (!currentMembers.includes(userId)) {
        await blocRef.update({ members: firebase.firestore.FieldValue.arrayUnion(userId) });
        console.log(`enterEditor: Added delegate ${userId} to bloc ${selectedBloc} members.`);
      }

      currentUser.bloc = selectedBloc;
      userInfoText += ` – BLOC: ${selectedBloc}`;
      updateBlocDisplays(); // ✅ Call only after bloc is selected
    } catch (e) {
      console.error("Error joining bloc:", e);
      alert("Failed to join bloc: " + e.message);
      return;
    }
  } else { // Chair
    // Clear resolution display for chairs when entering until a bloc is selected
    document.getElementById("resolution-text").value = "";
    document.getElementById("comments-list").innerHTML = "";
    document.getElementById("forum").value = "";
    document.getElementById("question-of").value = "";
    document.getElementById("submitted-by").value = "";
    document.getElementById("co-submitted-by").value = "";
    console.log("enterEditor: Chair logged in, clearing display.");
  }

  document.getElementById("login-container").style.display = "none";
  document.getElementById("editor-container").style.display = "block";
  document.getElementById("user-info").textContent = userInfoText;

  setupRoleInterface();
  updateBlocDisplays(); // This will set up the listener for blocs

  // Ensure committee document exists and set up listener for committee-level data (timer, lock)
  await ensureCommitteeExists(committee);
  const committeeRef = db.collection(`artifacts/${appId}/public/data/committees`).doc(committee);

  // Unsubscribe from previous committee listener if it exists
  if (committeeListeners.unsubscribeCommittee) {
    committeeListeners.unsubscribeCommittee();
    console.log("enterEditor: Unsubscribed from previous committee listener.");
  }

  committeeListeners.unsubscribeCommittee = committeeRef.onSnapshot((docSnap) => {
    console.log("enterEditor: Received new committee snapshot.");
    if (docSnap.exists) {
      const committeeData = docSnap.data();
      const timer = committeeData.timer || { totalSeconds: 0, isRunning: false, startTime: null };
      const isLocked = committeeData.isEditingLocked || false;

      // Update UI based on real-time data
      updateEditingPermissions(isLocked);
      // Timer display is handled by the setInterval, but ensure initial state is correct
      if (timer.isRunning && timer.startTime) {
        const elapsed = Math.floor((Date.now() - timer.startTime) / 1000);
        const remaining = Math.max(0, timer.totalSeconds - elapsed);
        updateTimerDisplay(remaining);
      } else {
        updateTimerDisplay(timer.totalSeconds);
      }
    } else {
      console.warn(`Committee ${committee} data not found in Firestore. It might have been deleted.`);
      // Potentially reset UI if committee data disappears
      updateEditingPermissions(false); // Unlock if committee data is gone
      updateTimerDisplay(0);
    }
  }, (error) => {
    console.error("Error listening to committee data:", error);
  });

  // If delegate, set up listeners for their specific bloc
  if (currentUser.role === "delegate" && currentUser.bloc) {
    viewBlocResolution(currentUser.bloc); // This will set up bloc-specific listeners
  }
}

/**
 * Adjusts UI visibility and states based on the current user's role.
 */
function setupRoleInterface() {
  console.log("setupRoleInterface called.");
  const isChair = currentUser.role === "chair";

  document.getElementById("set-timer").style.display = isChair ? "inline" : "none";
  document.getElementById("start-timer").style.display = isChair ? "inline" : "none";
  document.getElementById("pause-timer").style.display = isChair ? "inline" : "none";
  document.getElementById("reset-timer").style.display = isChair ? "inline" : "none";
  document.getElementById("lock-toggle").style.display = isChair ? "inline" : "none";

  // Chair specific comment controls
  const commentInput = document.getElementById("comment-input");
  const addCommentBtn = document.getElementById("add-comment");
  if (commentInput) commentInput.style.display = isChair ? "inline" : "none";
  if (addCommentBtn) addCommentBtn.style.display = isChair ? "inline" : "none";


  const chairControls = document.getElementById("chair-controls");
  const blocSelector = document.getElementById("bloc-selector");

  if (isChair) {
    chairControls.style.display = "block";
    blocSelector.style.display = "block";
    // The lock button text and color are updated by updateEditingPermissions via onSnapshot
  } else {
    chairControls.style.display = "none";
    blocSelector.style.display = "none";
  }
}

/**
 * Checks if a delegate has selected a bloc to enable/disable the enter button.
 */
function checkBlocSelection() {
  // console.log("checkBlocSelection called.");
  const selectedBloc = document.getElementById("available-blocs").value;
  const enterButton = document.getElementById("enter-button");
  const role = document.getElementById("role").value;

  if (role === "delegate") {
    enterButton.disabled = !selectedBloc; // Disable if no bloc selected
  } else { // Chair
    enterButton.disabled = false; // Chair's "Enter" button is always enabled
  }
}
