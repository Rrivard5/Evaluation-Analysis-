const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Import your API handlers
const testKeyHandler = require('./api/test-key.js');
const processTextHandler = require('./api/process-text.js');
const uploadHandler = require('./api/upload.js');

// API routes
app.post('/api/test-key', testKeyHandler);
app.post('/api/process-text', processTextHandler);
app.post('/api/upload', uploadHandler);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Local API server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Local API server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoints available:`);
  console.log(`   - POST http://localhost:${PORT}/api/test-key`);
  console.log(`   - POST http://localhost:${PORT}/api/process-text`);
  console.log(`   - POST http://localhost:${PORT}/api/upload`);
  console.log(`   - GET  http://localhost:${PORT}/api/health`);
  console.log('');
  console.log('💡 Make sure your React app is running on http://localhost:3000');
});
