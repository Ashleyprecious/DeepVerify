// controllers/imageController.js
const { optimizeImage } = require('../utils/imageProcessor');
const { extractTextFromImage, parseFields } = require('../services/claudeService');
const axios = require('axios');

const configs = require('../configs/config.json'); // Load configs (including Anthropic API key fallback)


/**
 * POST /api/preprocess
 * Accepts a single image file (mugitltipart/form-data), optimises it,
 * and returns base64 data and metadata.
 */

exports.preprocessImage = async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No image files provided' });
    }

    // Build image content blocks for Claude
    const imageBlocks = [];
    for (const file of files) {
      const optimizedBuffer = await optimizeImage(file.buffer);
      const base64Data = optimizedBuffer.toString('base64');

      imageBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: base64Data,
        },
      });
    }

    // Add the extraction prompt
    imageBlocks.push({
      type: 'text',
      text: `Extract all information from the ID card(s) in the image(s) and return it as a JSON object.
Include all visible fields such as: full_name, date_of_birth, id_number, nationality, expiry_date, issuing_country, address, gender, place_of_birth, and any other fields present.
If multiple ID cards are provided, return an array of objects.
Respond ONLY with valid JSON, no markdown, no explanation.`,
    });

    // Send to Claude API via axios
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: imageBlocks }],
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY || configs.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      }
    );

    // Extract text from response
    const rawText = response.data.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // Parse Claude's response as JSON
    let extractedData;
    try {
      const clean = rawText.replace(/```json|```/g, '').trim();
      extractedData = JSON.parse(clean);
    } catch {
      return res.status(422).json({
        error: 'Failed to parse Claude response as JSON',
        raw: rawText,
      });
    }

    res.json(extractedData);
  } catch (error) {
    console.error('Preprocess error:', error?.response?.data || error.message);
    res.status(500).json({ error: error?.response?.data?.error?.message || error.message });
  }
};


exports.faceMatching = async (req, res) => {
  try {
    const files = req.files;
    
    if (!files || files.length < 2) {
      return res.status(400).json({ error: 'Please provide at least 2 images: a profile picture and an ID front' });
    }

    // Build image content blocks for Claude
    const imageBlocks = [];
    for (const file of files) {
      const optimizedBuffer = await optimizeImage(file.buffer);
      const base64Data = optimizedBuffer.toString('base64');

      imageBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: base64Data,
        },
      });
    }

    // Add face matching prompt
    imageBlocks.push({
      type: 'text',
      text: `You are a face verification expert. You are given ${files.length} images.
The FIRST image is a live profile photo/selfie of a person.
The SECOND image (and any additional images) are ID card front photos.

Carefully compare the face in the profile photo against the face on the ID card(s).

Analyze the following facial features for matching:
- Overall face shape and structure
- Eye shape, spacing, and characteristics
- Nose shape and size
- Mouth and lip structure
- Jawline and chin
- Skin tone
- Any distinctive features (scars, marks, etc.)
- Approximate age consistency

Return ONLY a valid JSON object with no markdown or explanation in this exact structure:
{
  "match_score": <number 0-100>,
  "confidence": "<low|medium|high>",
  "verdict": "<MATCH|NO_MATCH|UNCERTAIN>",
  "details": {
    "face_detected_profile": <true|false>,
    "face_detected_id": <true|false>,
    "facial_features": {
      "face_shape": "<similar|different|uncertain>",
      "eyes": "<similar|different|uncertain>",
      "nose": "<similar|different|uncertain>",
      "mouth": "<similar|different|uncertain>",
      "jawline": "<similar|different|uncertain>",
      "skin_tone": "<similar|different|uncertain>",
      "age_consistency": "<consistent|inconsistent|uncertain>"
    },
    "matching_features_count": <number>,
    "total_features_analyzed": <number>,
    "notes": "<brief explanation of key observations>"
  }
}

Scoring guide:
- 85-100: Strong match, very high similarity
- 70-84: Likely match, good similarity with minor differences
- 50-69: Uncertain, some similarities but notable differences
- 30-49: Likely not a match, more differences than similarities
- 0-29: No match, clearly different people`,
    });

    // Send to Claude API via axios
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: imageBlocks }],
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY || configs.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
      }
    );

    // Extract text from response
    const rawText = response.data.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // Parse Claude's response as JSON
    let matchResult;
    try {
      const clean = rawText.replace(/```json|```/g, '').trim();
      matchResult = JSON.parse(clean);
    } catch {
      return res.status(422).json({
        error: 'Failed to parse Claude response as JSON',
        raw: rawText,
      });
    }

    res.json(matchResult);
  } catch (error) {
    console.error('Face matching error:', error?.response?.data || error.message);
    res.status(500).json({ error: error?.response?.data?.error?.message || error.message });
  }
};
/**
 * POST /api/extract-id
 * Accepts front and back image data (base64) and an optional model name.
 * Calls Claude to extract text from both sides, then parses the combined text
 * into structured fields.
 */
exports.extractId = async (req, res) => {
  try {
    const { front, back, model } = req.body;
    console.log('extractId req.body:', JSON.stringify(req.body, null, 2));
    // Validate input
    if (!front || !back) {
      return res.status(400).json({ error: 'Both front and back images are required' });
    }
    if (!front.data || !front.media_type || !back.data || !back.media_type) {
      return res.status(400).json({ error: 'Invalid image data format' });
    }

    // Use the model from request, or fallback to a default
    const selectedModel = model || 'claude-3-5-sonnet-20241022';
    console.log('Using model:', selectedModel); // ✅ Now after declaration

    // Extract text from front image
    const frontText = await extractTextFromImage(
      front,
      'Extract ALL visible text from this ID card image exactly as it appears. Preserve line breaks and spatial layout. Return only the raw extracted text — no commentary, no labels.',
      selectedModel
    );

    // Extract text from back image
    const backText = await extractTextFromImage(
      back,
      'Extract ALL visible text from this ID card back image exactly as it appears. Include MRZ lines verbatim if present. Return only the raw extracted text — no commentary.',
      selectedModel
    );

    // Combine both texts for field parsing
    const combined = `FRONT SIDE:\n${frontText}\n\nBACK SIDE:\n${backText}`;

    // Ask Claude to parse the combined text into a JSON object
    const fieldsJson = await parseFields(combined, selectedModel);

    // Clean and parse the JSON response
    let fields = {};
    try {
      const cleaned = fieldsJson.replace(/```json|```/g, '').trim();
      fields = JSON.parse(cleaned);
    } catch (e) {
      console.warn('Failed to parse fields JSON, returning empty object');
    }

    // Send successful response
    res.json({
      success: true,
      front_text: frontText,
      back_text: backText,
      fields
    });
  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({ error: error.message });
  }
};