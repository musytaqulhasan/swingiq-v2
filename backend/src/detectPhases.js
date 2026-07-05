const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Detect P1-P8 swing phases using GPT-4o Vision
 * 
 * Pass 1: Sample 20 frames → GPT detects P1, P4, P8
 * Pass 2 (in detectGeometryPhases or interpolation): Fill P2, P3, P5, P7
 * 
 * @param {Array} frames - All extracted frames [{base64, index}]
 * @param {Array} timestamps - All frame timestamps
 * @returns {Object} { P1, P2, P3, P4, P5, P6, P7, P8 } frame indices
 */
async function detectPhases(frames, timestamps) {
  // Sample 20 frames evenly for Pass 1
  const step = Math.max(1, Math.floor(frames.length / 20));
  const sampled = [];
  for (let i = 0; i < frames.length && sampled.length < 20; i += step) {
    sampled.push(frames[i]);
  }
  
  console.log(`[Pass1] Sampled ${sampled.length} frames: [${sampled.map(f => f.index).join(', ')}]`);
  
  // Build image content for GPT
  const imageContent = sampled.flatMap(f => ([
    { type: 'text', text: `Frame ${f.index}:` },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${f.base64}`, detail: 'low' } }
  ]));
  
  const systemPrompt = `You are a golf swing phase detector. Frames are in chronological order, labeled with frame numbers.

Identify exactly 3 key positions:
P1 (Setup): Golfer standing still over the ball. Club on ground. BEFORE movement.
P4 (Top of Backswing): Hands at HIGHEST point. Max shoulder turn. Club backward.
P8 (Finish): Final pose. Club behind body. Facing target. Weight on front foot.

RULES:
- P1 < P4 < P8
- P1 in first 15% of frames
- P4 around 35-50% of frames
- P8 in last 15% of frames

Return ONLY: {"P1":<frame>,"P4":<frame>,"P8":<frame>}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 150,
    temperature: 0.2,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: [...imageContent, { type: 'text', text: 'Identify P1, P4, P8. JSON only.' }] }
    ]
  });
  
  let raw = response.choices[0].message.content.trim().replace(/```json|```/g, '').trim();
  console.log(`[Pass1] Raw: ${raw}`);
  
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Pass1: no JSON returned');
  const anchors = JSON.parse(match[0]);
  
  if (anchors.P1 == null || anchors.P4 == null || anchors.P8 == null) {
    throw new Error('Pass1: missing phases');
  }
  if (!(anchors.P1 < anchors.P4 && anchors.P4 < anchors.P8)) {
    throw new Error(`Pass1: not ascending P1=${anchors.P1} P4=${anchors.P4} P8=${anchors.P8}`);
  }
  
  console.log(`[Pass1] P1=${anchors.P1}, P4=${anchors.P4}, P8=${anchors.P8}`);
  
  // Interpolate remaining phases
  const P1 = anchors.P1;
  const P4 = anchors.P4;
  const P8 = anchors.P8;
  
  // P6 will be refined separately via refineImpact()
  // For now, estimate P6 at ~60% between P4 and P8
  const P6 = P4 + Math.round(0.35 * (P8 - P4));
  
  const P2 = P1 + Math.round(0.35 * (P4 - P1));
  const P3 = P1 + Math.round(0.70 * (P4 - P1));
  const P5 = P4 + Math.round(0.50 * (P6 - P4));
  const P7 = P6 + Math.round(0.25 * (P8 - P6));
  
  const maxIdx = frames.length - 1;
  const result = { P1, P2, P3, P4, P5, P6, P7, P8 };
  
  // Clamp and ensure ascending
  const keys = ['P1','P2','P3','P4','P5','P6','P7','P8'];
  keys.forEach(k => { result[k] = Math.max(0, Math.min(result[k], maxIdx)); });
  for (let i = 1; i < keys.length; i++) {
    if (result[keys[i]] <= result[keys[i-1]]) {
      result[keys[i]] = Math.min(result[keys[i-1]] + 1, maxIdx);
    }
  }
  
  return result;
}

/**
 * Refine P6 (Impact) using focused window around initial estimate
 * Sends P6±5 frames to GPT for precise detection
 * 
 * @param {Array} frames - All extracted frames
 * @param {number} initialP6 - Initial P6 estimate from detectPhases
 * @returns {number} Refined P6 frame index
 */
async function refineImpact(frames, initialP6) {
  const wStart = Math.max(0, initialP6 - 5);
  const wEnd = Math.min(frames.length - 1, initialP6 + 5);
  
  const windowFrames = frames.filter(f => f.index >= wStart && f.index <= wEnd);
  console.log(`[ImpactRefine] Window: f${wStart}-f${wEnd} (${windowFrames.length} frames, initial P6=${initialP6})`);
  
  if (windowFrames.length < 3) return initialP6;
  
  const imageContent = windowFrames.flatMap(f => ([
    { type: 'text', text: `Frame ${f.index}:` },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${f.base64}`, detail: 'low' } }
  ]));
  
  const prompt = `You are identifying the EXACT golf impact frame.

Identify THREE frames:
1. lastPreImpact: FINAL frame BEFORE clubhead reaches ball
2. impact: Frame where clubhead is CLOSEST to ball (moment of contact)
3. firstPostImpact: FIRST frame AFTER clubhead passed ball

RULES:
- impact = frame where clubhead touches/closest to ball BEFORE separation
- Do NOT select frame where clubhead already passed ball
- If uncertain between two frames, choose the EARLIER one
- lastPreImpact < impact < firstPostImpact

Return ONLY: {"lastPreImpact":<frame>,"impact":<frame>,"firstPostImpact":<frame>}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 100,
      temperature: 0.1,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: [...imageContent, { type: 'text', text: 'Find impact. JSON only.' }] }
      ]
    });
    
    let raw = response.choices[0].message.content.trim().replace(/```json|```/g, '').trim();
    console.log(`[ImpactRefine] Raw: ${raw}`);
    
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const r = JSON.parse(match[0]);
      if (r.impact != null) {
        console.log(`[ImpactRefine] lastPre=${r.lastPreImpact} impact=${r.impact} firstPost=${r.firstPostImpact}`);
        return r.impact;
      }
    }
  } catch(e) {
    console.warn(`[ImpactRefine] Error: ${e.message}`);
  }
  
  console.log(`[ImpactRefine] Fallback: keeping P6=${initialP6}`);
  return initialP6;
}

module.exports = { detectPhases, refineImpact };
