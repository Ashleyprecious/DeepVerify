// app.js
require('dotenv').config();                // Load environment variables from .env
const express = require('express');
const cors = require('cors');
const { initClaude } = require('./services/claudeService');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize the Anthropic Claude client with your API key
initClaude(process.env.ANTHROPIC_API_KEY);

// Middleware
app.use(cors());                           // Allow requests from your frontend (e.g., http://localhost:5500)
app.use(express.json({ limit: '50mb' }));  // Parse JSON bodies, increase limit for base64 images

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Mount the API routes (all endpoints start with /api)
app.use('/api', apiRoutes);

// Handle 404 – route not found
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler (optional, but good practice)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});