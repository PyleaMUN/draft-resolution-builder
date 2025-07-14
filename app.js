// app.js
// Resolution Builder with Live Updates and Persistence using Firebase Firestore

// --- Firebase Global Variables (Initialized in index.html) ---
let db; // Firestore instance
let auth; // Auth instance
let userId; // Current user's ID
let appId; // Application ID for Firestore paths (now set in index.html)
let isAuthReady = false; // Flag to ensure Firebase Auth is ready

// --- Clause Definitions ---
const preambulatoryClauses = [...]; // (Omitted for brevity)
const operativeClauses = [...]; // (Omitted for brevity)

// --- Application State ---
let currentUser = {}; // { role, committee, bloc?, selectedBloc?, id? }
let committeeListeners = {}; // Firestore unsubscribe functions
let blocListeners = {}; // Firestore unsubscribe functions

window.addEventListener('load', async () => {
  db = window.db;
  auth = window.auth;
  appId = window.appId;
  console.log("App loaded. Initializing Firebase...");

  try {
    await auth.signInAnonymously();
    console.log("Anonymous sign-in successful.");
  } catch (error) {
    console.error("Firebase Auth Error:", error);
    alert("Authentication Error: " + error.message);
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
      console.log("User not authenticated.");
    }
  });
});

function initializeUI() {
  console.log("initializeUI called.");

  // Populate clause buttons (unchanged logic)

  document.getElementById("role").addEventListener("change", handleRoleChange);
  document.getElementById("committee").addEventListener("change", updateBlocDisplays);
  document.getElementById("available-blocs").addEventListener("change", checkBlocSelection);
  document.getElementById("enter-button").addEventListener("click", enterEditor);
  document.getElementById("create-bloc-button").addEventListener("click", createBloc);
  document.getElementById("chair-bloc-select").addEventListener("change", onChairBlocSelect);

  handleRoleChange();
  checkBlocSelection();
}

function updateBlocDisplays() {
  console.log("updateBlocDisplays called.");
  if (!isAuthReady) return;

  const committeeId = currentUser.committee || document.getElementById("committee").value;
  if (!committeeId) return;

  const blocsCollectionRef = db.collection(`artifacts/${appId}/public/data/committees/${committeeId}/blocs`);

  if (blocListeners.unsubscribeBlocs) blocListeners.unsubscribeBlocs();

  blocListeners.unsubscribeBlocs = blocsCollectionRef.onSnapshot((snapshot) => {
    console.log("🔁 Delegate listener received snapshot", snapshot.size);
    console.log("🔍 currentUser in snapshot:", currentUser);

    const existingBlocsDiv = document.getElementById("existing-blocs");
    const availableBlocsSelect = document.getElementById("available-blocs");
    const chairBlocSelect = document.getElementById("chair-bloc-select");

    if (existingBlocsDiv) existingBlocsDiv.innerHTML = "<h4>Existing Blocs:</h4>";
    if (availableBlocsSelect) availableBlocsSelect.innerHTML = '<option value="">Select a bloc</option>';
    if (chairBlocSelect) chairBlocSelect.innerHTML = '<option value="">Select a bloc</option>';

    snapshot.forEach(docSnap => {
      const blocName = docSnap.id;
      const blocData = docSnap.data();

      if (existingBlocsDiv && currentUser.role === "chair") {
        const blocDiv = document.createElement("div");
        blocDiv.innerHTML = `
          <strong>${blocName}</strong> - Members: ${blocData.members ? blocData.members.length : 0}
          <button onclick="viewBlocResolution('${blocName}')">View Resolution</button>
        `;
        existingBlocsDiv.appendChild(blocDiv);
      }

      if (availableBlocsSelect && currentUser.role === "delegate") {
        const option = document.createElement("option");
        option.value = blocName;
        option.textContent = blocName;
        availableBlocsSelect.appendChild(option);
      }

      if (chairBlocSelect && currentUser.role === "chair") {
        const option = document.createElement("option");
        option.value = blocName;
        option.textContent = blocName;
        chairBlocSelect.appendChild(option);
      }
    });
  });
}

async function enterEditor() {
  console.log("enterEditor called.");
  if (!isAuthReady) return;

  const role = document.getElementById("role").value;
  const committee = document.getElementById("committee").value;
  const code = document.getElementById("committee-code").value;
  const validCodes = { ... };

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

  currentUser = { role, committee, id: userId }; // ✅ Set early
  updateBlocDisplays(); // ✅ Call early

  let userInfoText = `${role.toUpperCase()} – ${committee.toUpperCase()} – User ID: ${userId}`;

  if (role === "delegate") {
    const selectedBloc = document.getElementById("available-blocs").value;
    const blocPassword = document.getElementById("bloc-password").value;

    if (!selectedBloc || !blocPassword) {
      alert("Please select bloc and enter password.");
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
      alert("Error joining bloc: " + e.message);
      return;
    }
  }

  document.getElementById("login-container").style.display = "none";
  document.getElementById("editor-container").style.display = "block";
  document.getElementById("user-info").textContent = userInfoText;

  setupRoleInterface();
  await ensureCommitteeExists(committee);

  const committeeRef = db.collection(`artifacts/${appId}/public/data/committees`).doc(committee);
  if (committeeListeners.unsubscribeCommittee) committeeListeners.unsubscribeCommittee();

  committeeListeners.unsubscribeCommittee = committeeRef.onSnapshot((docSnap) => {
    if (docSnap.exists) {
      const data = docSnap.data();
      updateEditingPermissions(data.isEditingLocked || false);
      const t = data.timer || {};
      const remaining = t.isRunning && t.startTime ? Math.max(0, t.totalSeconds - Math.floor((Date.now() - t.startTime)/1000)) : t.totalSeconds;
      updateTimerDisplay(remaining);
    } else {
      updateEditingPermissions(false);
      updateTimerDisplay(0);
    }
  });

  if (currentUser.role === "delegate" && currentUser.bloc) {
    viewBlocResolution(currentUser.bloc);
  }
}

// ...rest of code remains unchanged
