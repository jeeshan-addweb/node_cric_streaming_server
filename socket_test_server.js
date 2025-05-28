const NodeMediaServer = require('node-media-server');
const { spawn } = require('child_process');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs').promises;
const path = require('path');

// Import the overlay designer
const { OverlayDesigner, OVERLAY_STYLES } = require('./overlayDesigns');

const config = {
    logType: 3,
    rtmp: {
        port: 1935,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60,
        allow_publish: ['live', 'overlay'] // This is crucial!
    },
    http: {
        port: 8000,
        mediaroot: './media',
        allow_origin: '*'
    }
};

const nms = new NodeMediaServer(config);
let ffmpegProcesses = {};

// Configuration
const STREAM_CONFIG = {
    useHardcodedStreamKey: true, // Set to false to use dynamic stream keys
    defaultStreamKey: 'test',    // Used when hardcoded or as fallback
    debugMode: true,             // Extra logging
    defaultOverlayStyle: 'custom' // Default overlay style
};

// File paths for score storage
const SCORE_FILE_PATH = path.join(__dirname, 'cricket_score.json');
const SCORE_TEXT_PATH = path.join(__dirname, 'score_display.txt');

// Enhanced cricket score data with additional fields for advanced overlays
let cricketScore = {
    team1: "India",
    team1Score: "245/4",
    team1Overs: "38.2",
    team1Color: "#FF6B35", // Team 1 accent color
    team2: "Australia", 
    team2Score: "198/7",
    team2Overs: "35.0",
    team2Color: "#FFD700", // Team 2 accent color
    status: "India batting",
    currentBatsman: "Virat Kohli",
    currentBowler: "Pat Cummins",
    lastBall: "4 (boundary)",
    currentRate: "6.42",
    requiredRate: "8.15",
    venue: "Melbourne Cricket Ground",
    matchType: "ODI World Cup",
    lastUpdated: new Date().toISOString()
};

// Initialize Express app and Socket.IO
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.json());

// Initialize overlay designer
let overlayDesigner = new OverlayDesigner(cricketScore, ffmpegProcesses);

// Load score from file on startup
async function loadScoreFromFile() {
    try {
        const data = await fs.readFile(SCORE_FILE_PATH, 'utf8');
        cricketScore = { ...cricketScore, ...JSON.parse(data) };
        console.log('[File] Score loaded from file:', cricketScore);
        // Update overlay designer with new score
        overlayDesigner.updateCricketScore(cricketScore);
        await updateScoreTextFile();
    } catch (error) {
        console.log('[File] No existing score file, using defaults');
        await saveScoreToFile();
        await updateScoreTextFile();
    }
}

// Save score to JSON file
async function saveScoreToFile() {
    try {
        cricketScore.lastUpdated = new Date().toISOString();
        await fs.writeFile(SCORE_FILE_PATH, JSON.stringify(cricketScore, null, 2));
        console.log('[File] Score saved to file');
    } catch (error) {
        console.error('[File] Error saving score:', error);
    }
}

// Update text file for overlay display
async function updateScoreTextFile() {
    try {
        const scoreText = `${cricketScore.team1} ${cricketScore.team1Score} (${cricketScore.team1Overs}) | ${cricketScore.team2} ${cricketScore.team2Score} (${cricketScore.team2Overs}) | ${cricketScore.status}`;
        await fs.writeFile(SCORE_TEXT_PATH, scoreText);
        console.log('[File] Score text file updated:', scoreText);
    } catch (error) {
        console.error('[File] Error updating text file:', error);
    }
}

// Watch for file changes and update overlays
let fileWatcher;
let lastModified = 0;

function watchScoreFile() {
    try {
        // Use fs.watchFile instead of fs.watch for better reliability
        const fs = require('fs');
        
        fileWatcher = fs.watchFile(SCORE_TEXT_PATH, { interval: 1000 }, async (curr, prev) => {
            // Check if file was actually modified
            if (curr.mtime !== prev.mtime && curr.mtime.getTime() !== lastModified) {
                lastModified = curr.mtime.getTime();
                console.log('[File Watcher] Score text file changed, updating overlays...');
                console.log('[File Watcher] Modified time:', curr.mtime);
                
                // Small delay to ensure file write is complete
                setTimeout(async () => {
                    try {
                        // Read the updated content to verify
                        const updatedContent = await fs.promises.readFile(SCORE_TEXT_PATH, 'utf8');
                        console.log('[File Watcher] New content:', updatedContent);
                        await restartAllOverlays();
                    } catch (readError) {
                        console.error('[File Watcher] Error reading updated file:', readError);
                    }
                }, 500);
            }
        });
        console.log('[File Watcher] Watching score text file for changes:', SCORE_TEXT_PATH);
    } catch (error) {
        console.error('[File Watcher] Error setting up file watcher:', error);
    }
}

