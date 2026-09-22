import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyApiWIFDg_LLv6VTKDF-WeznyeVuWo-r9Y",
  authDomain: "focus-ddu-fellowship.firebaseapp.com",
  projectId: "focus-ddu-fellowship",
  storageBucket: "focus-ddu-fellowship.firebasestorage.app",
  messagingSenderId: "467070830126",
  appId: "1:467070830126:web:f4223d1b898aa0fd67c1bf"
};

const appId = 'focus-ddu-fellowship-portal';
let app, db, auth, userId = null;
let globalRegistrations = [];
let globalUsers = [];
let globalEditRequests = [];
let currentAdminFilter = 'All';
let isAdminAuthenticated = false;
let currentClientUser = null; 
let isRegisteringMode = false;

try {
    const localRegs = localStorage.getItem('edureg_registrations_backup');
    if (localRegs) globalRegistrations = JSON.parse(localRegs);

    const localUsers = localStorage.getItem('edureg_users_backup');
    if (localUsers) globalUsers = JSON.parse(localUsers);

    const localReqs = localStorage.getItem('edureg_requests_backup');
    if (localReqs) globalEditRequests = JSON.parse(localReqs);

    const savedClient = sessionStorage.getItem('edureg_current_client');
    if (savedClient) {
        currentClientUser = JSON.parse(savedClient);
    }
} catch(e) {
    console.error("Local storage read error:", e);
}

async function initFirebase() {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        await signInAnonymously(auth);
        userId = auth.currentUser?.uid || crypto.randomUUID();
        
        setCloudStatus('active', 'Cloud Sync Active');
        setupRealtimeListeners();
    } catch (err) {
        console.error("Firebase init error:", err);
        setCloudStatus('active', 'Local Backup Active');
        updateClientDashboardUI();
        loadAdminData();
    }
}

function setCloudStatus(status, text) {
    const dot = document.getElementById('cloudStatusDot');
    const label = document.getElementById('cloudStatusText');
    if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse";
    if (label) label.innerText = text;
}

function setupRealtimeListeners() {
    if (!db) return;
    try {
        const regRef = collection(db, 'artifacts', appId, 'public', 'data', 'registrations');
        onSnapshot(regRef, (snapshot) => {
            const loaded = [];
            snapshot.forEach(docSnap => {
                loaded.push({ firebaseId: docSnap.id, ...docSnap.data() });
            });
            globalRegistrations = loaded.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            saveLocalBackups();
            updateClientDashboardUI();
            loadAdminData();
        });

        const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
        onSnapshot(usersRef, (snapshot) => {
            const loaded = [];
            snapshot.forEach(docSnap => {
                loaded.push({ firebaseId: docSnap.id, ...docSnap.data() });
            });
            globalUsers = loaded;
            saveLocalBackups();
        });

        const reqRef = collection(db, 'artifacts', appId, 'public', 'data', 'edit_requests');
        onSnapshot(reqRef, (snapshot) => {
            const loaded = [];
            snapshot.forEach(docSnap => {
                loaded.push({ firebaseId: docSnap.id, ...docSnap.data() });
            });
            globalEditRequests = loaded.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
            saveLocalBackups();
            loadAdminData();
            updateClientDashboardUI();
        });
    } catch (e) {
        console.error("Listener setup error:", e);
    }
}

function saveLocalBackups() {
    try {
        localStorage.setItem('edureg_registrations_backup', JSON.stringify(globalRegistrations));
        localStorage.setItem('edureg_users_backup', JSON.stringify(globalUsers));
        localStorage.setItem('edureg_requests_backup', JSON.stringify(globalEditRequests));
        if (currentClientUser) {
            sessionStorage.setItem('edureg_current_client', JSON.stringify(currentClientUser));
        } else {
            sessionStorage.removeItem('edureg_current_client');
        }
    } catch(e) {
        console.error("Failed to save backups:", e);
    }
}

