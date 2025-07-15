// app.js
// Resolution Builder with Live Updates and Persistence using Firebase Firestore

// --- Firebase Global Variables ---
let db;
let auth;
let userId;
let appId;
let isAuthReady = false;

// --- Clause Definitions ---
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
  "Expressing its hope", "Expressing its satisfaction",
  "Further invites", "Further proclaims",
  "Further recommends", "Further requests", "Has resolved", "Hopes", "Invites", "Notes",
  "Proclaims", "Proposes", "Reaffirms", "Recommends", "Regrets", "Requests", "Seeks",
  "Solemnly affirms", "Strongly condemns", "Supports", "Suggests", "Takes note of",
  "Transmits", "Trusts", "Urges"
];

// --- Application State ---
let currentUser = {};
let committeeListeners = {};
let blocListeners = {};

// --- Initialization and Authentication ---
window.addEventListener('load', async () => {
  db = window.db;
  auth = window.auth;
  appId = window.appId;
  console.log("App loaded. Initializing Firebase...");

  try {
    await auth.signInAnonymously();
    console.log("Anonymous sign-in attempt successful.");
  } catch (error) {
    console.error("Firebase Auth Error during signInAnonymously:", error);
    alert("Authentication Error: " + error.message + ". Please refresh.");
  }

  auth.onAuthStateChanged((user) => {
    if (user) {
      userId = user.uid;
      isAuthReady = true;
      console.log("Firebase Auth Ready. User ID:", userId);
      initializeUI();
    } else {
      userId = null;
      isAuthReady = false;
      console.log("No Firebase user logged in (onAuthStateChanged).");
    }
  });
});

// --- Core UI Initialization ---
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

  // Event listeners
  document.getElementById("role").addEventListener("change", handleRoleChange);
  document.getElementById("committee").addEventListener("change", updateBlocDisplays);
  document.getElementById("available-blocs").addEventListener("change", checkBlocSelection);
  document.getElementById("enter-button").addEventListener("click", enterEditor);
  document.getElementById("create-bloc-button").addEventListener("click", createBloc);
  document.getElementById("lock-toggle").addEventListener("click", toggleLock);
  document.getElementById("set-timer").addEventListener("click", setTimer);
  document.getElementById("start-timer").addEventListener("click", startTimer);
  document.getElementById("pause-timer").addEventListener("click", pauseTimer);
  document.getElementById("reset-timer").addEventListener("click", resetTimer);
  document.getElementById("export-pdf").addEventListener("click", exportToPDF);
  document.getElementById("add-comment").addEventListener("click", addComment);
  document.getElementById("chair-bloc-select").addEventListener("change", onChairBlocSelect);

  handleRoleChange();
  checkBlocSelection();

  // Auto-save on input changes
  const inputs = ["forum", "question-of", "submitted-by", "co-submitted-by"];
  inputs.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener("input", saveResolution);
    }
  });

  // Timer display interval
  setInterval(() => {
    if (currentUser.committee && isAuthReady) {
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
    }
  } catch (e) {
    console.error("Error ensuring committee exists:", e);
  }
}

