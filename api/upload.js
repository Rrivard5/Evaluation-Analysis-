import Anthropic from '@anthropic-ai/sdk';
import formidable from 'formidable';
import pdf from 'pdf-parse';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const config = {
  api: {
    bodyParser: false,
  },
};

const parseForm = (req) => {
  return new Promise((resolve, reject) => {
    const uploadDir = path.join(os.tmpdir(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB
      keepExtensions: true,
      multiples: false,
      uploadDir: uploadDir,
      filename: (name, ext, part) => {
        return `${Date.now()}-${Math.random().toString(36).substring(2)}${ext}`;
      }
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        console.error('Form parsing error:', err);
        reject(err);
      } else {
        let fileObj = files.file;
        if (Array.isArray(fileObj)) {
          fileObj = fileObj[0];
        }

        console.log('Raw form parse result:', {
          fields: Object.keys(fields),
          files: Object.keys(files),
          fileIsArray: Array.isArray(files.file),
          fileDetails: fileObj ? {
            name: fileObj.name,
            originalFilename: fileObj.originalFilename,
            newFilename: fileObj.newFilename,
            mimetype: fileObj.mimetype,
            size: fileObj.size,
            filepath: fileObj.filepath,
            properties: Object.getOwnPropertyNames(fileObj)
          } : 'No file'
        });

        files.file = fileObj;
        resolve({ fields, files });
      }
    });
  });
};

const extractPDFText = async (file) => {
  try {
    let dataBuffer;

    if (file.filepath && fs.existsSync(file.filepath)) {
      console.log('Reading PDF file from path:', file.filepath);
      dataBuffer = fs.readFileSync(file.filepath);
    } else if (file.buffer) {
      console.log('Using PDF file buffer, size:', file.buffer.length);
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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }]
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('Content declined by AI for safety reasons');
    }

    return response.content[0].text;
  } catch (error) {
    console.error('Anthropic API error:', error);

    if (error.message.includes('refusal') || error.message.includes('Content declined')) {
      throw new Error('The AI declined to process this content for safety reasons. Please try with different content.');
    }

    if (error.status === 401 || error.message.includes('authentication')) {
      throw new Error('Invalid API key. Please check your Anthropic API key.');
    }

    if (error.status === 429) {
      throw new Error('Rate limit exceeded. Please try again in a moment.');
    }

    if (error.status === 400) {
      throw new Error('Invalid request. Please check your input and try again.');
    }

    throw new Error('Failed to process comments with AI');
  }
};

const validateApiKey = (apiKey) => {
  return apiKey && apiKey.startsWith('sk-ant-') && apiKey.length > 20;
};

async function handler(req, res) {
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

  let uploadedFile = null;

  try {
    console.log('Request received, parsing form...');
    const { fields, files } = await parseForm(req);

    const actualFile = files.file;
    uploadedFile = actualFile;

    console.log('Form parsed successfully');
    console.log('Fields:', Object.keys(fields));
    console.log('Files:', Object.keys(files));

    const apiKey = Array.isArray(fields.apiKey) ? fields.apiKey[0] : fields.apiKey;

    if (!apiKey || !validateApiKey(apiKey)) {
      return res.status(400).json({ error: 'Valid Anthropic API key required' });
    }

    if (!actualFile) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filename = actualFile.originalFilename || actualFile.newFilename || actualFile.name || actualFile.filename || '';
    const mimetype = actualFile.mimetype || actualFile.type || '';

    console.log('File object details:', {
      exists: !!actualFile,
      originalFilename: actualFile?.originalFilename,
      newFilename: actualFile?.newFilename,
      name: actualFile?.name,
      filename: actualFile?.filename,
      mimetype: actualFile?.mimetype,
      size: actualFile?.size,
      filepath: actualFile?.filepath,
      allProperties: Object.getOwnPropertyNames(actualFile)
    });

    const isValidPdf = filename.toLowerCase().endsWith('.pdf') || mimetype === 'application/pdf';

    if (!isValidPdf && filename !== '' && mimetype !== '') {
      return res.status(400).json({
        error: 'Please upload a PDF file',
        debug: {
          filename,
          mimetype,
          receivedFile: !!actualFile,
          allProps: Object.getOwnPropertyNames(actualFile)
        }
      });
    }

    if (!filename && !mimetype) {
      console.log('Warning: No filename or mimetype detected, but file exists. Proceeding...');
    }

    console.log('Attempting to extract PDF text...');
    const text = await extractPDFText(actualFile);
    console.log('PDF text extracted, length:', text.length);

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'No text found in PDF' });
    }

    const trimmedText = text.length > 50000
      ? text.substring(0, 50000) + "\n\n[Text truncated due to length]"
      : text;

    console.log('Processing comments with AI...');
    const result = await processComments(trimmedText, apiKey);
    console.log('AI processing complete');

    res.status(200).json({ result });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    try {
      if (uploadedFile?.filepath && fs.existsSync(uploadedFile.filepath)) {
        fs.unlinkSync(uploadedFile.filepath);
        console.log('Cleaned up temporary file:', uploadedFile.filepath);
      }
    } catch (cleanupError) {
      console.error('File cleanup error:', cleanupError);
    }
  }
}

export default handler;