// Updated overlay functions using the new overlay designer
function startOverlayForStream(streamKey, style = STREAM_CONFIG.defaultOverlayStyle) {
    if (ffmpegProcesses[streamKey]) {
        console.log(`[Overlay] Already running for ${streamKey}`);
        return false;
    }

    console.log(`[Overlay] Starting ${style} overlay for ${streamKey}`);
    
    // Use the advanced overlay designer
    const success = overlayDesigner.startAdvancedOverlay(streamKey, style);
    
    if (success) {
        console.log(`[Overlay] Successfully started ${style} overlay for ${streamKey}`);
        return true;
    } else {
        console.error(`[Overlay] Failed to start ${style} overlay for ${streamKey}`);
        return false;
    }
}

function startImageOverlayForStream(streamKey, templatePath) {
    if (ffmpegProcesses[streamKey]) {
        console.log(`[Image Overlay] Already running for ${streamKey}`);
        return false;
    }

    console.log(`[Image Overlay] Starting for ${streamKey} with template: ${templatePath}`);
    
    const success = overlayDesigner.startImageBasedOverlay(streamKey, templatePath);
    
    if (success) {
        console.log(`[Image Overlay] Successfully started for ${streamKey}`);
        return true;
    } else {
        console.error(`[Image Overlay] Failed to start for ${streamKey}`);
        return false;
    }
}

function stopOverlayForStream(streamKey) {
    console.log(`[Overlay] Stopping for ${streamKey}`);
    return overlayDesigner.stopOverlay(streamKey);
}

// Restart all active overlays with current style
async function restartAllOverlays() {
    const activeStreams = Object.keys(ffmpegProcesses);
    console.log(`[Overlay] Restarting ${activeStreams.length} overlays with new score`);
    
    // Update overlay designer with current score
    overlayDesigner.updateCricketScore(cricketScore);
    
    // Stop all overlays
    activeStreams.forEach(streamKey => {
        stopOverlayForStream(streamKey);
    });
    
    // Restart after a delay with the current style
    setTimeout(() => {
        activeStreams.forEach(streamKey => {
            startOverlayForStream(streamKey, STREAM_CONFIG.defaultOverlayStyle);
        });
    }, 2000);
}