window.switchTab = function(tabName) {
    const clientView = document.getElementById('view-client');
    const adminView = document.getElementById('view-admin');
    const navClient = document.getElementById('nav-client');
    const navAdmin = document.getElementById('nav-admin');
    const clientPortalHeaderControls = document.getElementById('clientPortalHeaderControls');

    if (tabName === 'client') {
        isAdminAuthenticated = false;
        clientView.classList.remove('hidden');
        adminView.classList.add('hidden');
        if (clientPortalHeaderControls) clientPortalHeaderControls.classList.remove('hidden');
        navClient.className = "px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all bg-indigo-600 text-white shadow-md shadow-indigo-600/30 flex items-center space-x-1.5 sm:space-x-2";
        navAdmin.className = "px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all text-slate-300 hover:text-white hover:bg-slate-800 flex items-center space-x-1.5 sm:space-x-2";
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (tabName === 'admin') {
        if (!isAdminAuthenticated) {
            openAdminModal();
            return;
        }
        
        // SECURE ADMIN ISOLATION: Automatically sign out client when admin panel opens
        if (currentClientUser) {
            currentClientUser = null;
            sessionStorage.removeItem('edureg_current_client');
            updateClientDashboardUI();
        }

        clientView.classList.add('hidden');
        adminView.classList.remove('hidden');
        if (clientPortalHeaderControls) clientPortalHeaderControls.classList.add('hidden');
        navAdmin.className = "px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all bg-indigo-600 text-white shadow-md shadow-indigo-600/30 flex items-center space-x-1.5 sm:space-x-2";
        navClient.className = "px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all text-slate-300 hover:text-white hover:bg-slate-800 flex items-center space-x-1.5 sm:space-x-2";
        loadAdminData();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
};

window.handleAdminNavClick = function() {
    if (isAdminAuthenticated) {
        switchTab('admin');
    } else {
        openAdminModal();
    }
};

window.openAdminModal = function() {
    const modal = document.getElementById('adminLoginModal');
    modal.classList.remove('hidden');
    document.getElementById('adminUsernameInput').value = '';
    document.getElementById('adminPasswordInput').value = '';
    document.getElementById('adminErrorMsg').classList.add('hidden');
    setTimeout(() => document.getElementById('adminUsernameInput').focus(), 100);
};

window.closeAdminModal = function() {
    document.getElementById('adminLoginModal').classList.add('hidden');
};

window.verifyAdminCredentials = function(e) {
    e.preventDefault();
    const u = document.getElementById('adminUsernameInput').value.trim();
    const p = document.getElementById('adminPasswordInput').value.trim();
    
    if (u === "Focus DDU" && p === "focusddufellowship") {
        isAdminAuthenticated = true;
        closeAdminModal();
        showTopBanner("Admin access granted successfully!", "success");
        switchTab('admin');
    } else {
        document.getElementById('adminErrorMsg').classList.remove('hidden');
        document.getElementById('adminPasswordInput').focus();
    }
};

window.lockAdminSession = function() {
    isAdminAuthenticated = false;
    switchTab('client');
    showTopBanner("Admin session locked securely.", "success");
};

window.handlePortalClick = function() {
    if (!currentClientUser) {
        openAuthModal('login');
    } else {
        const dash = document.getElementById('clientDashboardCard');
        if (dash) {
            dash.classList.remove('hidden');
            dash.scrollIntoView({ behavior: 'smooth' });
        }
    }
};

window.openAuthModal = function(mode) {
    isRegisteringMode = (mode === 'register');
    const modal = document.getElementById('clientAuthModal');
    modal.classList.remove('hidden');
    document.getElementById('authErrorMsg').classList.add('hidden');
    document.getElementById('authForm').reset();
    
    const title = document.getElementById('authModalTitle');
    const sub = document.getElementById('authModalSub');
    const nameGrp = document.getElementById('authNameGroup');
    const btn = document.getElementById('authSubmitBtn');
    const switchTxt = document.getElementById('authSwitchText');

    if (isRegisteringMode) {
        title.innerText = "Create Client Account";
        sub.innerText = "Register your account before submitting your form";
        nameGrp.classList.remove('hidden');
        document.getElementById('authFullName').required = true;
        btn.innerText = "Create Account & Sign In";
        switchTxt.innerText = "Already have an account? Sign In here";
    } else {
        title.innerText = "Client Login";
        sub.innerText = "Access your 'Your Giving' dashboard";
        nameGrp.classList.add('hidden');
        document.getElementById('authFullName').required = false;
        btn.innerText = "Sign In to Account";
        switchTxt.innerText = "Don't have an account? Create one here";
    }
};

window.closeAuthModal = function() {
    document.getElementById('clientAuthModal').classList.add('hidden');
};

window.toggleAuthMode = function() {
    openAuthModal(isRegisteringMode ? 'login' : 'register');
};

window.handleClientAuth = async function(e) {
    e.preventDefault();
    const identifier = document.getElementById('authIdentifier').value.trim();
    const password = document.getElementById('authPassword').value.trim();
    const fullName = document.getElementById('authFullName').value.trim();
    const errBox = document.getElementById('authErrorMsg');
    const errText = document.getElementById('authErrorText');

    if (isRegisteringMode) {
        const existing = globalUsers.find(u => u.identifier === identifier);
        if (existing) {
            errText.innerText = "Account already exists with this phone number.";
            errBox.classList.remove('hidden');
            return;
        }
        const newUser = { identifier, password, fullName, createdAt: new Date().toISOString() };
        globalUsers.push(newUser);
        saveLocalBackups();

        if (db) {
            try {
                await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'users'), newUser);
            } catch(err) { console.warn("Cloud user sync warning:", err); }
        }

        currentClientUser = { identifier, fullName };
        saveLocalBackups();
        closeAuthModal();
        showTopBanner("Account created and signed in successfully!", "success");
        updateClientDashboardUI();
        handlePortalClick();
    } else {
        const user = globalUsers.find(u => u.identifier === identifier && u.password === password);
        if (!user) {
            errText.innerText = "Invalid credentials. Please check your phone number and password.";
            errBox.classList.remove('hidden');
            return;
        }
        currentClientUser = { identifier: user.identifier, fullName: user.fullName };
        saveLocalBackups();
        closeAuthModal();
        showTopBanner(`Welcome back, ${user.fullName}!`, "success");
        updateClientDashboardUI();
        handlePortalClick();
    }
};

