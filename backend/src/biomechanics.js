/**
 * Biomechanics measurement using MediaPipe Pose (server-side)
 * 
 * NOTE: Server-side MediaPipe requires @mediapipe/tasks-vision for Node.js
 * or a Python sidecar. For MVP, this returns placeholder data.
 * Phase 2: Implement with Python MediaPipe via child_process or gRPC.
 */

/**
 * Measure biomechanics for selected phase frames
 * 
 * @param {Array} frames - All extracted frames
 * @param {Array} phaseFrameIndices - Frame indices for P1-P8
 * @returns {Object} Biomechanics per phase
 */
async function measureBiomechanics(frames, phaseFrameIndices) {
  const phaseKeys = ['P1','P2','P3','P4','P5','P6','P7','P8'];
  const results = {};
  
  // TODO: Implement server-side MediaPipe
  // Options:
  // 1. @mediapipe/tasks-vision (Node.js native)
  // 2. Python child_process: python3 mediapipe_worker.py <frame_path>
  // 3. gRPC to Python MediaPipe service
  
  // For now, return empty biomechanics (GPT coaching still works without it)
  phaseFrameIndices.forEach((frameIdx, i) => {
    results[phaseKeys[i]] = {
      frameIndex: frameIdx,
      measured: false,
      // Placeholder - will be populated by MediaPipe
      spineAngle: null,
      shoulderTilt: null,
      hipRotation: null,
      wristPosition: null
    };
  });
  
  console.log(`[Biomechanics] Placeholder for ${phaseFrameIndices.length} frames (MediaPipe TODO)`);
  return results;
}

module.exports = { measureBiomechanics };