// Socket.IO event handlers
io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);
    
    // Send current score and available styles to newly connected client
    socket.emit('currentScore', cricketScore);
    socket.emit('availableStyles', OVERLAY_STYLES);
    
    // Handle score updates from clients
    socket.on('updateScore', async (newScoreData) => {
        console.log('[Socket.IO] Received score update:', newScoreData);
        
        const oldScore = { ...cricketScore };
        cricketScore = { ...cricketScore, ...newScoreData };
        
        console.log('[Score Update] Old:', oldScore);
        console.log('[Score Update] New:', cricketScore);
        
        // Update overlay designer
        overlayDesigner.updateCricketScore(cricketScore);
        
        // Save to files
        await saveScoreToFile();
        await updateScoreTextFile();
        
        // Broadcast to all connected clients
        io.emit('scoreUpdated', cricketScore);
        
        // Acknowledge the update
        socket.emit('updateAcknowledged', {
            success: true,
            updatedScore: cricketScore,
            activeOverlays: Object.keys(ffmpegProcesses).length
        });
    });
    
    // Handle overlay style changes
    socket.on('changeOverlayStyle', (data) => {
        const { streamKey, style } = data;
        console.log(`[Socket.IO] Changing overlay style for ${streamKey} to ${style}`);
        
        if (!OVERLAY_STYLES[style]) {
            socket.emit('overlayError', { error: `Style '${style}' not found` });
            return;
        }
        
        // Stop current overlay
        if (ffmpegProcesses[streamKey]) {
            stopOverlayForStream(streamKey);
            
            // Start with new style after delay
            setTimeout(() => {
                const success = startOverlayForStream(streamKey, style);
                if (success) {
                    socket.emit('styleChanged', { streamKey, style, success: true });
                    io.emit('overlayStatus', { streamKey, status: 'style_changed', style });
                } else {
                    socket.emit('overlayError', { error: 'Failed to start overlay with new style' });
                }
            }, 1500);
        } else {
            // Start new overlay with specified style
            const success = startOverlayForStream(streamKey, style);
            if (success) {
                socket.emit('styleChanged', { streamKey, style, success: true });
                io.emit('overlayStatus', { streamKey, status: 'started', style });
            } else {
                socket.emit('overlayError', { error: 'Failed to start overlay' });
            }
        }
    });
    
    // Handle image-based overlay
    socket.on('startImageOverlay', (data) => {
        const { streamKey, templatePath } = data;
        if (streamKey && templatePath) {
            const success = startImageOverlayForStream(streamKey, templatePath);
            if (success) {
                socket.emit('imageOverlayStarted', { streamKey, templatePath, success: true });
                io.emit('overlayStatus', { streamKey, status: 'image_started', templatePath });
            } else {
                socket.emit('overlayError', { error: 'Failed to start image overlay' });
            }
        } else {
            socket.emit('overlayError', { error: 'streamKey and templatePath required' });
        }
    });
    
    // Handle manual overlay control
    socket.on('startOverlay', (data) => {
        const { streamKey, style = STREAM_CONFIG.defaultOverlayStyle } = data;
        if (streamKey) {
            const success = startOverlayForStream(streamKey, style);
            if (success) {
                socket.emit('overlayStarted', { streamKey, style, success: true });
                io.emit('overlayStatus', { streamKey, status: 'started', style });
            } else {
                socket.emit('overlayError', { error: 'Failed to start overlay' });
            }
        } else {
            socket.emit('overlayError', { error: 'streamKey required' });
        }
    });
    
    socket.on('stopOverlay', (data) => {
        const { streamKey } = data;
        if (streamKey) {
            const success = stopOverlayForStream(streamKey);
            if (success) {
                socket.emit('overlayStopped', { streamKey, success: true });
                io.emit('overlayStatus', { streamKey, status: 'stopped' });
            } else {
                socket.emit('overlayError', { error: 'No overlay running for this stream' });
            }
        } else {
            socket.emit('overlayError', { error: 'streamKey required' });
        }
    });
    
    // Handle client requesting current overlay status
    socket.on('getOverlayStatus', () => {
        socket.emit('overlayStatusList', {
            activeOverlays: Object.keys(ffmpegProcesses),
            currentScore: cricketScore,
            availableStyles: OVERLAY_STYLES,
            currentStyle: STREAM_CONFIG.defaultOverlayStyle
        });
    });
    
    // Get available overlay styles
    socket.on('getAvailableStyles', () => {
        socket.emit('availableStyles', OVERLAY_STYLES);
    });
    
    socket.on('disconnect', () => {
        console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
});