window.clientLogout = function() {
    currentClientUser = null;
    saveLocalBackups();
    updateClientDashboardUI();
    document.getElementById('clientDashboardCard').classList.add('hidden');
    showTopBanner("Signed out of client account.", "success");
};

function updateClientDashboardUI() {
    const accBtnContainer = document.getElementById('clientAccountBtnContainer');
    const dashCard = document.getElementById('clientDashboardCard');

    if (!currentClientUser) {
        if (accBtnContainer) {
            accBtnContainer.innerHTML = `
                <button type="button" onclick="openAuthModal('login')" class="px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center space-x-2">
                    <i class="fa-solid fa-user-circle"></i>
                    <span>Account</span>
                </button>
            `;
        }
        if (dashCard) dashCard.classList.add('hidden');
    } else {
        if (accBtnContainer) {
            accBtnContainer.innerHTML = `
                <button type="button" onclick="clientLogout()" class="px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all flex items-center space-x-2">
                    <i class="fa-solid fa-right-from-bracket text-rose-400"></i>
                    <span class="truncate max-w-[100px] sm:max-w-xs">${escapeHtml(currentClientUser.fullName)}</span>
                </button>
            `;
        }
        
        if (dashCard) {
            document.getElementById('dashClientName').innerText = `Hello, ${currentClientUser.fullName}`;

            const reg = globalRegistrations.find(r => r.phone === currentClientUser.identifier || r.fullName.toLowerCase() === currentClientUser.fullName.toLowerCase());
            const noRegBox = document.getElementById('dashNoRegistration');
            const hasRegBox = document.getElementById('dashHasRegistration');

            if (!reg) {
                noRegBox.classList.remove('hidden');
                hasRegBox.classList.add('hidden');
                document.getElementById('fullName').value = currentClientUser.fullName;
                document.getElementById('phoneNumber').value = currentClientUser.identifier;
            } else {
                noRegBox.classList.add('hidden');
                hasRegBox.classList.remove('hidden');

                document.getElementById('dashPlan').innerText = reg.plan;
                document.getElementById('dashAmount').innerText = `${reg.amount} ETB`;
                document.getElementById('dashDate').innerText = reg.date;

                const badgeContainer = document.getElementById('dashBadgeContainer');
                if (reg.verified) {
                    badgeContainer.innerHTML = `<span class="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold inline-flex items-center"><i class="fa-solid fa-shield-check mr-1.5"></i> Verified</span>`;
                } else {
                    badgeContainer.innerHTML = `<span class="px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold inline-flex items-center"><i class="fa-solid fa-clock mr-1.5"></i> Pending</span>`;
                }

                const reqBox = document.getElementById('editRequestStatusBox');
                const normalEditBox = document.getElementById('editRequestNormalBox');
                const unlockedEditBox = document.getElementById('editRequestUnlockedBox');

                const approvedReq = globalEditRequests.find(req => req.clientName.toLowerCase() === currentClientUser.fullName.toLowerCase() && req.status === 'Approved');
                const pendingReq = globalEditRequests.find(req => req.clientName.toLowerCase() === currentClientUser.fullName.toLowerCase() && req.status === 'Pending');

                if (approvedReq) {
                    normalEditBox.classList.add('hidden');
                    unlockedEditBox.classList.remove('hidden');
                    
                    const amountPresets = ['300', '500', '1000', '3000', '4000', '5000', '10000'];
                    const amountSelect = document.getElementById('dashEditAmountSelect');
                    const customContainer = document.getElementById('dashCustomAmountContainer');
                    const customInput = document.getElementById('dashCustomAmount');

                    if (amountPresets.includes(reg.amount)) {
                        amountSelect.value = reg.amount;
                        customContainer.classList.add('hidden');
                        customInput.value = '';
                    } else {
                        amountSelect.value = 'Other';
                        customContainer.classList.remove('hidden');
                        customInput.value = reg.amount;
                    }

                    document.getElementById('dashEditPlan').value = reg.plan;
                    document.getElementById('dashEditPhone').value = reg.phone;
                    document.getElementById('dashEditNotes').value = reg.notes;
                } else {
                    unlockedEditBox.classList.add('hidden');
                    normalEditBox.classList.remove('hidden');

                    if (pendingReq) {
                        reqBox.classList.remove('hidden');
                        reqBox.className = "p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs font-medium text-amber-300";
                        reqBox.innerHTML = `<i class="fa-solid fa-clock mr-1"></i> Edit Request Pending Review: "${escapeHtml(pendingReq.reason)}"`;
                    } else {
                        reqBox.classList.add('hidden');
                    }
                }
            }
        }
    }
}