async function createBloc() {
  console.log("createBloc called.");
  if (!isAuthReady) {
    alert("Firebase authentication not ready. Please wait a moment and try again.");
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
  
  try {
    const docSnap = await blocRef.get();
    if (docSnap.exists) {
      alert("Bloc name already exists!");
      return;
    }

    await blocRef.set({
      password: password,
      members: [],
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
    document.getElementById("new-bloc-name").value = "";
    document.getElementById("new-bloc-password").value = "";
  } catch (e) {
    console.error("Error creating bloc in Firestore:", e);
    alert("Failed to create bloc: " + e.message);
  }
}

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
  
  const roleForDisplay = currentUser.role || document.getElementById("role").value;
  console.log(`updateBlocDisplays: roleForDisplay: ${roleForDisplay}`);

  const availableBlocsSelect = document.getElementById("available-blocs");
  const existingBlocsDiv = document.getElementById("existing-blocs");
  const chairBlocSelect = document.getElementById("chair-bloc-select");

  // Unsubscribe from previous bloc listeners
  if (blocListeners.unsubscribeBlocs) {
    blocListeners.unsubscribeBlocs();
    blocListeners = {};
  }

  const blocsCollectionRef = db.collection(`artifacts/${appId}/public/data/committees/${committeeId}/blocs`);
  
  blocListeners.unsubscribeBlocs = blocsCollectionRef.onSnapshot((snapshot) => {
    console.log("updateBlocDisplays: Received new bloc snapshot.");
    
    // Clear existing options
    if (availableBlocsSelect) availableBlocsSelect.innerHTML = '<option value="">Select a bloc</option>';
    if (chairBlocSelect) chairBlocSelect.innerHTML = '<option value="">Select a bloc</option>';
    if (existingBlocsDiv) existingBlocsDiv.innerHTML = "<h4>Existing Blocs:</h4>";

    if (snapshot.empty) {
      console.log("updateBlocDisplays: No blocs found for this committee.");
      return;
    }

    snapshot.forEach(docSnap => {
      const blocName = docSnap.id;
      const blocData = docSnap.data();

      // Populate delegate's bloc dropdown
      if (availableBlocsSelect && roleForDisplay === "delegate") {
        const option = document.createElement("option");
        option.value = blocName;
        option.textContent = blocName;
        availableBlocsSelect.appendChild(option);
      }

      // Populate chair's bloc selection
      if (chairBlocSelect && roleForDisplay === "chair") {
        const option = document.createElement("option");
        option.value = blocName;
        option.textContent = blocName;
        chairBlocSelect.appendChild(option);
      }

      // Update existing blocs display for chairs
      if (existingBlocsDiv && roleForDisplay === "chair") {
        const blocDiv = document.createElement("div");
        blocDiv.innerHTML = `
          <strong>${blocName}</strong> - Members: ${blocData.members ? blocData.members.length : 0}
          <button onclick="viewBlocResolution('${blocName}')">View Resolution</button>
        `;
        existingBlocsDiv.appendChild(blocDiv);
      }
    });

    checkBlocSelection();
  }, (error) => {
    console.error("Error listening to blocs collection:", error);
  });
}

function onChairBlocSelect() {
  console.log("onChairBlocSelect called.");
  const selectedBloc = document.getElementById("chair-bloc-select").value;
  if (selectedBloc) {
    viewBlocResolution(selectedBloc);
  } else {
    document.getElementById("resolution-text").value = "";
    document.getElementById("comments-list").innerHTML = "";
    document.getElementById("forum").value = "";
    document.getElementById("question-of").value = "";
    document.getElementById("submitted-by").value = "";
    document.getElementById("co-submitted-by").value = "";

    if (blocListeners.unsubscribeResolution) blocListeners.unsubscribeResolution();
    if (blocListeners.unsubscribeComments) blocListeners.unsubscribeComments();
    blocListeners = {};
    currentUser.selectedBloc = null;
  }
}

function viewBlocResolution(blocName) {
  console.log(`viewBlocResolution called for bloc: ${blocName}`);
  if (!isAuthReady) {
    console.warn("viewBlocResolution: Firebase not ready.");
    return;
  }

  currentUser.selectedBloc = blocName;
  document.getElementById("user-info").textContent =
    `${currentUser.role.toUpperCase()} – ${currentUser.committee.toUpperCase()} – Viewing: ${blocName}`;

  // Unsubscribe from previous listeners
  if (blocListeners.unsubscribeResolution) blocListeners.unsubscribeResolution();
  if (blocListeners.unsubscribeComments) blocListeners.unsubscribeComments();

  const blocRef = db.collection(`artifacts/${appId}/public/data/committees/${currentUser.committee}/blocs`).doc(blocName);
  const commentsCollectionRef = db.collection(`artifacts/${appId}/public/data/committees/${currentUser.committee}/blocs/${blocName}/comments`);

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
      document.getElementById("resolution-text").value = "";
      document.getElementById("forum").value = "";
      document.getElementById("question-of").value = "";
      document.getElementById("submitted-by").value = "";
      document.getElementById("co-submitted-by").value = "";
    }
  }, (error) => {
    console.error("Error listening to resolution:", error);
  });

  blocListeners.unsubscribeComments = commentsCollectionRef.orderBy('timestamp').onSnapshot((snapshot) => {
    console.log("viewBlocResolution: Received new comments snapshot.");
    updateCommentsDisplay(snapshot.docs.map(doc => doc.data()));
  }, (error) => {
    console.error("Error listening to comments:", error);
  });
}

