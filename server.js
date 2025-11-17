const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');

// Azure Kusto SDK imports (dynamic import for ES modules)
let Client, DefaultAzureCredential;

const app = express();

// Initialize Azure Kusto Client (lazy initialization)
let kustoClient = null;

async function getKustoClient(clusterUrl) {
    if (!kustoClient || kustoClient.clusterUrl !== clusterUrl) {
        try {
            // Dynamic import for ES modules with better error handling
            if (!Client || !DefaultAzureCredential) {
                console.log('🔄 Loading Azure Kusto SDK...');
                
                const [kustoModule, identityModule] = await Promise.all([
                    import('azure-kusto-data').catch(e => {
                        console.error('Failed to import azure-kusto-data:', e.message);
                        throw new Error('Kusto SDK not available - using fallback mode');
                    }),
                    import('@azure/identity').catch(e => {
                        console.error('Failed to import @azure/identity:', e.message);
                        throw new Error('Azure Identity SDK not available');
                    })
                ]);
                
                Client = kustoModule.Client;
                DefaultAzureCredential = identityModule.DefaultAzureCredential;
                console.log('✅ Azure SDKs loaded successfully');
            }
            
            // Use DefaultAzureCredential with fallback chain
            // Production: Uses Managed Identity when deployed to Azure
            // Local Dev: Falls back to Azure CLI credentials
            const credential = new DefaultAzureCredential({
                // Enable environment variables (for Service Principal in CI/CD)
                excludeEnvironmentCredential: false,
                // Enable Managed Identity (for Azure-hosted apps)
                excludeManagedIdentityCredential: false,
                // Enable Azure CLI (for local development)
                excludeAzureCliCredential: false,
                // Disable others for security
                excludeAzurePowerShellCredential: true,
                excludeVisualStudioCodeCredential: true,
                excludeInteractiveBrowserCredential: true
            });
            
            console.log('🔐 Initializing Kusto client with Azure CLI credentials...');
            kustoClient = new Client(clusterUrl, credential);
            kustoClient.clusterUrl = clusterUrl; // Store for comparison
            console.log('✅ Kusto client initialized:', clusterUrl);
            
        } catch (error) {
            console.error('❌ Failed to initialize Kusto client:', error.message);
            throw new Error(`Kusto authentication failed: ${error.message}`);
        }
    }
    return kustoClient;
}

// Security middleware with relaxed CSP for dashboard functionality
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://d3js.org", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'self'", "'unsafe-inline'"],
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
// Exclude index.html from static serving to prevent conflicts
app.use(express.static(__dirname, {
    index: false,  // This prevents index.html from being served automatically
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

// Favicon route to prevent 404 errors
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
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

// Live Kusto query execution endpoint
app.post('/api/execute-query', async (req, res) => {
    try {
        const { query, cluster, database, dryRun = false } = req.body;
        
        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }
        
        // Default to Azure Portal telemetry if not specified
        const kustoCluster = cluster || 'https://azportalpartnerrow.westus.kusto.windows.net';
        const kustoDatabase = database || 'AzurePortal';
        
        console.log('🔄 Kusto Query Request:', { 
            cluster: kustoCluster, 
            database: kustoDatabase, 
            dryRun 
        });
        
        // Option 1: Dry Run Mode (for testing)
        if (dryRun) {
            const mockResponse = {
                query: query,
                cluster: kustoCluster,
                database: kustoDatabase,
                executedAt: new Date().toISOString(),
                status: 'dry-run-success',
                message: 'Query validated - ready for live execution',
                mode: 'mock',
                sampleData: {
                    columns: ['name', 'MAU_by_Blade'],
                    rows: [
                        ['Extension/Microsoft_Azure_Policy/Blade/PolicyMenuBlade', 129272],
                        ['Extension/Microsoft_Azure_Policy/Blade/Compliance.ReactView', 114597],
                        ['Extension/Microsoft_Azure_Policy/Blade/ScopeSelectorBlade', 33032]
                    ]
                }
            };
            return res.json(mockResponse);
        }
        
        // Option 2: Live Kusto Execution
        try {
            const client = await getKustoClient(kustoCluster);
            
            console.log('🚀 Executing live Kusto query...');
            
            // Add timeout to prevent hanging
            const queryPromise = client.execute(kustoDatabase, query);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Query timeout after 30 seconds')), 30000)
            );
            
            const results = await Promise.race([queryPromise, timeoutPromise]);
            
            // Process Kusto results into dashboard format
            const processedData = {
                query: query,
                cluster: kustoCluster,
                database: kustoDatabase,
                executedAt: new Date().toISOString(),
                status: 'live-success',
                message: 'Live Kusto query executed successfully',
                mode: 'live',
                resultCount: results.primaryResults[0]?.count || 0,
                data: {
                    columns: results.primaryResults[0]?.columns?.map(col => col.name) || [],
                    rows: results.primaryResults[0]?.rows || [],
                    metadata: {
                        queryDuration: results.queryDuration,
                        dataSetCompletion: results.dataSetCompletion
                    }
                }
            };
            
            console.log('✅ Kusto query successful:', {
                rows: processedData.data.rows.length,
                columns: processedData.data.columns.length
            });
            
            res.json(processedData);
            
        } catch (kustoError) {
            console.error('❌ Kusto execution failed:', kustoError.message);
            
            // Detect specific error types
            const is401 = kustoError.message.includes('401') || kustoError.message.includes('Unauthorized');
            const errorType = is401 ? 'permission' : 'connection';
            
            // Enhanced fallback with detailed error info
            const fallbackResponse = {
                query: query,
                cluster: kustoCluster,
                database: kustoDatabase,
                executedAt: new Date().toISOString(),
                status: 'fallback-mock',
                error: kustoError.message,
                errorType: errorType,
                message: is401 
                    ? '⚠️ Access Denied: You need Viewer permissions on this Kusto database. Contact the cluster owner to request access.'
                    : 'Kusto connection failed - using mock data. Check network connectivity and credentials.',
                mode: 'fallback',
                troubleshooting: {
                    steps: is401 ? [
                        '1. Request "Viewer" role on the Kusto database',
                        '2. Contact cluster owner or Azure Portal Telemetry team',
                        '3. Verify you\'re logged in: az login',
                        '4. Wait 5-10 minutes after permissions are granted'
                    ] : [
                        '1. Ensure Azure CLI is logged in: az login',
                        '2. Check network connectivity (avoid phone hotspots)',
                        '3. Verify cluster URL is correct',
                        '4. For testing: set dryRun: true in frontend'
                    ],
                    authMethod: 'Azure CLI credentials via DefaultAzureCredential',
                    helpLink: is401 ? 'Request access from cluster administrators' : 'Check Azure documentation'
                },
                sampleData: {
                    columns: ['name', 'MAU_by_Blade'],
                    rows: [
                        ['Extension/Microsoft_Azure_Policy/Blade/PolicyMenuBlade', 129272],
                        ['Extension/Microsoft_Azure_Policy/Blade/Compliance.ReactView', 114597],
                        ['Extension/Microsoft_Azure_Policy/Blade/ScopeSelectorBlade', 33032]
                    ]
                }
            };
            
            res.status(206).json(fallbackResponse); // 206 = Partial Content
        }
        
    } catch (error) {
        console.error('💥 Server error:', error);
        res.status(500).json({ 
            error: 'Server error executing Kusto query',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
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