// Node Media Server event handlers
nms.on('preConnect', (id, args) => {
    console.log('[NodeEvent on preConnect]', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('postConnect', (id, args) => {
    console.log('[NodeEvent on postConnect]', `id=${id} args=${JSON.stringify(args)}`);
});

nms.on('prePublish', (id, StreamPath, args) => {
    console.log('[NodeEvent on prePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('postPublish', (id, StreamPath, args) => {
    console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
    
    if (STREAM_CONFIG.debugMode) {
        console.log('[Debug] StreamPath type:', typeof StreamPath);
        console.log('[Debug] StreamPath value:', StreamPath);
        console.log('[Debug] args:', args);
    }
    
    let streamKey;
    
    if (STREAM_CONFIG.useHardcodedStreamKey) {
        streamKey = STREAM_CONFIG.defaultStreamKey;
        console.log(`[Overlay] Using hardcoded stream key: ${streamKey}`);
    } else {
        if (!StreamPath) {
            console.log('[Warning] StreamPath is undefined/null/empty, using fallback');
            streamKey = STREAM_CONFIG.defaultStreamKey;
        } else if (StreamPath.includes('/overlay/')) {
            console.log('[Overlay] Skipping overlay stream');
            return;
        } else {
            try {
                streamKey = StreamPath.split('/').pop();
                console.log(`[Overlay] Extracted stream key: ${streamKey}`);
                
                if (!streamKey) {
                    console.log('[Warning] Could not extract stream key, using fallback');
                    streamKey = STREAM_CONFIG.defaultStreamKey;
                }
            } catch (error) {
                console.error('[Error] Failed to extract stream key:', error);
                streamKey = STREAM_CONFIG.defaultStreamKey;
            }
        }
    }
    
    // Start overlay after a short delay
    setTimeout(() => {
        startOverlayForStream(streamKey, STREAM_CONFIG.defaultOverlayStyle);
        // Notify clients about new stream
        io.emit('streamStarted', { streamKey, style: STREAM_CONFIG.defaultOverlayStyle });
    }, 2000);
});

nms.on('donePublish', (id, StreamPath, args) => {
    console.log('[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
    
    if (!StreamPath) {
        console.log('[Warning] StreamPath is undefined in donePublish, stopping all overlays');
        Object.keys(ffmpegProcesses).forEach(key => {
            stopOverlayForStream(key);
        });
        return;
    }
    
    if (StreamPath.includes('/overlay/')) {
        return;
    }
    
    let streamKey;
    try {
        streamKey = StreamPath.split('/').pop();
        if (!streamKey) {
            streamKey = 'test';
        }
    } catch (error) {
        console.error('[Error] Failed to extract stream key in donePublish:', error);
        streamKey = 'test';
    }
    
    stopOverlayForStream(streamKey);
    // Notify clients about stream end
    io.emit('streamEnded', { streamKey });
});

nms.on('prePlay', (id, StreamPath, args) => {
    console.log('[NodeEvent on prePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('postPlay', (id, StreamPath, args) => {
    console.log('[NodeEvent on postPlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

nms.on('donePlay', (id, StreamPath, args) => {
    console.log('[NodeEvent on donePlay]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
});

// Enhanced REST API endpoints
app.post('/update-score', async (req, res) => {
    const oldScore = { ...cricketScore };
    cricketScore = { ...cricketScore, ...req.body };
    console.log('[REST API] Score Update - Old:', oldScore);
    console.log('[REST API] Score Update - New:', cricketScore);
    
    // Update overlay designer
    overlayDesigner.updateCricketScore(cricketScore);
    
    // Save to files
    await saveScoreToFile();
    await updateScoreTextFile();
    
    // Broadcast to Socket.IO clients
    io.emit('scoreUpdated', cricketScore);
    
    const activeOverlays = Object.keys(ffmpegProcesses).length;
    res.json({ 
        success: true, 
        currentScore: cricketScore,
        activeOverlays: activeOverlays,
        message: 'Score updated and files saved'
    });
});

app.get('/current-score', (req, res) => {
    res.json(cricketScore);
});

// Enhanced overlay control endpoints
app.post('/start-overlay', (req, res) => {
    const { streamKey, style = STREAM_CONFIG.defaultOverlayStyle } = req.body;
    if (!streamKey) {
        return res.status(400).json({ success: false, message: 'streamKey required' });
    }
    
    try {
        const success = startOverlayForStream(streamKey, style);
        if (success) {
            io.emit('overlayStatus', { streamKey, status: 'started', style });
            res.json({ 
                success: true, 
                message: `${style} overlay started for ${streamKey}`,
                inputStream: `rtmp://localhost:1935/live/${streamKey}`,
                overlayStream: `rtmp://localhost:1935/overlay/${streamKey}`,
                style: style
            });
        } else {
            res.status(500).json({ success: false, message: 'Failed to start overlay' });
        }
    } catch (error) {
        console.error('[Manual] Failed to start overlay:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/start-image-overlay', (req, res) => {
    const { streamKey, templatePath } = req.body;
    if (!streamKey || !templatePath) {
        return res.status(400).json({ success: false, message: 'streamKey and templatePath required' });
    }
    
    try {
        const success = startImageOverlayForStream(streamKey, templatePath);
        if (success) {
            io.emit('overlayStatus', { streamKey, status: 'image_started', templatePath });
            res.json({ 
                success: true, 
                message: `Image overlay started for ${streamKey}`,
                templatePath: templatePath
            });
        } else {
            res.status(500).json({ success: false, message: 'Failed to start image overlay' });
        }
    } catch (error) {
        console.error('[Manual] Failed to start image overlay:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/change-overlay-style', (req, res) => {
    const { streamKey, style } = req.body;
    if (!streamKey || !style) {
        return res.status(400).json({ success: false, message: 'streamKey and style required' });
    }
    
    if (!OVERLAY_STYLES[style]) {
        return res.status(400).json({ success: false, message: `Style '${style}' not found` });
    }
    
    try {
        // Stop current overlay
        stopOverlayForStream(streamKey);
        
        // Start with new style after delay
        setTimeout(() => {
            const success = startOverlayForStream(streamKey, style);
            if (success) {
                io.emit('overlayStatus', { streamKey, status: 'style_changed', style });
            }
        }, 1500);
        
        res.json({ 
            success: true, 
            message: `Overlay style changed to ${style} for ${streamKey}`,
            style: style
        });
    } catch (error) {
        console.error('[Manual] Failed to change overlay style:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/stop-overlay', (req, res) => {
    const { streamKey } = req.body;
    if (!streamKey) {
        return res.status(400).json({ success: false, message: 'streamKey required' });
    }
    
    const success = stopOverlayForStream(streamKey);
    if (success) {
        io.emit('overlayStatus', { streamKey, status: 'stopped' });
        res.json({ success: true, message: `Overlay stopped for ${streamKey}` });
    } else {
        res.status(404).json({ success: false, message: `No overlay running for ${streamKey}` });
    }
});

// Get available overlay styles
app.get('/overlay-styles', (req, res) => {
    res.json({
        styles: OVERLAY_STYLES,
        currentDefault: STREAM_CONFIG.defaultOverlayStyle
    });
});

// Enhanced debug endpoint
app.get('/debug/streams', (req, res) => {
    res.json({
        activeOverlays: Object.keys(ffmpegProcesses),
        currentScore: cricketScore,
        availableStyles: OVERLAY_STYLES,
        currentStyle: STREAM_CONFIG.defaultOverlayStyle,
        serverInfo: {
            rtmpPort: 1935,
            httpPort: 8000,
            apiPort: 3001,
            socketIOConnections: io.engine.clientsCount
        },
        files: {
            scoreJsonPath: SCORE_FILE_PATH,
            scoreTextPath: SCORE_TEXT_PATH
        }
    });
});

// Test file watcher endpoint
app.post('/debug/test-watcher', async (req, res) => {
    try {
        const testContent = `TEST UPDATE ${new Date().toISOString()}`;
        await fs.writeFile(SCORE_TEXT_PATH, testContent);
        console.log('[Debug] Test content written to file:', testContent);
        res.json({ 
            success: true, 
            message: 'Test content written to file',
            content: testContent,
            filePath: SCORE_TEXT_PATH
        });
    } catch (error) {
        console.error('[Debug] Error writing test content:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Force overlay restart endpoint
app.post('/debug/restart-overlays', async (req, res) => {
    try {
        await restartAllOverlays();
        res.json({ 
            success: true, 
            message: 'All overlays restarted',
            activeOverlays: Object.keys(ffmpegProcesses),
            currentStyle: STREAM_CONFIG.defaultOverlayStyle
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the client interface
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize and start servers
async function startServer() {
    // Load existing score data
    await loadScoreFromFile();
    
    // Ensure the score text file exists before watching
    try {
        const fs = require('fs');
        await fs.promises.access(SCORE_TEXT_PATH);
    } catch (error) {
        console.log('[File] Score text file does not exist, creating it...');
        await updateScoreTextFile();
    }
    
    // Start watching the score file
    watchScoreFile();
    
    // Start the media server
    nms.run();
    
    // Start the HTTP/Socket.IO server
    server.listen(3001, () => {
        console.log('=================================');
        console.log('[Server] RTMP server started on port 1935');
        console.log('[Server] HTTP server started on port 8000');
        console.log('[Server] API/Socket.IO server started on port 3001');
        console.log('[Server] Test interface: http://localhost:3001');
        console.log('=================================');
        console.log('[Usage] Stream to: rtmp://localhost:1935/live/test');
        console.log('[Usage] Watch overlay: rtmp://localhost:1935/overlay/test');
        console.log('[Usage] Socket.IO: Connect to ws://localhost:3001');
        console.log('=================================');
        console.log('[Overlay] Available styles:', Object.keys(OVERLAY_STYLES).join(', '));
        console.log('[Overlay] Default style:', STREAM_CONFIG.defaultOverlayStyle);
        console.log('=================================');
        console.log('[Files] Score JSON: ' + SCORE_FILE_PATH);
        console.log('[Files] Score Text: ' + SCORE_TEXT_PATH);
        console.log('=================================');
    });
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[Shutdown] Stopping all overlays...');
    Object.keys(ffmpegProcesses).forEach(streamKey => {
        stopOverlayForStream(streamKey);
    });
    
    if (fileWatcher) {
        const fs = require('fs');
        fs.unwatchFile(SCORE_TEXT_PATH);
        console.log('[Shutdown] File watcher stopped');
    }
    
    setTimeout(() => {
        process.exit(0);
    }, 2000);
});

// Start the server
startServer().catch(console.error);