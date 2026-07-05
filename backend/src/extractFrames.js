const ffmpeg = require('fluent-ffmpeg');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

/**
 * Extract frames from video using FFmpeg
 * Returns deterministic frames regardless of client device/browser
 * 
 * @param {string} videoPath - Path to uploaded video file
 * @param {number} count - Number of frames to extract (default 90)
 * @returns {Object} { frames: [{base64, index}], timestamps: [number], duration: number, outputDir: string }
 */
async function extractFrames(videoPath, count = 90) {
  // Step 1: Probe video metadata
  const probe = await probeVideo(videoPath);
  const duration = parseFloat(probe.format.duration);
  const fps = eval(probe.streams[0].r_frame_rate); // e.g. "30/1" → 30
  const totalFrames = Math.round(duration * fps);
  
  console.log(`[FFmpeg] Duration: ${duration.toFixed(3)}s, FPS: ${fps}, Total frames: ${totalFrames}`);
  
  // Step 2: Calculate extraction timestamps (evenly distributed)
  const interval = duration / (count + 1);
  const targetTimestamps = [];
  for (let i = 1; i <= count; i++) {
    targetTimestamps.push(parseFloat((interval * i).toFixed(4)));
  }
  
  // Step 3: Extract frames using FFmpeg
  const outputDir = path.join('/tmp', `swingiq-frames-${uuidv4().slice(0, 8)}`);
  fs.mkdirSync(outputDir, { recursive: true });
  
  await new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions([
        `-vf`, `fps=${count}/${duration.toFixed(4)}`,
        `-q:v`, `3`,
        `-frames:v`, `${count}`
      ])
      .output(path.join(outputDir, 'frame_%03d.jpg'))
      .on('start', cmd => console.log(`[FFmpeg] Command: ${cmd}`))
      .on('end', () => resolve())
      .on('error', err => reject(new Error(`FFmpeg error: ${err.message}`)))
      .run();
  });
  
  // Step 4: Read frames and convert to base64
  const frames = [];
  const actualTimestamps = [];
  
  for (let i = 1; i <= count; i++) {
    const framePath = path.join(outputDir, `frame_${String(i).padStart(3, '0')}.jpg`);
    
    if (!fs.existsSync(framePath)) {
      console.warn(`[FFmpeg] Missing frame: ${framePath}`);
      continue;
    }
    
    // Resize to 640px width for GPT (maintain aspect ratio)
    const resized = await sharp(framePath)
      .resize(640, null, { fit: 'inside' })
      .jpeg({ quality: 70 })
      .toBuffer();
    
    const base64 = resized.toString('base64');
    const timestamp = targetTimestamps[i - 1] || (interval * i);
    
    frames.push({
      base64,
      index: i - 1, // 0-based
      timestamp
    });
    actualTimestamps.push(timestamp);
  }
  
  console.log(`[FFmpeg] Extracted ${frames.length} frames, timestamps: [${actualTimestamps.slice(0, 5).map(t => t.toFixed(3)).join(', ')}...${actualTimestamps.slice(-2).map(t => t.toFixed(3)).join(', ')}]`);
  
  return {
    frames,
    timestamps: actualTimestamps,
    duration,
    fps,
    totalFrames,
    outputDir
  };
}

/**
 * Probe video metadata using ffprobe
 */
function probeVideo(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) reject(new Error(`FFprobe error: ${err.message}`));
      else resolve(metadata);
    });
  });
}

module.exports = { extractFrames, probeVideo };
