// api/process-text.js
const Anthropic = require('@anthropic-ai/sdk');

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb' // Much smaller since we're only sending text
    },
  },
};

const processComments = async (text, apiKey) => {
  const prompt = `You are a kind and constructive assistant helping instructors analyze course evaluations. Your task is to:

1. Filter out any comments that are mean, hurtful, or purely negative without constructive value
2. Categorize constructive feedback into themes and count frequency
3. Summarize actionable suggestions with frequency indicators
4. Extract positive/uplifting comments verbatim

Return the response in this exact format:

## CONSTRUCTIVE FEEDBACK SUMMARY

**Most Frequent Suggestions:**
• [Theme] (mentioned X times): [Summary of suggestions]
• [Theme] (mentioned X times): [Summary of suggestions]

**Additional Suggestions:**
• [Less frequent but valuable feedback]

## POSITIVE COMMENTS

**Encouraging Feedback:**
"[Exact quote from student]"

"[Exact quote from student]"

**Additional Positive Notes:**
• [Paraphrased positive feedback that wasn't quotable]

## OVERALL SENTIMENT
[Brief summary of the overall tone and any patterns you noticed]

Please be thorough but concise, focusing on actionable insights that will help the instructor improve while maintaining their confidence.

Here are the course evaluation comments to analyze:
${text}`;

  try {
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }]
    });

    return response.content[0].text;
  } catch (error) {
    console.error('Anthropic API error:', error);

    if (error.status === 401) {
      throw new Error('Invalid API key. Please check your Anthropic API key.');
    }

    if (error.status === 429) {
      throw new Error('Rate limit exceeded. Please try again in a moment.');
    }

    throw new Error('Failed to process comments with AI: ' + error.message);
  }
};

const validateApiKey = (apiKey) => {
  return apiKey && apiKey.startsWith('sk-ant-') && apiKey.length > 20;
};

export default async function handler(req, res) {
  console.log('=== PROCESS TEXT REQUEST START ===');
  console.log('Method:', req.method);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, apiKey, filename } = req.body;

    console.log('Processing text from:', filename);
    console.log('Text length:', text?.length || 0);

    if (!apiKey || !validateApiKey(apiKey)) {
      return res.status(400).json({ error: 'Valid Anthropic API key required' });
    }

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ 
        error: 'No text provided. This might be a scanned document or contain only images.' 
      });
    }

    console.log('Processing comments with AI...');
    const result = await processComments(text, apiKey);

    console.log('AI processing successful');
    console.log('=== PROCESS TEXT REQUEST SUCCESS ===');
    
    res.status(200).json({ result });
  } catch (error) {
    console.error('=== PROCESS TEXT REQUEST ERROR ===');
    console.error('Error message:', error.message);
    
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
}
