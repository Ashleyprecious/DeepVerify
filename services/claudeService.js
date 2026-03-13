const Anthropic = require('@anthropic-ai/sdk');

let anthropic;

function initClaude(apiKey) {
  anthropic = new Anthropic({ apiKey });
}

async function extractTextFromImage(imageData, prompt, model = 'claude-3-5-sonnet-20241022') {
  const response = await anthropic.messages.create({
    model: model,
    max_tokens: 1200,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: imageData.media_type,
            data: imageData.data
          }
        },
        { type: 'text', text: prompt }
      ]
    }]
  });
  return response.content[0].text;
}

async function parseFields(combinedText, model = 'claude-3-5-sonnet-20241022') {
  const response = await anthropic.messages.create({
    model: model,
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `From this ID card OCR text, extract fields into a JSON object. Return ONLY raw JSON with no markdown fences or backticks. Use null for missing fields.

Required fields:
- full_name
- date_of_birth
- id_number
- gender
- nationality
- expiry_date
- issue_date
- issuing_authority
- address
- blood_group
- mrz
- other_notes

OCR TEXT:
${combinedText}`
    }]
  });
  return response.content[0].text;
}

module.exports = { initClaude, extractTextFromImage, parseFields };