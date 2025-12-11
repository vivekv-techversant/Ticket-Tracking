/**
 * Ticket Tracking API - Glitch Server
 * 
 * Endpoints:
 * - GET /api/tickets - Get all tickets (pool + weeks)
 * - GET /api/tickets/pool - Get ticket pool only
 * - GET /api/ticket/:ticketId - Get specific ticket by ID
 * - GET /api/export/excel - Download Excel file with all data
 * - GET /health - Health check endpoint
 */

const express = require('express');
const cors = require('cors');
const XLSX = require('xlsx');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
// You'll need to set these environment variables in Glitch
const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.FIREBASE_CERT_URL
};

// Only initialize if credentials are provided
let database = null;
if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`
        });
        database = admin.database();
        console.log('Firebase initialized successfully');
    } catch (error) {
        console.error('Firebase initialization error:', error.message);
    }
} else {
    console.log('Firebase credentials not found. Set environment variables.');
}

// Helper: Convert Firebase object to array
function toArray(data) {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data === 'object') return Object.values(data);
    return [];
}

// Helper: Format ticket for export
function formatTicket(ticket, source) {
    return {
        ticketId: ticket.ticketId || '',
        name: ticket.name || '',
        tester: ticket.tester || '',
        status: ticket.status || '',
        priority: ticket.priority || '',
        estimatedHours: ticket.estimatedHours || 0,
        actualHours: ticket.actualHours || 0,
        createdAt: ticket.createdAt || '',
        updatedAt: ticket.updatedAt || '',
        source: source,
        internalId: ticket.id || ''
    };
}

// Middleware to check Firebase connection
function checkFirebase(req, res, next) {
    if (!database) {
        return res.status(503).json({ 
            error: 'Database not configured',
            message: 'Firebase credentials not set. Please configure environment variables.'
        });
    }
    next();
}

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Ticket Tracking API is running',
        firebase: database ? 'connected' : 'not configured',
        endpoints: [
            'GET /api/tickets - Get all tickets',
            'GET /api/tickets/pool - Get ticket pool',
            'GET /api/ticket/:id - Get ticket by ID',
            'GET /api/export/excel - Download Excel'
        ]
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /api/tickets
 * Returns all tickets from pool and all weeks
 */
app.get('/api/tickets', checkFirebase, async (req, res) => {
    try {
        // Fetch all data
        const [poolSnap, ticketsSnap] = await Promise.all([
            database.ref('/ticketPool').once('value'),
            database.ref('/tickets').once('value')
        ]);

        const poolData = toArray(poolSnap.val());
        const allWeeksData = ticketsSnap.val() || {};

        // Format response
        const response = {
            timestamp: new Date().toISOString(),
            ticketPool: poolData.map(t => formatTicket(t, 'pool')),
            weeks: {}
        };

        // Add all weeks
        Object.keys(allWeeksData).forEach(weekKey => {
            response.weeks[weekKey] = toArray(allWeeksData[weekKey]).map(t => 
                formatTicket(t, weekKey)
            );
        });

        // Summary
        response.summary = {
            poolCount: response.ticketPool.length,
            weeksCount: Object.keys(response.weeks).length,
            totalTickets: response.ticketPool.length + 
                Object.values(response.weeks).reduce((sum, arr) => sum + arr.length, 0)
        };

        res.json(response);
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

/**
 * GET /api/tickets/pool
 * Returns only ticket pool
 */
app.get('/api/tickets/pool', checkFirebase, async (req, res) => {
    try {
        const poolSnap = await database.ref('/ticketPool').once('value');
        const poolData = toArray(poolSnap.val());

        res.json({
            timestamp: new Date().toISOString(),
            count: poolData.length,
            tickets: poolData.map(t => formatTicket(t, 'pool'))
        });
    } catch (error) {
        console.error('Error fetching pool:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

/**
 * GET /api/tickets/weeks
 * Returns all week tickets (excluding pool)
 */
app.get('/api/tickets/weeks', checkFirebase, async (req, res) => {
    try {
        const ticketsSnap = await database.ref('/tickets').once('value');
        const allWeeksData = ticketsSnap.val() || {};

        const response = {
            timestamp: new Date().toISOString(),
            weeks: {}
        };

        Object.keys(allWeeksData).sort().forEach(weekKey => {
            response.weeks[weekKey] = toArray(allWeeksData[weekKey]).map(t => 
                formatTicket(t, weekKey)
            );
        });

        response.totalTickets = Object.values(response.weeks)
            .reduce((sum, arr) => sum + arr.length, 0);

        res.json(response);
    } catch (error) {
        console.error('Error fetching weeks:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

/**
 * GET /api/ticket/:ticketId
 * Get a specific ticket by ID (searches all sources)
 */
app.get('/api/ticket/:ticketId', checkFirebase, async (req, res) => {
    try {
        const { ticketId } = req.params;
        
        if (!ticketId) {
            return res.status(400).json({ error: 'Ticket ID is required' });
        }

        // Fetch all data
        const [poolSnap, ticketsSnap] = await Promise.all([
            database.ref('/ticketPool').once('value'),
            database.ref('/tickets').once('value')
        ]);

        const poolData = toArray(poolSnap.val());
        const allWeeksData = ticketsSnap.val() || {};

        // Search in pool
        let found = poolData.find(t => 
            t.ticketId?.toString().toLowerCase() === ticketId.toLowerCase()
        );
        if (found) {
            return res.json({
                found: true,
                source: 'pool',
                ticket: formatTicket(found, 'pool')
            });
        }

        // Search in weeks
        for (const weekKey of Object.keys(allWeeksData)) {
            const weekTickets = toArray(allWeeksData[weekKey]);
            found = weekTickets.find(t => 
                t.ticketId?.toString().toLowerCase() === ticketId.toLowerCase()
            );
            if (found) {
                return res.json({
                    found: true,
                    source: weekKey,
                    ticket: formatTicket(found, weekKey)
                });
            }
        }

        res.status(404).json({ found: false, message: 'Ticket not found' });
    } catch (error) {
        console.error('Error finding ticket:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

/**
 * GET /api/export/excel
 * Returns Excel file with all ticket data
 */
app.get('/api/export/excel', checkFirebase, async (req, res) => {
    try {
        // Fetch all data
        const [poolSnap, ticketsSnap] = await Promise.all([
            database.ref('/ticketPool').once('value'),
            database.ref('/tickets').once('value')
        ]);

        const poolData = toArray(poolSnap.val());
        const allWeeksData = ticketsSnap.val() || {};

        // Create workbook
        const workbook = XLSX.utils.book_new();

        // All Tickets sheet (combined)
        const allTickets = [];
        
        // Add pool tickets
        poolData.forEach(t => {
            allTickets.push({
                'Source': 'Ticket Pool',
                'Ticket ID': t.ticketId,
                'Ticket Name': t.name,
                'Tester': t.tester,
                'Status': t.status,
                'Priority': t.priority,
                'Estimated Hours': t.estimatedHours || 0,
                'Actual Hours': t.actualHours || 0,
                'Created At': t.createdAt || '',
                'Updated At': t.updatedAt || ''
            });
        });

        // Add week tickets
        Object.keys(allWeeksData).sort().forEach(weekKey => {
            const weekTickets = toArray(allWeeksData[weekKey]);
            weekTickets.forEach(t => {
                allTickets.push({
                    'Source': weekKey,
                    'Ticket ID': t.ticketId,
                    'Ticket Name': t.name,
                    'Tester': t.tester,
                    'Status': t.status,
                    'Priority': t.priority,
                    'Estimated Hours': t.estimatedHours || 0,
                    'Actual Hours': t.actualHours || 0,
                    'Created At': t.createdAt || '',
                    'Updated At': t.updatedAt || ''
                });
            });
        });

        // Create sheets
        if (allTickets.length > 0) {
            const allSheet = XLSX.utils.json_to_sheet(allTickets);
            XLSX.utils.book_append_sheet(workbook, allSheet, 'All Tickets');
        }

        // Pool sheet
        if (poolData.length > 0) {
            const poolSheet = XLSX.utils.json_to_sheet(poolData.map(t => ({
                'Ticket ID': t.ticketId,
                'Ticket Name': t.name,
                'Tester': t.tester,
                'Status': t.status,
                'Priority': t.priority,
                'Estimated Hours': t.estimatedHours || 0,
                'Actual Hours': t.actualHours || 0
            })));
            XLSX.utils.book_append_sheet(workbook, poolSheet, 'Ticket Pool');
        }

        // Individual week sheets
        Object.keys(allWeeksData).sort().forEach(weekKey => {
            const weekTickets = toArray(allWeeksData[weekKey]);
            if (weekTickets.length > 0) {
                const weekSheet = XLSX.utils.json_to_sheet(weekTickets.map(t => ({
                    'Ticket ID': t.ticketId,
                    'Ticket Name': t.name,
                    'Tester': t.tester,
                    'Status': t.status,
                    'Priority': t.priority,
                    'Estimated Hours': t.estimatedHours || 0,
                    'Actual Hours': t.actualHours || 0
                })));
                // Shorten week key for sheet name (max 31 chars)
                const sheetName = weekKey.replace('week_', 'W').substring(0, 31);
                XLSX.utils.book_append_sheet(workbook, weekSheet, sheetName);
            }
        });

        // Generate buffer
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        // Send file
        const filename = `tickets_export_${new Date().toISOString().split('T')[0]}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (error) {
        console.error('Error exporting Excel:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 API endpoints available at http://localhost:${PORT}`);
});


