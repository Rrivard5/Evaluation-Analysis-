const Anthropic = require('@anthropic-ai/sdk');

const validateApiKey = (apiKey) => {
  console.log('Validating API key format...');
  console.log('Key starts with sk-ant-:', apiKey?.startsWith('sk-ant-'));
  console.log('Key length:', apiKey?.length);
  return apiKey && apiKey.startsWith('sk-ant-') && apiKey.length > 20;
};

const testApiKey = async (apiKey) => {
  try {
    console.log('Creating Anthropic client...');
    console.log('Anthropic constructor type:', typeof Anthropic);
    
    const anthropic = new Anthropic({
      apiKey: apiKey,
    });
    
    console.log('Anthropic client created successfully');
    console.log('Making test API call...');

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

    console.log('API call successful');
    console.log('Response content type:', typeof response.content[0]?.text);
    return response.content[0].text !== undefined;
  } catch (error) {
    console.error('API key test error details:');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error status:', error.status);
    console.error('Error stack:', error.stack);
    return false;
  }
};

module.exports = async function handler(req, res) {
  console.log('=== TEST KEY ENDPOINT START ===');
  console.log('Method:', req.method);
  console.log('Headers:', req.headers);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    console.log('Invalid method:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Processing POST request...');
    console.log('Request body keys:', Object.keys(req.body || {}));
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { apiKey } = req.body;
    console.log('Extracted API key length:', apiKey?.length);
    console.log('API key first 10 chars:', apiKey?.substring(0, 10));

    if (!apiKey || !validateApiKey(apiKey)) {
      console.log('API key validation failed');
      return res.status(400).json({ 
        error: 'Please provide a valid Anthropic API key (starts with sk-ant-)',
        valid: false 
      });
    }

    console.log('API key format valid, testing with Anthropic...');
    const isValid = await testApiKey(apiKey);
    console.log('API key test result:', isValid);

    if (isValid) {
      console.log('API key test successful');
      res.status(200).json({ valid: true });
    } else {
      console.log('API key test failed');
      res.status(401).json({ 
        error: 'Invalid API key. Please check your key and try again.',
        valid: false 
      });
    }
  } catch (error) {
    console.error('=== TEST KEY ENDPOINT ERROR ===');
    console.error('Handler error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Unable to validate API key. Please try again.',
      valid: false 
    });
  }
};
