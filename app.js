// PlanQC Application
// Version: 1.1.0 - Excel Export
// =========================

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDt-Pi6XQBwe-kCGw5_h4HCtXDN_7L2muI",
    authDomain: "weeklyqc-a5587.firebaseapp.com",
    databaseURL: "https://weeklyqc-a5587-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "weeklyqc-a5587",
    storageBucket: "weeklyqc-a5587.firebasestorage.app",
    messagingSenderId: "285330076526",
    appId: "1:285330076526:web:4a2682c466323880e9477f",
    measurementId: "G-B7JXK82NS3"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

// Auth state
let currentUser = null;

// Tester List
const TESTERS = [
    'Amalraj R',
    'Aravind K V',
    'Julie Varghese',
    'Kavyagayathry S',
    'Reshma Madhavan Nair',
    'Reshma R',
    'Subhash S V Nair',
    'Suby Baby',
    'Vincy JP'
];

// Status Categories Mapping
const STATUS_CATEGORIES = {
    'qa-india': {
        name: 'QA (India)',
        statuses: ['qc-testing', 'qc-testing-in-progress', 'qc-testing-hold']
    },
    'bis-qa': {
        name: 'BIS QA',
        statuses: ['bis-testing', 'testing-in-progress']
    },
    'dev': {
        name: 'Dev',
        statuses: ['approved-for-live', 'moved-to-live', 'in-progress', 'qc-review-fail', 'tested-awaiting-fixes', 'nil', 'start-code-review', 'code-review-failed', 'hold-pending']
    },
    'closed': {
        name: 'Closed',
        statuses: ['closed']
    }
};

// Get category for a status
function getStatusCategory(status) {
    for (const [categoryKey, category] of Object.entries(STATUS_CATEGORIES)) {
        if (category.statuses.includes(status)) {
            return categoryKey;
        }
    }
    return 'dev'; // Default to Dev if not found
}

// Get category display name
function getCategoryName(categoryKey) {
    return STATUS_CATEGORIES[categoryKey]?.name || categoryKey;
}

// State Management
const state = {
    currentWeekStart: null, // Will be initialized in DOMContentLoaded
    currentWeekTickets: [],
    nextWeekPlanTickets: [],
    ticketPool: [], // Pool of imported tickets not yet assigned to a week
    editingTicket: null,
    editingWeek: null,
    currentWeekCapacity: {}, // { testerName: { totalHours: number } }
    nextWeekCapacity: {}, // { testerName: { totalHours: number } }
    groupBy: {
        current: 'none',
        nextWeekPlan: 'none'
    },
    viewMode: {
        current: 'cards',
        nextWeekPlan: 'cards'
    },
    capacitySortOrder: {
        current: null, // null, 'asc', 'desc'
        nextWeekPlan: null
    }
};

// Utility Functions
function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    // Monday = 1, Sunday = 0
    // For weekdays (Mon-Fri): get current week's Monday
    // For weekend (Sat-Sun): still show current week (the week that just ended/is ending)
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function getCurrentViewWeek() {
    const today = new Date();
    const day = today.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Get the Monday of the current week
    const currentWeekMonday = getWeekStart(today);
    
    // For all days (weekdays and weekends), show current week as "next week" section
    // This means the "previous week" will be the week before, and "next week" will be current week
    return currentWeekMonday;
}

