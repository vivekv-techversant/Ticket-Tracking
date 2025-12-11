# Ticket Tracking API - Glitch Deployment

A simple REST API to access your ticket data and export to Excel.

## 🚀 Quick Setup on Glitch

### Step 1: Create a New Project on Glitch
1. Go to [glitch.com](https://glitch.com)
2. Click **"New Project"** → **"glitch-hello-node"**
3. This creates a new Node.js project

### Step 2: Replace the Code
1. In Glitch editor, delete all existing files except `.env`
2. Create `server.js` and paste the contents from this folder's `server.js`
3. Create `package.json` and paste the contents from this folder's `package.json`

### Step 3: Get Firebase Service Account Key
1. Go to [Firebase Console](https://console.firebase.google.com/project/weeklyqc-a5587/settings/serviceaccounts/adminsdk)
2. Click **"Generate new private key"**
3. Download the JSON file

### Step 4: Set Environment Variables in Glitch
1. In Glitch, click on `.env` file (it's private and secure)
2. Add these variables from your downloaded JSON:

```
FIREBASE_PROJECT_ID=weeklyqc-a5587
FIREBASE_PRIVATE_KEY_ID=<private_key_id from JSON>
FIREBASE_PRIVATE_KEY=<private_key from JSON - keep the \n characters>
FIREBASE_CLIENT_EMAIL=<client_email from JSON>
FIREBASE_CLIENT_ID=<client_id from JSON>
FIREBASE_CERT_URL=<client_x509_cert_url from JSON>
```

**Important:** For `FIREBASE_PRIVATE_KEY`, copy the entire key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`

### Step 5: Your API is Live!
Your API will be available at:
```
https://your-project-name.glitch.me
```

## 📡 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | API info and health check |
| `GET /health` | Simple health check |
| `GET /api/tickets` | Get all tickets (pool + all weeks) |
| `GET /api/tickets/pool` | Get ticket pool only |
| `GET /api/tickets/weeks` | Get all week tickets |
| `GET /api/ticket/:id` | Get specific ticket by ID |
| `GET /api/export/excel` | Download Excel file |

## 📋 Example Responses

### GET /api/tickets
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

### GET /api/ticket/4299
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

## 🔧 Usage Examples

### Using cURL
```bash
# Get all tickets
curl https://your-project.glitch.me/api/tickets

# Get ticket pool
curl https://your-project.glitch.me/api/tickets/pool

# Get specific ticket
curl https://your-project.glitch.me/api/ticket/4299

# Download Excel file
curl -o tickets.xlsx https://your-project.glitch.me/api/export/excel
```

### Using JavaScript/Fetch
```javascript
// Get all tickets
const response = await fetch('https://your-project.glitch.me/api/tickets');
const data = await response.json();
console.log(data.ticketPool);
console.log(data.weeks);
```

### Using Power Automate
1. Add HTTP action
2. Method: GET
3. URI: `https://your-project.glitch.me/api/tickets`
4. Parse JSON response

### Using in Browser
Simply open in browser:
- `https://your-project.glitch.me/api/tickets` - View JSON
- `https://your-project.glitch.me/api/export/excel` - Download Excel

## ⚠️ Notes

- **Sleep Mode:** Free Glitch apps sleep after 5 minutes of inactivity. First request after sleep takes ~10-30 seconds.
- **Keep Awake:** Use a service like [UptimeRobot](https://uptimerobot.com) to ping `/health` every 5 minutes to keep it awake.
- **Rate Limits:** Free tier allows 4000 requests/hour.

## 🔒 Security

- The `.env` file in Glitch is private and not visible to others
- Your Firebase credentials are secure
- The API is read-only (no write operations)


