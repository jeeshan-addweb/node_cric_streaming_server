// Socket.IO connection
const socket = io();

// DOM elements
const statusElement = document.getElementById('status');
const connectionStatusElement = document.getElementById('connectionStatus');
const currentScoreElement = document.getElementById('currentScore');
const lastUpdatedElement = document.getElementById('lastUpdated');
const activeOverlaysElement = document.getElementById('activeOverlays');
const scoreForm = document.getElementById('scoreForm');
const debugOutput = document.getElementById('debugOutput');
const notificationsContainer = document.getElementById('notifications');

// Socket.IO event handlers
socket.on('connect', () => {
    updateConnectionStatus('connected');
    showNotification('Connected to server', 'success');
    console.log('[Socket.IO] Connected to server');
});

socket.on('disconnect', () => {
    updateConnectionStatus('disconnected');
    showNotification('Disconnected from server', 'error');
    console.log('[Socket.IO] Disconnected from server');
});

socket.on('connect_error', (error) => {
    updateConnectionStatus('disconnected');
    showNotification('Connection error: ' + error.message, 'error');
    console.error('[Socket.IO] Connection error:', error);
});

socket.on('currentScore', (score) => {
    console.log('[Socket.IO] Received current score:', score);
    displayScore(score);
    populateForm(score);
});

socket.on('scoreUpdated', (score) => {
    console.log('[Socket.IO] Score updated:', score);
    displayScore(score);
    showNotification('Score updated successfully!', 'success');
});

socket.on('updateAcknowledged', (response) => {
    console.log('[Socket.IO] Update acknowledged:', response);
    if (response.success) {
        showNotification(`Score updated! Active overlays: ${response.activeOverlays}`, 'success');
    } else {
        showNotification('Failed to update score', 'error');
    }
});

socket.on('overlayStarted', (data) => {
    console.log('[Socket.IO] Overlay started:', data);
    showNotification(`Overlay started for stream: ${data.streamKey}`, 'success');
    updateStreamUrls();
});

socket.on('overlayStopped', (data) => {
    console.log('[Socket.IO] Overlay stopped:', data);
    showNotification(`Overlay stopped for stream: ${data.streamKey}`, 'info');
});

socket.on('overlayError', (data) => {
    console.error('[Socket.IO] Overlay error:', data);
    showNotification(`Overlay error: ${data.error}`, 'error');
});

socket.on('overlayStatus', (data) => {
    console.log('[Socket.IO] Overlay status:', data);
    showNotification(`Stream ${data.streamKey}: ${data.status}`, 'info');
});

socket.on('overlayStatusList', (data) => {
    console.log('[Socket.IO] Overlay status list:', data);
    activeOverlaysElement.textContent = `Active overlays: ${data.activeOverlays.length}`;
    
    let statusText = `Active overlays: ${data.activeOverlays.length}`;
    if (data.activeOverlays.length > 0) {
        statusText += ` (${data.activeOverlays.join(', ')})`;
    }
    
    displayDebugInfo(`Overlay Status:\n${JSON.stringify(data, null, 2)}`);
});

socket.on('streamStarted', (data) => {
    console.log('[Socket.IO] Stream started:', data);
    showNotification(`New stream started: ${data.streamKey}`, 'info');
});

socket.on('streamEnded', (data) => {
    console.log('[Socket.IO] Stream ended:', data);
    showNotification(`Stream ended: ${data.streamKey}`, 'info');
});

// Helper functions
function updateConnectionStatus(status) {
    statusElement.className = `status ${status}`;
    connectionStatusElement.className = status;
    
    switch (status) {
        case 'connected':
            statusElement.textContent = 'Connected';
            break;
        case 'connecting':
            statusElement.textContent = 'Connecting...';
            break;
        case 'disconnected':
            statusElement.textContent = 'Disconnected';
            break;
    }
}

function displayScore(score) {
    const scoreText = `${score.team1} ${score.team1Score} (${score.team1Overs}) | ${score.team2} ${score.team2Score} (${score.team2Overs}) | ${score.status}`;
    currentScoreElement.innerHTML = scoreText;
    
    if (score.lastUpdated) {
        const lastUpdated = new Date(score.lastUpdated).toLocaleString();
        lastUpdatedElement.textContent = `Last updated: ${lastUpdated}`;
    }
}

function populateForm(score) {
    document.getElementById('team1').value = score.team1 || '';
    document.getElementById('team1Score').value = score.team1Score || '';
    document.getElementById('team1Overs').value = score.team1Overs || '';
    document.getElementById('team2').value = score.team2 || '';
    document.getElementById('team2Score').value = score.team2Score || '';
    document.getElementById('team2Overs').value = score.team2Overs || '';
    document.getElementById('status').value = score.status || '';
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 5px;">${type.toUpperCase()}</div>
        <div>${message}</div>
    `;
    
    notificationsContainer.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
    
    // Allow manual close by clicking
    notification.addEventListener('click', () => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    });
}

function displayDebugInfo(info) {
    debugOutput.textContent = info;
    debugOutput.classList.add('show');
}

function updateStreamUrls() {
    const streamKey = document.getElementById('streamKey').value || 'test';
    document.getElementById('inputUrl').textContent = `rtmp://localhost:1935/live/${streamKey}`;
    document.getElementById('overlayUrl').textContent = `rtmp://localhost:1935/overlay/${streamKey}`;
}