window.handleDashEditAmountChange = function(val) {
    const container = document.getElementById('dashCustomAmountContainer');
    const customInput = document.getElementById('dashCustomAmount');
    if (val === 'Other') {
        container.classList.remove('hidden');
        customInput.required = true;
        customInput.focus();
    } else {
        container.classList.add('hidden');
        customInput.required = false;
        customInput.value = '';
    }
};

window.sendEditRequest = async function() {
    if (!currentClientUser) {
        openAuthModal('login');
        return;
    }
    const reason = document.getElementById('clientEditReason').value.trim();
    if (!reason) {
        showTopBanner("Please enter your edit request details.", "error");
        return;
    }

    const reg = globalRegistrations.find(r => r.phone === currentClientUser.identifier || r.fullName.toLowerCase() === currentClientUser.fullName.toLowerCase());
    if (!reg) {
        showTopBanner("You must submit a registration before requesting edits.", "error");
        return;
    }

    const newReq = {
        clientName: currentClientUser.fullName,
        phone: reg.phone,
        reason,
        status: 'Pending',
        createdAt: new Date().toISOString()
    };

    try {
        let localId = 'req_' + Date.now();
        let reqToSave = { firebaseId: localId, ...newReq };
        globalEditRequests.unshift(reqToSave);
        saveLocalBackups();
        loadAdminData();
        updateClientDashboardUI();

        if (db) {
            await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'edit_requests'), newReq);
        }

        document.getElementById('clientEditReason').value = '';
        showTopBanner("Edit request sent to admin successfully!", "success");
    } catch(e) {
        console.error("Edit request error:", e);
        showTopBanner("Failed to send request. Try again.", "error");
    }
};

