// api/process-pdf-direct.js
import Anthropic from '@anthropic-ai/sdk';
import formidable from 'formidable';
import fs from 'fs/promises';

export const config = {
  api: {
    bodyParser: false,
    // Increase the response size limit for Claude's responses
    responseLimit: '4mb',
  },
  // Increase function timeout for PDF processing
  maxDuration: 60,
};

const parseForm = (req) => {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB
      keepExtensions: true,
      uploadDir: '/tmp',
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
        return;
      }

      let fileObj = files.file;
      if (Array.isArray(fileObj)) {
        fileObj = fileObj[0];
      }

      resolve({ fields, fileObj });
    });
  });
};

const validateApiKey = (apiKey) => {
  return apiKey && apiKey.startsWith('sk-ant-') && apiKey.length > 20;
};

const processPDFWithClaude = async (pdfBuffer, apiKey, filename) => {
  const prompt = `You are a kind and constructive assistant helping instructors analyze course evaluations. I'm sending you a PDF containing course evaluation comments. Please:

1. Extract and read all the text content from this PDF
2. Filter out any comments that are mean, hurtful, or purely negative without constructive value
3. Categorize constructive feedback into themes and count frequency
4. Summarize actionable suggestions with frequency indicators
5. Extract positive/uplifting comments verbatim

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

Please be thorough but concise, focusing on actionable insights that will help the instructor improve while maintaining their confidence.`;

  try {
    const anthropic = new Anthropic({ apiKey });

    // Convert buffer to base64
    const base64PDF = pdfBuffer.toString('base64');

    console.log('Sending PDF to Claude for direct processing...');
    console.log('PDF size:', (pdfBuffer.length / 1024 / 1024).toFixed(2), 'MB');

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt
          },
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64PDF
            },
            cache_control: { type: 'ephemeral' }
          }
        ]
      }]
    });

    return response.content[0].text;
  } catch (error) {
    console.error('Claude API error:', error);

    if (error.status === 401) {
      throw new Error('Invalid API key. Please check your Anthropic API key.');
    }

    if (error.status === 429) {
      throw new Error('Rate limit exceeded. Please try again in a moment.');
    }

    if (error.status === 413) {
      throw new Error('PDF file is too large. Please try with a smaller file (under 5MB recommended).');
    }

    throw new Error('Failed to process PDF with AI: ' + error.message);
  }
};

export default async function handler(req, res) {
  console.log('=== PROCESS PDF DIRECT REQUEST START ===');
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

  let uploadedFilePath = null;

  try {
    console.log('Parsing form data...');
    const { fields, fileObj } = await parseForm(req);

    const apiKey = Array.isArray(fields.apiKey) ? fields.apiKey[0] : fields.apiKey;

    if (!apiKey || !validateApiKey(apiKey)) {
      return res.status(400).json({ error: 'Valid Anthropic API key required' });
    }

    if (!fileObj) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    uploadedFilePath = fileObj.filepath || fileObj.path;
    const filename = fileObj.originalFilename || fileObj.name || 'unknown.pdf';
    const mimetype = fileObj.mimetype || fileObj.type || '';

    console.log('Processing file:', filename);
    console.log('File size:', fileObj.size, 'bytes');

    if (!filename.toLowerCase().endsWith('.pdf') && mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Please upload a PDF file' });
    }

    // Check file size (5MB recommended limit for Claude)
    if (fileObj.size > 5 * 1024 * 1024) {
      console.warn('File size exceeds 5MB, processing may be slower or fail');
    }

    // Read the PDF file
    const pdfBuffer = await fs.readFile(uploadedFilePath);
    console.log('PDF buffer loaded, size:', pdfBuffer.length);

    // Process directly with Claude
    console.log('Processing PDF with Claude...');
    const result = await processPDFWithClaude(pdfBuffer, apiKey, filename);

    console.log('Claude processing successful');
    console.log('=== PROCESS PDF DIRECT REQUEST SUCCESS ===');
    
    res.status(200).json({ result });
  } catch (error) {
    console.error('=== PROCESS PDF DIRECT REQUEST ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  } finally {
    // Clean up uploaded file
    if (uploadedFilePath) {
      try {
        await fs.unlink(uploadedFilePath);
        console.log('Cleaned up temporary file:', uploadedFilePath);
      } catch (cleanupError) {
        console.error('File cleanup error:', cleanupError);
      }
    }
  }
}
