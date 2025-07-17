const Anthropic = require('@anthropic-ai/sdk');
const formidable = require('formidable');
const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const os = require('os');

export const config = {
  api: {
    bodyParser: false,
  },
};

const parseForm = (req) => {
  return new Promise((resolve, reject) => {
    // Use /tmp directory for Vercel
    const uploadDir = '/tmp';
    
    const form = formidable.formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB
      keepExtensions: true,
      multiples: false,
      uploadDir: uploadDir,
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        console.error('Form parsing error:', err);
        reject(err);
        return;
      }

      let fileObj = files.file;
      if (Array.isArray(fileObj)) {
        fileObj = fileObj[0];
      }

      console.log('File object:', fileObj);
      resolve({ fields, files, fileObj });
    });
  });
};

const extractPDFText = async (file) => {
  try {
    console.log('Extracting PDF text from file:', file);
    
    let dataBuffer;

    // Try different ways to read the file
    if (file.filepath && fs.existsSync(file.filepath)) {
      console.log('Reading from filepath:', file.filepath);
      dataBuffer = fs.readFileSync(file.filepath);
    } else if (file.path && fs.existsSync(file.path)) {
      console.log('Reading from path:', file.path);
      dataBuffer = fs.readFileSync(file.path);
    } else if (file.buffer) {
      console.log('Using buffer directly');
      dataBuffer = file.buffer;
    } else {
      // Try to read the file content directly from the request
      console.log('Attempting to read file content directly');
      const possiblePaths = [
        file.filepath,
        file.path,
        path.join('/tmp', file.originalFilename || file.name || 'upload.pdf')
      ];
      
      let found = false;
      for (const filePath of possiblePaths) {
        if (filePath && fs.existsSync(filePath)) {
          console.log('Found file at:', filePath);
          dataBuffer = fs.readFileSync(filePath);
          found = true;
          break;
        }
      }
      
      if (!found) {
        throw new Error('Could not locate uploaded file. Available properties: ' + Object.keys(file).join(', '));
      }
    }

    if (!dataBuffer || dataBuffer.length === 0) {
      throw new Error('File buffer is empty');
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

export default async function handler(req, res) {
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
    console.log('Fields:', fields);
    console.log('File object keys:', Object.keys(fileObj));

    const apiKey = Array.isArray(fields.apiKey) ? fields.apiKey[0] : fields.apiKey;

    if (!apiKey || !validateApiKey(apiKey)) {
      return res.status(400).json({ error: 'Valid Anthropic API key required' });
    }

    if (!fileObj) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Store file path for cleanup
    uploadedFilePath = fileObj.filepath || fileObj.path;

    const filename = fileObj.originalFilename || fileObj.name || 'unknown.pdf';
    const mimetype = fileObj.mimetype || fileObj.type || '';

    console.log('File details:', {
      filename,
      mimetype,
      size: fileObj.size,
      filepath: fileObj.filepath,
      path: fileObj.path
    });

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
    // Clean up uploaded file
    if (uploadedFilePath) {
      try {
        if (fs.existsSync(uploadedFilePath)) {
          fs.unlinkSync(uploadedFilePath);
          console.log('Cleaned up temporary file:', uploadedFilePath);
        }
      } catch (cleanupError) {
        console.error('File cleanup error:', cleanupError);
      }
    }
  }
}
