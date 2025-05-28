// overlayDesigns.js - Separate file for all overlay configurations
const { spawn } = require('child_process');

const OVERLAY_STYLES = {
    custom: {
        name: "Custom Style",
        bottomHeight: 120,
        backgroundColor: "0x000000",
        accentColor: "0x16213e@0.8",
        description: "Modern IPL-style with dark theme and team colors"
    },
    ipl_modern: {
        name: "IPL Modern Style",
        bottomHeight: 120,
        backgroundColor: "0x1a1a2e@0.9",
        accentColor: "0x16213e@0.8",
        description: "Modern IPL-style with dark theme and team colors"
    },
    broadcast_classic: {
        name: "Broadcast Classic",
        bottomHeight: 100,
        backgroundColor: "0x000000@0.8",
        accentColor: "0x333333@0.9",
        description: "Traditional TV broadcast look"
    },
    minimal_clean: {
        name: "Minimal Clean",
        bottomHeight: 80,
        backgroundColor: "0xffffff@0.9",
        accentColor: "0xe0e0e0@0.8",
        description: "Clean, modern minimal design"
    },
    ipl_premium: {
        name: "IPL Premium",
        bottomHeight: 140,
        backgroundColor: "0x0f0f23@0.95",
        accentColor: "0x6c5ce7@0.9",
        description: "Premium design with gradients and animations"
    },
    world_cup: {
        name: "World Cup",
        bottomHeight: 110,
        backgroundColor: "0x2d3436@0.9",
        accentColor: "0x00b894@0.8",
        description: "World Cup tournament style"
    }
};

// Font configurations
const FONT_CONFIGS = {
    default: {
        main: "/System/Library/Fonts/Arial.ttf",
        bold: "/System/Library/Fonts/Arial Bold.ttf",
        fallback: "Arial"
    },
    windows: {
        main: "C:/Windows/Fonts/arial.ttf",
        bold: "C:/Windows/Fonts/arialbd.ttf",
        fallback: "Arial"
    },
    linux: {
        main: "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        bold: "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        fallback: "DejaVu Sans"
    }
};

// Get system-appropriate font
function getSystemFont() {
    const platform = process.platform;
    if (platform === 'win32') return FONT_CONFIGS.windows;
    if (platform === 'linux') return FONT_CONFIGS.linux;
    return FONT_CONFIGS.default;
}

class OverlayDesigner {
    constructor(cricketScore, ffmpegProcesses) {
        this.cricketScore = cricketScore;
        this.ffmpegProcesses = ffmpegProcesses;
        this.fonts = getSystemFont();
    }

