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

// State Management
const state = {
    currentWeekStart: null, // Will be initialized in DOMContentLoaded
    currentWeekTickets: [],
    nextWeekPlanTickets: [],
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
    
    database.ref().update(updates).catch(error => {
        console.error('Error saving to Firebase:', error);
        showToast('Error saving data. Please try again.', 'error');
    });
    
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
        database.ref(`/capacity/${nextCapacityKey}`).once('value')
    ]).then(([currentSnap, nextSnap, currentCapSnap, nextCapSnap]) => {
        state.currentWeekTickets = currentSnap.val() || [];
        state.nextWeekPlanTickets = nextSnap.val() || [];
        state.currentWeekCapacity = currentCapSnap.val() || {};
        state.nextWeekCapacity = nextCapSnap.val() || {};
        
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
    }).catch(error => {
        console.error('Error loading from Firebase:', error);
        showToast('Error loading data. Please refresh the page.', 'error');
        
        // Initialize with empty data
        state.currentWeekTickets = [];
        state.nextWeekPlanTickets = [];
        initializeCapacity();
        renderTickets();
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
    
    return `
        <div class="ticket-card ${statusClass} ${priorityClass} ${carriedClass} ${carriedToNextClass}" data-index="${index}" data-week="${week}">
            <div class="ticket-header">
                <span class="ticket-id">${ticketIdDisplay}</span>
                <div class="ticket-actions">
                    ${week === 'current' && !ticket.carriedToNextWeek ? `
                    <button class="ticket-action-btn move" onclick="moveTicket('${week}', ${index})" title="Copy to Next Week">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </button>
                    ` : ''}
                    <button class="ticket-action-btn edit" onclick="editTicket('${week}', ${index})" title="Edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="ticket-action-btn delete" onclick="deleteTicket('${week}', ${index})" title="Delete">
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
        const statusOrder = ['in-progress', 'qc-testing', 'qc-testing-in-progress', 'testing-in-progress', 'bis-testing', 'qc-testing-hold', 'qc-review-fail', 'tested-awaiting-fixes', 'approved-for-live', 'closed', 'nil'];
        sortedKeys.sort((a, b) => statusOrder.indexOf(a) - statusOrder.indexOf(b));
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
            { key: 'qc-testing', name: 'QC Testing' },
            { key: 'qc-testing-in-progress', name: 'QC Testing In Progress' },
            { key: 'qc-testing-hold', name: 'QC Testing Hold' },
            { key: 'qc-review-fail', name: 'QC Review Fail' },
            { key: 'testing-in-progress', name: 'Testing In Progress' },
            { key: 'tested-awaiting-fixes', name: 'Tested - Awaiting Fixes' },
            { key: 'bis-testing', name: 'BIS Testing' },
            { key: 'approved-for-live', name: 'Approved for Live' },
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
    const headers = ['Week', 'Tester Name', 'Ticket ID', 'Summary', 'Status', 'Priority', 'Estimated Hours', 'Actual Hours'];
    
    const rows = tickets.map(ticket => ({
        'Week': formatWeekRange(ticket.weekStart),
        'Tester Name': ticket.tester,
        'Ticket ID': ticket.ticketId,
        'Summary': ticket.name,
        'Status': formatStatus(ticket.status),
        'Priority': ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1),
        'Estimated Hours': ticket.estimatedHours,
        'Actual Hours': ticket.actualHours
    }));
    
    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
    
    // Set column widths
    ws['!cols'] = [
        { wch: 20 },  // Week
        { wch: 22 },  // Tester Name
        { wch: 15 },  // Ticket ID
        { wch: 40 },  // Summary
        { wch: 20 },  // Status
        { wch: 10 },  // Priority
        { wch: 15 },  // Estimated Hours
        { wch: 12 }   // Actual Hours
    ];
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Ticket Report');
    
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
    
    showToast(`Excel report generated with ${tickets.length} tickets!`, 'success');
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
    
    // ===== Sheet 1: Current Week Tickets =====
    const currentWeekHeaders = ['Week', 'Ticket ID', 'Summary', 'Tester', 'Status', 'Priority', 'Estimated Hours', 'Actual Hours', 'Remaining Hours', 'Carried Over', 'Moved to Next Week'];
    const currentWeekRows = state.currentWeekTickets.map(ticket => ({
        'Week': formatWeekRange(state.currentWeekStart),
        'Ticket ID': ticket.ticketId,
        'Summary': ticket.name,
        'Tester': ticket.tester,
        'Status': formatStatus(ticket.status),
        'Priority': ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1),
        'Estimated Hours': ticket.estimatedHours,
        'Actual Hours': ticket.actualHours,
        'Remaining Hours': Math.max(0, ticket.estimatedHours - ticket.actualHours),
        'Carried Over': ticket.carriedOver ? 'Yes' : 'No',
        'Moved to Next Week': ticket.carriedToNextWeek ? 'Yes' : 'No'
    }));
    
    const wsCurrentWeek = XLSX.utils.json_to_sheet(currentWeekRows, { header: currentWeekHeaders });
    wsCurrentWeek['!cols'] = [
        { wch: 20 }, { wch: 15 }, { wch: 40 }, { wch: 22 }, { wch: 22 }, { wch: 10 },
        { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, wsCurrentWeek, `Current Week (${formatDate(state.currentWeekStart)})`);
    
    // ===== Sheet 2: Next Week Tickets =====
    const nextWeekRows = state.nextWeekPlanTickets.map(ticket => ({
        'Week': formatWeekRange(nextWeekStart),
        'Ticket ID': ticket.ticketId,
        'Summary': ticket.name,
        'Tester': ticket.tester,
        'Status': formatStatus(ticket.status),
        'Priority': ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1),
        'Estimated Hours': ticket.estimatedHours,
        'Actual Hours': ticket.actualHours,
        'Remaining Hours': Math.max(0, ticket.estimatedHours - ticket.actualHours),
        'Carried Over': ticket.carriedOver ? 'Yes' : 'No',
        'Moved to Next Week': ticket.carriedToNextWeek ? 'Yes' : 'No'
    }));
    
    const wsNextWeek = XLSX.utils.json_to_sheet(nextWeekRows, { header: currentWeekHeaders });
    wsNextWeek['!cols'] = [
        { wch: 20 }, { wch: 15 }, { wch: 40 }, { wch: 22 }, { wch: 22 }, { wch: 10 },
        { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, wsNextWeek, `Next Week (${formatDate(nextWeekStart)})`);
    
    // ===== Sheet 3: Current Week Tester Capacity =====
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
    
    // ===== Sheet 4: Next Week Tester Capacity =====
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
    
    // ===== Sheet 5: Summary =====
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
        { 'Metric': 'Team Unplanned Hours', 'Current Week': TESTERS.reduce((sum, t) => sum + (state.currentWeekCapacity[t]?.totalHours ?? 40), 0) - currentStats.totalHours, 'Next Week': TESTERS.reduce((sum, t) => sum + (state.nextWeekCapacity[t]?.totalHours ?? 40), 0) - nextStats.totalHours }
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
