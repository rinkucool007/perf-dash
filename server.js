const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const port = 3005;

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

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});