// Form submission handler
scoreForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const scoreData = {
        team1: document.getElementById('team1').value.trim(),
        team1Score: document.getElementById('team1Score').value.trim(),
        team1Overs: document.getElementById('team1Overs').value.trim(),
        team2: document.getElementById('team2').value.trim(),
        team2Score: document.getElementById('team2Score').value.trim(),
        team2Overs: document.getElementById('team2Overs').value.trim(),
        status: document.getElementById('status').value.trim()
    };
    
    // Validate required fields
    const requiredFields = ['team1', 'team1Score', 'team1Overs', 'team2', 'team2Score', 'team2Overs', 'status'];
    const missingFields = requiredFields.filter(field => !scoreData[field]);
    
    if (missingFields.length > 0) {
        showNotification(`Please fill in all fields: ${missingFields.join(', ')}`, 'warning');
        return;
    }
    
    console.log('[Form] Submitting score update:', scoreData);
    socket.emit('updateScore', scoreData);
    showNotification('Sending score update...', 'info');
});

// Stream key input handler
document.getElementById('streamKey').addEventListener('input', updateStreamUrls);

// Overlay control functions
function startOverlay() {
    const streamKey = document.getElementById('streamKey').value.trim();
    if (!streamKey) {
        showNotification('Please enter a stream key', 'warning');
        return;
    }
    
    console.log('[Control] Starting overlay for:', streamKey);
    socket.emit('startOverlay', { streamKey });
    showNotification(`Starting overlay for: ${streamKey}`, 'info');
}

function stopOverlay() {
    const streamKey = document.getElementById('streamKey').value.trim();
    if (!streamKey) {
        showNotification('Please enter a stream key', 'warning');
        return;
    }
    
    console.log('[Control] Stopping overlay for:', streamKey);
    socket.emit('stopOverlay', { streamKey });
    showNotification(`Stopping overlay for: ${streamKey}`, 'info');
}

function getOverlayStatus() {
    console.log('[Control] Requesting overlay status');
    socket.emit('getOverlayStatus');
    showNotification('Fetching overlay status...', 'info');
}

// Debug functions
async function testFileWatcher() {
    try {
        showNotification('Testing file watcher...', 'info');
        const response = await fetch('/debug/test-watcher', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            displayDebugInfo(`File Watcher Test:\n${JSON.stringify(result, null, 2)}`);
            showNotification('File watcher test completed', 'success');
        } else {
            showNotification(`File watcher test failed: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('[Debug] File watcher test error:', error);
        showNotification(`File watcher test error: ${error.message}`, 'error');
    }
}

async function forceRestartOverlays() {
    try {
        showNotification('Restarting all overlays...', 'info');
        const response = await fetch('/debug/restart-overlays', { method: 'POST' });
        const result = await response.json();
        
        if (result.success) {
            displayDebugInfo(`Overlay Restart:\n${JSON.stringify(result, null, 2)}`);
            showNotification(`All overlays restarted. Active: ${result.activeOverlays.length}`, 'success');
        } else {
            showNotification(`Overlay restart failed: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('[Debug] Overlay restart error:', error);
        showNotification(`Overlay restart error: ${error.message}`, 'error');
    }
}

async function getDebugInfo() {
    try {
        showNotification('Fetching debug info...', 'info');
        const response = await fetch('/debug/streams');
        const result = await response.json();
        
        displayDebugInfo(`Debug Info:\n${JSON.stringify(result, null, 2)}`);
        showNotification('Debug info retrieved', 'success');
        
        // Update active overlays count
        activeOverlaysElement.textContent = `Active overlays: ${result.activeOverlays.length}`;
    } catch (error) {
        console.error('[Debug] Get debug info error:', error);
        showNotification(`Debug info error: ${error.message}`, 'error');
    }
}

// Utility functions
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        showNotification(`Copied to clipboard: ${text}`, 'success');
    }).catch(err => {
        console.error('[Clipboard] Error:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification(`Copied to clipboard: ${text}`, 'success');
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Client] Application initialized');
    updateConnectionStatus('connecting');
    updateStreamUrls();
    
    // Request initial status
    setTimeout(() => {
        if (socket.connected) {
            socket.emit('getOverlayStatus');
        }
    }, 1000);
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && socket.connected) {
        // Refresh status when page becomes visible
        socket.emit('getOverlayStatus');
    }
});

// Handle window focus
window.addEventListener('focus', () => {
    if (socket.connected) {
        // Refresh status when window gets focus
        socket.emit('getOverlayStatus');
    }
});