function handleRoleChange() {
  console.log("handleRoleChange called.");
  const role = document.getElementById("role").value;
  const delegateBlocContainer = document.getElementById("delegate-bloc-container");
  const chairPasswordDiv = document.getElementById("chair-password");

  if (role === "chair") {
    if (delegateBlocContainer) delegateBlocContainer.style.display = "none";
    if (chairPasswordDiv) chairPasswordDiv.style.display = "block";
  } else {
    if (delegateBlocContainer) delegateBlocContainer.style.display = "block";
    if (chairPasswordDiv) chairPasswordDiv.style.display = "none";
    updateBlocDisplays();
  }
  checkBlocSelection();
}

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
      return;
    }
  } catch (e) {
    console.error("Error checking lock status in insertClause:", e);
    alert("Could not check editing lock status.");
    return;
  }

  const blocRef = db.collection(`artifacts/${appId}/public/data/committees/${committeeId}/blocs`).doc(blocName);

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
    });
  } catch (e) {
    console.error("Error inserting clause in transaction:", e);
    alert("Failed to insert clause: " + e.message);
  }
}

function updateResolutionDisplay(resolutionData) {
  let resolutionText = "";

  if (resolutionData) {
    if (resolutionData.preambulatoryClauses && resolutionData.preambulatoryClauses.length > 0) {
      resolutionText += resolutionData.preambulatoryClauses.join(",\n\n") + ",\n\n";
    }

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

async function saveResolution() {
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
  } catch (e) {
    console.error("Error saving resolution header:", e);
  }
}

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
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      chair: currentUser.id || "Chair"
    });
    document.getElementById("comment-input").value = "";
  } catch (e) {
    console.error("Error adding comment to Firestore:", e);
    alert("Failed to add comment: " + e.message);
  }
}

function updateCommentsDisplay(comments) {
  const commentsDiv = document.getElementById("comments-list");
  commentsDiv.innerHTML = "";

  comments.sort((a, b) => {
    const timeA = a.timestamp ? a.timestamp.toDate() : new Date(0);
    const timeB = b.timestamp ? b.timestamp.toDate() : new Date(0);
    return timeA - timeB;
  });

  comments.forEach(comment => {
    const commentDiv = document.createElement("div");
    commentDiv.className = "comment";
    const localTime = comment.timestamp ? comment.timestamp.toDate().toLocaleTimeString() : 'N/A';
    commentDiv.innerHTML = `
      <div class="comment-time">${localTime} - ${comment.chair}</div>
      <div class="comment-text">${comment.text}</div>
    `;
    commentsDiv.appendChild(commentDiv);
  });
}

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
    }
  } catch (e) {
    console.error("Error toggling lock in Firestore:", e);
    alert("Failed to toggle lock: " + e.message);
  }
}

function updateEditingPermissions(isEditingLocked) {
  const isDelegate = currentUser.role === "delegate";
  const canEdit = !isDelegate || !isEditingLocked;

  document.getElementById("forum").disabled = !canEdit;
  document.getElementById("question-of").disabled = !canEdit;
  document.getElementById("submitted-by").disabled = !canEdit;
  document.getElementById("co-submitted-by").disabled = !canEdit;

  const clauseButtons = document.querySelectorAll("#preambulatory-buttons button, #operative-buttons button");
  clauseButtons.forEach(btn => btn.disabled = !canEdit);

  const lockBtn = document.getElementById("lock-toggle");
  if (lockBtn) {
    lockBtn.textContent = isEditingLocked ? "🔓 Unlock" : "🔒 Lock";
    lockBtn.style.backgroundColor = isEditingLocked ? "#dc3545" : "#28a745";
  }
}

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
  } catch (e) {
    console.error("Error setting timer in Firestore:", e);
    alert("Failed to set timer: " + e.message);
  }
}

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
            totalSeconds: timer.totalSeconds,
            isRunning: true,
            startTime: Date.now()
          }
        });
      }
    }
  } catch (e) {
    console.error("Error starting timer in Firestore:", e);
    alert("Failed to start timer: " + e.message);
  }
}

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
            totalSeconds: remaining,
            isRunning: false,
            startTime: null
          }
        });
      }
    }
  } catch (e) {
    console.error("Error pausing timer in Firestore:", e);
    alert("Failed to pause timer: " + e.message);
  }
}

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
  } catch (e) {
    console.error("Error resetting timer in Firestore:", e);
    alert("Failed to reset timer: " + e.message);
  }
}

function updateTimerDisplay(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  document.getElementById("timer").textContent = display;
}

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