window.handleClientUpdateRegistration = async function(e) {
    e.preventDefault();
    if (!currentClientUser) return;

    const reg = globalRegistrations.find(r => r.phone === currentClientUser.identifier || r.fullName.toLowerCase() === currentClientUser.fullName.toLowerCase());
    if (!reg) return;

    const amountSelect = document.getElementById('dashEditAmountSelect').value;
    const customAmount = document.getElementById('dashCustomAmount')?.value.trim();
    const finalAmount = amountSelect === 'Other' ? customAmount : amountSelect;

    const plan = document.getElementById('dashEditPlan').value;
    const phone = document.getElementById('dashEditPhone').value.trim();
    const notes = document.getElementById('dashEditNotes').value.trim();

    reg.amount = finalAmount;
    reg.plan = plan;
    reg.phone = phone;
    reg.notes = notes;

    const approvedReq = globalEditRequests.find(req => req.clientName.toLowerCase() === currentClientUser.fullName.toLowerCase() && req.status === 'Approved');
    if (approvedReq) {
        approvedReq.status = 'Completed';
    }

    saveLocalBackups();
    updateClientDashboardUI();
    loadAdminData();

    if (db && !reg.firebaseId.startsWith('local_')) {
        try {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'registrations', reg.firebaseId), {
                amount: finalAmount, plan, phone, notes
            });
        } catch(err) {
            console.warn("Cloud update error:", err);
        }
    }

    showTopBanner("Registration successfully updated!", "success");
};

window.handleAmountChange = function(val) {
    const container = document.getElementById('customAmountContainer');
    const customInput = document.getElementById('customAmount');
    if (val === 'Other') {
        container.classList.remove('hidden');
        customInput.required = true;
        customInput.focus();
    } else {
        container.classList.add('hidden');
        customInput.required = false;
        customInput.value = '';
    }
};

window.handleRegistration = async function(e) {
    e.preventDefault();
    if (!currentClientUser) {
        openAuthModal('login');
        showTopBanner("Please sign in to your client account first.", "error");
        return;
    }

    const existingReg = globalRegistrations.find(r => r.phone === currentClientUser.identifier || r.fullName.toLowerCase() === currentClientUser.fullName.toLowerCase());
    if (existingReg) {
        showTopBanner("Your account already has a registered entry! Use 'Your Giving' to view or request edits.", "error");
        handlePortalClick();
        return;
    }

    const fullName = document.getElementById('fullName').value.trim();
    const phone = document.getElementById('phoneNumber').value.trim();
    const amountSelect = document.getElementById('paymentAmountSelect').value;
    const customAmount = document.getElementById('customAmount').value.trim();
    const plan = document.getElementById('paymentPlan').value;
    const notes = document.getElementById('optionalNotes').value.trim();

    const finalAmount = amountSelect === 'Other' ? customAmount : amountSelect;

    if (!fullName || !phone || !finalAmount || !plan) {
        showTopBanner('Please fill out all required fields.', 'error');
        return;
    }

    const newRecord = {
        fullName,
        phone,
        amount: finalAmount,
        plan,
        notes: notes || 'None',
        verified: false,
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
    };

    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i><span>Saving Registration...</span>`;

    try {
        let localId = 'local_' + Date.now();
        let recordToSave = { firebaseId: localId, ...newRecord };

        globalRegistrations.unshift(recordToSave);
        saveLocalBackups();
        updateClientDashboardUI();
        loadAdminData();

        if (db) {
            const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'registrations');
            const docRef = await addDoc(colRef, newRecord);
            recordToSave.firebaseId = docRef.id;
            saveLocalBackups();
        }

        document.getElementById('registrationForm').reset();
        document.getElementById('customAmountContainer').classList.add('hidden');
        showSuccessModal(fullName, finalAmount, plan);
        handlePortalClick();
    } catch (err) {
        console.error("Error saving document:", err);
        showTopBanner('Error saving record. Please try again.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Submit Registration</span><i class="fa-solid fa-arrow-right-long"></i>`;
    }
};

