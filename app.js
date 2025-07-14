// app.js
// Resolution Builder with Live Updates and Persistence
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

// Global state with persistence
let committees = JSON.parse(localStorage.getItem('mun_committees') || '{}');
let currentUser = {};

// Initialize committees structure if empty
function initializeCommittees() {
  const committeeNames = ["unep", "security", "ecosoc", "unesco", "nato", "who", "hrc", "unwomen"];
  committeeNames.forEach(comm => {
    if (!committees[comm]) {
      committees[comm] = {
        blocs: {},
        timer: { totalSeconds: 0, isRunning: false, startTime: null },
        isEditingLocked: false
      };
    }
  });
  saveToStorage();
}

function saveToStorage() {
  localStorage.setItem('mun_committees', JSON.stringify(committees));
}

function createBloc() {
  const name = document.getElementById("new-bloc-name").value.trim();
  const password = document.getElementById("new-bloc-password").value;

  if (!name || !password) {
    alert("Please enter both bloc name and password!");
    return;
  }

  const committee = currentUser.committee;
  if (committees[committee].blocs[name]) {
    alert("Bloc name already exists!");
    return;
  }

  committees[committee].blocs[name] = {
    password: password,
    members: [],
    resolution: {
      forum: "",
      questionOf: "",
      submittedBy: "",
      coSubmittedBy: "",
      preambulatoryClauses: [],
      operativeClauses: []
    },
    comments: []
  };

  saveToStorage();
  updateBlocDisplays();
  document.getElementById("new-bloc-name").value = "";
  document.getElementById("new-bloc-password").value = "";
  alert(`Bloc "${name}" created successfully!`);
}