async function enterEditor() {
  console.log("enterEditor called.");
  if (!isAuthReady) {
    alert("Firebase authentication not ready. Please wait a moment and try again.");
    return;
  }

  const role = document.getElementById("role").value;
  const committee = document.getElementById("committee").value;
  const code = document.getElementById("committee-code").value;
  const validCodes = {
    "unep": "un#p26", "security": "$ecur!ty", "ecosoc": "ec0s0c",
    "unesco": "un3sco2026", "nato": "n@t0", "who": "wh022",
    "hrc": "#rc24", "unwomen": "wom(26)", "historical": "historic@l"
  };

  if (validCodes[committee] !== code) {
    alert("Wrong committee code!");
    return;
  }

  if (role === "chair") {
    const chairPassword = document.getElementById("chair-password-input").value;
    if (chairPassword !== "resolutions@26") {
      alert("Invalid chair password!");
      return;
    }
  }

  let userInfoText = `${role.toUpperCase()} – ${committee.toUpperCase()} – User ID: ${userId}`;

  currentUser = { role, committee, id: userId };
  console.log("enterEditor: currentUser set to:", currentUser);

  if (role === "delegate") {
    const selectedBloc = document.getElementById("available-blocs").value;
    const blocPassword = document.getElementById("bloc-password").value;

    if (!selectedBloc) {
      alert("Delegates must select a bloc!");
      return;
    }

    if (!blocPassword) {
      alert("Please enter the bloc password!");
      return;
    }

    const blocRef = db.collection(`artifacts/${appId}/public/data/committees/${committee}/blocs`).doc(selectedBloc);
    try {
      const docSnap = await blocRef.get();
      if (!docSnap.exists || docSnap.data().password !== blocPassword) {
        alert("Invalid bloc password!");
        return;
      }
      
      const currentMembers = docSnap.data().members || [];
      if (!currentMembers.includes(userId)) {
        await blocRef.update({ members: firebase.firestore.FieldValue.arrayUnion(userId) });
      }

      currentUser.bloc = selectedBloc;
      userInfoText += ` – BLOC: ${selectedBloc}`;
    } catch (e) {
      console.error("Error joining bloc:", e);
      alert("Failed to join bloc: " + e.message);
      return;
    }
  }

  document.getElementById("login-container").style.display = "none";
  document.getElementById("editor-container").style.display = "block";
  document.getElementById("user-info").textContent = userInfoText;

  setupRoleInterface();
  updateBlocDisplays();

  await ensureCommitteeExists(committee);
  const committeeRef = db.collection(`artifacts/${appId}/public/data/committees`).doc(committee);

  if (committeeListeners.unsubscribeCommittee) {
    committeeListeners.unsubscribeCommittee();
  }

  committeeListeners.unsubscribeCommittee = committeeRef.onSnapshot((docSnap) => {
    if (docSnap.exists) {
      const committeeData = docSnap.data();
      const timer = committeeData.timer || { totalSeconds: 0, isRunning: false, startTime: null };
      const isLocked = committeeData.isEditingLocked || false;

      updateEditingPermissions(isLocked);
      if (timer.isRunning && timer.startTime) {
        const elapsed = Math.floor((Date.now() - timer.startTime) / 1000);
        const remaining = Math.max(0, timer.totalSeconds - elapsed);
        updateTimerDisplay(remaining);
      } else {
        updateTimerDisplay(timer.totalSeconds);
      }
    }
  }, (error) => {
    console.error("Error listening to committee data:", error);
  });

  if (currentUser.role === "delegate" && currentUser.bloc) {
    viewBlocResolution(currentUser.bloc);
  }
}

function setupRoleInterface() {
  console.log("setupRoleInterface called.");
  const isChair = currentUser.role === "chair";

  document.getElementById("set-timer").style.display = isChair ? "inline" : "none";
  document.getElementById("start-timer").style.display = isChair ? "inline" : "none";
  document.getElementById("pause-timer").style.display = isChair ? "inline" : "none";
  document.getElementById("reset-timer").style.display = isChair ? "inline" : "none";
  document.getElementById("lock-toggle").style.display = isChair ? "inline" : "none";

  const commentInput = document.getElementById("comment-input");
  const addCommentBtn = document.getElementById("add-comment");
  if (commentInput) commentInput.style.display = isChair ? "inline" : "none";
  if (addCommentBtn) addCommentBtn.style.display = isChair ? "inline" : "none";

  const chairControls = document.getElementById("chair-controls");
  const blocSelector = document.getElementById("bloc-selector");

  if (isChair) {
    chairControls.style.display = "block";
    blocSelector.style.display = "block";
  } else {
    chairControls.style.display = "none";
    blocSelector.style.display = "none";
  }
}

function checkBlocSelection() {
  const selectedBloc = document.getElementById("available-blocs").value;
  const enterButton = document.getElementById("enter-button");
  const role = document.getElementById("role").value;

  if (role === "delegate") {
    enterButton.disabled = !selectedBloc;
  } else {
    enterButton.disabled = false;
  }
}