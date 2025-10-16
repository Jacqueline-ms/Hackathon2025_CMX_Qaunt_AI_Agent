const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

// Security middleware with relaxed CSP for dashboard functionality
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://d3js.org", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "https:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// CORS for future API calls
app.use(cors());

// Parse JSON bodies for API requests
app.use(express.json());

// Serve static files (dashboard assets) with explicit routes
app.use(express.static(__dirname, {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (path.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json');
        }
    }
}));

// Explicit routes for critical assets to prevent 500 errors
app.get('/dashboard.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'dashboard.js'));
});

app.get('/dashboard.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(path.join(__dirname, 'dashboard.css'));
});

app.get('/test_ver11.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(path.join(__dirname, 'test_ver11.json'));
});

// Main dashboard route - serve the actual dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Dashboard route (for direct access)
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Legacy index route (redirect to dashboard)
app.get('/index', (req, res) => {
    res.redirect('/');
});

// API Routes (Future extensibility)
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Future: Custom query execution endpoint
app.post('/api/execute-query', (req, res) => {
    // TODO: Implement KQL query execution against Azure Data Explorer
    res.json({ 
        message: 'Query execution endpoint - coming soon!',
        received: req.body 
    });
});

// Future: Dashboard configuration management
app.get('/api/dashboards', (req, res) => {
    // TODO: List saved dashboard configurations
    res.json({ 
        dashboards: [],
        message: 'Dashboard management - coming soon!'
    });
});

app.post('/api/dashboards', (req, res) => {
    // TODO: Save new dashboard configuration
    res.json({ 
        message: 'Dashboard saved - coming soon!',
        config: req.body 
    });
});

// Current data endpoint (serves existing JSON)
app.get('/api/data/current', (req, res) => {
    res.sendFile(path.join(__dirname, 'test_ver11.json'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 Azure Blade Analytics Dashboard running on port ${port}`);
    console.log(`📊 Dashboard: http://localhost:${port}`);
    console.log(`🔧 API Health: http://localhost:${port}/api/health`);
});