function updateBlocDisplays() {
  const committee = document.getElementById("committee").value || currentUser.committee;
  if (!committee || !committees[committee]) return;

  // Update existing blocs display for chairs
  const existingBlocsDiv = document.getElementById("existing-blocs");
  if (existingBlocsDiv) {
    existingBlocsDiv.innerHTML = "<h4>Existing Blocs:</h4>";
    Object.keys(committees[committee].blocs).forEach(blocName => {
      const bloc = committees[committee].blocs[blocName];
      const blocDiv = document.createElement("div");
      blocDiv.innerHTML = `
        <strong>${blocName}</strong> - Members: ${bloc.members.length}
        <button onclick="viewBlocResolution('${blocName}')">View Resolution</button>
      `;
      existingBlocsDiv.appendChild(blocDiv);
    });
  }

  // Update available blocs dropdown for delegates
  const availableBlocsSelect = document.getElementById("available-blocs");
  if (availableBlocsSelect) {
    availableBlocsSelect.innerHTML = '<option value="">Select a bloc</option>';
    Object.keys(committees[committee].blocs).forEach(blocName => {
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
        ${Object.keys(committees[committee].blocs).map(blocName =>
          `<option value="${blocName}">${blocName}</option>`
        ).join('')}
      </select>
    `;
  }
}

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
  }
}

function viewBlocResolution(blocName) {
  if (currentUser.role !== "chair") return;

  currentUser.selectedBloc = blocName;
  document.getElementById("user-info").textContent =
    `${currentUser.role.toUpperCase()} – ${currentUser.committee.toUpperCase()} – Viewing: ${blocName}`;

  loadResolution();
  updateCommentsDisplay();
}

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
  checkBlocSelection(); // Re-evaluate enter button state
}

function insertClause(clause, type) {
  if (currentUser.role === "delegate" && committees[currentUser.committee].isEditingLocked) {
    alert("Editing is currently locked by the chair!");
    return;
  }

  const committee = currentUser.committee;
  const blocName = currentUser.bloc || currentUser.selectedBloc;
  const bloc = committees[committee].blocs[blocName];

  if (!bloc) return;

  if (type === "preambulatory") {
    bloc.resolution.preambulatoryClauses.push(`*${clause}*`);
  } else {
    const operativeNumber = bloc.resolution.operativeClauses.length + 1;
    bloc.resolution.operativeClauses.push(`${operativeNumber}. _${clause}_`);
  }

  saveToStorage();
  updateResolutionDisplay();
}

function updateResolutionDisplay() {
  const committee = currentUser.committee;
  const blocName = currentUser.bloc || currentUser.selectedBloc;
  if (!blocName || !committees[committee].blocs[blocName]) return;

  const resolution = committees[committee].blocs[blocName].resolution;
  let resolutionText = "";

  // Add preambulatory clauses
  if (resolution.preambulatoryClauses.length > 0) {
    resolutionText += resolution.preambulatoryClauses.join(",\n\n") + ",\n\n";
  }

  // Add operative clauses
  if (resolution.operativeClauses.length > 0) {
    const operativeText = resolution.operativeClauses.map((clause, index) => {
      const isLast = index === resolution.operativeClauses.length - 1;
      return clause + (isLast ? "." : ";");
    }).join("\n\n");
    resolutionText += operativeText;
  }

  document.getElementById("resolution-text").value = resolutionText;
}

function saveResolution() {
  const committee = currentUser.committee;
  const blocName = currentUser.bloc || currentUser.selectedBloc;
  if (!blocName || !committees[committee].blocs[blocName]) return;

  const resolution = committees[committee].blocs[blocName].resolution;
  resolution.forum = document.getElementById("forum").value;
  resolution.questionOf = document.getElementById("question-of").value;
  resolution.submittedBy = document.getElementById("submitted-by").value;
  resolution.coSubmittedBy = document.getElementById("co-submitted-by").value;

  saveToStorage();
}

function loadResolution() {
  const committee = currentUser.committee;
  const blocName = currentUser.bloc || currentUser.selectedBloc;
  if (!blocName || !committees[committee].blocs[blocName]) return;

  const resolution = committees[committee].blocs[blocName].resolution;
  document.getElementById("forum").value = resolution.forum;
  document.getElementById("question-of").value = resolution.questionOf;
  document.getElementById("submitted-by").value = resolution.submittedBy;
  document.getElementById("co-submitted-by").value = resolution.coSubmittedBy;

  updateResolutionDisplay();
}

function addComment() {
  if (currentUser.role !== "chair") return;

  const commentText = document.getElementById("comment-input").value.trim();
  if (!commentText) return;

  const committee = currentUser.committee;
  const blocName = currentUser.selectedBloc;
  if (!blocName || !committees[committee].blocs[blocName]) {
    alert("Please select a bloc first!");
    return;
  }

  committees[committee].blocs[blocName].comments.push({
    text: commentText,
    timestamp: new Date().toLocaleTimeString(),
    chair: currentUser.id || "Chair" // Use a generic ID if specific chair ID isn't set
  });

  document.getElementById("comment-input").value = "";
  saveToStorage();
  updateCommentsDisplay();
}

function updateCommentsDisplay() {
  const committee = currentUser.committee;
  const blocName = currentUser.bloc || currentUser.selectedBloc;
  if (!blocName || !committees[committee].blocs[blocName]) return;

  const commentsDiv = document.getElementById("comments-list");
  commentsDiv.innerHTML = "";

  const comments = committees[committee].blocs[blocName].comments;
  comments.forEach(comment => {
    const commentDiv = document.createElement("div");
    commentDiv.className = "comment";
    commentDiv.innerHTML = `
      <div class="comment-time">${comment.timestamp} - ${comment.chair}</div>
      <div class="comment-text">${comment.text}</div>
    `;
    commentsDiv.appendChild(commentDiv);
  });
}

function toggleLock() {
  if (currentUser.role !== "chair") return;

  const committee = currentUser.committee;
  committees[committee].isEditingLocked = !committees[committee].isEditingLocked;

  const lockBtn = document.getElementById("lock-toggle");
  lockBtn.textContent = committees[committee].isEditingLocked ? "🔓 Unlock" : "🔒 Lock";
  lockBtn.style.backgroundColor = committees[committee].isEditingLocked ? "#dc3545" : "#28a745";

  saveToStorage();
  updateEditingPermissions();
}

function updateEditingPermissions() {
  const committee = currentUser.committee;
  if (!committee || !committees[committee]) return; // Ensure committee context exists

  const isDelegate = currentUser.role === "delegate";
  // Editing is allowed if it's not a delegate, OR if it's a delegate and editing is NOT locked
  const canEdit = !isDelegate || !committees[committee].isEditingLocked;

  document.getElementById("forum").disabled = !canEdit;
  document.getElementById("question-of").disabled = !canEdit;
  document.getElementById("submitted-by").disabled = !canEdit;
  document.getElementById("co-submitted-by").disabled = !canEdit;

  const clauseButtons = document.querySelectorAll("#preambulatory-buttons button, #operative-buttons button");
  clauseButtons.forEach(btn => btn.disabled = !canEdit);
}

function setTimer() {
  if (currentUser.role !== "chair") return;

  const minutes = parseInt(prompt("Enter minutes:")) || 0;
  const seconds = parseInt(prompt("Enter seconds:")) || 0;

  const committee = currentUser.committee;
  committees[committee].timer = {
    totalSeconds: minutes * 60 + seconds,
    isRunning: false,
    startTime: null
  };

  saveToStorage();
  updateTimerDisplay();
}

function startTimer() {
  if (currentUser.role !== "chair") return;

  const committee = currentUser.committee;
  const timer = committees[committee].timer;

  if (timer.isRunning || timer.totalSeconds <= 0) return;

  timer.isRunning = true;
  timer.startTime = Date.now();
  saveToStorage();

  // Ensure only one interval runs
  startTimerInterval();
}

// Global variable to hold the timer interval ID
let globalTimerIntervalId = null;

function startTimerInterval() {
  // Clear any existing interval to prevent duplicates
  if (globalTimerIntervalId) {
    clearInterval(globalTimerIntervalId);
  }

  globalTimerIntervalId = setInterval(() => {
    const committee = currentUser.committee;
    // Check if committee and timer exist before proceeding
    if (!committee || !committees[committee] || !committees[committee].timer) {
      clearInterval(globalTimerIntervalId);
      globalTimerIntervalId = null; // Clear reference
      return;
    }
    const timer = committees[committee].timer;

    if (!timer.isRunning) {
      clearInterval(globalTimerIntervalId);
      globalTimerIntervalId = null; // Clear reference
      return;
    }

    if (timer.totalSeconds <= 0) {
      timer.isRunning = false;
      timer.totalSeconds = 0;
      if (currentUser.role === "chair") {
        alert("Time's up!");
      }
      clearInterval(globalTimerIntervalId);
      globalTimerIntervalId = null; // Clear reference
      saveToStorage();
      updateTimerDisplay();
      return;
    }

    timer.totalSeconds -= 1;

    saveToStorage(); // Save every second to keep state consistent
    updateTimerDisplay(); // Update display immediately
  }, 1000);
}

function pauseTimer() {
  if (currentUser.role !== "chair") return;

  const committee = currentUser.committee;
  const timer = committees[committee].timer;

  if (timer.isRunning) {
    timer.isRunning = false;
    timer.startTime = null;
    saveToStorage();

    if (globalTimerIntervalId) {
      clearInterval(globalTimerIntervalId);
      globalTimerIntervalId = null; // Clear reference
    }
  }
}

function resetTimer() {
  if (currentUser.role !== "chair") return;

  const committee = currentUser.committee;
  committees[committee].timer = {
    totalSeconds: 0,
    isRunning: false,
    startTime: null
  };

  saveToStorage();
  updateTimerDisplay();

  if (globalTimerIntervalId) {
    clearInterval(globalTimerIntervalId);
    globalTimerIntervalId = null; // Clear reference
  }
}

function updateTimerDisplay() {
  const committee = currentUser.committee;
  if (!committee || !committees[committee]) return;

  const timer = committees[committee].timer;
  const totalSeconds = Math.max(0, timer.totalSeconds);

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  document.getElementById("timer").textContent = display;
}

function exportToPDF() {
  const committee = currentUser.committee;
  const blocName = currentUser.bloc || currentUser.selectedBloc;
  if (!blocName || !committees[committee].blocs[blocName]) {
    alert("No resolution to export!");
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
        <div class="field"><strong>FORUM:</strong> ${resolution.forum}</div>
        <div class="field"><strong>QUESTION OF:</strong> ${resolution.questionOf}</div>
        <div class="field"><strong>SUBMITTED BY:</strong> ${resolution.submittedBy}</div>
        <div class="field"><strong>CO-SUBMITTED BY:</strong> ${resolution.coSubmittedBy}</div>
        <hr>
        <div class="resolution">${resolutionText}</div>
        <script>window.print(); window.close();</script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function enterEditor() {
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
    return;
  }

  if (role === "chair") {
    const chairPassword = document.getElementById("chair-password-input").value;
    if (chairPassword !== "resolutions@26") {
      alert("Invalid chair password!");
      return;
    }
  }

  let userInfoText = `${role.toUpperCase()} – ${committee.toUpperCase()}`;

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

    if (!committees[committee].blocs[selectedBloc] ||
        committees[committee].blocs[selectedBloc].password !== blocPassword) {
      alert("Invalid bloc password!");
      return;
    }

    const delegateId = `Delegate-${Date.now()}`;
    if (!committees[committee].blocs[selectedBloc].members.includes(delegateId)) {
      committees[committee].blocs[selectedBloc].members.push(delegateId);
    }

    currentUser = { role, committee, bloc: selectedBloc, id: delegateId };
    userInfoText += ` – BLOC: ${selectedBloc}`;
  } else { // Chair
    currentUser = { role, committee };
    // Clear resolution display for chairs when entering until a bloc is selected
    document.getElementById("resolution-text").value = "";
    document.getElementById("comments-list").innerHTML = "";
    document.getElementById("forum").value = "";
    document.getElementById("question-of").value = "";
    document.getElementById("submitted-by").value = "";
    document.getElementById("co-submitted-by").value = "";
  }

  document.getElementById("login-container").style.display = "none";
  document.getElementById("editor-container").style.display = "block";
  document.getElementById("user-info").textContent = userInfoText;

  setupRoleInterface();
  updateBlocDisplays();

  if (role === "delegate") {
    loadResolution();
    updateCommentsDisplay();
  }

  // Load committee state for initial display
  updateEditingPermissions();
  updateTimerDisplay();

  // Start timer if it was already running (e.g., from a previous session or another tab)
  if (committees[committee].timer.isRunning) {
    startTimerInterval();
  }

  saveToStorage();
}

function setupRoleInterface() {
  const isChair = currentUser.role === "chair";

  document.getElementById("set-timer").style.display = isChair ? "inline" : "none";
  document.getElementById("start-timer").style.display = isChair ? "inline" : "none";
  document.getElementById("pause-timer").style.display = isChair ? "inline" : "none";
  document.getElementById("reset-timer").style.display = isChair ? "inline" : "none";
  document.getElementById("lock-toggle").style.display = isChair ? "inline" : "none";
  document.getElementById("comment-input").style.display = isChair ? "inline" : "none";
  document.getElementById("add-comment").style.display = isChair ? "inline" : "none";

  const chairControls = document.getElementById("chair-controls");
  const blocSelector = document.getElementById("bloc-selector");

  if (isChair) {
    chairControls.style.display = "block";
    blocSelector.style.display = "block";

    const committee = currentUser.committee;
    if (committee && committees[committee]) { // Ensure committee exists before accessing its properties
        const lockBtn = document.getElementById("lock-toggle");
        lockBtn.textContent = committees[committee].isEditingLocked ? "🔓 Unlock" : "🔒 Lock";
        lockBtn.style.backgroundColor = committees[committee].isEditingLocked ? "#dc3545" : "#28a745";
    }
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
    enterButton.disabled = !selectedBloc; // Disable if no bloc selected
  } else { // Chair
    enterButton.disabled = false; // Chair's "Enter" button is always enabled
  }
}

// Combined and corrected window.onload
window.onload = () => {
  initializeCommittees();

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
  document.getElementById("available-blocs").addEventListener("change", checkBlocSelection); // Added for delegate bloc selection updates

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

  // Main polling loop for display updates based on localStorage (for all users)
  // This helps reflect changes if multiple tabs are open or if the chair changes something
  // and the delegate's view needs to update without requiring explicit refresh.
  setInterval(() => {
    if (currentUser.committee) {
      updateTimerDisplay(); // Update timer display for everyone
      updateEditingPermissions(); // Update lock status for everyone
      // Update resolution and comments for the currently active bloc view (if any)
      if (currentUser.bloc || currentUser.selectedBloc) {
        updateResolutionDisplay();
        updateCommentsDisplay();
      }
    }
  }, 1000);
};