const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const Papa = require('papaparse');
const app = express();
const port = 3001;

// Middleware to parse JSON bodies
app.use(express.json());
// Serve static files from the public directory
app.use('/public', express.static(path.join(__dirname, 'public')));
// Serve static files from the root directory
app.use(express.static(path.join(__dirname)));

// API to list available data folders
app.get('/api/data-folders', async (req, res) => {
    try {
        const dataDir = path.join(__dirname, 'data');
        const folders = await fs.readdir(dataDir);
        // Filter for valid MM-DD-YYYY format
        const validFolders = folders.filter(folder => {
            return folder.match(/^\d{2}-\d{2}-\d{4}$/);
        });
        res.json(validFolders);
    } catch (err) {
        console.error('Error reading data folders:', err);
        res.status(500).json({ error: 'Failed to list data folders' });
    }
});

// API to serve CSV file for a given date
app.get('/api/data/:date/results.csv', async (req, res) => {
    const date = req.params.date;
    const csvPath = path.join(__dirname, 'data', date, 'results.csv');
    try {
        await fs.access(csvPath);
        res.sendFile(csvPath);
    } catch (err) {
        res.status(404).json({ error: 'CSV file not found' });
    }
});

// API to handle chat queries
app.post('/api/chat', async (req, res) => {
    const { message, date } = req.body;
    if (!message || !date) {
        return res.status(400).json({ error: 'Message and date are required' });
    }

    const csvPath = path.join(__dirname, 'data', date, 'results.csv');
    try {
        const csvContent = await fs.readFile(csvPath, 'utf-8');
        const parsed = Papa.parse(csvContent, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: false,
            transformHeader: header => header.trim().replace(/^"|"$/g, ''),
            transform: (value, header) => {
                let cleaned = value.trim().replace(/^"|"$/g, '');
                if (header === 'timeStamp') {
                    return new Date(parseInt(cleaned)).toLocaleString('en-US', { timeZone: 'America/New_York' });
                }
                if (['elapsed', 'bytes', 'sentBytes', 'grpThreads', 'allThreads', 'Latency', 'IdleTime', 'Connect'].includes(header)) {
                    return parseInt(cleaned) || 0;
                }
                if (header === 'success') {
                    return cleaned.toLowerCase() === 'true';
                }
                return cleaned;
            }
        });

        if (parsed.errors.length > 0) {
            return res.status(500).json({ error: 'Error parsing CSV data' });
        }

        const data = parsed.data;
        const response = processQuery(message, data, date);
        res.json({ response });
    } catch (err) {
        console.error('Error processing chat query:', err);
        res.status(500).json({ error: 'Failed to process query' });
    }
});

// Simple query processing logic
function processQuery(message, data, date) {
    message = message.toLowerCase().trim();
    const dateStr = date.replace(/-/g, '/');

    // Handle average response time
    if (message.includes('average response time') || message.includes('avg response time')) {
        const avgResponseTime = data.reduce((sum, item) => sum + item.elapsed, 0) / data.length;
        return `The average response time on ${dateStr} was ${avgResponseTime.toFixed(2)} ms.`;
    }

    // Handle total requests
    if (message.includes('total requests') || message.includes('number of requests')) {
        return `There were ${data.length} requests on ${dateStr}.`;
    }

    // Handle error count
    if (message.includes('errors') || message.includes('failed requests')) {
        const errorCount = data.filter(item => !item.success).length;
        return `There were ${errorCount} failed requests on ${dateStr}.`;
    }

    // Handle throughput
    if (message.includes('throughput') || message.includes('requests per second')) {
        const startTime = new Date(data[0].timeStamp).getTime();
        const endTime = new Date(data[data.length - 1].timeStamp).getTime();
        const durationSeconds = (endTime - startTime) / 1000;
        const throughput = data.length / durationSeconds;
        return `The throughput on ${dateStr} was approximately ${throughput.toFixed(2)} requests per second.`;
    }

    // Handle specific endpoint
    if (message.includes('endpoint') || message.includes('label')) {
        const endpointMatch = message.match(/endpoint\s+([^\s]+)/) || message.match(/label\s+([^\s]+)/);
        if (endpointMatch) {
            const endpoint = endpointMatch[1];
            const endpointData = data.filter(item => item.label.toLowerCase().includes(endpoint));
            if (endpointData.length === 0) {
                return `No data found for endpoint "${endpoint}" on ${dateStr}.`;
            }
            const avgResponseTime = endpointData.reduce((sum, item) => sum + item.elapsed, 0) / endpointData.length;
            return `For endpoint "${endpoint}" on ${dateStr}, the average response time was ${avgResponseTime.toFixed(2)} ms based on ${endpointData.length} requests.`;
        }
    }

    // Default response
    return `Sorry, I didn't understand your question. You can ask about average response time, total requests, errors, throughput, or specific endpoints for ${dateStr}.`;
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
