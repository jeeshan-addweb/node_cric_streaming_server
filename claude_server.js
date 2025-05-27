const NodeMediaServer = require('node-media-server');
const { spawn } = require('child_process');
const express = require('express');

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
    debugMode: true              // Extra logging
};

// Cricket score data
let cricketScore = {
    team1: "India",
    team1Score: "245/4",
    team1Overs: "38.2",
    team2: "Australia", 
    team2Score: "198/7",
    team2Overs: "35.0",
    status: "India batting"
};

function startOverlayForStream(streamKey) {
    if (ffmpegProcesses[streamKey]) {
        console.log(`[Overlay] Already running for ${streamKey}`);
        return;
    }

    // Clean and escape the score text for FFmpeg
    const scoreText = `${cricketScore.team1} ${cricketScore.team1Score} (${cricketScore.team1Overs}) | ${cricketScore.team2} ${cricketScore.team2Score} (${cricketScore.team2Overs}) | ${cricketScore.status}`;
    
    // Escape special characters for FFmpeg drawtext
    const escapedText = scoreText
        .replace(/:/g, '\\:')     // Escape colons
        .replace(/'/g, "\\'")     // Escape single quotes
        .replace(/"/g, '\\"')     // Escape double quotes
        .replace(/\(/g, '\\(')    // Escape parentheses
        .replace(/\)/g, '\\)')
        .replace(/\|/g, '\\|');   // Escape pipe characters
    
    const inputStream = `rtmp://localhost:1935/live/${streamKey}`;
    const outputStream = `rtmp://localhost:1935/overlay/${streamKey}`;

    console.log(`[Overlay] Starting for ${streamKey}`);
    console.log(`[Overlay] Input: ${inputStream}`);
    console.log(`[Overlay] Output: ${outputStream}`);
    console.log(`[Overlay] Score text: ${scoreText}`);
    console.log(`[Overlay] Escaped text: ${escapedText}`);

    const ffmpeg = spawn('ffmpeg', [
        '-i', inputStream,
        '-vf', `drawtext=text='${escapedText}':fontcolor=white:fontsize=24:box=1:boxcolor=black@0.7:boxborderw=5:x=10:y=h-th-10`,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-c:a', 'copy',
        '-f', 'flv',
        outputStream
    ]);

    ffmpeg.stderr.on('data', data => {
        console.log(`[FFmpeg ${streamKey}] ${data}`);
    });

    ffmpeg.stdout.on('data', data => {
        console.log(`[FFmpeg ${streamKey} stdout] ${data}`);
    });

    ffmpeg.on('close', code => {
        console.log(`[FFmpeg ${streamKey}] process exited with code ${code}`);
        delete ffmpegProcesses[streamKey];
    });

    ffmpeg.on('exit', (code, signal) => {
        console.log(`[FFmpeg ${streamKey}] exited with code ${code}, signal ${signal}`);
    });

    ffmpeg.on('error', (err) => {
        console.error(`[FFmpeg ${streamKey}] Error:`, err);
        delete ffmpegProcesses[streamKey];
    });

    ffmpegProcesses[streamKey] = ffmpeg;
}

function stopOverlayForStream(streamKey) {
    console.log(`[Overlay] Stopping for ${streamKey}`);
    
    if (ffmpegProcesses[streamKey]) {
        ffmpegProcesses[streamKey].kill('SIGINT');
        setTimeout(() => {
            delete ffmpegProcesses[streamKey];
        }, 1000);
    }
}

// Event handlers
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
        // Try to extract from StreamPath
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
        startOverlayForStream(streamKey);
    }, 2000);
});