    // Generate advanced overlay filter
    generateAdvancedOverlay(streamKey, style = 'ipl_modern') {
        const styleConfig = OVERLAY_STYLES[style];
        
        if (!styleConfig) {
            throw new Error(`Style '${style}' not found`);
        }

        const escapeText = (text) => {
            return text.toString()
                .replace(/:/g, '\\:')
                .replace(/'/g, "\\'")
                .replace(/"/g, '\\"')
                .replace(/\(/g, '\\(')
                .replace(/\)/g, '\\)')
                .replace(/\|/g, '\\|')
                .replace(/\[/g, '\\[')
                .replace(/\]/g, '\\]');
        };

        // Create complex filter for IPL-style overlay
        const filterComplex = [
            // Create background bar at bottom
            `color=${styleConfig.backgroundColor}:size=1920x${styleConfig.bottomHeight}[bg]`,
            
            // Create accent bar (smaller colored bar)
            `color=${styleConfig.accentColor}:size=1920x8[accent]`,
            
            // Main video input
            `[0:v]scale=1920:1080[main]`,
            
            // Overlay background at bottom
            `[main][bg]overlay=0:H-${styleConfig.bottomHeight}:shortest=1[with_bg]`,
            
            // Add accent bar
            `[with_bg][accent]overlay=0:H-${styleConfig.bottomHeight}:shortest=1[with_accent]`,
            
            // Team 1 info (left side)
            `[with_accent]drawtext=text='${escapeText(this.cricketScore.team1.toUpperCase())}':fontcolor=white:fontsize=25:fontfile=${this.fonts.bold}:x=50:y=H-90:box=1:boxcolor=${this.cricketScore.team1Color || '#FF6B35'}@0.8:boxborderw=3[team1]`,
            
            // Team 1 score
            `[team1]drawtext=text='${escapeText(this.cricketScore.team1Score)}':fontcolor=white:fontsize=48:fontfile=${this.fonts.bold}:x=50:y=H-55[team1_score]`,
            
            // Team 1 overs
            `[team1_score]drawtext=text='(${escapeText(this.cricketScore.team1Overs)} ov)':fontcolor=white:fontsize=24:fontfile=${this.fonts.main}:x=250:y=H-45[team1_overs]`,
            
            // VS separator
            `[team1_overs]drawtext=text='VS':fontcolor=white:fontsize=28:fontfile=${this.fonts.bold}:x=W/2-20:y=H-70:box=1:boxcolor=red@0.8:boxborderw=2[vs]`,
            
            // Team 2 info (right side)
            `[vs]drawtext=text='${escapeText(this.cricketScore.team2.toUpperCase())}':fontcolor=white:fontsize=32:fontfile=${this.fonts.bold}:x=W-350:y=H-90:box=1:boxcolor=${this.cricketScore.team2Color || '#FFD700'}@0.8:boxborderw=3[team2]`,
            
            // Team 2 score
            `[team2]drawtext=text='${escapeText(this.cricketScore.team2Score)}':fontcolor=white:fontsize=48:fontfile=${this.fonts.bold}:x=W-350:y=H-55[team2_score]`,
            
            // Team 2 overs
            `[team2_score]drawtext=text='(${escapeText(this.cricketScore.team2Overs)} ov)':fontcolor=white:fontsize=24:fontfile=${this.fonts.main}:x=W-150:y=H-45[team2_overs]`,
            
            // Current status
            `[team2_overs]drawtext=text='${escapeText(this.cricketScore.status.toUpperCase())}':fontcolor=yellow:fontsize=20:fontfile=${this.fonts.main}:x=W/2-100:y=H-25:box=1:boxcolor=black@0.7:boxborderw=2[status]`,
            
            // Additional info (venue, match type)
            `[status]drawtext=text='${escapeText((this.cricketScore.venue || 'Stadium') + ' • ' + (this.cricketScore.matchType || 'Match'))}':fontcolor=white:fontsize=18:fontfile=${this.fonts.main}:x=50:y=H-10[venue]`,
            
            // Current rate and required rate
            `[venue]drawtext=text='CRR\\: ${escapeText(this.cricketScore.currentRate || 'N/A')} • RRR\\: ${escapeText(this.cricketScore.requiredRate || 'N/A')}':fontcolor=white:fontsize=18:fontfile=${this.fonts.main}:x=W-300:y=H-20[rates]`
        ].join(',');
        
        return filterComplex;
    }

    // Generate player info overlay (top corner)
    generatePlayerInfoOverlay() {
        const escapeText = (text) => {
            return text.toString()
                .replace(/:/g, '\\:')
                .replace(/'/g, "\\'")
                .replace(/"/g, '\\"')
                .replace(/\(/g, '\\(')
                .replace(/\)/g, '\\)')
                .replace(/\|/g, '\\|');
        };

        return [
            // Player info background
            `color=0x1a1a2e@0.8:size=350x80[player_bg]`,
            
            // Overlay player background
            `[0:v][player_bg]overlay=W-370:20[with_player_bg]`,
            
            // Current batsman
            `[with_player_bg]drawtext=text='BATTING\\: ${escapeText(this.cricketScore.currentBatsman || 'N/A')}':fontcolor=white:fontsize=18:fontfile=${this.fonts.main}:x=W-350:y=30[batsman]`,
            
            // Current bowler
            `[batsman]drawtext=text='BOWLING\\: ${escapeText(this.cricketScore.currentBowler || 'N/A')}':fontcolor=white:fontsize=18:fontfile=${this.fonts.main}:x=W-350:y=55[bowler]`,
            
            // Last ball result
            `[bowler]drawtext=text='LAST BALL\\: ${escapeText(this.cricketScore.lastBall || 'N/A')}':fontcolor=yellow:fontsize=16:fontfile=${this.fonts.main}:x=W-350:y=80:box=1:boxcolor=green@0.7:boxborderw=2[last_ball]`
        ].join(',');
    }

    // Start advanced overlay
    startAdvancedOverlay(streamKey, style = 'custom') {
        if (this.ffmpegProcesses[streamKey]) {
            console.log(`[Advanced Overlay] Already running for ${streamKey}`);
            return false;
        }

        const inputStream = `rtmp://localhost:1935/live/${streamKey}`;
        const outputStream = `rtmp://localhost:1935/overlay/${streamKey}`;
        
        try {
            const filterComplex = this.generateAdvancedOverlay(streamKey, style);
            
            console.log(`[Advanced Overlay] Starting ${style} for ${streamKey}`);
            
            const ffmpeg = spawn('ffmpeg', [
                '-i', inputStream,
                '-filter_complex', filterComplex,
                '-map', '[rates]',
                '-c:v', 'libx264',
                '-preset', 'medium',
                '-crf', '23',
                '-maxrate', '6000k',
                '-bufsize', '12000k',
                '-c:a', 'copy',
                '-f', 'flv',
                outputStream
            ]);

            this.setupFFmpegHandlers(ffmpeg, streamKey, 'Advanced');
            this.ffmpegProcesses[streamKey] = ffmpeg;
            
            return true;
        } catch (error) {
            console.error(`[Advanced Overlay] Error starting ${streamKey}:`, error);
            return false;
        }
    }

    // Start image-based overlay
    startImageBasedOverlay(streamKey, templatePath) {
        if (this.ffmpegProcesses[streamKey]) {
            console.log(`[Image Overlay] Already running for ${streamKey}`);
            return false;
        }

        const inputStream = `rtmp://localhost:1935/live/${streamKey}`;
        const outputStream = `rtmp://localhost:1935/overlay/${streamKey}`;
        
        const escapeText = (text) => text.toString().replace(/'/g, "\\'").replace(/"/g, '\\"');
        
        const filterComplex = [
            `[0:v][1:v]overlay=0:H-overlay_h[with_template]`,
            `[with_template]drawtext=text='${escapeText(this.cricketScore.team1Score)}':fontcolor=white:fontsize=36:fontfile=${this.fonts.bold}:x=80:y=H-80[score1]`,
            `[score1]drawtext=text='${escapeText(this.cricketScore.team2Score)}':fontcolor=white:fontsize=36:fontfile=${this.fonts.bold}:x=W-200:y=H-80[score2]`,
            `[score2]drawtext=text='${escapeText(this.cricketScore.status)}':fontcolor=yellow:fontsize=20:fontfile=${this.fonts.main}:x=W/2-50:y=H-30[final]`
        ].join(',');
        
        try {
            const ffmpeg = spawn('ffmpeg', [
                '-i', inputStream,
                '-i', templatePath,
                '-filter_complex', filterComplex,
                '-map', '[final]',
                '-c:v', 'libx264',
                '-preset', 'medium',
                '-c:a', 'copy',
                '-f', 'flv',
                outputStream
            ]);

            this.setupFFmpegHandlers(ffmpeg, streamKey, 'Image');
            this.ffmpegProcesses[streamKey] = ffmpeg;
            
            return true;
        } catch (error) {
            console.error(`[Image Overlay] Error starting ${streamKey}:`, error);
            return false;
        }
    }

    // Setup FFmpeg event handlers
    setupFFmpegHandlers(ffmpeg, streamKey, type) {
        ffmpeg.stderr.on('data', data => {
            console.log(`[${type} FFmpeg ${streamKey}] ${data}`);
        });

        ffmpeg.on('close', code => {
            console.log(`[${type} FFmpeg ${streamKey}] process exited with code ${code}`);
            delete this.ffmpegProcesses[streamKey];
        });

        ffmpeg.on('error', (err) => {
            console.error(`[${type} FFmpeg ${streamKey}] Error:`, err);
            delete this.ffmpegProcesses[streamKey];
        });
    }

    // Stop overlay
    stopOverlay(streamKey) {
        if (this.ffmpegProcesses[streamKey]) {
            console.log(`[Overlay] Stopping for ${streamKey}`);
            this.ffmpegProcesses[streamKey].kill('SIGTERM');
            
            setTimeout(() => {
                delete this.ffmpegProcesses[streamKey];
            }, 1000);
            
            return true;
        }
        return false;
    }

    // Get available styles
    getAvailableStyles() {
        return OVERLAY_STYLES;
    }

    // Update cricket score reference
    updateCricketScore(newScore) {
        this.cricketScore = newScore;
    }
}

module.exports = {
    OverlayDesigner,
    OVERLAY_STYLES,
    FONT_CONFIGS
};