window.setAdminFilter = function(filterName) {
    currentAdminFilter = filterName;
    const filterTypes = ['All', 'Month by Month', 'Every 3 Months', 'Every 6 Months', 'Annual'];
    filterTypes.forEach(type => {
        const card = document.getElementById(`card-${type}`);
        if (!card) return;
        if (type === filterName) {
            card.className = "cursor-pointer bg-slate-800/90 border-2 border-indigo-500 p-4 sm:p-5 rounded-2xl shadow-xl transition-all scale-[1.01] " + (type === 'All' || type === 'Annual' ? 'col-span-2 sm:col-span-1' : '');
        } else {
            card.className = "cursor-pointer bg-slate-800/80 border-2 border-slate-700/80 p-4 sm:p-5 rounded-2xl shadow-lg transition-all hover:scale-[1.02] " + (type === 'All' || type === 'Annual' ? 'col-span-2 sm:col-span-1' : '');
        }
    });

    const titleEl = document.getElementById('activeFilterTitle');
    if (titleEl) titleEl.innerText = `Showing: ${filterName === 'All' ? 'All In One Records' : filterName}`;
    loadAdminData();
};

function loadAdminData() {
    const records = globalRegistrations;
    const tbody = document.getElementById('registrationsTableBody');
    const emptyState = document.getElementById('emptyState');
    const recordCountBadge = document.getElementById('recordCountBadge');
    
    if (!tbody) return;

    const totalCount = records.length;
    const monthlyCount = records.filter(r => r.plan === 'Month by Month').length;
    const q3Count = records.filter(r => r.plan === 'Every 3 Months').length;
    const q6Count = records.filter(r => r.plan === 'Every 6 Months').length;
    const annualCount = records.filter(r => r.plan === 'Annual').length;

    if (document.getElementById('statAll')) document.getElementById('statAll').innerText = totalCount;
    if (document.getElementById('statMonthly')) document.getElementById('statMonthly').innerText = monthlyCount;
    if (document.getElementById('stat3Months')) document.getElementById('stat3Months').innerText = q3Count;
    if (document.getElementById('stat6Months')) document.getElementById('stat6Months').innerText = q6Count;
    if (document.getElementById('statAnnual')) document.getElementById('statAnnual').innerText = annualCount;

    let filteredRecords = records;
    if (currentAdminFilter !== 'All') {
        filteredRecords = records.filter(r => r.plan === currentAdminFilter);
    }

    if (recordCountBadge) recordCountBadge.innerText = `${filteredRecords.length} Records`;

    const reqContainer = document.getElementById('adminEditRequestsContainer');
    const reqCountBadge = document.getElementById('editRequestsCountBadge');
    const pendingReqs = globalEditRequests.filter(r => r.status === 'Pending');
    if (reqCountBadge) reqCountBadge.innerText = `${pendingReqs.length} Requests`;

    if (reqContainer) {
        if (pendingReqs.length === 0) {
            reqContainer.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">No pending edit requests from clients.</p>`;
        } else {
            reqContainer.innerHTML = '';
            pendingReqs.forEach(req => {
                const div = document.createElement('div');
                div.className = "bg-slate-900 border border-slate-700 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3";
                div.innerHTML = `
                    <div>
                        <h5 class="text-white font-extrabold text-sm flex items-center">
                            <i class="fa-solid fa-user-circle text-indigo-400 mr-2"></i> ${escapeHtml(req.clientName)} <span class="text-xs text-slate-400 font-normal ml-2">(${escapeHtml(req.phone)})</span>
                        </h5>
                        <p class="text-xs text-slate-300 mt-1 font-medium bg-slate-950 p-2.5 rounded-xl border border-slate-800">"${escapeHtml(req.reason)}"</p>
                    </div>
                    <div class="flex items-center space-x-2 self-end sm:self-auto">
                        <button onclick="grantEditPermission('${req.firebaseId}')" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition-all flex items-center space-x-1">
                            <i class="fa-solid fa-check"></i>
                            <span>Grant Permission</span>
                        </button>
                        <button onclick="cancelEditRequest('${req.firebaseId}')" class="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow transition-all flex items-center space-x-1">
                            <i class="fa-solid fa-xmark"></i>
                            <span>Cancel</span>
                        </button>
                    </div>
                `;
                reqContainer.appendChild(div);
            });
        }
    }

    tbody.innerHTML = '';
    if (filteredRecords.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    } else {
        if (emptyState) emptyState.classList.add('hidden');
    }

    filteredRecords.forEach((record, index) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-700/40 transition-all";
        
        let badgeColor = 'bg-slate-700 text-slate-300';
        if (record.plan === 'Annual') badgeColor = 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        else if (record.plan === 'Every 3 Months') badgeColor = 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
        else if (record.plan === 'Every 6 Months') badgeColor = 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30';
        else if (record.plan === 'Month by Month') badgeColor = 'bg-amber-500/20 text-amber-300 border border-amber-500/30';

        const statusBadge = record.verified
            ? `<button onclick="toggleVerification('${record.firebaseId}', false)" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-flex items-center hover:bg-emerald-500/30 transition-all"><i class="fa-solid fa-shield-check mr-1"></i> Verified</button>`
            : `<button onclick="toggleVerification('${record.firebaseId}', true)" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-flex items-center hover:bg-amber-500/30 transition-all"><i class="fa-solid fa-clock mr-1"></i> Pending</button>`;

        tr.innerHTML = `
            <td class="py-4 px-6 font-semibold text-slate-500 text-xs">${index + 1}</td>
            <td class="py-4 px-6 font-bold text-white">${escapeHtml(record.fullName)}</td>
            <td class="py-4 px-6 font-mono text-xs text-slate-300">${escapeHtml(record.phone)}</td>
            <td class="py-4 px-6 font-mono font-bold text-emerald-400">${escapeHtml(record.amount)} ETB</td>
            <td class="py-4 px-6"><span class="px-2.5 py-1 rounded-lg text-xs font-bold ${badgeColor}">${escapeHtml(record.plan)}</span></td>
            <td class="py-4 px-6">${statusBadge}</td>
            <td class="py-4 px-6 text-slate-400 max-w-xs truncate font-medium">${escapeHtml(record.notes)}</td>
            <td class="py-4 px-6 text-right">
                <button type="button" onclick="deleteRecord('${record.firebaseId}')" class="w-8 h-8 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 inline-flex items-center justify-center transition-all border border-rose-500/20" title="Delete">
                    <i class="fa-solid fa-trash text-xs"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.toggleVerification = async function(firebaseId, status) {
    try {
        const rec = globalRegistrations.find(r => r.firebaseId === firebaseId);
        if (rec) rec.verified = status;
        saveLocalBackups();
        loadAdminData();
        updateClientDashboardUI();

        if (db && !firebaseId.startsWith('local_')) {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'registrations', firebaseId), { verified: status });
        }
        showTopBanner(`Status updated to ${status ? 'Verified' : 'Pending'}.`, 'success');
    } catch(e) {
        console.error("Verification error:", e);
        showTopBanner("Failed to update status.", "error");
    }
};

window.grantEditPermission = async function(reqId) {
    try {
        const req = globalEditRequests.find(r => r.firebaseId === reqId);
        if (req) req.status = 'Approved';
        saveLocalBackups();
        loadAdminData();
        updateClientDashboardUI();

        if (db && !reqId.startsWith('req_')) {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'edit_requests', reqId), { status: 'Approved' });
        }
        showTopBanner("Edit permission granted to client.", "success");
    } catch(e) {
        console.error("Grant error:", e);
        showTopBanner("Failed to grant permission.", "error");
    }
};

window.cancelEditRequest = async function(reqId) {
    try {
        const req = globalEditRequests.find(r => r.firebaseId === reqId);
        if (req) req.status = 'Cancelled';
        saveLocalBackups();
        loadAdminData();
        updateClientDashboardUI();

        if (db && !reqId.startsWith('req_')) {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'edit_requests', reqId), { status: 'Cancelled' });
        }
        showTopBanner("Edit request cancelled.", "success");
    } catch(e) {
        console.error("Cancel error:", e);
        showTopBanner("Failed to cancel request.", "error");
    }
};

window.deleteRecord = async function(firebaseId) {
    if (!firebaseId) return;
    try {
        if (db && !firebaseId.startsWith('local_')) {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'registrations', firebaseId));
        }
        globalRegistrations = globalRegistrations.filter(r => r.firebaseId !== firebaseId);
        saveLocalBackups();
        loadAdminData();
        updateClientDashboardUI();
        showTopBanner('Registration deleted successfully.', 'success');
    } catch (err) {
        console.error("Error deleting document:", err);
        showTopBanner('Failed to delete record.', 'error');
    }
};

window.clearAllData = async function() {
    if (window.confirm && confirm('Are you sure you want to delete all registrations?')) {
        try {
            globalRegistrations = [];
            saveLocalBackups();
            loadAdminData();
            updateClientDashboardUI();
            showTopBanner('All records cleared.', 'success');
        } catch (err) {
            console.error("Error clearing database:", err);
            showTopBanner('Failed to clear records.', 'error');
        }
    }
};

window.exportData = function() {
    const records = globalRegistrations;
    if (records.length === 0) {
        showTopBanner('No data available to export.', 'error');
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,Full Name,Phone Number,Amount (ETB),Billing Plan,Verification Status,Optional Notes,Date\n";
    records.forEach(r => {
        csvContent += `"${r.fullName}","${r.phone}","${r.amount}","${r.plan}","${r.verified ? 'Verified' : 'Pending'}","${(r.notes || '').replace(/"/g, '""')}","${r.date}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "registrations_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showTopBanner('CSV Export generated successfully!', 'success');
};