nms.on('donePublish', (id, StreamPath, args) => {
    console.log('[NodeEvent on donePublish]', `id=${id} StreamPath=${StreamPath} args=${JSON.stringify(args)}`);
    
    // Debug: Check what we actually received
    console.log('[Debug] donePublish StreamPath:', StreamPath);
    
    // Handle cases where StreamPath might be undefined
    if (!StreamPath) {
        console.log('[Warning] StreamPath is undefined in donePublish, stopping all overlays');
        // Stop all overlays as fallback
        Object.keys(ffmpegProcesses).forEach(key => {
            stopOverlayForStream(key);
        });
        return;
    }
    
    // Don't process overlay streams
    if (StreamPath.includes('/overlay/')) {
        return;
    }
    
    let streamKey;
    try {
        streamKey = StreamPath.split('/').pop();
        if (!streamKey) {
            streamKey = 'test'; // Fallback
        }
    } catch (error) {
        console.error('[Error] Failed to extract stream key in donePublish:', error);
        streamKey = 'test'; // Fallback
    }
    
    stopOverlayForStream(streamKey);
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

// Express API for score updates and manual control
const app = express();
app.use(express.json());

app.post('/update-score', (req, res) => {
    const oldScore = { ...cricketScore };
    cricketScore = { ...cricketScore, ...req.body };
    console.log('[Score Update] Old:', oldScore);
    console.log('[Score Update] New:', cricketScore);
    
    // Restart all active overlays with new score
    let restarted = 0;
    Object.keys(ffmpegProcesses).forEach(streamKey => {
        console.log(`[Score Update] Restarting overlay for: ${streamKey}`);
        stopOverlayForStream(streamKey);
        
        setTimeout(() => {
            startOverlayForStream(streamKey);
            restarted++;
        }, 3000);
    });
    
    res.json({ 
        success: true, 
        currentScore: cricketScore,
        overlaysRestarted: restarted
    });
});

app.get('/current-score', (req, res) => {
    res.json(cricketScore);
});

// Manual control endpoints
app.post('/start-overlay', (req, res) => {
    const { streamKey } = req.body;
    if (!streamKey) {
        return res.status(400).json({ success: false, message: 'streamKey required' });
    }
    
    try {
        startOverlayForStream(streamKey);
        res.json({ 
            success: true, 
            message: `Overlay started for ${streamKey}`,
            inputStream: `rtmp://localhost:1935/live/${streamKey}`,
            overlayStream: `rtmp://localhost:1935/overlay/${streamKey}`
        });
    } catch (error) {
        console.error('[Manual] Failed to start overlay:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Test with simple overlay (no dynamic text)
app.post('/start-simple-overlay', (req, res) => {
    const { streamKey } = req.body;
    if (!streamKey) {
        return res.status(400).json({ success: false, message: 'streamKey required' });
    }
    
    const inputStream = `rtmp://localhost:1935/live/${streamKey}`;
    const outputStream = `rtmp://localhost:1935/overlay/${streamKey}`;
    
    console.log(`[Simple Overlay] Starting for ${streamKey}`);
    
    const ffmpeg = spawn('ffmpeg', [
        '-i', inputStream,
        '-vf', 'drawtext=text=TEST_OVERLAY:fontcolor=white:fontsize=30:box=1:boxcolor=black@0.7:x=10:y=h-th-50',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-c:a', 'copy',
        '-f', 'flv',
        outputStream
    ]);
    
    ffmpeg.stderr.on('data', data => {
        console.log(`[Simple FFmpeg ${streamKey}] ${data}`);
    });
    
    ffmpeg.on('close', code => {
        console.log(`[Simple FFmpeg ${streamKey}] process exited with code ${code}`);
    });
    
    res.json({ 
        success: true, 
        message: `Simple overlay started for ${streamKey}`,
        inputStream: inputStream,
        overlayStream: outputStream
    });
});

app.post('/stop-overlay', (req, res) => {
    const { streamKey } = req.body;
    if (!streamKey) {
        return res.status(400).json({ success: false, message: 'streamKey required' });
    }
    
    stopOverlayForStream(streamKey);
    res.json({ success: true, message: `Overlay stopped for ${streamKey}` });
});

// Debug endpoint
app.get('/debug/streams', (req, res) => {
    res.json({
        activeOverlays: Object.keys(ffmpegProcesses),
        currentScore: cricketScore,
        serverInfo: {
            rtmpPort: 1935,
            httpPort: 8000,
            apiPort: 3001
        }
    });
});

app.listen(3001, () => {
    console.log('[API] Score update server running on port 3001');
    console.log('[API] Endpoints:');
    console.log('[API] POST /start-overlay {"streamKey": "test"}');
    console.log('[API] POST /start-simple-overlay {"streamKey": "test"}');
    console.log('[API] POST /stop-overlay {"streamKey": "test"}');
    console.log('[API] POST /update-score {score data}');
    console.log('[API] GET /debug/streams');
});

// Auto-update scores for demo (remove in production)
setInterval(() => {
    const randomRuns = Math.floor(Math.random() * 6) + 1;
    const currentRuns = parseInt(cricketScore.team1Score.split('/')[0]);
    cricketScore.team1Score = `${currentRuns + randomRuns}/${cricketScore.team1Score.split('/')[1]}`;
    
    console.log('[Auto Update] Score updated:', cricketScore.team1Score);
    
    // Auto-restart overlays with new score
    Object.keys(ffmpegProcesses).forEach(streamKey => {
        stopOverlayForStream(streamKey);
        setTimeout(() => {
            startOverlayForStream(streamKey);
        }, 2000);
    });
}, 30000);

// Start the media server
nms.run();

console.log('=================================');
console.log('[Server] RTMP server started on port 1935');
console.log('[Server] HTTP server started on port 8000');
console.log('[Server] API server started on port 3001');
console.log('=================================');
console.log('[Usage] Stream to: rtmp://localhost:1935/live/test');
console.log('[Usage] Watch overlay: rtmp://localhost:1935/overlay/test');
console.log('[Usage] Manual start: curl -X POST http://localhost:3001/start-overlay -H "Content-Type: application/json" -d \'{"streamKey": "test"}\'');
console.log('[Usage] Simple test: curl -X POST http://localhost:3001/start-simple-overlay -H "Content-Type: application/json" -d \'{"streamKey": "test"}\'');
console.log('=================================');