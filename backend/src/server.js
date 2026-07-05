require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { extractFrames } = require('./extractFrames');
const { detectPhases, refineImpact } = require('./detectPhases');
const { measureBiomechanics } = require('./biomechanics');
const { generateCoaching } = require('./coaching');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Multer for video upload
const upload = multer({
  dest: '/tmp/swingiq-uploads/',
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const allowed = ['video/mp4', 'video/quicktime', 'video/mov'];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(mp4|mov)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only MP4/MOV videos allowed'), false);
    }
  }
});

// ===== MAIN ANALYSIS ENDPOINT =====
app.post('/api/analyze', upload.single('video'), async (req, res) => {
  const requestId = uuidv4().slice(0, 8);
  const startTime = Date.now();
  
  try {
    if (!req.file) return res.status(400).json({ error: 'No video uploaded' });
    
    const videoPath = req.file.path;
    const club = req.body.club || 'iron';
    const view = req.body.view || 'dtl';
    
    console.log(`[${requestId}] Start analysis: ${req.file.originalname} (${(req.file.size/1024/1024).toFixed(1)}MB) club=${club} view=${view}`);
    
    // ===== STEP 1: FFmpeg Extract Frames =====
    console.log(`[${requestId}] Step 1: Extracting frames...`);
    const extraction = await extractFrames(videoPath, 90);
    console.log(`[${requestId}] Extracted ${extraction.frames.length} frames, duration=${extraction.duration.toFixed(3)}s`);
    
    // ===== STEP 2: GPT-4o Detect P1-P8 =====
    console.log(`[${requestId}] Step 2: Detecting phases...`);
    const phases = await detectPhases(extraction.frames, extraction.timestamps);
    console.log(`[${requestId}] Phases: ${Object.entries(phases).map(([k,v]) => `${k}=f${v}`).join(', ')}`);
    
    // ===== STEP 3: Refine P6 (Impact) =====
    console.log(`[${requestId}] Step 3: Refining impact...`);
    const refinedP6 = await refineImpact(extraction.frames, phases.P6);
    phases.P6 = refinedP6;
    console.log(`[${requestId}] Refined P6=${refinedP6}`);
    
    // ===== STEP 4: MediaPipe Biomechanics =====
    console.log(`[${requestId}] Step 4: Biomechanics...`);
    const phaseFrameIndices = Object.values(phases);
    const biomechanics = await measureBiomechanics(extraction.frames, phaseFrameIndices);
    console.log(`[${requestId}] Biomechanics: ${Object.keys(biomechanics).length} phases measured`);
    
    // ===== STEP 5: GPT-4o Coaching =====
    console.log(`[${requestId}] Step 5: Coaching analysis...`);
    const coaching = await generateCoaching(extraction.frames, phases, biomechanics, club, view);
    console.log(`[${requestId}] Coaching: score=${coaching.overall_score}`);
    
    // ===== BUILD RESPONSE =====
    const phaseKeys = ['P1','P2','P3','P4','P5','P6','P7','P8'];
    const phaseNames = ['Setup/Address','Takeaway','Backswing','Top of Backswing','Downswing','Impact','Follow Through','Finish'];
    
    const result = {
      status: 'success',
      video: {
        duration: extraction.duration,
        frameCount: extraction.frames.length,
        frameTimestamps: extraction.timestamps
      },
      phases: {},
      biomechanics,
      coaching,
      debug: {
        requestId,
        extractionMethod: 'ffmpeg',
        processingTime: ((Date.now() - startTime) / 1000).toFixed(1),
        phasesRaw: phases
      }
    };
    
    // Build phases with timestamps
    phaseKeys.forEach((key, i) => {
      const frameIdx = phases[key];
      result.phases[key] = {
        frame: frameIdx,
        timestamp: extraction.timestamps[frameIdx] || 0,
        name: phaseNames[i],
        // Include base64 for frontend display
        imageBase64: extraction.frames[frameIdx]?.base64 || null
      };
    });
    
    console.log(`[${requestId}] Complete in ${result.debug.processingTime}s`);
    
    // Cleanup temp files
    cleanup(videoPath, extraction.outputDir);
    
    res.json(result);
    
  } catch(err) {
    console.error(`[${requestId}] Error:`, err.message);
    // Cleanup on error
    if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch(e) {}
    res.status(500).json({ error: err.message, requestId });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', ffmpeg: true });
});

function cleanup(videoPath, outputDir) {
  try { fs.unlinkSync(videoPath); } catch(e) {}
  if (outputDir) {
    try {
      const files = fs.readdirSync(outputDir);
      files.forEach(f => fs.unlinkSync(path.join(outputDir, f)));
      fs.rmdirSync(outputDir);
    } catch(e) {}
  }
}

app.listen(PORT, () => {
  console.log(`SwingIQ v2 backend running on port ${PORT}`);
});