function showTopBanner(message, type = 'success') {
    let container = document.getElementById('topBannerContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'topBannerContainer';
        container.className = 'fixed top-5 left-1/2 transform -translate-x-1/2 z-50 flex flex-col items-center space-y-2 w-full max-w-md px-4 pointer-events-none';
        document.body.appendChild(container);
    }

    const banner = document.createElement('div');
    banner.className = `pointer-events-auto w-full px-5 py-3.5 rounded-2xl shadow-2xl text-white text-xs sm:text-sm font-bold flex items-center space-x-3 transition-all transform -translate-y-4 opacity-0 border ${type === 'success' ? 'bg-emerald-600/95 border-emerald-500 backdrop-blur-md' : 'bg-rose-600/95 border-rose-500 backdrop-blur-md'}`;
    
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
    banner.innerHTML = `<i class="fa-solid ${icon} text-base shrink-0"></i><span class="flex-1">${message}</span>`;
    
    container.appendChild(banner);
    
    setTimeout(() => banner.classList.remove('-translate-y-4', 'opacity-0'), 20);
    setTimeout(() => {
        banner.classList.add('-translate-y-4', 'opacity-0');
        setTimeout(() => banner.remove(), 300);
    }, 4000);
}

function showSuccessModal(name, amount, plan) {
    let modal = document.getElementById('successWelcomeModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'successWelcomeModal';
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in';
        modal.innerHTML = `
            <div class="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl text-center space-y-5">
                <div class="w-16 h-16 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 rounded-2xl mx-auto flex items-center justify-center text-3xl shadow-lg">
                    <i class="fa-solid fa-heart-circle-check"></i>
                </div>
                <div>
                    <h3 class="text-xl sm:text-2xl font-extrabold text-white" id="modalWelcomeTitle">Welcome to the Fellowship!</h3>
                    <p class="text-xs sm:text-sm text-slate-300 mt-2" id="modalWelcomeText">Your registration has been successfully recorded and synced.</p>
                </div>
                <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-left space-y-2 text-xs text-slate-300 font-medium">
                    <div class="flex justify-between"><span class="text-slate-500">Partner Name:</span> <strong class="text-white" id="modalRegName">-</strong></div>
                    <div class="flex justify-between"><span class="text-slate-500">Pledged Amount:</span> <strong class="text-emerald-400" id="modalRegAmount">-</strong></div>
                    <div class="flex justify-between"><span class="text-slate-500">Billing Plan:</span> <strong class="text-indigo-300" id="modalRegPlan">-</strong></div>
                </div>
                <button type="button" onclick="document.getElementById('successWelcomeModal').remove(); window.handlePortalClick();" class="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all">
                    View Your Giving Dashboard
                </button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    document.getElementById('modalWelcomeTitle').innerText = `Welcome, ${name}!`;
    document.getElementById('modalRegName').innerText = name;
    document.getElementById('modalRegAmount').innerText = `${amount} ETB`;
    document.getElementById('modalRegPlan').innerText = plan;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

window.onload = function() {
    initFirebase();
    updateClientDashboardUI();
};