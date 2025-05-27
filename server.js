const NodeMediaServer = require('node-media-server');
const { spawn } = require('child_process');

const config = {
    rtmp: {
        port: 1935,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60,
        allow_publish: ['live', 'overlay']
    },
    http: {
        port: 8000,
        mediaroot: './media',
        allow_origin: '*'
    }
};

const nms = new NodeMediaServer(config);
const streamKey = 'test';

let ffmpegProcesses = {};

nms.on('postPublish', (id, StreamPath, args) => {

    if (ffmpegProcesses[streamKey]) return;

    setTimeout(() => {
        var inputStream = `rtmp://localhost:1935/live/${streamKey}`;
        var outputStream = `rtmp://localhost:1935/overlay/${streamKey}`;

        var ffmpeg = spawn('ffmpeg', [
            '-i', inputStream,
            '-vf', "drawtext=text='Test Overlay':fontcolor=white:fontsize=24:box=1:boxcolor=black@0.7:x=10:y=h-th-10",
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-c:a', 'copy',
            '-f', 'flv',
            outputStream
        ]);

        ffmpeg.stderr.on('data', data => {
            console.log(`[FFmpeg ${streamKey}] ${data}`);
        });

        ffmpeg.on('close', code => {
            console.log(`[FFmpeg ${streamKey}] process exited with code ${code}`);
            delete ffmpegProcesses[streamKey];
        });

        ffmpeg.on('exit', (code, signal) => {
            console.log(`[FFmpeg ${streamKey}] exited with code ${code}, signal ${signal}`);
        });

        ffmpegProcesses[streamKey] = ffmpeg;
    }, 1000);

});

nms.on('donePublish', (id, StreamPath, args) => {
    console.log(`[NodeEvent on donePublish] Stopping FFmpeg for ${streamKey}`);

    if (ffmpegProcesses[streamKey]) {
        ffmpegProcesses[streamKey].kill('SIGINT');

        setTimeout(() => {
            delete ffmpegProcesses[streamKey];
        }, 1000);
        // delete ffmpegProcesses[streamKey];
    }

});

nms.run();
