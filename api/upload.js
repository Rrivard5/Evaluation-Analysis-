const Anthropic = require('@anthropic-ai/sdk');
const formidable = require('formidable');
const pdf = require('pdf-parse');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const parseForm = (req) => {
  return new Promise((resolve, reject) => {
    const uploadDir = path.join(os.tmpdir(), 'uploads');
    
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB
      keepExtensions: true,
      multiples: false,
      uploadDir: uploadDir,
    });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('Form parsing error:', err);
        reject(err);
        return;
      }

      try {
        await fs.mkdir(uploadDir, { recursive: true });
      } catch (e) {
        // Directory might already exist
      }

      let fileObj = files.file;
      if (Array.isArray(fileObj)) {
        fileObj = fileObj[0];
      }

      resolve({ fields, files, fileObj });
    });
  });
};

const extractPDFText = async (file) => {
  try {
    let dataBuffer;

    if (file.filepath) {
      console.log('Reading PDF file from path:', file.filepath);
      dataBuffer = await fs.readFile(file.filepath);
    } else if (file.buffer) {
      console.log('Using PDF file buffer');
      dataBuffer = file.buffer;
    } else {
      throw new Error('No valid file path or buffer found');
    }

    console.log('PDF file read successfully, size:', dataBuffer.length);
    const data = await pdf(dataBuffer);
    console.log('PDF parsing complete. Text length:', data.text.length);
    return data.text;
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
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

module.exports = async function handler(req, res) {
  console.log('Upload endpoint called with method:', req.method);
  
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
    console.log('Request received, parsing form...');
    const { fields, fileObj } = await parseForm(req);

    console.log('Form parsed successfully');

    const apiKey = Array.isArray(fields.apiKey) ? fields.apiKey[0] : fields.apiKey;

    if (!apiKey || !validateApiKey(apiKey)) {
      return res.status(400).json({ error: 'Valid Anthropic API key required' });
    }

    if (!fileObj) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    uploadedFilePath = fileObj.filepath;

    const filename = fileObj.originalFilename || fileObj.name || '';
    const mimetype = fileObj.mimetype || '';

    if (!filename.toLowerCase().endsWith('.pdf') && mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Please upload a PDF file' });
    }

    console.log('Extracting PDF text...');
    const text = await extractPDFText(fileObj);

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'No text found in PDF' });
    }

    const trimmedText = text.length > 50000
      ? text.substring(0, 50000) + "\n\n[Text truncated due to length]"
      : text;

    console.log('Processing comments with AI...');
    const result = await processComments(trimmedText, apiKey);

    console.log('Sending successful response');
    res.status(200).json({ result });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  } finally {
    if (uploadedFilePath) {
      try {
        await fs.unlink(uploadedFilePath);
        console.log('Cleaned up temporary file');
      } catch (cleanupError) {
        console.error('File cleanup error:', cleanupError);
      }
    }
  }
};
