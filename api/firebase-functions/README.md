# Ticket Tracking API - Firebase Cloud Functions

This API provides webhook endpoints to access your ticket data and export to Excel.

## Setup Instructions

### 1. Install Firebase CLI (if not already installed)
```bash
npm install -g firebase-tools
```

### 2. Login to Firebase
```bash
firebase login
```

### 3. Initialize Firebase in this directory
```bash
cd api/firebase-functions
firebase init functions
```
- Select your existing Firebase project: `weeklyqc-a5587`
- Choose JavaScript
- Say "No" to ESLint
- Say "Yes" to install dependencies

### 4. Install dependencies
```bash
npm install
```

### 5. Deploy the functions
```bash
firebase deploy --only functions
```

## API Endpoints

After deployment, your endpoints will be available at:
`https://us-central1-weeklyqc-a5587.cloudfunctions.net/`

### 1. Get All Tickets
```
GET /getTickets
```
Returns all tickets from the pool and all weeks.

**Example Response:**
```json
{
  "timestamp": "2025-12-11T12:00:00.000Z",
  "ticketPool": [
    {
      "ticketId": "4299",
      "name": "BIS - Courses - Change emails...",
      "tester": "Aravind K V",
      "status": "in-progress",
      "priority": "high",
      "estimatedHours": 0,
      "actualHours": 0,
      "source": "pool"
    }
  ],
  "weeks": {
    "week_2025_12_07": [...]
  },
  "summary": {
    "poolCount": 64,
    "weeksCount": 2,
    "totalTickets": 104
  }
}
```

### 2. Get Ticket Pool Only
```
GET /getTicketPool
```
Returns only tickets in the pool.

**Example Response:**
```json
{
  "timestamp": "2025-12-11T12:00:00.000Z",
  "count": 64,
  "tickets": [...]
}
```

### 3. Get Specific Ticket by ID
```
GET /getTicketById?id=4299
```
Searches for a ticket by ID across all sources.

**Example Response:**
```json
{
  "found": true,
  "source": "pool",
  "ticket": {
    "ticketId": "4299",
    "name": "BIS - Courses - Change emails...",
    "tester": "Aravind K V",
    "status": "in-progress",
    "priority": "high",
    "estimatedHours": 0,
    "actualHours": 0
  }
}
```

### 4. Export to Excel
```
GET /exportExcel
```
Downloads an Excel file containing all tickets.

**Usage in browser:**
Simply navigate to the URL to download the file.

**Usage in code:**
```javascript
// Download Excel file
fetch('https://us-central1-weeklyqc-a5587.cloudfunctions.net/exportExcel')
  .then(response => response.blob())
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tickets_export.xlsx';
    a.click();
  });
```

## Usage Examples

### Using with Power Automate / Power BI
1. Use HTTP connector with GET method
2. URL: `https://us-central1-weeklyqc-a5587.cloudfunctions.net/getTickets`
3. Parse the JSON response

### Using with Zapier
1. Use Webhooks by Zapier (GET request)
2. URL: `https://us-central1-weeklyqc-a5587.cloudfunctions.net/getTickets`

### Using with cURL
```bash
# Get all tickets
curl https://us-central1-weeklyqc-a5587.cloudfunctions.net/getTickets

# Get ticket pool
curl https://us-central1-weeklyqc-a5587.cloudfunctions.net/getTicketPool

# Get specific ticket
curl "https://us-central1-weeklyqc-a5587.cloudfunctions.net/getTicketById?id=4299"

# Download Excel
curl -o tickets.xlsx https://us-central1-weeklyqc-a5587.cloudfunctions.net/exportExcel
```

### Using with JavaScript/Fetch
```javascript
// Get all tickets
const response = await fetch('https://us-central1-weeklyqc-a5587.cloudfunctions.net/getTickets');
const data = await response.json();
console.log(data.ticketPool);
console.log(data.weeks);
```

## Optional: Add API Key Authentication

To secure your API with an API key:

1. Set the API key in Firebase config:
```bash
firebase functions:config:set api.key="your-secret-api-key"
```

2. Include the key in requests:
```bash
curl -H "x-api-key: your-secret-api-key" https://us-central1-weeklyqc-a5587.cloudfunctions.net/getTickets
```

Or as a query parameter:
```
https://us-central1-weeklyqc-a5587.cloudfunctions.net/getTickets?apiKey=your-secret-api-key
```

## Troubleshooting

### Functions not deploying
- Make sure you're logged in: `firebase login`
- Check you have billing enabled (required for external npm packages)

### CORS errors
- The API includes CORS headers for all origins
- If you need to restrict origins, modify the `cors` config in `index.js`

### Data not showing
- Verify your Firebase database has data at `/ticketPool` and `/tickets`
- Check Firebase console for function logs

