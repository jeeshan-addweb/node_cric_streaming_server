# RTMP Overlay Server with Socket.IO

A Node.js server that adds real-time cricket score overlays to RTMP streams using FFmpeg and Socket.IO.

## 📁 Project Structure

```
your-project/
├── server.js              # Main server file
├── public/                 # Client-side files
│   ├── index.html         # Main web interface
│   ├── styles.css         # CSS styles
│   └── app.js             # Client-side JavaScript
├── cricket_score.json     # Score data (auto-generated)
├── score_display.txt      # Score text for overlay (auto-generated)
└── README.md              # This file
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install node-media-server socket.io express
```

### 2. Create Directory Structure

```bash
mkdir public
# Place the HTML, CSS, and JS files in the public directory
```

### 3. Start the Server

```bash
node server.js
```

### 4. Access the Web Interface

Open your browser and go to: `http://localhost:3001`

## 📺 Usage

### Streaming Setup

1. **Stream Input**: Configure your streaming software (OBS, etc.) to stream to:
   ```
   rtmp://localhost:1935/live/test
   ```

2. **Overlay Output**: Use this URL to view/restream the overlay version:
   ```
   rtmp://localhost:1935/overlay/test
   ```

### Score Updates

#### Via Web Interface
1. Open `http://localhost:3001`
2. Fill in the score form
3. Click "Update Score"
4. Overlays will automatically restart with new scores

#### Via Socket.IO (Real-time)
```javascript
const io = require('socket.io-client');
const socket = io('http://localhost:3001');

// Update score
socket.emit('updateScore', {
    team1: "India",
    team1Score: "250/5",
    team1Overs: "40.0",
    team2: "Australia",
    team2Score: "200/3",
    team2Overs: "35.0",
    status: "India batting"
});

// Listen for updates
socket.on('scoreUpdated', (score) => {
    console.log('Score updated:', score);
});
```

#### Via REST API
```bash
curl -X POST http://localhost:3001/update-score \
  -H "Content-Type: application/json" \
  -d '{
    "team1": "India",
    "team1Score": "250/5",
    "team1Overs": "40.0",
    "status": "India batting"
  }'
```

## 🔧 API Endpoints

### REST API
- `GET /` - Web interface
- `POST /update-score` - Update cricket score
- `GET /current-score` - Get current score
- `POST /start-overlay` - Start overlay for stream
- `POST /stop-overlay` - Stop overlay for stream
- `GET /debug/streams` - Debug information
- `POST /debug/test-watcher` - Test file watcher
- `POST /debug/restart-overlays` - Force restart overlays

### Socket.IO Events

#### Client → Server
- `updateScore` - Update score data
- `startOverlay` - Start overlay
- `stopOverlay` - Stop overlay  
- `getOverlayStatus` - Get current status

#### Server → Client
- `currentScore` - Current score data
- `scoreUpdated` - Score was updated
- `overlayStarted` - Overlay started
- `overlayStopped` - Overlay stopped
- `overlayStatus` - Overlay status change
- `streamStarted` - New stream detected
- `streamEnded` - Stream ended

## 🎯 Features

### Real-time Updates
- ✅ Socket.IO for instant score updates
- ✅ File-based persistence
- ✅ Automatic overlay refresh
- ✅ File watcher for external updates

### Web Interface
- ✅ Modern, responsive design
- ✅ Real-time connection status
- ✅ Live score display
- ✅ Overlay control buttons
- ✅ Debug tools
- ✅ Copy-to-clipboard for URLs

### Server Features
- ✅ RTMP stream processing
- ✅ FFmpeg overlay generation
- ✅ Multiple stream support
- ✅ Automatic stream detection
- ✅ Error handling and recovery

## 🛠️ Configuration

Edit the `STREAM_CONFIG` object in `server.js`:

```javascript
const STREAM_CONFIG = {
    useHardcodedStreamKey: true,  // Use fixed stream key
    defaultStreamKey: 'test',     // Default stream key
    debugMode: true               // Enable debug logging
};
```

## 🐛 Troubleshooting

### File Watcher Not Working
1. Check file permissions in the project directory
2. Test manually: `curl -X POST http://localhost:3001/debug/test-watcher`
3. Try the chokidar alternative (install: `npm install chokidar`)

### Overlay Not Appearing
1. Ensure FFmpeg is installed and in PATH
2. Check the input stream is active
3. Verify stream key matches
4. Check console logs for FFmpeg errors

### Connection Issues
1. Check if ports 1935, 3001, 8000 are available
2. Verify firewall settings
3. Check Socket.IO connection in browser console

## 📊 Monitoring

Use the debug endpoints to monitor server status:

```bash
# Get current status
curl http://localhost:3001/debug/streams

# Test file watcher
curl -X POST http://localhost:3001/debug/test-watcher

# Force restart overlays
curl -X POST http://localhost:3001/debug/restart-overlays
```

## 🔄 File Structure Details

- **`cricket_score.json`**: Persistent score storage with metadata
- **`score_display.txt`**: Simple text file used by FFmpeg overlay
- **File watcher**: Monitors `score_display.txt` for changes and auto-restarts overlays

## 🌐 Browser Support

The web interface works in all modern browsers with WebSocket support:
- Chrome 14+
- Firefox 11+
- Safari 7+
- Edge 12+

## 📝 Notes

- Overlays automatically restart when scores change
- File watcher ensures external file updates trigger overlay refresh
- Socket.IO provides real-time bidirectional communication
- REST API maintained for backward compatibility
- Debug tools help troubleshoot issues