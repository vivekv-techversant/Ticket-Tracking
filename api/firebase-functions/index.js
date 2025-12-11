/**
 * Firebase Cloud Functions API for Ticket Tracking
 * 
 * Deploy with: firebase deploy --only functions
 * 
 * Endpoints:
 * - GET /api/tickets - Get all tickets (pool + weeks)
 * - GET /api/tickets/pool - Get ticket pool only
 * - GET /api/tickets/week/:weekKey - Get specific week tickets
 * - GET /api/export/excel - Download Excel file with all data
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const XLSX = require('xlsx');
const cors = require('cors')({ origin: true });

admin.initializeApp();
const database = admin.database();

// Helper: Get current week key
function getCurrentWeekKey() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    
    const year = monday.getFullYear();
    const month = String(monday.getMonth() + 1).padStart(2, '0');
    const day = String(monday.getDate()).padStart(2, '0');
    return `week_${year}_${month}_${day}`;
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

/**
 * GET /api/tickets
 * Returns all tickets from pool and all weeks
 */
exports.getTickets = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            if (req.method !== 'GET') {
                return res.status(405).json({ error: 'Method not allowed' });
            }

            // Optional API key authentication
            const apiKey = req.headers['x-api-key'] || req.query.apiKey;
            const expectedKey = functions.config().api?.key;
            if (expectedKey && apiKey !== expectedKey) {
                return res.status(401).json({ error: 'Unauthorized - Invalid API key' });
            }

            const currentWeekKey = getCurrentWeekKey();
            const nextWeekDate = new Date();
            nextWeekDate.setDate(nextWeekDate.getDate() + 7);
            const nextWeekKey = getCurrentWeekKey.call({ now: nextWeekDate });

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

            res.status(200).json(response);
        } catch (error) {
            console.error('Error fetching tickets:', error);
            res.status(500).json({ error: 'Internal server error', message: error.message });
        }
    });
});

/**
 * GET /api/tickets/pool
 * Returns only ticket pool
 */
exports.getTicketPool = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            if (req.method !== 'GET') {
                return res.status(405).json({ error: 'Method not allowed' });
            }

            const poolSnap = await database.ref('/ticketPool').once('value');
            const poolData = toArray(poolSnap.val());

            res.status(200).json({
                timestamp: new Date().toISOString(),
                count: poolData.length,
                tickets: poolData.map(t => formatTicket(t, 'pool'))
            });
        } catch (error) {
            console.error('Error fetching pool:', error);
            res.status(500).json({ error: 'Internal server error', message: error.message });
        }
    });
});

/**
 * GET /api/export/excel
 * Returns Excel file with all ticket data
 */
exports.exportExcel = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            if (req.method !== 'GET') {
                return res.status(405).json({ error: 'Method not allowed' });
            }

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
            const allSheet = XLSX.utils.json_to_sheet(allTickets);
            XLSX.utils.book_append_sheet(workbook, allSheet, 'All Tickets');

            // Pool sheet
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

            // Generate buffer
            const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

            // Send file
            const filename = `tickets_export_${new Date().toISOString().split('T')[0]}.xlsx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.status(200).send(buffer);
        } catch (error) {
            console.error('Error exporting Excel:', error);
            res.status(500).json({ error: 'Internal server error', message: error.message });
        }
    });
});

/**
 * GET /api/ticket/:ticketId
 * Get a specific ticket by ID (searches all sources)
 */
exports.getTicketById = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            if (req.method !== 'GET') {
                return res.status(405).json({ error: 'Method not allowed' });
            }

            const ticketId = req.query.id || req.path.split('/').pop();
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
                return res.status(200).json({
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
                    return res.status(200).json({
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
});