function formatDate(date) {
    const options = { month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function formatWeekRange(startDate) {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

function generateId() {
    return 'ticket_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function getStorageKey(weekStart, type) {
    const dateStr = weekStart.toISOString().split('T')[0];
    return `tickets_${type}_${dateStr}`;
}

function getFirebaseKey(weekStart, type) {
    const dateStr = weekStart.toISOString().split('T')[0];
    return `${type}_${dateStr.replace(/-/g, '_')}`;
}

// Firebase Database Functions
function saveToStorage() {
    const nextWeekStart = new Date(state.currentWeekStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    
    const currentWeekKey = getFirebaseKey(state.currentWeekStart, 'week');
    const nextWeekKey = getFirebaseKey(nextWeekStart, 'week');
    const currentCapacityKey = getFirebaseKey(state.currentWeekStart, 'capacity');
    const nextCapacityKey = getFirebaseKey(nextWeekStart, 'capacity');
    
    // Save to Firebase
    const updates = {};
    updates[`/tickets/${currentWeekKey}`] = state.currentWeekTickets;
    updates[`/tickets/${nextWeekKey}`] = state.nextWeekPlanTickets;
    updates[`/capacity/${currentCapacityKey}`] = state.currentWeekCapacity;
    updates[`/capacity/${nextCapacityKey}`] = state.nextWeekCapacity;
    updates[`/ticketPool`] = state.ticketPool.length > 0 ? state.ticketPool : null;
    
    console.log('Attempting to save updates:', Object.keys(updates));
    console.log('Ticket pool to save:', state.ticketPool);
    
    database.ref().update(updates)
        .then(() => {
            console.log('Data saved successfully. Pool has', state.ticketPool.length, 'tickets');
        })
        .catch(error => {
            console.error('Error saving to Firebase:', error);
            showToast('Error saving data. Please try again.', 'error');
        });
    
    // Also try saving ticket pool separately to ensure it works
    database.ref('/ticketPool').set(state.ticketPool.length > 0 ? state.ticketPool : null)
        .then(() => console.log('Ticket pool saved separately'))
        .catch(err => console.error('Error saving ticket pool separately:', err));
    
    // Save view preferences locally (these are user-specific)
    localStorage.setItem('viewPreferences', JSON.stringify({
        viewMode: state.viewMode,
        groupBy: state.groupBy
    }));
}

function loadFromStorage() {
    const nextWeekStart = new Date(state.currentWeekStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    
    const currentWeekKey = getFirebaseKey(state.currentWeekStart, 'week');
    const nextWeekKey = getFirebaseKey(nextWeekStart, 'week');
    const currentCapacityKey = getFirebaseKey(state.currentWeekStart, 'capacity');
    const nextCapacityKey = getFirebaseKey(nextWeekStart, 'capacity');
    
    // Load view preferences from localStorage (user-specific)
    const viewPreferences = localStorage.getItem('viewPreferences');
    if (viewPreferences) {
        const prefs = JSON.parse(viewPreferences);
        if (prefs.viewMode) {
            state.viewMode = prefs.viewMode;
        }
        if (prefs.groupBy) {
            state.groupBy = prefs.groupBy;
        }
    }
    
    // Load data from Firebase
    Promise.all([
        database.ref(`/tickets/${currentWeekKey}`).once('value'),
        database.ref(`/tickets/${nextWeekKey}`).once('value'),
        database.ref(`/capacity/${currentCapacityKey}`).once('value'),
        database.ref(`/capacity/${nextCapacityKey}`).once('value'),
        database.ref(`/ticketPool`).once('value')
    ]).then(([currentSnap, nextSnap, currentCapSnap, nextCapSnap, poolSnap]) => {
        console.log('=== LOADING DATA FROM FIREBASE ===');
        state.currentWeekTickets = currentSnap.val() || [];
        state.nextWeekPlanTickets = nextSnap.val() || [];
        state.currentWeekCapacity = currentCapSnap.val() || {};
        state.nextWeekCapacity = nextCapSnap.val() || {};
        
        // Firebase returns object with numeric keys for arrays, convert back to array
        const poolData = poolSnap.val();
        console.log('Raw pool data from Firebase:', poolData);
        console.log('Pool data type:', typeof poolData);
        
        if (poolData && typeof poolData === 'object' && !Array.isArray(poolData)) {
            state.ticketPool = Object.values(poolData);
            console.log('Converted object to array');
        } else if (Array.isArray(poolData)) {
            state.ticketPool = poolData;
            console.log('Pool data was already an array');
        } else {
            state.ticketPool = [];
            console.log('Pool data was null/empty, using empty array');
        }
        console.log('Loaded ticket pool with', state.ticketPool.length, 'tickets');
        
        // Initialize capacity for all testers if not present
        TESTERS.forEach(tester => {
            if (!state.currentWeekCapacity[tester]) {
                state.currentWeekCapacity[tester] = { totalHours: 40 };
            }
            if (!state.nextWeekCapacity[tester]) {
                state.nextWeekCapacity[tester] = { totalHours: 40 };
            }
        });
        
        // Re-render after loading
        updateWeekDates();
        updateViewButtons();
        renderTickets();
        renderTicketPool();
    }).catch(error => {
        console.error('Error loading from Firebase:', error);
        showToast('Error loading data. Please refresh the page.', 'error');
        
        // Initialize with empty data
        state.currentWeekTickets = [];
        state.nextWeekPlanTickets = [];
        state.ticketPool = [];
        initializeCapacity();
        renderTickets();
        renderTicketPool();
    });
}

function initializeCapacity() {
    TESTERS.forEach(tester => {
        if (!state.currentWeekCapacity[tester]) {
            state.currentWeekCapacity[tester] = { totalHours: 40 };
        }
        if (!state.nextWeekCapacity[tester]) {
            state.nextWeekCapacity[tester] = { totalHours: 40 };
        }
    });
}

// Set up real-time listeners for Firebase
function setupRealtimeListeners() {
    const nextWeekStart = new Date(state.currentWeekStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    
    const currentWeekKey = getFirebaseKey(state.currentWeekStart, 'week');
    const nextWeekKey = getFirebaseKey(nextWeekStart, 'week');
    const currentCapacityKey = getFirebaseKey(state.currentWeekStart, 'capacity');
    const nextCapacityKey = getFirebaseKey(nextWeekStart, 'capacity');
    
    // Remove existing listeners
    database.ref(`/tickets/${currentWeekKey}`).off();
    database.ref(`/tickets/${nextWeekKey}`).off();
    database.ref(`/capacity/${currentCapacityKey}`).off();
    database.ref(`/capacity/${nextCapacityKey}`).off();
    
    // Set up new listeners
    database.ref(`/tickets/${currentWeekKey}`).on('value', (snapshot) => {
        state.currentWeekTickets = snapshot.val() || [];
        renderTickets();
    });
    
    database.ref(`/tickets/${nextWeekKey}`).on('value', (snapshot) => {
        state.nextWeekPlanTickets = snapshot.val() || [];
        renderTickets();
    });
    
    database.ref(`/capacity/${currentCapacityKey}`).on('value', (snapshot) => {
        state.currentWeekCapacity = snapshot.val() || {};
        initializeCapacity();
        // Only re-render if user is not currently editing
        if (!activeHoursInputTester) {
            renderTesterCapacity();
            updateStats();
        }
    });
    
    database.ref(`/capacity/${nextCapacityKey}`).on('value', (snapshot) => {
        state.nextWeekCapacity = snapshot.val() || {};
        initializeCapacity();
        // Only re-render if user is not currently editing
        if (!activeHoursInputTester) {
            renderTesterCapacity();
            updateStats();
        }
    });
}

// DOM Elements
const elements = {
    currentWeekDisplay: document.getElementById('currentWeekDisplay'),
    nextWeekDate: document.getElementById('nextWeekDate'),
    nextWeekPlanDate: document.getElementById('nextWeekPlanDate'),
    nextWeekTickets: document.getElementById('nextWeekTickets'),
    nextWeekPlanTicketsContainer: document.getElementById('nextWeekPlanTicketsContainer'),
    
    // Stats - Current Week
    nextTotalTickets: document.getElementById('nextTotalTickets'),
    nextTotalHours: document.getElementById('nextTotalHours'),
    nextCarriedHours: document.getElementById('nextCarriedHours'),
    
    // Stats - Next Week Plan
    nextWeekPlanTickets: document.getElementById('nextWeekPlanTickets'),
    nextWeekPlanHours: document.getElementById('nextWeekPlanHours'),
    
    // Bleed Over (Top)
    bleedOverSection: document.getElementById('bleedOverSectionTop'),
    bleedOverCount: document.getElementById('bleedOverCountTop'),
    bleedOverHours: document.getElementById('bleedOverHoursTop'),
    bleedOverBtn: document.getElementById('bleedOverBtnTop'),
    
    // Modals
    ticketModal: document.getElementById('ticketModal'),
    confirmModal: document.getElementById('confirmModal'),
    ticketForm: document.getElementById('ticketForm'),
    modalTitle: document.getElementById('modalTitle'),
    confirmDetails: document.getElementById('confirmDetails'),
    
    // Form Fields
    ticketId: document.getElementById('ticketId'),
    ticketName: document.getElementById('ticketName'),
    testerName: document.getElementById('testerName'),
    estimatedHours: document.getElementById('estimatedHours'),
    actualHours: document.getElementById('actualHours'),
    ticketStatus: document.getElementById('ticketStatus'),
    ticketPriority: document.getElementById('ticketPriority'),
    ticketWeek: document.getElementById('ticketWeek'),
    editTicketIndex: document.getElementById('editTicketIndex'),
    
    // Navigation
    prevWeekBtn: document.getElementById('prevWeekBtn'),
    nextWeekBtn: document.getElementById('nextWeekBtn')
};

// Render Functions
function renderTicketCard(ticket, week, index) {
    const remainingHours = Math.max(0, ticket.estimatedHours - ticket.actualHours);
    const progress = ticket.estimatedHours > 0 
        ? Math.min(100, (ticket.actualHours / ticket.estimatedHours) * 100) 
        : 0;
    
    const statusClass = ticket.status.replace(' ', '-');
    const priorityClass = `priority-${ticket.priority}`;
    const carriedClass = ticket.carriedOver ? 'carried-over' : '';
    const carriedToNextClass = ticket.carriedToNextWeek ? 'carried-to-next' : '';
    
    // Apply search highlighting if search is active
    const ticketIdDisplay = searchTerm ? highlightSearchTermInText(ticket.ticketId) : escapeHtml(ticket.ticketId);
    const ticketNameDisplay = searchTerm ? highlightSearchTermInText(ticket.name) : escapeHtml(ticket.name);
    const ticketTesterDisplay = searchTerm ? highlightSearchTermInText(ticket.tester) : escapeHtml(ticket.tester);
    
    // Check if ticket has today's plan
    const hasTodayPlan = ticket.dailyPlans && ticket.dailyPlans.some(p => {
        const planDate = new Date(p.date).toDateString();
        const today = new Date().toDateString();
        return planDate === today && p.type === 'plan';
    });
    
    return `
        <div class="ticket-card clickable ${statusClass} ${priorityClass} ${carriedClass} ${carriedToNextClass}" data-index="${index}" data-week="${week}" onclick="handleTicketCardClick(event, '${week}', ${index})">
            <div class="ticket-header">
                <span class="ticket-id">${ticketIdDisplay}</span>
                ${hasTodayPlan ? `
                    <span class="daily-plan-badge" title="Has today's plan">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 6v6l4 2"/>
                        </svg>
                        Today
                    </span>
                ` : ''}
                <div class="ticket-actions">
                    ${week === 'current' && !ticket.carriedToNextWeek ? `
                    <button class="ticket-action-btn move" onclick="event.stopPropagation(); moveTicket('${week}', ${index})" title="Copy to Next Week">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </button>
                    ` : ''}
                    <button class="ticket-action-btn edit" onclick="event.stopPropagation(); editTicket('${week}', ${index})" title="Edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="ticket-action-btn delete" onclick="event.stopPropagation(); deleteTicket('${week}', ${index})" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="ticket-name">${ticketNameDisplay}</div>
            <div class="ticket-meta">
                <span class="ticket-tester">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                    </svg>
                    ${ticketTesterDisplay}
                </span>
                <span class="ticket-hours">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 6v6l4 2"/>
                    </svg>
                    <span class="actual">${ticket.actualHours}h</span> / 
                    <span>${ticket.estimatedHours}h</span>
                    ${remainingHours > 0 && ticket.status !== 'completed' && !ticket.carriedToNextWeek ? `<span class="remaining">(${remainingHours}h left)</span>` : ''}
                </span>
                ${ticket.carriedOver ? `
                    <span class="carried-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M13 5l7 7-7 7M5 12h14"/>
                        </svg>
                        Carried Over
                    </span>
                ` : ''}
                ${ticket.carriedToNextWeek ? `
                    <span class="carried-to-next-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                        → Next Week
                    </span>
                ` : ''}
                ${ticket.reestimationNote ? `
                    <span class="reestimated-badge" title="${escapeHtml(ticket.reestimationNote)}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 9v2m0 4h.01"/>
                        </svg>
                        Reestimated
                    </span>
                ` : ''}
                <span class="ticket-status ${statusClass}">${formatStatus(ticket.status)}</span>
            </div>
            <div class="ticket-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress}%"></div>
                </div>
            </div>
        </div>
    `;
}

function formatStatus(status) {
    return status.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderEmptyState() {
    return `
        <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
                <rect x="9" y="3" width="6" height="4" rx="2"/>
                <path d="M9 14l2 2 4-4"/>
            </svg>
            <p>No tickets yet. Add one to get started!</p>
        </div>
    `;
}

function renderTickets() {
    // Filter tickets by search term
    const filteredCurrentWeekTickets = filterTicketsBySearchTerm(state.currentWeekTickets);
    const filteredNextWeekPlanTickets = filterTicketsBySearchTerm(state.nextWeekPlanTickets);
    
    // Current week tickets
    let currentWeekHtml = '';
    if (searchTerm) {
        currentWeekHtml = getSearchResultsInfo(filteredCurrentWeekTickets.length, state.currentWeekTickets.length, 'Current Week');
    }
    
    if (state.currentWeekTickets.length === 0) {
        elements.nextWeekTickets.innerHTML = renderEmptyState();
        elements.nextWeekTickets.classList.remove('grouped');
    } else if (filteredCurrentWeekTickets.length === 0 && searchTerm) {
        elements.nextWeekTickets.innerHTML = currentWeekHtml + renderNoSearchResults();
        elements.nextWeekTickets.classList.remove('grouped');
    } else {
        renderTicketsByGroup(filteredCurrentWeekTickets, 'current', elements.nextWeekTickets, currentWeekHtml);
    }
    
    // Next week plan tickets
    let nextWeekHtml = '';
    if (searchTerm) {
        nextWeekHtml = getSearchResultsInfo(filteredNextWeekPlanTickets.length, state.nextWeekPlanTickets.length, 'Next Week');
    }
    
    if (state.nextWeekPlanTickets.length === 0) {
        elements.nextWeekPlanTicketsContainer.innerHTML = renderEmptyState();
        elements.nextWeekPlanTicketsContainer.classList.remove('grouped');
    } else if (filteredNextWeekPlanTickets.length === 0 && searchTerm) {
        elements.nextWeekPlanTicketsContainer.innerHTML = nextWeekHtml + renderNoSearchResults();
        elements.nextWeekPlanTicketsContainer.classList.remove('grouped');
    } else {
        renderTicketsByGroup(filteredNextWeekPlanTickets, 'nextWeekPlan', elements.nextWeekPlanTicketsContainer, nextWeekHtml);
    }
    
    updateStats();
    updateBleedOverSection();
    renderTesterCapacity();
    renderReestimationNotes();
}

function renderNoSearchResults() {
    return `
        <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
            </svg>
            <p>No tickets match your search.</p>
        </div>
    `;
}

function renderReestimationNotes() {
    // Render current week reestimation notes
    const currentWeekNotesContainer = document.getElementById('currentWeekReestimationNotes');
    const currentWeekReestimatedTickets = state.currentWeekTickets.filter(t => t.reestimationNote);
    
    if (currentWeekReestimatedTickets.length > 0) {
        currentWeekNotesContainer.innerHTML = `
            <div class="reestimation-notes-header">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <span>Reestimation Notes (${currentWeekReestimatedTickets.length})</span>
            </div>
            <div class="reestimation-notes-list">
                ${currentWeekReestimatedTickets.map(ticket => `
                    <div class="reestimation-note-item">
                        <div class="reestimation-note-ticket">
                            <span class="reestimation-note-id">${escapeHtml(ticket.ticketId)}</span>
                            <span class="reestimation-note-name">${escapeHtml(ticket.name)}</span>
                            <span class="reestimation-note-tester">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                                    <circle cx="12" cy="7" r="4"/>
                                </svg>
                                ${escapeHtml(ticket.tester)}
                            </span>
                        </div>
                        <div class="reestimation-note-text">${escapeHtml(ticket.reestimationNote)}</div>
                    </div>
                `).join('')}
            </div>
        `;
        currentWeekNotesContainer.style.display = 'block';
    } else {
        currentWeekNotesContainer.style.display = 'none';
    }
    
    // Render next week reestimation notes
    const nextWeekNotesContainer = document.getElementById('nextWeekReestimationNotes');
    const nextWeekReestimatedTickets = state.nextWeekPlanTickets.filter(t => t.reestimationNote);
    
    if (nextWeekReestimatedTickets.length > 0) {
        nextWeekNotesContainer.innerHTML = `
            <div class="reestimation-notes-header">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <span>Reestimation Notes (${nextWeekReestimatedTickets.length})</span>
            </div>
            <div class="reestimation-notes-list">
                ${nextWeekReestimatedTickets.map(ticket => `
                    <div class="reestimation-note-item">
                        <div class="reestimation-note-ticket">
                            <span class="reestimation-note-id">${escapeHtml(ticket.ticketId)}</span>
                            <span class="reestimation-note-name">${escapeHtml(ticket.name)}</span>
                            <span class="reestimation-note-tester">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                                    <circle cx="12" cy="7" r="4"/>
                                </svg>
                                ${escapeHtml(ticket.tester)}
                            </span>
                        </div>
                        <div class="reestimation-note-text">${escapeHtml(ticket.reestimationNote)}</div>
                    </div>
                `).join('')}
            </div>
        `;
        nextWeekNotesContainer.style.display = 'block';
    } else {
        nextWeekNotesContainer.style.display = 'none';
    }
}

function renderTicketsByGroup(tickets, weekType, container, prefixHtml = '') {
    const groupBy = state.groupBy[weekType] || 'none';
    const viewMode = state.viewMode[weekType] || 'cards';
    
    // We need to find the original index for each ticket in the full array
    const fullTickets = weekType === 'current' ? state.currentWeekTickets : state.nextWeekPlanTickets;
    
    // Handle swim lanes view
    if (viewMode === 'swimlanes') {
        container.classList.remove('grouped');
        container.classList.add('swimlanes');
        renderSwimLanes(tickets, weekType, container, groupBy, prefixHtml);
        return;
    }
    
    container.classList.remove('swimlanes');
    
    if (groupBy === 'none') {
        container.classList.remove('grouped');
        container.innerHTML = prefixHtml + tickets
            .map((ticket) => {
                const originalIndex = fullTickets.findIndex(t => t.id === ticket.id);
                return renderTicketCard(ticket, weekType === 'current' ? 'current' : 'nextWeekPlan', originalIndex);
            })
            .join('');
        return;
    }
    
    container.classList.add('grouped');
    
    // Group tickets
    const groups = {};
    tickets.forEach((ticket) => {
        let groupKey;
        if (groupBy === 'status') {
            groupKey = ticket.status;
        } else if (groupBy === 'category') {
            groupKey = getStatusCategory(ticket.status);
        } else if (groupBy === 'tester') {
            groupKey = ticket.tester;
        } else if (groupBy === 'priority') {
            groupKey = ticket.priority;
        }
        
        if (!groups[groupKey]) {
            groups[groupKey] = [];
        }
        const originalIndex = fullTickets.findIndex(t => t.id === ticket.id);
        groups[groupKey].push({ ticket, index: originalIndex });
    });
    
    // Sort groups
    let sortedKeys = Object.keys(groups);
    if (groupBy === 'priority') {
        const priorityOrder = ['critical', 'high', 'medium', 'low'];
        sortedKeys.sort((a, b) => priorityOrder.indexOf(a) - priorityOrder.indexOf(b));
    } else if (groupBy === 'status') {
        const statusOrder = ['in-progress', 'start-code-review', 'qc-testing', 'qc-testing-in-progress', 'testing-in-progress', 'bis-testing', 'qc-testing-hold', 'qc-review-fail', 'code-review-failed', 'tested-awaiting-fixes', 'hold-pending', 'approved-for-live', 'moved-to-live', 'closed', 'nil'];
        sortedKeys.sort((a, b) => statusOrder.indexOf(a) - statusOrder.indexOf(b));
    } else if (groupBy === 'category') {
        const categoryOrder = ['qa-india', 'bis-qa', 'dev', 'closed'];
        sortedKeys.sort((a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b));
    } else {
        sortedKeys.sort();
    }
    
    // Render groups
    let html = prefixHtml;
    sortedKeys.forEach(key => {
        const groupTickets = groups[key];
        const totalHours = groupTickets.reduce((sum, item) => sum + item.ticket.estimatedHours, 0);
        
        let headerClass = '';
        let displayName = key;
        
        if (groupBy === 'status') {
            headerClass = `status-${key}`;
            displayName = formatStatus(key);
        } else if (groupBy === 'category') {
            headerClass = `category-${key}`;
            displayName = getCategoryName(key);
        } else if (groupBy === 'priority') {
            headerClass = `priority-${key}`;
            displayName = key.charAt(0).toUpperCase() + key.slice(1) + ' Priority';
        }
        
        html += `
            <div class="ticket-group">
                <div class="ticket-group-header ${headerClass}">
                    <span class="ticket-group-title">${escapeHtml(displayName)}</span>
                    <span class="ticket-group-count">${groupTickets.length} ticket${groupTickets.length !== 1 ? 's' : ''}</span>
                    <span class="ticket-group-hours">${totalHours}h</span>
                </div>
                <div class="ticket-group-cards">
                    ${groupTickets.map(item => renderTicketCard(item.ticket, weekType === 'current' ? 'current' : 'nextWeekPlan', item.index)).join('')}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function renderSwimLanes(tickets, weekType, container, groupBy, prefixHtml = '') {
    // We need to find the original index for each ticket in the full array
    const fullTickets = weekType === 'current' ? state.currentWeekTickets : state.nextWeekPlanTickets;
    
    // Determine lanes based on groupBy
    let lanes = [];
    let laneType = groupBy;
    
    if (groupBy === 'none' || groupBy === 'status') {
        laneType = 'status';
        lanes = [
            { key: 'nil', name: 'Nil' },
            { key: 'in-progress', name: 'In Progress' },
            { key: 'start-code-review', name: 'Start Code Review' },
            { key: 'qc-testing', name: 'QC Testing' },
            { key: 'qc-testing-in-progress', name: 'QC Testing In Progress' },
            { key: 'qc-testing-hold', name: 'QC Testing Hold' },
            { key: 'qc-review-fail', name: 'QC Review Fail' },
            { key: 'code-review-failed', name: 'Code Review Failed' },
            { key: 'testing-in-progress', name: 'Testing In Progress' },
            { key: 'tested-awaiting-fixes', name: 'Tested - Awaiting Fixes' },
            { key: 'hold-pending', name: 'Hold/Pending' },
            { key: 'bis-testing', name: 'BIS Testing' },
            { key: 'approved-for-live', name: 'Approved for Live' },
            { key: 'moved-to-live', name: 'Moved to Live' },
            { key: 'closed', name: 'Closed' }
        ];
    } else if (groupBy === 'category') {
        laneType = 'category';
        lanes = [
            { key: 'qa-india', name: 'QA (India)' },
            { key: 'bis-qa', name: 'BIS QA' },
            { key: 'dev', name: 'Dev' },
            { key: 'closed', name: 'Closed' }
        ];
    } else if (groupBy === 'tester') {
        laneType = 'tester';
        lanes = TESTERS.map(t => ({ key: t, name: t }));
    } else if (groupBy === 'priority') {
        laneType = 'priority';
        lanes = [
            { key: 'critical', name: 'Critical' },
            { key: 'high', name: 'High' },
            { key: 'medium', name: 'Medium' },
            { key: 'low', name: 'Low' }
        ];
    }
    
    // Group tickets by lane
    const ticketsByLane = {};
    lanes.forEach(lane => {
        ticketsByLane[lane.key] = [];
    });
    
    tickets.forEach((ticket) => {
        let laneKey;
        if (laneType === 'status') {
            laneKey = ticket.status;
        } else if (laneType === 'category') {
            laneKey = getStatusCategory(ticket.status);
        } else if (laneType === 'tester') {
            laneKey = ticket.tester;
        } else if (laneType === 'priority') {
            laneKey = ticket.priority;
        }
        
        if (ticketsByLane[laneKey]) {
            const originalIndex = fullTickets.findIndex(t => t.id === ticket.id);
            ticketsByLane[laneKey].push({ ticket, index: originalIndex });
        }
    });
    
    // Render swim lanes as vertical columns
    let html = prefixHtml ? `<div class="swimlanes-search-info">${prefixHtml}</div>` : '';
    html += '<div class="swimlanes-wrapper">';
    lanes.forEach(lane => {
        const laneTickets = ticketsByLane[lane.key] || [];
        const totalHours = laneTickets.reduce((sum, item) => sum + item.ticket.estimatedHours, 0);
        
        let indicatorClass = '';
        if (laneType === 'status') {
            indicatorClass = `status-${lane.key}`;
        } else if (laneType === 'category') {
            indicatorClass = `category-${lane.key}`;
        } else if (laneType === 'priority') {
            indicatorClass = `priority-${lane.key}`;
        } else if (laneType === 'tester') {
            indicatorClass = 'tester';
        }
        
        // Hide empty lanes during search
        const hideEmpty = searchTerm && laneTickets.length === 0;
        
        if (!hideEmpty) {
            html += `
                <div class="swimlane">
                    <div class="swimlane-header">
                        <div class="swimlane-indicator ${indicatorClass}"></div>
                        <div class="swimlane-header-info">
                            <span class="swimlane-title">${escapeHtml(lane.name)}</span>
                            <span class="swimlane-count">${laneTickets.length}</span>
                        </div>
                        <div class="swimlane-hours">${totalHours}h total</div>
                    </div>
                    <div class="swimlane-cards">
                        ${laneTickets.length > 0 
                            ? laneTickets.map(item => renderTicketCard(item.ticket, weekType === 'current' ? 'current' : 'nextWeekPlan', item.index)).join('')
                            : '<div class="swimlane-empty">No tickets</div>'
                        }
                    </div>
                </div>
            `;
        }
    });
    html += '</div>';
    
    container.innerHTML = html;
}

// Tester Capacity Functions
function calculateTesterPlannedHours(testerName, weekType) {
    const tickets = weekType === 'current' ? state.currentWeekTickets : state.nextWeekPlanTickets;
    return tickets
        .filter(ticket => ticket.tester === testerName)
        .reduce((sum, ticket) => sum + ticket.estimatedHours, 0);
}

function getInitials(name) {
    return name.split(' ')
        .map(word => word.charAt(0))
        .join('')
        .substring(0, 2)
        .toUpperCase();
}

function renderTesterCapacity() {
    // Render current week capacity
    renderWeekCapacity('current', 'currentWeekCapacityTableBody', state.currentWeekCapacity);
    
    // Render next week capacity
    renderWeekCapacity('nextWeekPlan', 'nextWeekCapacityTableBody', state.nextWeekCapacity);
}

// Track which input is currently being edited to prevent re-render issues
let activeHoursInputTester = null;
let activeHoursInputWeek = null;

function renderWeekCapacity(weekType, tableBodyId, capacityData) {
    const tableBody = document.getElementById(tableBodyId);
    if (!tableBody) return;
    
    // Check if user is currently editing an input in this table - don't re-render if so
    if (activeHoursInputWeek === weekType && activeHoursInputTester) {
        // User is editing, don't re-render the table at all
        return;
    }
    
    const activeInput = tableBody.querySelector('.tester-total-hours:focus');
    if (activeInput) {
        // User is editing, don't re-render the table
        return;
    }
    
    // Calculate data for all testers
    let testerData = TESTERS.map(tester => {
        const totalHours = capacityData[tester]?.totalHours ?? 40;
        const plannedHours = calculateTesterPlannedHours(tester, weekType);
        const unplannedHours = totalHours - plannedHours;
        const percentage = totalHours > 0 ? Math.min((plannedHours / totalHours) * 100, 100) : 0;
        
        let statusClass = 'under';
        if (plannedHours > totalHours) {
            statusClass = 'over';
        } else if (plannedHours === totalHours) {
            statusClass = 'exact';
        }
        
        return {
            tester,
            totalHours,
            plannedHours,
            unplannedHours,
            percentage,
            statusClass
        };
    });
    
    // Apply sorting if set
    const sortOrder = state.capacitySortOrder[weekType];
    if (sortOrder) {
        testerData.sort((a, b) => {
            if (sortOrder === 'asc') {
                return a.unplannedHours - b.unplannedHours;
            } else {
                return b.unplannedHours - a.unplannedHours;
            }
        });
    }
    
    const testerRows = testerData.map(data => {
        return `
            <tr data-tester="${escapeHtml(data.tester)}">
                <td>
                    <div class="tester-info">
                        <div class="tester-avatar">${getInitials(data.tester)}</div>
                        <span class="tester-name">${escapeHtml(data.tester)}</span>
                    </div>
                </td>
                <td>
                    <input type="text" 
                           class="hours-input tester-total-hours" 
                           data-tester="${escapeHtml(data.tester)}"
                           data-week="${weekType}"
                           data-original="${data.totalHours}"
                           value="${data.totalHours}" 
                           placeholder="0"
                           autocomplete="off"
                           spellcheck="false">
                </td>
                <td>
                    <span class="planned-hours ${data.statusClass}">${data.plannedHours}h</span>
                </td>
                <td>
                    <span class="unplanned-hours ${data.unplannedHours >= 0 ? 'positive' : 'negative'}">
                        ${data.unplannedHours >= 0 ? '+' + data.unplannedHours + 'h' : data.unplannedHours + 'h'}
                    </span>
                </td>
                <td>
                    <div class="capacity-bar-cell">
                        <div class="capacity-bar-bg">
                            ${data.percentage > 0 ? `<div class="capacity-bar-fill ${data.statusClass}" style="width: ${data.percentage}%"></div>` : ''}
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    tableBody.innerHTML = testerRows;
    
    // Add event listeners to total hours inputs
    tableBody.querySelectorAll('.tester-total-hours').forEach(input => {
        // Track when input is focused to prevent re-renders
        input.addEventListener('focus', (e) => {
            activeHoursInputTester = e.target.dataset.tester;
            activeHoursInputWeek = e.target.dataset.week;
            // Select all text for easy editing
            setTimeout(() => {
                e.target.select();
            }, 0);
        });
        
        // Save on blur (when user clicks away)
        input.addEventListener('blur', (e) => {
            // Clear the active input tracking
            activeHoursInputTester = null;
            activeHoursInputWeek = null;
            // Handle the value change
            handleTesterHoursBlur(e);
        });
        
        // Save on Enter key
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.target.blur();
            }
        });
        
        // Only allow numbers and decimal point - filter on input
        input.addEventListener('input', (e) => {
            let value = e.target.value;
            // Allow only digits and one decimal point
            value = value.replace(/[^0-9.]/g, '');
            // Ensure only one decimal point
            const parts = value.split('.');
            if (parts.length > 2) {
                value = parts[0] + '.' + parts.slice(1).join('');
            }
            // Don't update if nothing changed (prevents cursor issues)
            if (e.target.value !== value) {
                e.target.value = value;
            }
        });
    });
    
    // Update sort header icons
    updateSortHeaderIcons(weekType);
}

function updateCapacityDisplayOnly(weekType, tableBody, capacityData) {
    // Update only the display cells, not the input fields
    TESTERS.forEach(tester => {
        const row = tableBody.querySelector(`tr[data-tester="${tester}"]`);
        if (!row) return;
        
        const totalHours = capacityData[tester]?.totalHours ?? 40;
        const plannedHours = calculateTesterPlannedHours(tester, weekType);
        const unplannedHours = totalHours - plannedHours;
        const percentage = totalHours > 0 ? Math.min((plannedHours / totalHours) * 100, 100) : 0;
        
        let statusClass = 'under';
        if (plannedHours > totalHours) {
            statusClass = 'over';
        } else if (plannedHours === totalHours) {
            statusClass = 'exact';
        }
        
        // Update planned hours
        const plannedEl = row.querySelector('.planned-hours');
        if (plannedEl) {
            plannedEl.className = `planned-hours ${statusClass}`;
            plannedEl.textContent = `${plannedHours}h`;
        }
        
        // Update unplanned hours
        const unplannedEl = row.querySelector('.unplanned-hours');
        if (unplannedEl) {
            unplannedEl.className = `unplanned-hours ${unplannedHours >= 0 ? 'positive' : 'negative'}`;
            unplannedEl.textContent = unplannedHours >= 0 ? `+${unplannedHours}h` : `${unplannedHours}h`;
        }
        
        // Update capacity bar
        const barFill = row.querySelector('.capacity-bar-fill');
        const barBg = row.querySelector('.capacity-bar-bg');
        if (barBg) {
            if (percentage > 0) {
                if (barFill) {
                    barFill.className = `capacity-bar-fill ${statusClass}`;
                    barFill.style.width = `${percentage}%`;
                } else {
                    barBg.innerHTML = `<div class="capacity-bar-fill ${statusClass}" style="width: ${percentage}%"></div>`;
                }
            } else if (barFill) {
                barFill.remove();
            }
        }
    });
}

function updateSortHeaderIcons(weekType) {
    const sortOrder = state.capacitySortOrder[weekType];
    const header = document.querySelector(`.sortable-header[data-week="${weekType}"]`);
    
    if (header) {
        header.classList.remove('sort-asc', 'sort-desc');
        if (sortOrder === 'asc') {
            header.classList.add('sort-asc');
        } else if (sortOrder === 'desc') {
            header.classList.add('sort-desc');
        }
    }
}

function toggleCapacitySort(weekType) {
    const currentOrder = state.capacitySortOrder[weekType];
    
    if (currentOrder === null) {
        state.capacitySortOrder[weekType] = 'asc';
    } else if (currentOrder === 'asc') {
        state.capacitySortOrder[weekType] = 'desc';
    } else {
        state.capacitySortOrder[weekType] = null;
    }
    
    renderTesterCapacity();
}

function handleTesterHoursBlur(e) {
    const tester = e.target.dataset.tester;
    const weekType = e.target.dataset.week;
    const originalValue = parseFloat(e.target.dataset.original) || 40;
    let inputValue = e.target.value.trim();
    
    // Parse the input value - treat empty as 0
    let hours;
    if (inputValue === '') {
        hours = 0;
    } else {
        hours = parseFloat(inputValue);
    }
    
    // If invalid (NaN), revert to original value
    if (isNaN(hours)) {
        hours = originalValue;
    }
    
    // Ensure non-negative
    if (hours < 0) {
        hours = 0;
    }
    
    // Update the display
    e.target.value = hours;
    
    const capacityData = weekType === 'current' ? state.currentWeekCapacity : state.nextWeekCapacity;
    
    if (!capacityData[tester]) {
        capacityData[tester] = {};
    }
    
    // Only save and re-render if value actually changed
    const previousValue = capacityData[tester].totalHours ?? 40;
    if (previousValue !== hours) {
        capacityData[tester].totalHours = hours;
        
        // Update the data-original attribute for next edit
        e.target.dataset.original = hours;
        
        // Save to Firebase
        saveToStorage();
        
        // Use setTimeout to allow the blur to complete before re-rendering
        setTimeout(() => {
            renderTesterCapacity();
            updateStats();
        }, 100);
        
        showToast(`${tester}'s capacity updated to ${hours}h`, 'success');
    }
}

function updateStats() {
    // Current week stats
    const currentStats = calculateStats(state.currentWeekTickets);
    const carriedHours = state.currentWeekTickets
        .filter(t => t.carriedOver)
        .reduce((sum, t) => sum + t.estimatedHours, 0);
    
    // Calculate total unplanned hours for current week
    const currentTotalCapacity = TESTERS.reduce((sum, tester) => {
        return sum + (state.currentWeekCapacity[tester]?.totalHours || 40);
    }, 0);
    const currentUnplannedHours = currentTotalCapacity - currentStats.totalHours;
    
    elements.nextTotalTickets.textContent = state.currentWeekTickets.length;
    elements.nextTotalHours.textContent = `${currentStats.totalHours}h`;
    elements.nextCarriedHours.textContent = `${carriedHours}h`;
    
    const nextUnplannedEl = document.getElementById('nextUnplannedHours');
    if (nextUnplannedEl) {
        nextUnplannedEl.textContent = `${currentUnplannedHours}h`;
        nextUnplannedEl.parentElement.classList.toggle('negative', currentUnplannedHours < 0);
    }
    
    // Next week plan stats
    const nextPlanStats = calculateStats(state.nextWeekPlanTickets);
    
    // Calculate total unplanned hours for next week
    const nextTotalCapacity = TESTERS.reduce((sum, tester) => {
        return sum + (state.nextWeekCapacity[tester]?.totalHours || 40);
    }, 0);
    const nextUnplannedHours = nextTotalCapacity - nextPlanStats.totalHours;
    
    elements.nextWeekPlanTickets.textContent = state.nextWeekPlanTickets.length;
    elements.nextWeekPlanHours.textContent = `${nextPlanStats.totalHours}h`;
    
    const nextWeekPlanUnplannedEl = document.getElementById('nextWeekPlanUnplannedHours');
    if (nextWeekPlanUnplannedEl) {
        nextWeekPlanUnplannedEl.textContent = `${nextUnplannedHours}h`;
        nextWeekPlanUnplannedEl.parentElement.classList.toggle('negative', nextUnplannedHours < 0);
    }
}

function calculateStats(tickets) {
    return tickets.reduce((stats, ticket) => {
        stats.totalHours += ticket.estimatedHours;
        stats.actualHours += ticket.actualHours;
        stats.remainingHours += Math.max(0, ticket.estimatedHours - ticket.actualHours);
        return stats;
    }, { totalHours: 0, actualHours: 0, remainingHours: 0 });
}

function updateBleedOverSection() {
    // Check for incomplete tasks in current week that can be transferred to next week
    // Exclude tasks that have already been carried to next week
    const incompleteTasks = state.currentWeekTickets.filter(ticket => 
        ticket.status !== 'closed' &&
        ticket.actualHours < ticket.estimatedHours &&
        !ticket.carriedToNextWeek
    );
    
    const totalRemainingHours = incompleteTasks.reduce((sum, ticket) => 
        sum + Math.max(0, ticket.estimatedHours - ticket.actualHours), 0
    );
    
    if (incompleteTasks.length > 0) {
        elements.bleedOverSection.classList.add('visible');
        elements.bleedOverCount.textContent = incompleteTasks.length;
        elements.bleedOverHours.textContent = `${totalRemainingHours}h`;
    } else {
        elements.bleedOverSection.classList.remove('visible');
    }
}

function updateWeekDates() {
    const nextWeekStart = new Date(state.currentWeekStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    
    elements.currentWeekDisplay.textContent = `Week of ${formatDate(state.currentWeekStart)}`;
    elements.nextWeekDate.textContent = formatWeekRange(state.currentWeekStart);
    elements.nextWeekPlanDate.textContent = formatWeekRange(nextWeekStart);
}

// Modal Functions
function openTicketModal(week, ticket = null, index = null) {
    state.editingWeek = week;
    state.editingTicket = index;
    
    if (ticket) {
        elements.modalTitle.textContent = 'Edit Ticket/Task';
        elements.ticketId.value = ticket.ticketId;
        elements.ticketName.value = ticket.name;
        elements.testerName.value = ticket.tester;
        elements.estimatedHours.value = ticket.estimatedHours;
        elements.actualHours.value = ticket.actualHours;
        elements.ticketStatus.value = ticket.status;
        elements.ticketPriority.value = ticket.priority;
    } else {
        elements.modalTitle.textContent = 'Add New Ticket/Task';
        elements.ticketForm.reset();
        elements.actualHours.value = 0;
    }
    
    elements.ticketWeek.value = week;
    elements.editTicketIndex.value = index !== null ? index : '';
    elements.ticketModal.classList.add('active');
}

function closeTicketModal() {
    elements.ticketModal.classList.remove('active');
    elements.ticketForm.reset();
    state.editingTicket = null;
    state.editingWeek = null;
}

function openConfirmModal() {
    const incompleteTasks = state.currentWeekTickets.filter(ticket => 
        ticket.status !== 'closed' &&
        ticket.actualHours < ticket.estimatedHours &&
        !ticket.carriedToNextWeek
    );
    
    elements.confirmDetails.innerHTML = incompleteTasks.map(ticket => {
        const remaining = Math.max(0, ticket.estimatedHours - ticket.actualHours);
        return `
            <div class="confirm-item">
                <span class="confirm-item-name">${escapeHtml(ticket.ticketId)} - ${escapeHtml(ticket.name)}</span>
                <span class="confirm-item-hours">${remaining}h remaining</span>
            </div>
        `;
    }).join('');
    
    elements.confirmModal.classList.add('active');
}

function closeConfirmModal() {
    elements.confirmModal.classList.remove('active');
}

function openReestimateModal(estimatedHours, actualHours) {
    document.getElementById('reestimateEstimated').textContent = estimatedHours;
    document.getElementById('reestimateActual').textContent = actualHours;
    document.getElementById('newEstimatedHours').value = actualHours;
    document.getElementById('reestimationReason').value = '';
    document.getElementById('reestimateModal').classList.add('active');
}

function closeReestimateModal() {
    document.getElementById('reestimateModal').classList.remove('active');
}

// Ticket Management Functions
function addTicket(ticketData, week, reestimationNote = null) {
    const ticket = {
        id: generateId(),
        ticketId: ticketData.ticketId,
        name: ticketData.name,
        tester: ticketData.tester,
        estimatedHours: parseFloat(ticketData.estimatedHours),
        actualHours: parseFloat(ticketData.actualHours) || 0,
        status: ticketData.status,
        priority: ticketData.priority,
        carriedOver: false,
        reestimationNote: reestimationNote,
        createdAt: new Date().toISOString()
    };
    
    if (week === 'current' || week === 'next') {
        state.currentWeekTickets.push(ticket);
    } else if (week === 'nextWeekPlan') {
        state.nextWeekPlanTickets.push(ticket);
    }
    
    saveToStorage();
    renderTickets();
    showToast('Ticket added successfully!', 'success');
}

function updateTicket(ticketData, week, index, reestimationNote = null) {
    const tickets = (week === 'current' || week === 'next') ? state.currentWeekTickets : state.nextWeekPlanTickets;
    
    if (tickets[index]) {
        const updatedTicket = {
            ...tickets[index],
            ticketId: ticketData.ticketId,
            name: ticketData.name,
            tester: ticketData.tester,
            estimatedHours: parseFloat(ticketData.estimatedHours),
            actualHours: parseFloat(ticketData.actualHours) || 0,
            status: ticketData.status,
            priority: ticketData.priority,
            updatedAt: new Date().toISOString()
        };
        
        if (reestimationNote) {
            updatedTicket.reestimationNote = reestimationNote;
        }
        
        tickets[index] = updatedTicket;
        
        saveToStorage();
        renderTickets();
        showToast('Ticket updated successfully!', 'success');
    }
}

window.editTicket = function(week, index) {
    const tickets = (week === 'current' || week === 'next') ? state.currentWeekTickets : state.nextWeekPlanTickets;
    const ticket = tickets[index];
    
    if (ticket) {
        openTicketModal(week, ticket, index);
    }
};

window.deleteTicket = function(week, index) {
    if (confirm('Are you sure you want to delete this ticket?')) {
        if (week === 'current' || week === 'next') {
            state.currentWeekTickets.splice(index, 1);
        } else if (week === 'nextWeekPlan') {
            state.nextWeekPlanTickets.splice(index, 1);
        }
        
        saveToStorage();
        renderTickets();
        showToast('Ticket deleted successfully!', 'info');
    }
};

window.moveTicket = function(week, index) {
    // Only allow moving from Current Week to Next Week
    if (week !== 'current') {
        showToast('Tickets can only be moved forward to Next Week', 'error');
        return;
    }
    
    const ticket = state.currentWeekTickets[index];
    if (!ticket) return;
    
    // Check if already carried to next week
    if (ticket.carriedToNextWeek) {
        showToast('This ticket has already been copied to Next Week', 'info');
        return;
    }
    
    // Calculate remaining hours (estimated - actual)
    const remainingHours = Math.max(0, ticket.estimatedHours - ticket.actualHours);
    
    // If no remaining hours, don't create a copy
    if (remainingHours <= 0) {
        showToast('No remaining hours to carry over. Ticket is complete!', 'info');
        return;
    }
    
    // Create a COPY of the ticket for Next Week with remaining hours
    const copiedTicket = {
        id: generateId(),
        ticketId: ticket.ticketId,
        name: ticket.name,
        tester: ticket.tester,
        estimatedHours: remainingHours, // Remaining hours become the new estimate
        actualHours: 0, // Reset actual hours for the new week
        status: 'nil', // Reset status for the new week
        priority: ticket.priority,
        carriedOver: true, // Mark as carried over from previous week
        carriedFromWeek: 'currentWeek',
        originalTicketId: ticket.id,
        createdAt: new Date().toISOString()
    };
    
    // Update the original ticket to mark it as carried (modify in place)
    state.currentWeekTickets[index] = {
        ...ticket,
        carriedToNextWeek: true
    };
    
    // Add copy to Next Week
    state.nextWeekPlanTickets.push(copiedTicket);
    
    // Save to Firebase - the realtime listeners will update the UI
    const nextWeekStart = new Date(state.currentWeekStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    
    const currentWeekKey = getFirebaseKey(state.currentWeekStart, 'week');
    const nextWeekKey = getFirebaseKey(nextWeekStart, 'week');
    
    const updates = {};
    updates[`/tickets/${currentWeekKey}`] = state.currentWeekTickets;
    updates[`/tickets/${nextWeekKey}`] = state.nextWeekPlanTickets;
    
    database.ref().update(updates).then(() => {
        showToast(`Ticket copied to Next Week with ${remainingHours}h remaining!`, 'success');
    }).catch(error => {
        console.error('Error moving ticket:', error);
        showToast('Error moving ticket. Please try again.', 'error');
    });
};


function transferIncompleteTasks() {
    const incompleteTasks = state.currentWeekTickets.filter(ticket => 
        ticket.status !== 'closed' &&
        ticket.actualHours < ticket.estimatedHours &&
        !ticket.carriedToNextWeek
    );
    
    incompleteTasks.forEach(ticket => {
        const remainingHours = Math.max(0, ticket.estimatedHours - ticket.actualHours);
        
        // Check if already transferred (by ticketId)
        const existingIndex = state.nextWeekPlanTickets.findIndex(t => 
            t.ticketId === ticket.ticketId && t.carriedOver
        );
        
        if (existingIndex === -1) {
            // Create new ticket for next week with remaining hours
            const carriedTicket = {
                id: generateId(),
                ticketId: ticket.ticketId,
                name: ticket.name,
                tester: ticket.tester,
                estimatedHours: remainingHours,
                actualHours: 0,
                status: 'nil',
                priority: ticket.priority,
                carriedOver: true,
                originalTicketId: ticket.id,
                createdAt: new Date().toISOString()
            };
            
            state.nextWeekPlanTickets.push(carriedTicket);
            
            // Mark original ticket as carried to next week
            const originalIndex = state.currentWeekTickets.findIndex(t => t.id === ticket.id);
            if (originalIndex !== -1) {
                state.currentWeekTickets[originalIndex].carriedToNextWeek = true;
            }
        }
    });
    
    saveToStorage();
    renderTickets();
    closeConfirmModal();
    showToast(`${incompleteTasks.length} task(s) transferred to next week!`, 'success');
}

// Toast Notifications
function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const iconPaths = {
        success: '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',
        error: '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
        info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'
    };
    
    toast.innerHTML = `
        <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${iconPaths[type] || iconPaths.info}
        </svg>
        <span class="toast-message">${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'toastSlideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Week Navigation
function navigateWeek(direction) {
    const daysToAdd = direction === 'next' ? 7 : -7;
    state.currentWeekStart.setDate(state.currentWeekStart.getDate() + daysToAdd);
    
    updateWeekDates();
    loadFromStorage();
    setupRealtimeListeners();
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Auth state listener will handle initialization
    // This is just a placeholder - the auth.onAuthStateChanged handles everything
    console.log('App loaded, waiting for auth state...');
});

// Update view buttons to reflect saved preferences
function updateViewButtons() {
    // Update view mode buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
        const weekType = btn.dataset.week;
        const viewType = btn.dataset.view;
        btn.classList.toggle('active', state.viewMode[weekType] === viewType);
    });
    
    // Update group by buttons
    document.querySelectorAll('.group-btn').forEach(btn => {
        const weekType = btn.dataset.week;
        const groupType = btn.dataset.group;
        btn.classList.toggle('active', state.groupBy[weekType] === groupType);
    });
}

// Add Ticket Buttons
document.querySelectorAll('.add-ticket-btn, .add-ticket-btn-inline, .add-ticket-btn-header').forEach(btn => {
    btn.addEventListener('click', () => {
        const week = btn.dataset.week;
        openTicketModal(week);
    });
});

// Form Submit
elements.ticketForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const estimatedHours = parseFloat(elements.estimatedHours.value) || 0;
    const actualHours = parseFloat(elements.actualHours.value) || 0;
    
    // Check if actual hours exceed estimated hours
    if (actualHours > estimatedHours) {
        openReestimateModal(estimatedHours, actualHours);
        return;
    }
    
    // Check if tester will be over capacity
    const testerName = elements.testerName.value.trim();
    const week = elements.ticketWeek.value;
    const editIndex = elements.editTicketIndex.value;
    
    const capacityCheck = checkTesterCapacity(testerName, week, estimatedHours, editIndex);
    if (capacityCheck.isOverCapacity) {
        openOverCapacityModal(testerName, capacityCheck);
        return;
    }
    
    submitTicketForm();
});

function checkTesterCapacity(testerName, week, newEstimatedHours, editIndex) {
    const weekType = (week === 'current' || week === 'next') ? 'current' : 'nextWeekPlan';
    const tickets = weekType === 'current' ? state.currentWeekTickets : state.nextWeekPlanTickets;
    const capacityData = weekType === 'current' ? state.currentWeekCapacity : state.nextWeekCapacity;
    
    const totalHours = capacityData[testerName]?.totalHours || 40;
    
    // Calculate current planned hours for this tester
    let currentPlannedHours = tickets
        .filter((ticket, idx) => {
            // Exclude the ticket being edited
            if (editIndex !== '' && idx === parseInt(editIndex)) {
                return false;
            }
            return ticket.tester === testerName;
        })
        .reduce((sum, ticket) => sum + ticket.estimatedHours, 0);
    
    // Add the new/updated ticket hours
    const newTotalPlanned = currentPlannedHours + newEstimatedHours;
    
    return {
        isOverCapacity: newTotalPlanned > totalHours,
        totalHours: totalHours,
        currentPlanned: currentPlannedHours,
        newPlanned: newTotalPlanned,
        overBy: newTotalPlanned - totalHours
    };
}

function openOverCapacityModal(testerName, capacityInfo) {
    document.getElementById('overCapacityTester').textContent = testerName;
    document.getElementById('overCapacityTotal').textContent = capacityInfo.totalHours;
    document.getElementById('overCapacityPlanned').textContent = capacityInfo.newPlanned;
    document.getElementById('overCapacityOver').textContent = capacityInfo.overBy;
    document.getElementById('overCapacityModal').classList.add('active');
}

function closeOverCapacityModal() {
    document.getElementById('overCapacityModal').classList.remove('active');
}

function submitTicketForm(reestimationNote = null) {
    const ticketData = {
        ticketId: elements.ticketId.value.trim(),
        name: elements.ticketName.value.trim(),
        tester: elements.testerName.value.trim(),
        estimatedHours: elements.estimatedHours.value,
        actualHours: elements.actualHours.value,
        status: elements.ticketStatus.value,
        priority: elements.ticketPriority.value,
        reestimationNote: reestimationNote
    };
    
    const week = elements.ticketWeek.value;
    const editIndex = elements.editTicketIndex.value;
    
    if (editIndex !== '') {
        updateTicket(ticketData, week, parseInt(editIndex), reestimationNote);
    } else {
        addTicket(ticketData, week, reestimationNote);
    }
    
    closeTicketModal();
}

// Modal Close Buttons
document.getElementById('closeModal').addEventListener('click', closeTicketModal);
document.getElementById('cancelBtn').addEventListener('click', closeTicketModal);
document.getElementById('cancelConfirm').addEventListener('click', closeConfirmModal);

// Close modals on overlay click
elements.ticketModal.addEventListener('click', (e) => {
    if (e.target === elements.ticketModal) {
        closeTicketModal();
    }
});

elements.confirmModal.addEventListener('click', (e) => {
    if (e.target === elements.confirmModal) {
        closeConfirmModal();
    }
});

// Bleed Over Button - opens confirmation modal
document.getElementById('bleedOverBtnTop').addEventListener('click', openConfirmModal);
document.getElementById('confirmTransfer').addEventListener('click', () => {
    // Double confirmation for safety
    const incompleteTasks = state.currentWeekTickets.filter(ticket => 
        ticket.status !== 'closed' &&
        ticket.actualHours < ticket.estimatedHours &&
        !ticket.carriedToNextWeek
    );
    
    const confirmed = confirm(
        `⚠️ Final Confirmation\n\n` +
        `You are about to transfer ${incompleteTasks.length} incomplete task(s) to Next Week.\n\n` +
        `This action will:\n` +
        `• Copy remaining hours to Next Week\n` +
        `• Mark original tickets as "→ Next Week"\n\n` +
        `Are you sure you want to proceed?`
    );
    
    if (confirmed) {
        transferIncompleteTasks();
    }
});

// Over Capacity Modal
document.getElementById('cancelOverCapacity').addEventListener('click', closeOverCapacityModal);
document.getElementById('confirmOverCapacity').addEventListener('click', () => {
    closeOverCapacityModal();
    submitTicketForm();
});
document.getElementById('overCapacityModal').addEventListener('click', (e) => {
    if (e.target.id === 'overCapacityModal') {
        closeOverCapacityModal();
    }
});

// Reestimate Modal
document.getElementById('cancelReestimate').addEventListener('click', closeReestimateModal);
document.getElementById('confirmReestimate').addEventListener('click', () => {
    const newEstimatedHours = parseFloat(document.getElementById('newEstimatedHours').value) || 0;
    const actualHours = parseFloat(elements.actualHours.value) || 0;
    const reason = document.getElementById('reestimationReason').value.trim();
    
    if (newEstimatedHours < actualHours) {
        showToast('New estimated hours must be at least equal to actual hours', 'error');
        return;
    }
    
    if (!reason) {
        showToast('Please provide a reason for reestimation', 'error');
        return;
    }
    
    // Update the estimated hours in the form
    elements.estimatedHours.value = newEstimatedHours;
    
    // Create reestimation note
    const originalEstimate = document.getElementById('reestimateEstimated').textContent;
    const reestimationNote = `Reestimated from ${originalEstimate}h to ${newEstimatedHours}h: ${reason}`;
    
    closeReestimateModal();
    submitTicketForm(reestimationNote);
});

document.getElementById('reestimateModal').addEventListener('click', (e) => {
    if (e.target.id === 'reestimateModal') {
        closeReestimateModal();
    }
});

// Week Navigation
elements.prevWeekBtn.addEventListener('click', () => navigateWeek('prev'));
elements.nextWeekBtn.addEventListener('click', () => navigateWeek('next'));

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeTicketModal();
        closeConfirmModal();
    }
});

// Toggle Tester Capacity View - Current Week
document.getElementById('toggleCurrentCapacity').addEventListener('click', () => {
    document.getElementById('currentWeekCapacity').classList.toggle('collapsed');
});

// Toggle Tester Capacity View - Next Week
document.getElementById('toggleNextCapacity').addEventListener('click', () => {
    document.getElementById('nextWeekCapacity').classList.toggle('collapsed');
});

// Group By Buttons
document.querySelectorAll('.group-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const groupType = btn.dataset.group;
        const weekType = btn.dataset.week;
        
        // Update state
        state.groupBy[weekType] = groupType;
        
        // Update active button
        const container = btn.closest('.group-btn-container');
        container.querySelectorAll('.group-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Re-render tickets
        renderTickets();
    });
});

// View Toggle Buttons (Cards vs Swim Lanes)
document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const viewType = btn.dataset.view;
        const weekType = btn.dataset.week;
        
        // Update state
        state.viewMode[weekType] = viewType;
        
        // Update active button
        const container = btn.closest('.view-toggle');
        container.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Re-render tickets
        renderTickets();
    });
});

// Sortable Headers for Tester Capacity
document.querySelectorAll('.sortable-header').forEach(header => {
    header.addEventListener('click', () => {
        const weekType = header.dataset.week;
        toggleCapacitySort(weekType);
    });
});

// Report Generation
document.getElementById('openReportModal').addEventListener('click', openReportModal);
document.getElementById('closeReportModal').addEventListener('click', closeReportModal);
document.getElementById('cancelReport').addEventListener('click', closeReportModal);
document.getElementById('generateReport').addEventListener('click', generateExcelReport);
document.getElementById('reportModal').addEventListener('click', (e) => {
    if (e.target.id === 'reportModal') {
        closeReportModal();
    }
});

// Update report preview when inputs change
document.getElementById('reportNumber').addEventListener('input', updateReportPreview);
document.getElementById('reportPeriod').addEventListener('change', updateReportPreview);
document.getElementById('reportTester').addEventListener('change', updateReportPreview);
document.getElementById('reportStatus').addEventListener('change', updateReportPreview);

function openReportModal() {
    document.getElementById('reportModal').classList.add('active');
    updateReportPreview();
}

function closeReportModal() {
    document.getElementById('reportModal').classList.remove('active');
}

function getReportDateRange() {
    const number = parseInt(document.getElementById('reportNumber').value) || 1;
    const period = document.getElementById('reportPeriod').value;
    
    const endDate = new Date();
    const startDate = new Date();
    
    if (period === 'week') {
        startDate.setDate(startDate.getDate() - (number * 7));
    } else if (period === 'month') {
        startDate.setMonth(startDate.getMonth() - number);
    } else if (period === 'year') {
        startDate.setFullYear(startDate.getFullYear() - number);
    }
    
    return { startDate, endDate };
}

async function getTicketsInRange(startDate, endDate) {
    const tickets = [];
    const testerFilter = document.getElementById('reportTester').value;
    const statusFilter = document.getElementById('reportStatus').value;
    
    // Get all week keys in the range
    const weekKeys = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        const weekStart = getWeekStart(currentDate);
        weekKeys.push({
            key: getFirebaseKey(weekStart, 'week'),
            weekStart: new Date(weekStart)
        });
        currentDate.setDate(currentDate.getDate() + 7);
    }
    
    // Fetch all weeks from Firebase
    const promises = weekKeys.map(({ key, weekStart }) => 
        database.ref(`/tickets/${key}`).once('value').then(snapshot => ({
            data: snapshot.val(),
            weekStart
        }))
    );
    
    const results = await Promise.all(promises);
    
    results.forEach(({ data, weekStart }) => {
        if (data && Array.isArray(data)) {
            data.forEach(ticket => {
                if (!ticket) return;
                // Apply filters
                if (testerFilter && ticket.tester !== testerFilter) return;
                if (statusFilter && ticket.status !== statusFilter) return;
                
                // Add week info to ticket
                tickets.push({
                    ...ticket,
                    weekStart: new Date(weekStart)
                });
            });
        }
    });
    
    // Remove duplicates based on ticket id
    const uniqueTickets = [];
    const seenIds = new Set();
    tickets.forEach(ticket => {
        const key = `${ticket.ticketId}-${ticket.weekStart.toISOString()}`;
        if (!seenIds.has(key)) {
            seenIds.add(key);
            uniqueTickets.push(ticket);
        }
    });
    
    return uniqueTickets;
}

async function updateReportPreview() {
    const { startDate, endDate } = getReportDateRange();
    
    document.getElementById('reportDateRange').textContent = 
        `${formatDate(startDate)} - ${formatDate(endDate)}`;
    document.getElementById('reportTicketCount').textContent = 'Loading...';
    
    const tickets = await getTicketsInRange(startDate, endDate);
    document.getElementById('reportTicketCount').textContent = tickets.length;
}

async function generateExcelReport() {
    const { startDate, endDate } = getReportDateRange();
    
    showToast('Generating report...', 'info');
    const tickets = await getTicketsInRange(startDate, endDate);
    
    if (tickets.length === 0) {
        showToast('No tickets found for the selected period', 'info');
        return;
    }
    
    // Create Excel workbook using SheetJS
    const wb = XLSX.utils.book_new();
    
    // ===== Sheet 1: Ticket Report =====
    const headers = ['Week', 'Tester Name', 'Ticket ID', 'Summary', 'Status', 'Responsibility', 'Priority', 'Estimated Hours', 'Actual Hours'];
    
    const rows = tickets.map(ticket => ({
        'Week': formatWeekRange(ticket.weekStart),
        'Tester Name': ticket.tester,
        'Ticket ID': ticket.ticketId,
        'Summary': ticket.name,
        'Status': formatStatus(ticket.status),
        'Responsibility': getCategoryName(getStatusCategory(ticket.status)),
        'Priority': ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1),
        'Estimated Hours': ticket.estimatedHours,
        'Actual Hours': ticket.actualHours
    }));
    
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
    
    // Set column widths
    ws['!cols'] = [
        { wch: 20 },  // Week
        { wch: 22 },  // Tester Name
        { wch: 15 },  // Ticket ID
        { wch: 40 },  // Summary
        { wch: 20 },  // Status
        { wch: 12 },  // Responsibility
        { wch: 10 },  // Priority
        { wch: 15 },  // Estimated Hours
        { wch: 12 }   // Actual Hours
    ];
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Ticket Report');
    
    // ===== Sheet 2: Daily Log History =====
    const dailyLogHeaders = ['Date', 'Type', 'Ticket ID', 'Summary', 'Tester', 'Hours', 'Notes/Tasks', 'Status/Goal'];
    const dailyLogRows = [];
    
    // Collect daily logs from all tickets in the report range
    tickets.forEach(ticket => {
        if (ticket.dailyPlans && ticket.dailyPlans.length > 0) {
            ticket.dailyPlans.forEach(plan => {
                const planDate = new Date(plan.date);
                // Only include logs within the date range
                if (planDate >= startDate && planDate <= endDate) {
                    dailyLogRows.push({
                        'Date': planDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
                        'Type': plan.type === 'actual' ? 'Actual' : 'Plan',
                        'Ticket ID': ticket.ticketId,
                        'Summary': ticket.name,
                        'Tester': ticket.tester,
                        'Hours': plan.hours || plan.plannedHours || 0,
                        'Notes/Tasks': plan.notes || plan.tasks || '',
                        'Status/Goal': plan.type === 'actual' ? formatStatus(plan.status || '') : (plan.goal || '')
                    });
                }
            });
        }
    });
    
    // Sort by date descending
    dailyLogRows.sort((a, b) => new Date(b['Date']) - new Date(a['Date']));
    
    if (dailyLogRows.length > 0) {
        const wsDailyLog = XLSX.utils.json_to_sheet(dailyLogRows, { header: dailyLogHeaders });
        wsDailyLog['!cols'] = [
            { wch: 22 },  // Date
            { wch: 8 },   // Type
            { wch: 15 },  // Ticket ID
            { wch: 35 },  // Summary
            { wch: 22 },  // Tester
            { wch: 8 },   // Hours
            { wch: 50 },  // Notes/Tasks
            { wch: 20 }   // Status/Goal
        ];
        XLSX.utils.book_append_sheet(wb, wsDailyLog, 'Daily Log History');
    }
    
    // ===== Sheet 3: Report Summary =====
    const totalEstimated = tickets.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
    const totalActual = tickets.reduce((sum, t) => sum + (t.actualHours || 0), 0);
    const totalDailyLogHours = dailyLogRows.filter(r => r.Type === 'Actual').reduce((sum, r) => sum + (r.Hours || 0), 0);
    
    const summaryData = [
        { 'Metric': 'Report Generated', 'Value': new Date().toLocaleString() },
        { 'Metric': 'Date Range', 'Value': `${formatDate(startDate)} - ${formatDate(endDate)}` },
        { 'Metric': '', 'Value': '' },
        { 'Metric': 'Total Tickets', 'Value': tickets.length },
        { 'Metric': 'Total Estimated Hours', 'Value': totalEstimated },
        { 'Metric': 'Total Actual Hours', 'Value': totalActual },
        { 'Metric': '', 'Value': '' },
        { 'Metric': 'Daily Log Entries', 'Value': dailyLogRows.length },
        { 'Metric': 'Daily Actual Hours Logged', 'Value': totalDailyLogHours },
        { 'Metric': 'Daily Plan Entries', 'Value': dailyLogRows.filter(r => r.Type === 'Plan').length }
    ];
    
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary['!cols'] = [
        { wch: 25 }, { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Report Summary');
    
    // Generate filename
    const number = document.getElementById('reportNumber').value;
    const period = document.getElementById('reportPeriod').value;
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `ticket_report_past_${number}_${period}s_${dateStr}.xlsx`;
    
    // Write to blob and download using a cleaner method
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }, 100);
    
    showToast(`Excel report generated with ${tickets.length} tickets and ${dailyLogRows.length} daily log entries!`, 'success');
    closeReportModal();
}

// =====================
// Authentication Functions
// =====================

function showLoginPage() {
    document.getElementById('loginContainer').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
}

function showAppPage() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
}

function updateUserDisplay(user) {
    const userEmailEl = document.getElementById('userEmail');
    if (userEmailEl && user) {
        userEmailEl.textContent = user.email;
    }
}

async function handleLogin(email, password) {
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');
    
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span>Signing in...</span>';
    loginError.textContent = '';
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        // Auth state listener will handle the rest
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'Failed to sign in. Please try again.';
        
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = 'No account found with this email.';
                break;
            case 'auth/wrong-password':
                errorMessage = 'Incorrect password.';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address.';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'Too many failed attempts. Please try again later.';
                break;
            case 'auth/invalid-credential':
                errorMessage = 'Invalid email or password.';
                break;
        }
        
        loginError.textContent = errorMessage;
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span>Sign In</span>';
    }
}

async function handleRegister(email, password) {
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');
    
    loginBtn.disabled = true;
    loginError.textContent = '';
    
    try {
        await auth.createUserWithEmailAndPassword(email, password);
        showToast('Account created successfully!', 'success');
        // Auth state listener will handle the rest
    } catch (error) {
        console.error('Registration error:', error);
        let errorMessage = 'Failed to create account. Please try again.';
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = 'An account with this email already exists.';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address.';
                break;
            case 'auth/weak-password':
                errorMessage = 'Password should be at least 6 characters.';
                break;
        }
        
        loginError.textContent = errorMessage;
        loginBtn.disabled = false;
    }
}

async function handleLogout() {
    try {
        await auth.signOut();
        showToast('Signed out successfully', 'info');
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Failed to sign out', 'error');
    }
}

// Auth state listener
auth.onAuthStateChanged((user) => {
    currentUser = user;
    
    if (user) {
        // User is signed in
        updateUserDisplay(user);
        showAppPage();
        
        // Initialize the app
        state.currentWeekStart = getCurrentViewWeek();
        
        const viewPreferences = localStorage.getItem('viewPreferences');
        if (viewPreferences) {
            const prefs = JSON.parse(viewPreferences);
            if (prefs.viewMode) state.viewMode = prefs.viewMode;
            if (prefs.groupBy) state.groupBy = prefs.groupBy;
        }
        
        updateWeekDates();
        updateViewButtons();
        initializeCapacity();
        loadFromStorage();
        setupRealtimeListeners();
    } else {
        // User is signed out
        showLoginPage();
        
        // Reset login form
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<span>Sign In</span>';
        }
    }
});

// Login form event listeners
document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    handleLogin(email, password);
});

document.getElementById('registerBtn').addEventListener('click', () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const loginError = document.getElementById('loginError');
    
    if (!email || !password) {
        loginError.textContent = 'Please enter email and password to create an account.';
        return;
    }
    
    if (password.length < 6) {
        loginError.textContent = 'Password should be at least 6 characters.';
        return;
    }
    
    handleRegister(email, password);
});

document.getElementById('logoutBtn').addEventListener('click', handleLogout);

// =====================
// Search Functionality
// =====================

let searchTerm = '';

function initializeSearch() {
    const searchInput = document.getElementById('ticketSearch');
    const clearBtn = document.getElementById('clearSearch');
    
    if (!searchInput || !clearBtn) return;
    
    searchInput.addEventListener('input', (e) => {
        searchTerm = e.target.value.trim().toLowerCase();
        clearBtn.style.display = searchTerm ? 'flex' : 'none';
        // Re-render tickets with search filter applied
        renderTickets();
    });
    
    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchTerm = '';
        clearBtn.style.display = 'none';
        renderTickets();
        searchInput.focus();
    });
    
    // Keyboard shortcut: Ctrl/Cmd + K to focus search
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
    });
}

function filterTicketsBySearchTerm(tickets) {
    if (!searchTerm) return tickets;
    
    return tickets.filter(ticket => {
        const ticketId = (ticket.ticketId || '').toLowerCase();
        const ticketName = (ticket.name || '').toLowerCase();
        const ticketTester = (ticket.tester || '').toLowerCase();
        const ticketStatus = (ticket.status || '').toLowerCase();
        
        return ticketId.includes(searchTerm) || 
               ticketName.includes(searchTerm) || 
               ticketTester.includes(searchTerm) ||
               ticketStatus.includes(searchTerm);
    });
}

function highlightSearchTermInText(text) {
    if (!searchTerm || !text) return escapeHtml(text);
    
    const escapedText = escapeHtml(text);
    const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
    return escapedText.replace(regex, '<span class="search-highlight">$1</span>');
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSearchResultsInfo(filteredCount, totalCount, weekName) {
    if (!searchTerm) return '';
    
    return `
        <div class="search-results-info">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
            </svg>
            <span>Showing <span class="count">${filteredCount}</span> of ${totalCount} tickets matching "<span class="term">${escapeHtml(searchTerm)}</span>" in ${weekName}</span>
        </div>
    `;
}

// Initialize search when DOM is ready
document.addEventListener('DOMContentLoaded', initializeSearch);

// =====================
// Export to Excel Functionality
// =====================

function initializeExport() {
    const exportBtn = document.getElementById('exportDataBtn');
    
    if (exportBtn) {
        exportBtn.addEventListener('click', exportAllDataToExcel);
    }
}

function exportAllDataToExcel() {
    showToast('Generating Excel export...', 'info');
    
    const nextWeekStart = new Date(state.currentWeekStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Common headers for ticket sheets
    const ticketHeaders = ['Week', 'Ticket ID', 'Summary', 'Tester', 'Status', 'Responsibility', 'Priority', 'Estimated Hours', 'Actual Hours', 'Remaining Hours', 'Carried Over', 'Moved to Next Week'];
    const ticketColWidths = [
        { wch: 20 }, { wch: 15 }, { wch: 40 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 10 },
        { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 18 }
    ];
    
    // Helper function to map ticket to row
    const mapTicketToRow = (ticket, weekStart) => ({
        'Week': formatWeekRange(weekStart),
        'Ticket ID': ticket.ticketId,
        'Summary': ticket.name,
        'Tester': ticket.tester,
        'Status': formatStatus(ticket.status),
        'Responsibility': getCategoryName(getStatusCategory(ticket.status)),
        'Priority': ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1),
        'Estimated Hours': ticket.estimatedHours,
        'Actual Hours': ticket.actualHours,
        'Remaining Hours': Math.max(0, ticket.estimatedHours - ticket.actualHours),
        'Carried Over': ticket.carriedOver ? 'Yes' : 'No',
        'Moved to Next Week': ticket.carriedToNextWeek ? 'Yes' : 'No'
    });
    
    // ===== Sheet 1: All Weeks Combined =====
    const allWeeksRows = [
        ...state.currentWeekTickets.map(ticket => mapTicketToRow(ticket, state.currentWeekStart)),
        ...state.nextWeekPlanTickets.map(ticket => mapTicketToRow(ticket, nextWeekStart))
    ];
    
    const wsAllWeeks = XLSX.utils.json_to_sheet(allWeeksRows, { header: ticketHeaders });
    wsAllWeeks['!cols'] = ticketColWidths;
    XLSX.utils.book_append_sheet(wb, wsAllWeeks, 'All Weeks');
    
    // ===== Sheet 2: Current Week Tickets =====
    const currentWeekRows = state.currentWeekTickets.map(ticket => mapTicketToRow(ticket, state.currentWeekStart));
    
    const wsCurrentWeek = XLSX.utils.json_to_sheet(currentWeekRows, { header: ticketHeaders });
    wsCurrentWeek['!cols'] = ticketColWidths;
    XLSX.utils.book_append_sheet(wb, wsCurrentWeek, `Current Week (${formatDate(state.currentWeekStart)})`);
    
    // ===== Sheet 3: Next Week Tickets =====
    const nextWeekRows = state.nextWeekPlanTickets.map(ticket => mapTicketToRow(ticket, nextWeekStart));
    
    const wsNextWeek = XLSX.utils.json_to_sheet(nextWeekRows, { header: ticketHeaders });
    wsNextWeek['!cols'] = ticketColWidths;
    XLSX.utils.book_append_sheet(wb, wsNextWeek, `Next Week (${formatDate(nextWeekStart)})`);
    
    // ===== Sheet 5: Current Week Tester Capacity =====
    const currentCapacityHeaders = ['Tester Name', 'Total Hours', 'Planned Hours', 'Unplanned Hours', 'Utilization %'];
    const currentCapacityRows = TESTERS.map(tester => {
        const totalHours = state.currentWeekCapacity[tester]?.totalHours ?? 40;
        const plannedHours = calculateTesterPlannedHours(tester, 'current');
        const unplannedHours = totalHours - plannedHours;
        const utilization = totalHours > 0 ? Math.round((plannedHours / totalHours) * 100) : 0;
        
        return {
            'Tester Name': tester,
            'Total Hours': totalHours,
            'Planned Hours': plannedHours,
            'Unplanned Hours': unplannedHours,
            'Utilization %': utilization + '%'
        };
    });
    
    const wsCurrentCapacity = XLSX.utils.json_to_sheet(currentCapacityRows, { header: currentCapacityHeaders });
    wsCurrentCapacity['!cols'] = [
        { wch: 25 }, { wch: 12 }, { wch: 14 }, { wch: 15 }, { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(wb, wsCurrentCapacity, 'Current Week Capacity');
    
    // ===== Sheet 6: Next Week Tester Capacity =====
    const nextCapacityRows = TESTERS.map(tester => {
        const totalHours = state.nextWeekCapacity[tester]?.totalHours ?? 40;
        const plannedHours = calculateTesterPlannedHours(tester, 'nextWeekPlan');
        const unplannedHours = totalHours - plannedHours;
        const utilization = totalHours > 0 ? Math.round((plannedHours / totalHours) * 100) : 0;
        
        return {
            'Tester Name': tester,
            'Total Hours': totalHours,
            'Planned Hours': plannedHours,
            'Unplanned Hours': unplannedHours,
            'Utilization %': utilization + '%'
        };
    });
    
    const wsNextCapacity = XLSX.utils.json_to_sheet(nextCapacityRows, { header: currentCapacityHeaders });
    wsNextCapacity['!cols'] = [
        { wch: 25 }, { wch: 12 }, { wch: 14 }, { wch: 15 }, { wch: 14 }
    ];
    XLSX.utils.book_append_sheet(wb, wsNextCapacity, 'Next Week Capacity');
    
    // ===== Sheet 7: Daily Log History =====
    const dailyLogHeaders = ['Date', 'Type', 'Ticket ID', 'Summary', 'Tester', 'Hours', 'Notes/Tasks', 'Status/Goal'];
    const dailyLogRows = [];
    
    // Collect daily logs from current week tickets
    state.currentWeekTickets.forEach(ticket => {
        if (ticket.dailyPlans && ticket.dailyPlans.length > 0) {
            ticket.dailyPlans.forEach(plan => {
                const planDate = new Date(plan.date);
                dailyLogRows.push({
                    'Date': planDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
                    'Type': plan.type === 'actual' ? 'Actual' : 'Plan',
                    'Ticket ID': ticket.ticketId,
                    'Summary': ticket.name,
                    'Tester': ticket.tester,
                    'Hours': plan.hours || plan.plannedHours || 0,
                    'Notes/Tasks': plan.notes || plan.tasks || '',
                    'Status/Goal': plan.type === 'actual' ? formatStatus(plan.status || '') : (plan.goal || '')
                });
            });
        }
    });
    
    // Collect daily logs from next week tickets
    state.nextWeekPlanTickets.forEach(ticket => {
        if (ticket.dailyPlans && ticket.dailyPlans.length > 0) {
            ticket.dailyPlans.forEach(plan => {
                const planDate = new Date(plan.date);
                dailyLogRows.push({
                    'Date': planDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
                    'Type': plan.type === 'actual' ? 'Actual' : 'Plan',
                    'Ticket ID': ticket.ticketId,
                    'Summary': ticket.name,
                    'Tester': ticket.tester,
                    'Hours': plan.hours || plan.plannedHours || 0,
                    'Notes/Tasks': plan.notes || plan.tasks || '',
                    'Status/Goal': plan.type === 'actual' ? formatStatus(plan.status || '') : (plan.goal || '')
                });
            });
        }
    });
    
    // Sort by date descending
    dailyLogRows.sort((a, b) => new Date(b['Date']) - new Date(a['Date']));
    
    if (dailyLogRows.length > 0) {
        const wsDailyLog = XLSX.utils.json_to_sheet(dailyLogRows, { header: dailyLogHeaders });
        wsDailyLog['!cols'] = [
            { wch: 22 },  // Date
            { wch: 8 },   // Type
            { wch: 15 },  // Ticket ID
            { wch: 35 },  // Summary
            { wch: 22 },  // Tester
            { wch: 8 },   // Hours
            { wch: 50 },  // Notes/Tasks
            { wch: 20 }   // Status/Goal
        ];
        XLSX.utils.book_append_sheet(wb, wsDailyLog, 'Daily Log History');
    }
    
    // ===== Sheet 8: Summary =====
    const currentStats = calculateStats(state.currentWeekTickets);
    const nextStats = calculateStats(state.nextWeekPlanTickets);
    
    const summaryData = [
        { 'Metric': 'Export Date', 'Current Week': new Date().toLocaleDateString(), 'Next Week': '' },
        { 'Metric': 'Week Starting', 'Current Week': formatDate(state.currentWeekStart), 'Next Week': formatDate(nextWeekStart) },
        { 'Metric': '', 'Current Week': '', 'Next Week': '' },
        { 'Metric': 'Total Tickets', 'Current Week': state.currentWeekTickets.length, 'Next Week': state.nextWeekPlanTickets.length },
        { 'Metric': 'Total Planned Hours', 'Current Week': currentStats.totalHours, 'Next Week': nextStats.totalHours },
        { 'Metric': 'Total Actual Hours', 'Current Week': currentStats.actualHours, 'Next Week': nextStats.actualHours },
        { 'Metric': 'Remaining Hours', 'Current Week': currentStats.remainingHours, 'Next Week': nextStats.remainingHours },
        { 'Metric': '', 'Current Week': '', 'Next Week': '' },
        { 'Metric': 'Team Total Capacity', 'Current Week': TESTERS.reduce((sum, t) => sum + (state.currentWeekCapacity[t]?.totalHours ?? 40), 0), 'Next Week': TESTERS.reduce((sum, t) => sum + (state.nextWeekCapacity[t]?.totalHours ?? 40), 0) },
        { 'Metric': 'Team Unplanned Hours', 'Current Week': TESTERS.reduce((sum, t) => sum + (state.currentWeekCapacity[t]?.totalHours ?? 40), 0) - currentStats.totalHours, 'Next Week': TESTERS.reduce((sum, t) => sum + (state.nextWeekCapacity[t]?.totalHours ?? 40), 0) - nextStats.totalHours },
        { 'Metric': '', 'Current Week': '', 'Next Week': '' },
        { 'Metric': 'Daily Log Entries', 'Current Week': dailyLogRows.length, 'Next Week': '' }
    ];
    
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary['!cols'] = [
        { wch: 22 }, { wch: 18 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
    
    // Generate filename and download
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `PlanQC_Export_${dateStr}.xlsx`;
    
    // Write to blob and download
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }, 100);
    
    const totalTickets = state.currentWeekTickets.length + state.nextWeekPlanTickets.length;
    showToast(`Excel exported with ${totalTickets} tickets!`, 'success');
}

// Initialize export when DOM is ready
document.addEventListener('DOMContentLoaded', initializeExport);

// =====================
// Import from Excel Functionality
// =====================

let importState = {
    file: null,
    parsedData: [],
    newTickets: [],
    duplicates: [],
    invalidRows: []
};

function initializeImport() {
    const openBtn = document.getElementById('openImportModal');
    const closeBtn = document.getElementById('closeImportModal');
    const cancelBtn = document.getElementById('cancelImport');
    const confirmBtn = document.getElementById('confirmImport');
    const fileInput = document.getElementById('importFileInput');
    const uploadArea = document.getElementById('fileUploadArea');
    const removeFileBtn = document.getElementById('removeFileBtn');
    const templateBtn = document.getElementById('downloadTemplateBtn');
    const modal = document.getElementById('importModal');
    
    if (openBtn) openBtn.addEventListener('click', openImportModal);
    if (closeBtn) closeBtn.addEventListener('click', closeImportModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeImportModal);
    if (confirmBtn) confirmBtn.addEventListener('click', confirmImport);
    if (removeFileBtn) removeFileBtn.addEventListener('click', removeSelectedFile);
    if (templateBtn) templateBtn.addEventListener('click', downloadImportTemplate);
    
    // File input change
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
    
    // Click to upload
    if (uploadArea) {
        uploadArea.addEventListener('click', (e) => {
            if (e.target.id !== 'removeFileBtn' && !e.target.closest('#removeFileBtn')) {
                fileInput.click();
            }
        });
        
        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFile(files[0]);
            }
        });
    }
    
    // Close on overlay click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.id === 'importModal') {
                closeImportModal();
            }
        });
    }
}

function downloadImportTemplate() {
    // Create workbook with template
    const wb = XLSX.utils.book_new();
    
    // Template headers
    const headers = ['Ticket ID', 'Ticket Name', 'Tester Name', 'Estimated Hours', 'Actual Hours', 'Status', 'Priority'];
    
    // Sample data rows to show format
    const sampleData = [
        {
            'Ticket ID': 'TICK-001',
            'Ticket Name': 'Sample ticket description',
            'Tester Name': TESTERS[0],
            'Estimated Hours': 4,
            'Actual Hours': 0,
            'Status': 'Nil',
            'Priority': 'medium'
        },
        {
            'Ticket ID': 'TICK-002',
            'Ticket Name': 'Another sample ticket',
            'Tester Name': TESTERS[1] || TESTERS[0],
            'Estimated Hours': 8,
            'Actual Hours': 2,
            'Status': 'In Progress',
            'Priority': 'high'
        }
    ];
    
    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    
    // Set column widths
    ws['!cols'] = [
        { wch: 15 },  // Ticket ID
        { wch: 40 },  // Ticket Name
        { wch: 25 },  // Tester Name
        { wch: 15 },  // Estimated Hours
        { wch: 12 },  // Actual Hours
        { wch: 20 },  // Status
        { wch: 12 }   // Priority
    ];
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Tickets');
    
    // Add a reference sheet with valid values
    const refData = [
        { 'Field': 'Tester Name (Valid Values)', 'Values': TESTERS.join(', ') },
        { 'Field': '', 'Values': '' },
        { 'Field': 'Status (Valid Values)', 'Values': 'Nil, In Progress, Start Code Review, QC Testing, QC Testing In Progress, QC Testing Hold, QC Review Fail, Code Review Failed, Testing In Progress, Tested - Awaiting Fixes, Hold/Pending, BIS Testing, Approved for Live, Moved to Live, Closed' },
        { 'Field': '', 'Values': '' },
        { 'Field': 'Priority (Valid Values)', 'Values': 'low, medium, high, critical' }
    ];
    
    const wsRef = XLSX.utils.json_to_sheet(refData);
    wsRef['!cols'] = [
        { wch: 30 },
        { wch: 100 }
    ];
    XLSX.utils.book_append_sheet(wb, wsRef, 'Reference');
    
    // Generate and download
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PlanQC_Import_Template.xlsx';
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }, 100);
    
    showToast('Template downloaded!', 'success');
}

function openImportModal() {
    resetImportState();
    document.getElementById('importModal').classList.add('active');
}

function closeImportModal() {
    document.getElementById('importModal').classList.remove('active');
    resetImportState();
}

function resetImportState() {
    importState = {
        file: null,
        parsedData: [],
        newTickets: [],
        duplicates: [],
        invalidRows: []
    };
    
    document.getElementById('importFileInput').value = '';
    document.getElementById('fileUploadArea').querySelector('.file-upload-content').style.display = '';
    document.getElementById('fileSelectedInfo').style.display = 'none';
    document.getElementById('importPreview').style.display = 'none';
    document.getElementById('confirmImport').disabled = true;
}

function removeSelectedFile() {
    resetImportState();
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
}

function handleFile(file) {
    const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv'
    ];
    
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
        showToast('Please select a valid Excel file (.xlsx, .xls, .csv)', 'error');
        return;
    }
    
    importState.file = file;
    
    // Update UI
    document.getElementById('fileUploadArea').querySelector('.file-upload-content').style.display = 'none';
    document.getElementById('fileSelectedInfo').style.display = 'flex';
    document.getElementById('selectedFileName').textContent = file.name;
    
    // Parse the file
    parseExcelFile(file);
}

function parseExcelFile(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            // Get the first sheet
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Convert to JSON
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
            
            if (jsonData.length === 0) {
                showToast('The Excel file appears to be empty', 'error');
                return;
            }
            
            importState.parsedData = jsonData;
            processImportData(jsonData);
            
        } catch (error) {
            console.error('Error parsing Excel file:', error);
            showToast('Error parsing Excel file. Please check the file format.', 'error');
        }
    };
    
    reader.onerror = function() {
        showToast('Error reading file', 'error');
    };
    
    reader.readAsArrayBuffer(file);
}

function processImportData(data) {
    // Check all existing tickets across pool and both weeks for duplicates
    const existingTicketIds = new Set();
    
    // Helper to normalize ticket ID for comparison
    const normalizeTicketId = (id) => String(id || '').toLowerCase().trim();
    
    // Add ticket pool IDs
    state.ticketPool.forEach(t => existingTicketIds.add(normalizeTicketId(t.ticketId)));
    
    // Add current week IDs
    state.currentWeekTickets.forEach(t => existingTicketIds.add(normalizeTicketId(t.ticketId)));
    
    // Add next week IDs
    state.nextWeekPlanTickets.forEach(t => existingTicketIds.add(normalizeTicketId(t.ticketId)));
    
    // Debug: log what we found
    console.log('Existing ticket IDs in system:', [...existingTicketIds]);
    console.log('Total existing tickets:', existingTicketIds.size);
    
    importState.newTickets = [];
    importState.duplicates = [];
    importState.invalidRows = [];
    
    // Column name mappings (case-insensitive)
    const columnMappings = {
        ticketId: ['ticket id', 'ticketid', 'ticket_id', 'id'],
        name: ['ticket name', 'ticketname', 'name', 'summary', 'description', 'title'],
        tester: ['tester name', 'testername', 'tester', 'assigned to', 'assignee'],
        estimatedHours: ['estimated hours', 'estimatedhours', 'estimated_hours', 'estimate', 'hours', 'est hours', 'est. hours'],
        actualHours: ['actual hours', 'actualhours', 'actual_hours', 'actual', 'worked hours'],
        status: ['status'],
        priority: ['priority']
    };
    
    // Get actual column names from data
    const sampleRow = data[0];
    const actualColumns = Object.keys(sampleRow);
    
    // Find matching columns
    const columnMap = {};
    for (const [field, possibleNames] of Object.entries(columnMappings)) {
        for (const colName of actualColumns) {
            if (possibleNames.includes(colName.toLowerCase().trim())) {
                columnMap[field] = colName;
                break;
            }
        }
    }
    
    // Check required columns
    const requiredFields = ['ticketId', 'name', 'tester', 'status'];
    const missingFields = requiredFields.filter(f => !columnMap[f]);
    
    if (missingFields.length > 0) {
        showToast(`Missing required columns: ${missingFields.join(', ')}`, 'error');
        return;
    }
    
    // Process each row
    data.forEach((row, index) => {
        const ticketId = String(row[columnMap.ticketId] || '').trim();
        const name = String(row[columnMap.name] || '').trim();
        const tester = String(row[columnMap.tester] || '').trim();
        // Keep 0 if not specified
        const estimatedHours = parseFloat(row[columnMap.estimatedHours]) || 0;
        const actualHours = columnMap.actualHours ? (parseFloat(row[columnMap.actualHours]) || 0) : 0;
        const status = columnMap.status ? normalizeStatus(String(row[columnMap.status] || '').trim()) : 'nil';
        const priority = columnMap.priority ? normalizePriority(String(row[columnMap.priority] || '').trim()) : 'medium';
        
        // Validate required fields
        if (!ticketId || !name || !tester || !status) {
            importState.invalidRows.push({ row: index + 2, reason: 'Missing Ticket ID, Name, Tester, or Status' });
            return;
        }
        
        // Check for duplicates
        const normalizedImportId = String(ticketId).toLowerCase().trim();
        if (existingTicketIds.has(normalizedImportId)) {
            importState.duplicates.push({ ticketId, name });
            return;
        }
        
        // Validate tester name
        if (!TESTERS.includes(tester)) {
            importState.invalidRows.push({ row: index + 2, reason: `Unknown tester: ${tester}` });
            return;
        }
        
        // Add to new tickets
        importState.newTickets.push({
            ticketId,
            name,
            tester,
            estimatedHours,
            actualHours,
            status,
            priority
        });
        
        // Add to existing set to catch duplicates within the import file
        existingTicketIds.add(ticketId.toLowerCase());
    });
    
    // Update preview
    updateImportPreview();
}

function normalizeStatus(status) {
    const statusLower = status.toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
    
    const validStatuses = [
        'nil', 'in-progress', 'start-code-review', 'qc-testing', 'qc-testing-in-progress',
        'qc-testing-hold', 'qc-review-fail', 'code-review-failed', 'testing-in-progress',
        'tested-awaiting-fixes', 'hold-pending', 'bis-testing', 'approved-for-live',
        'moved-to-live', 'closed'
    ];
    
    // Try exact match
    if (validStatuses.includes(statusLower)) {
        return statusLower;
    }
    
    // Try partial matches
    const statusMap = {
        'progress': 'in-progress',
        'testing': 'qc-testing',
        'approved': 'approved-for-live',
        'live': 'moved-to-live',
        'closed': 'closed',
        'done': 'closed',
        'complete': 'closed',
        'hold': 'hold-pending',
        'pending': 'hold-pending',
        'fail': 'qc-review-fail',
        'code review': 'start-code-review'
    };
    
    for (const [key, value] of Object.entries(statusMap)) {
        if (statusLower.includes(key)) {
            return value;
        }
    }
    
    return 'nil';
}

function normalizePriority(priority) {
    const priorityLower = priority.toLowerCase().trim();
    
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    
    if (validPriorities.includes(priorityLower)) {
        return priorityLower;
    }
    
    // Map common variations
    if (priorityLower === 'med' || priorityLower === 'normal') return 'medium';
    if (priorityLower === 'urgent' || priorityLower === 'blocker') return 'critical';
    
    return 'medium';
}

function updateImportPreview() {
    const preview = document.getElementById('importPreview');
    const confirmBtn = document.getElementById('confirmImport');
    
    document.getElementById('previewTotalRows').textContent = importState.parsedData.length;
    document.getElementById('previewNewTickets').textContent = importState.newTickets.length;
    document.getElementById('previewDuplicates').textContent = importState.duplicates.length;
    document.getElementById('previewInvalid').textContent = importState.invalidRows.length;
    
    preview.style.display = 'block';
    confirmBtn.disabled = importState.newTickets.length === 0;
}

function confirmImport() {
    console.log('=== CONFIRM IMPORT CALLED ===');
    console.log('New tickets to import:', importState.newTickets.length);
    
    if (importState.newTickets.length === 0) {
        showToast('No valid tickets to import', 'error');
        return;
    }
    
    // Add tickets to the pool instead of directly to weeks
    importState.newTickets.forEach(ticketData => {
        const ticket = {
            id: generateId(),
            ticketId: ticketData.ticketId,
            name: ticketData.name,
            tester: ticketData.tester,
            estimatedHours: parseFloat(ticketData.estimatedHours),
            actualHours: parseFloat(ticketData.actualHours) || 0,
            status: ticketData.status,
            priority: ticketData.priority,
            createdAt: new Date().toISOString()
        };
        state.ticketPool.push(ticket);
        console.log('Added ticket to pool:', ticket.ticketId);
    });
    
    const count = importState.newTickets.length;
    const skipped = importState.duplicates.length + importState.invalidRows.length;
    
    console.log('Pool now has', state.ticketPool.length, 'tickets');
    console.log('About to call saveToStorage()...');
    
    // Save and render
    saveToStorage();
    console.log('saveToStorage() called');
    renderTicketPool();
    
    closeImportModal();
    
    let message = `Successfully imported ${count} ticket${count !== 1 ? 's' : ''} to pool`;
    if (skipped > 0) {
        message += ` (${skipped} skipped)`;
    }
    showToast(message, 'success');
}


// Initialize import when DOM is ready
document.addEventListener('DOMContentLoaded', initializeImport);

// =====================
// Ticket Pool Functionality
// =====================

let poolState = {
    selectedTickets: new Set(),
    searchTerm: ''
};

function initializeTicketPool() {
    const toggleBtn = document.getElementById('togglePoolBtn');
    const saveBtn = document.getElementById('savePoolBtn');
    const searchInput = document.getElementById('poolSearchInput');
    const selectAllCheckbox = document.getElementById('selectAllPool');
    const assignCurrentBtn = document.getElementById('assignToCurrentWeek');
    const assignNextBtn = document.getElementById('assignToNextWeek');
    const deleteBtn = document.getElementById('deleteFromPool');
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleTicketPool);
    }
    
    if (saveBtn) {
        saveBtn.addEventListener('click', saveTicketPool);
    }
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            poolState.searchTerm = e.target.value.toLowerCase();
            renderTicketPool();
        });
    }
    
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            toggleSelectAllPool(e.target.checked);
        });
    }
    
    if (assignCurrentBtn) {
        assignCurrentBtn.addEventListener('click', () => assignSelectedToWeek('current'));
    }
    
    if (assignNextBtn) {
        assignNextBtn.addEventListener('click', () => assignSelectedToWeek('nextWeekPlan'));
    }
    
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deleteSelectedFromPool);
    }
}

function toggleTicketPool() {
    const section = document.getElementById('ticketPoolSection');
    section.classList.toggle('collapsed');
}

function saveTicketPool() {
    console.log('Manual save triggered. Pool has', state.ticketPool.length, 'tickets');
    
    database.ref('/ticketPool').set(state.ticketPool.length > 0 ? state.ticketPool : null)
        .then(() => {
            console.log('Ticket pool saved manually');
            showToast(`Saved ${state.ticketPool.length} tickets to pool`, 'success');
        })
        .catch(err => {
            console.error('Error saving ticket pool:', err);
            showToast('Error saving pool. Please try again.', 'error');
        });
}

function renderTicketPool() {
    const container = document.getElementById('poolTickets');
    const countEl = document.getElementById('poolTicketCount');
    const selectAllCheckbox = document.getElementById('selectAllPool');
    
    // Filter tickets based on search
    let filteredTickets = state.ticketPool;
    if (poolState.searchTerm) {
        filteredTickets = state.ticketPool.filter(ticket => 
            ticket.ticketId.toLowerCase().includes(poolState.searchTerm) ||
            ticket.name.toLowerCase().includes(poolState.searchTerm) ||
            ticket.tester.toLowerCase().includes(poolState.searchTerm)
        );
    }
    
    // Update count
    countEl.textContent = `${state.ticketPool.length} ticket${state.ticketPool.length !== 1 ? 's' : ''}`;
    
    // Clear invalid selections
    poolState.selectedTickets = new Set(
        [...poolState.selectedTickets].filter(id => 
            state.ticketPool.some(t => t.id === id)
        )
    );
    
    // Update select all checkbox
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = filteredTickets.length > 0 && 
            filteredTickets.every(t => poolState.selectedTickets.has(t.id));
    }
    
    // Update selection actions visibility
    updatePoolSelectionActions();
    
    if (filteredTickets.length === 0) {
        container.innerHTML = `
            <div class="pool-empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                    <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/>
                </svg>
                <p>${poolState.searchTerm ? 'No matching tickets' : 'No tickets in pool'}</p>
                <span>${poolState.searchTerm ? 'Try a different search term' : 'Import tickets from Excel to add them here'}</span>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredTickets.map(ticket => renderPoolTicketCard(ticket)).join('');
    
    // Add click handlers
    container.querySelectorAll('.pool-ticket-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
                const checkbox = card.querySelector('.pool-ticket-checkbox');
                checkbox.checked = !checkbox.checked;
                togglePoolTicketSelection(card.dataset.id, checkbox.checked);
            }
        });
        
        card.querySelector('.pool-ticket-checkbox').addEventListener('change', (e) => {
            togglePoolTicketSelection(card.dataset.id, e.target.checked);
        });
    });
}

function renderPoolTicketCard(ticket) {
    const isSelected = poolState.selectedTickets.has(ticket.id);
    
    return `
        <div class="pool-ticket-card ${isSelected ? 'selected' : ''}" data-id="${ticket.id}">
            <input type="checkbox" class="pool-ticket-checkbox" ${isSelected ? 'checked' : ''}>
            <div class="pool-ticket-info">
                <div class="pool-ticket-header">
                    <span class="pool-ticket-id">${escapeHtml(ticket.ticketId)}</span>
                    <span class="pool-ticket-priority ${ticket.priority}">${ticket.priority}</span>
                </div>
                <div class="pool-ticket-name" title="${escapeHtml(ticket.name)}">${escapeHtml(ticket.name)}</div>
                <div class="pool-ticket-meta">
                    <span>👤 ${escapeHtml(ticket.tester)}</span>
                    <span>⏱️ ${ticket.estimatedHours}h</span>
                    <span class="pool-ticket-status">${formatStatus(ticket.status)}</span>
                </div>
            </div>
        </div>
    `;
}

function togglePoolTicketSelection(ticketId, isSelected) {
    if (isSelected) {
        poolState.selectedTickets.add(ticketId);
    } else {
        poolState.selectedTickets.delete(ticketId);
    }
    
    // Update card visual state
    const card = document.querySelector(`.pool-ticket-card[data-id="${ticketId}"]`);
    if (card) {
        card.classList.toggle('selected', isSelected);
    }
    
    // Update select all checkbox
    const selectAllCheckbox = document.getElementById('selectAllPool');
    const filteredTickets = getFilteredPoolTickets();
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = filteredTickets.length > 0 && 
            filteredTickets.every(t => poolState.selectedTickets.has(t.id));
    }
    
    updatePoolSelectionActions();
}

function toggleSelectAllPool(selectAll) {
    const filteredTickets = getFilteredPoolTickets();
    
    if (selectAll) {
        filteredTickets.forEach(t => poolState.selectedTickets.add(t.id));
    } else {
        filteredTickets.forEach(t => poolState.selectedTickets.delete(t.id));
    }
    
    renderTicketPool();
}

function getFilteredPoolTickets() {
    if (!poolState.searchTerm) return state.ticketPool;
    
    return state.ticketPool.filter(ticket => 
        ticket.ticketId.toLowerCase().includes(poolState.searchTerm) ||
        ticket.name.toLowerCase().includes(poolState.searchTerm) ||
        ticket.tester.toLowerCase().includes(poolState.searchTerm)
    );
}

function updatePoolSelectionActions() {
    const actionsEl = document.getElementById('poolSelectionActions');
    const countEl = document.getElementById('selectedPoolCount');
    
    if (poolState.selectedTickets.size > 0) {
        actionsEl.style.display = 'flex';
        countEl.textContent = `${poolState.selectedTickets.size} selected`;
    } else {
        actionsEl.style.display = 'none';
    }
}

function assignSelectedToWeek(weekType) {
    if (poolState.selectedTickets.size === 0) {
        showToast('No tickets selected', 'error');
        return;
    }
    
    const selectedIds = [...poolState.selectedTickets];
    let addedCount = 0;
    let duplicateCount = 0;
    
    // Get existing ticket IDs in target week
    const targetTickets = weekType === 'current' ? state.currentWeekTickets : state.nextWeekPlanTickets;
    const existingIds = new Set(targetTickets.map(t => t.ticketId.toLowerCase().trim()));
    
    selectedIds.forEach(id => {
        const ticketIndex = state.ticketPool.findIndex(t => t.id === id);
        if (ticketIndex !== -1) {
            const poolTicket = state.ticketPool[ticketIndex];
            
            // Check if ticket ID already exists in target week
            if (existingIds.has(poolTicket.ticketId.toLowerCase().trim())) {
                duplicateCount++;
                return;
            }
            
            // Create new ticket for the week
            const newTicket = {
                ...poolTicket,
                id: generateId(), // Generate new ID for week ticket
                carriedOver: false,
                createdAt: new Date().toISOString()
            };
            
            // Add to target week
            if (weekType === 'current') {
                state.currentWeekTickets.push(newTicket);
            } else {
                state.nextWeekPlanTickets.push(newTicket);
            }
            
            // Remove from pool
            state.ticketPool.splice(ticketIndex, 1);
            addedCount++;
        }
    });
    
    // Clear selections
    poolState.selectedTickets.clear();
    
    // Save and re-render
    saveToStorage();
    renderTicketPool();
    renderTickets();
    
    const weekName = weekType === 'current' ? 'Current Week' : 'Next Week';
    let message = `Added ${addedCount} ticket${addedCount !== 1 ? 's' : ''} to ${weekName}`;
    if (duplicateCount > 0) {
        message += ` (${duplicateCount} duplicate${duplicateCount !== 1 ? 's' : ''} skipped)`;
    }
    showToast(message, 'success');
}

function deleteSelectedFromPool() {
    if (poolState.selectedTickets.size === 0) {
        showToast('No tickets selected', 'error');
        return;
    }
    
    const count = poolState.selectedTickets.size;
    
    if (!confirm(`Are you sure you want to delete ${count} ticket${count !== 1 ? 's' : ''} from the pool?`)) {
        return;
    }
    
    // Remove selected tickets
    state.ticketPool = state.ticketPool.filter(t => !poolState.selectedTickets.has(t.id));
    
    // Clear selections
    poolState.selectedTickets.clear();
    
    // Save and re-render
    saveToStorage();
    renderTicketPool();
    
    showToast(`Deleted ${count} ticket${count !== 1 ? 's' : ''} from pool`, 'success');
}

// Initialize ticket pool when DOM is ready
document.addEventListener('DOMContentLoaded', initializeTicketPool);

// =====================
// Daily Planning Functionality
// =====================

let dailyPlanState = {
    currentTicket: null,
    currentWeek: null,
    currentIndex: null,
    activeTab: 'yesterday'
};

function formatDayDate(date) {
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function getYesterday() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
}

function getToday() {
    return new Date();
}

function getDailyPlanKey(ticketId, date) {
    const dateStr = date.toISOString().split('T')[0];
    return `${ticketId}_${dateStr}`;
}

function openDailyPlanModal(week, index) {
    const tickets = (week === 'current' || week === 'next') ? state.currentWeekTickets : state.nextWeekPlanTickets;
    const ticket = tickets[index];
    
    if (!ticket) return;
    
    dailyPlanState.currentTicket = ticket;
    dailyPlanState.currentWeek = week;
    dailyPlanState.currentIndex = index;
    dailyPlanState.activeTab = 'yesterday';
    
    // Populate ticket info
    document.getElementById('dailyPlanTicketId').textContent = ticket.ticketId;
    document.getElementById('dailyPlanTicketName').textContent = ticket.name;
    document.getElementById('dailyPlanTicketTester').textContent = ticket.tester;
    document.getElementById('dailyPlanTicketHours').textContent = `${ticket.actualHours}h / ${ticket.estimatedHours}h`;
    
    // Set status badge
    const statusEl = document.getElementById('dailyPlanTicketStatus');
    statusEl.textContent = formatStatus(ticket.status);
    statusEl.className = 'ticket-info-status ' + ticket.status;
    
    // Set dates
    document.getElementById('yesterdayDate').textContent = formatDayDate(getYesterday());
    document.getElementById('todayDate').textContent = formatDayDate(getToday());
    
    // Load existing daily plan data
    loadDailyPlanData(ticket);
    
    // Set active tab
    switchDailyTab('yesterday');
    
    // Load daily log history
    loadDailyLogHistory(ticket);
    
    // Show modal
    document.getElementById('dailyPlanModal').classList.add('active');
}

function closeDailyPlanModal() {
    document.getElementById('dailyPlanModal').classList.remove('active');
    dailyPlanState.currentTicket = null;
    dailyPlanState.currentWeek = null;
    dailyPlanState.currentIndex = null;
    
    // Reset form fields
    document.getElementById('yesterdayHours').value = 0;
    document.getElementById('yesterdayNotes').value = '';
    document.getElementById('yesterdayStatus').value = 'nil';
    document.getElementById('todayPlannedHours').value = 0;
    document.getElementById('todayTasks').value = '';
    document.getElementById('todayGoal').value = 'continue';
}

function switchDailyTab(day) {
    dailyPlanState.activeTab = day;
    
    // Update tab buttons
    document.querySelectorAll('.daily-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.day === day);
    });
    
    // Update panels
    document.getElementById('yesterdayPanel').classList.toggle('active', day === 'yesterday');
    document.getElementById('todayPanel').classList.toggle('active', day === 'today');
}

function loadDailyPlanData(ticket) {
    // Initialize daily plans array if not exists
    if (!ticket.dailyPlans) {
        ticket.dailyPlans = [];
    }
    
    const yesterday = getYesterday();
    const today = getToday();
    
    // Find yesterday's plan
    const yesterdayKey = getDailyPlanKey(ticket.id, yesterday);
    const yesterdayPlan = ticket.dailyPlans.find(p => p.key === yesterdayKey);
    
    if (yesterdayPlan) {
        document.getElementById('yesterdayHours').value = yesterdayPlan.hours || 0;
        document.getElementById('yesterdayNotes').value = yesterdayPlan.notes || '';
        document.getElementById('yesterdayStatus').value = yesterdayPlan.status || ticket.status;
    } else {
        document.getElementById('yesterdayHours').value = 0;
        document.getElementById('yesterdayNotes').value = '';
        document.getElementById('yesterdayStatus').value = ticket.status;
    }
    
    // Find today's plan
    const todayKey = getDailyPlanKey(ticket.id, today);
    const todayPlan = ticket.dailyPlans.find(p => p.key === todayKey && p.type === 'plan');
    
    if (todayPlan) {
        document.getElementById('todayPlannedHours').value = todayPlan.plannedHours || 0;
        document.getElementById('todayTasks').value = todayPlan.tasks || '';
        document.getElementById('todayGoal').value = todayPlan.goal || 'continue';
    } else {
        document.getElementById('todayPlannedHours').value = 0;
        document.getElementById('todayTasks').value = '';
        document.getElementById('todayGoal').value = 'continue';
    }
}

function loadDailyLogHistory(ticket) {
    const logContent = document.getElementById('dailyLogContent');
    
    if (!ticket.dailyPlans || ticket.dailyPlans.length === 0) {
        logContent.innerHTML = `
            <div class="daily-log-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
                </svg>
                <p>No daily entries yet</p>
            </div>
        `;
        return;
    }
    
    // Sort by date descending
    const sortedPlans = [...ticket.dailyPlans].sort((a, b) => {
        return new Date(b.date) - new Date(a.date);
    });
    
    let html = '';
    sortedPlans.forEach(plan => {
        const planDate = new Date(plan.date);
        const typeClass = plan.type === 'actual' ? 'actual' : 'plan';
        const typeLabel = plan.type === 'actual' ? 'Actual' : 'Plan';
        
        html += `
            <div class="daily-log-entry">
                <div class="log-entry-header">
                    <span class="log-entry-date">${formatDayDate(planDate)}</span>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <span class="log-entry-type ${typeClass}">${typeLabel}</span>
                        <span class="log-entry-hours">${plan.hours || plan.plannedHours || 0}h</span>
                    </div>
                </div>
                ${plan.notes || plan.tasks ? `<div class="log-entry-notes">${escapeHtml(plan.notes || plan.tasks)}</div>` : ''}
            </div>
        `;
    });
    
    logContent.innerHTML = html;
}

function saveDailyPlan() {
    if (!dailyPlanState.currentTicket) return;
    
    const ticket = dailyPlanState.currentTicket;
    const week = dailyPlanState.currentWeek;
    const index = dailyPlanState.currentIndex;
    
    // Initialize daily plans array if not exists
    if (!ticket.dailyPlans) {
        ticket.dailyPlans = [];
    }
    
    const yesterday = getYesterday();
    const today = getToday();
    
    // Save yesterday's actual data
    const yesterdayHours = parseFloat(document.getElementById('yesterdayHours').value) || 0;
    const yesterdayNotes = document.getElementById('yesterdayNotes').value.trim();
    const yesterdayStatus = document.getElementById('yesterdayStatus').value;
    const statusChanged = yesterdayStatus !== ticket.status;
    
    if (yesterdayHours > 0 || yesterdayNotes || statusChanged) {
        const yesterdayKey = getDailyPlanKey(ticket.id, yesterday);
        const existingYesterdayIndex = ticket.dailyPlans.findIndex(p => p.key === yesterdayKey && p.type === 'actual');
        
        const yesterdayEntry = {
            key: yesterdayKey,
            type: 'actual',
            date: yesterday.toISOString(),
            hours: yesterdayHours,
            notes: yesterdayNotes,
            status: yesterdayStatus,
            updatedAt: new Date().toISOString()
        };
        
        if (existingYesterdayIndex >= 0) {
            ticket.dailyPlans[existingYesterdayIndex] = yesterdayEntry;
        } else {
            ticket.dailyPlans.push(yesterdayEntry);
        }
        
        // Update ticket's actual hours (add yesterday's hours to the total)
        // Only add if this is a new entry or hours changed
        if (existingYesterdayIndex < 0) {
            ticket.actualHours = (ticket.actualHours || 0) + yesterdayHours;
        } else {
            const previousHours = ticket.dailyPlans[existingYesterdayIndex]?.hours || 0;
            ticket.actualHours = (ticket.actualHours || 0) - previousHours + yesterdayHours;
        }
        
        // Update ticket status if changed
        if (yesterdayStatus !== ticket.status) {
            ticket.status = yesterdayStatus;
        }
    }
    
    // Save today's plan
    const todayPlannedHours = parseFloat(document.getElementById('todayPlannedHours').value) || 0;
    const todayTasks = document.getElementById('todayTasks').value.trim();
    const todayGoal = document.getElementById('todayGoal').value;
    
    if (todayPlannedHours > 0 || todayTasks) {
        const todayKey = getDailyPlanKey(ticket.id, today);
        const existingTodayIndex = ticket.dailyPlans.findIndex(p => p.key === todayKey && p.type === 'plan');
        
        const todayEntry = {
            key: todayKey,
            type: 'plan',
            date: today.toISOString(),
            plannedHours: todayPlannedHours,
            tasks: todayTasks,
            goal: todayGoal,
            updatedAt: new Date().toISOString()
        };
        
        if (existingTodayIndex >= 0) {
            ticket.dailyPlans[existingTodayIndex] = todayEntry;
        } else {
            ticket.dailyPlans.push(todayEntry);
        }
    }
    
    // Update the ticket in state
    const tickets = (week === 'current' || week === 'next') ? state.currentWeekTickets : state.nextWeekPlanTickets;
    tickets[index] = ticket;
    
    // Save to Firebase
    saveToStorage();
    
    // Re-render tickets
    renderTickets();
    
    // Close modal
    closeDailyPlanModal();
    
    showToast('Daily plan saved successfully!', 'success');
}

function toggleDailyLog() {
    const logContent = document.getElementById('dailyLogContent');
    logContent.classList.toggle('collapsed');
    
    // Update chevron rotation
    const chevron = document.querySelector('.log-chevron');
    if (logContent.classList.contains('collapsed')) {
        chevron.style.transform = 'rotate(-90deg)';
    } else {
        chevron.style.transform = 'rotate(0deg)';
    }
}

// Initialize Daily Plan Modal Event Listeners
function initializeDailyPlanModal() {
    // Close button
    document.getElementById('closeDailyPlanModal').addEventListener('click', closeDailyPlanModal);
    document.getElementById('cancelDailyPlan').addEventListener('click', closeDailyPlanModal);
    
    // Save button
    document.getElementById('saveDailyPlan').addEventListener('click', saveDailyPlan);
    
    // Tab switching
    document.querySelectorAll('.daily-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchDailyTab(tab.dataset.day);
        });
    });
    
    // Toggle daily log
    document.getElementById('toggleDailyLog').addEventListener('click', toggleDailyLog);
    
    // Close on overlay click
    document.getElementById('dailyPlanModal').addEventListener('click', (e) => {
        if (e.target.id === 'dailyPlanModal') {
            closeDailyPlanModal();
        }
    });
    
    // Keyboard shortcut to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('dailyPlanModal').classList.contains('active')) {
            closeDailyPlanModal();
        }
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeDailyPlanModal);

// Handle ticket card click - opens daily plan modal
function handleTicketCardClick(event, week, index) {
    // Don't open if clicking on action buttons (they have stopPropagation but just in case)
    if (event.target.closest('.ticket-actions') || event.target.closest('.ticket-action-btn')) {
        return;
    }
    openDailyPlanModal(week, index);
}

// Make functions globally available
window.openDailyPlanModal = openDailyPlanModal;
window.handleTicketCardClick = handleTicketCardClick;