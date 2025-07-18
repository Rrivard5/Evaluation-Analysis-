const { Anthropic } = require('@anthropic-ai/sdk');

const validateApiKey = (apiKey) => {
  return apiKey && apiKey.startsWith('sk-ant-') && apiKey.length > 20;
};

const testApiKey = async (apiKey) => {
  try {
    const anthropic = new Anthropic({
      apiKey: apiKey,
    });

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 10,
      messages: [
        {
          role: 'user',
          content: 'Hello'
        }
      ]
    });

    return response.content[0].text !== undefined;
  } catch (error) {
    console.error('API key test error:', error);
    return false;
  }
};

module.exports = async function handler(req, res) {
  console.log('Test key endpoint called with method:', req.method);
  
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
    console.log('Request body:', req.body);
    const { apiKey } = req.body;

    if (!apiKey || !validateApiKey(apiKey)) {
      console.log('Invalid API key format');
      return res.status(400).json({ 
        error: 'Please provide a valid Anthropic API key (starts with sk-ant-)',
        valid: false 
      });
    }

    console.log('Testing API key...');
    const isValid = await testApiKey(apiKey);
    console.log('API key test result:', isValid);

    if (isValid) {
      res.status(200).json({ valid: true });
    } else {
      res.status(401).json({ 
        error: 'Invalid API key. Please check your key and try again.',
        valid: false 
      });
    }
  } catch (error) {
    console.error('Test key error:', error);
    res.status(500).json({ 
      error: 'Unable to validate API key. Please try again.',
      valid: false 
    });
  }
};
