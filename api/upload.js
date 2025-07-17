const Anthropic = require('@anthropic-ai/sdk');
const formidable = require('formidable');
const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');

export const config = {
  api: {
    bodyParser: false,
  },
};

const parseForm = (req) => {
  return new Promise((resolve, reject) => {
    const form = formidable.formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB
      keepExtensions: true,
      multiples: false,
      uploadDir: '/tmp',
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

      console.log('Form parsing successful');
      console.log('File object:', {
        originalFilename: fileObj?.originalFilename,
        filepath: fileObj?.filepath,
        size: fileObj?.size,
        mimetype: fileObj?.mimetype
      });

      resolve({ fields, files, fileObj });
    });
  });
};

const extractPDFText = async (file) => {
  try {
    console.log('Starting PDF extraction');
    console.log('File properties:', {
      filepath: file.filepath,
      path: file.path,
      size: file.size,
      originalFilename: file.originalFilename,
      mimetype: file.mimetype,
      hasBuffer: !!file.buffer
    });
    
    let dataBuffer;

    // Try multiple ways to get the file buffer
    if (file.buffer) {
      console.log('Using existing buffer');
      dataBuffer = file.buffer;
    } else if (file.filepath && fs.existsSync(file.filepath)) {
      console.log('Reading from filepath:', file.filepath);
      dataBuffer = fs.readFileSync(file.filepath);
    } else if (file.path && fs.existsSync(file.path)) {
      console.log('Reading from path:', file.path);
      dataBuffer = fs.readFileSync(file.path);
    } else {
      // List all files in /tmp to debug
      console.log('Files in /tmp:', fs.readdirSync('/tmp'));
      
      // Try to find the file by name
      const tmpFiles = fs.readdirSync('/tmp');
      const possibleFile = tmpFiles.find(f => 
        f.includes(file.originalFilename) || 
        f.includes('upload') ||
        f.endsWith('.pdf')
      );
      
      if (possibleFile) {
        const fullPath = '/tmp/' + possibleFile;
        console.log('Found possible file:', fullPath);
        dataBuffer = fs.readFileSync(fullPath);
      } else {
        throw new Error('Could not locate uploaded file. Available files: ' + tmpFiles.join(', '));
      }
    }

    if (!dataBuffer || dataBuffer.length === 0) {
      throw new Error('File buffer is empty');
    }

    console.log('PDF buffer loaded, size:', dataBuffer.length);
    
    // Try pdf-parse with different options
    let pdfData;
    try {
      // First try with default options
      pdfData = await pdf(dataBuffer);
    } catch (parseError) {
      console.log('Default parse failed, trying with options:', parseError.message);
      
      // Try with different options
      pdfData = await pdf(dataBuffer, {
        max: 0, // Extract all pages
        normalizeWhitespace: true,
        disableCombineTextItems: false
      });
    }

    console.log('PDF parsed successfully');
    console.log('Number of pages:', pdfData.numpages);
    console.log('Text length:', pdfData.text ? pdfData.text.length : 0);
    console.log('First 200 chars:', pdfData.text ? pdfData.text.substring(0, 200) : 'No text');
    
    if (!pdfData.text || pdfData.text.trim().length === 0) {
      // Try extracting text from individual pages
      console.log('Attempting page-by-page extraction...');
      let allText = '';
      
      for (let i = 1; i <= pdfData.numpages; i++) {
        try {
          const pageData = await pdf(dataBuffer, { 
            first: i, 
            last: i,
            normalizeWhitespace: true
          });
          if (pageData.text) {
            allText += pageData.text + '\n';
          }
        } catch (pageError) {
          console.log(`Error extracting page ${i}:`, pageError.message);
        }
      }
      
      if (allText.trim().length > 0) {
        console.log('Successfully extracted text from individual pages');
        return allText;
      }
      
      throw new Error('PDF appears to contain no extractable text. This might be a scanned document or contain only images.');
    }

    return pdfData.text;
  } catch (error) {
    console.error('PDF extraction error:', error);
    console.error('Error stack:', error.stack);
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
  console.log('=== UPLOAD REQUEST START ===');
  console.log('Method:', req.method);
  console.log('Headers:', req.headers);
  
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

    console.log('Form parsed successfully');
    console.log('Fields keys:', Object.keys(fields));

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

    if (!filename.toLowerCase().endsWith('.pdf') && mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Please upload a PDF file' });
    }

    console.log('Extracting PDF text...');
    const text = await extractPDFText(fileObj);

    console.log('Text extraction successful, length:', text.length);

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ 
        error: 'No text found in PDF. This might be a scanned document or contain only images.' 
      });
    }

    // Show first part of extracted text for debugging
    console.log('First 500 chars of extracted text:', text.substring(0, 500));

    const trimmedText = text.length > 50000
      ? text.substring(0, 50000) + "\n\n[Text truncated due to length]"
      : text;

    console.log('Processing comments with AI...');
    const result = await processComments(trimmedText, apiKey);

    console.log('AI processing successful');
    console.log('=== UPLOAD REQUEST SUCCESS ===');
    
    res.status(200).json({ result });
  } catch (error) {
    console.error('=== UPLOAD REQUEST ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
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
