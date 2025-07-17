const Anthropic = require('@anthropic-ai/sdk');
const formidable = require('formidable');
const pdf = require('pdf-parse');
const fs = require('fs');

export const config = {
  api: {
    bodyParser: false,
  },
};

const parseForm = (req) => {
  return new Promise((resolve, reject) => {
    // Create the form instance correctly
    const form = new formidable.IncomingForm({
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
    console.log('=== PDF EXTRACTION START ===');
    console.log('File object keys:', Object.keys(file));
    console.log('File details:', {
      originalFilename: file.originalFilename,
      filepath: file.filepath,
      path: file.path,
      size: file.size,
      mimetype: file.mimetype,
      type: file.type
    });
    
    // List all files in /tmp directory
    const tmpFiles = fs.readdirSync('/tmp');
    console.log('All files in /tmp:', tmpFiles);
    
    let dataBuffer;
    let filePath;

    // Try to get the file buffer
    if (file.buffer) {
      console.log('Using existing buffer, size:', file.buffer.length);
      dataBuffer = file.buffer;
    } else {
      // Try to find the file
      const possiblePaths = [
        file.filepath,
        file.path,
        `/tmp/${file.originalFilename}`,
        ...tmpFiles.map(f => `/tmp/${f}`)
      ].filter(p => p); // Remove null/undefined values

      console.log('Trying paths:', possiblePaths);

      for (const tryPath of possiblePaths) {
        if (fs.existsSync(tryPath)) {
          console.log('Found file at:', tryPath);
          filePath = tryPath;
          const stats = fs.statSync(tryPath);
          console.log('File stats:', { size: stats.size, isFile: stats.isFile() });
          
          dataBuffer = fs.readFileSync(tryPath);
          console.log('Buffer loaded, size:', dataBuffer.length);
          break;
        }
      }
    }

    if (!dataBuffer) {
      throw new Error('Could not locate or read uploaded file');
    }

    if (dataBuffer.length === 0) {
      throw new Error('File buffer is empty');
    }

    // Check if it's actually a PDF
    const pdfHeader = dataBuffer.slice(0, 4).toString();
    console.log('File header:', pdfHeader);
    
    if (pdfHeader !== '%PDF') {
      throw new Error('File does not appear to be a valid PDF (missing PDF header)');
    }

    console.log('Valid PDF detected, attempting text extraction...');

    // Try different PDF parsing approaches
    const parseAttempts = [
      // Attempt 1: Basic parsing
      () => pdf(dataBuffer),
      
      // Attempt 2: With options
      () => pdf(dataBuffer, {
        normalizeWhitespace: true,
        disableCombineTextItems: false
      }),
      
      // Attempt 3: Force version
      () => pdf(dataBuffer, {
        version: 'v1.10.100',
        normalizeWhitespace: true
      }),
      
      // Attempt 4: Max pages
      () => pdf(dataBuffer, {
        max: 10,
        normalizeWhitespace: true
      })
    ];

    let pdfData;
    let lastError;

    for (let i = 0; i < parseAttempts.length; i++) {
      try {
        console.log(`Parse attempt ${i + 1}...`);
        pdfData = await parseAttempts[i]();
        console.log(`Parse attempt ${i + 1} successful`);
        break;
      } catch (error) {
        console.log(`Parse attempt ${i + 1} failed:`, error.message);
        lastError = error;
      }
    }

    if (!pdfData) {
      throw new Error(`All PDF parsing attempts failed. Last error: ${lastError.message}`);
    }

    console.log('PDF parse results:', {
      hasText: !!pdfData.text,
      textLength: pdfData.text ? pdfData.text.length : 0,
      numPages: pdfData.numpages,
      info: pdfData.info
    });

    if (pdfData.text && pdfData.text.length > 0) {
      console.log('First 300 characters:', pdfData.text.substring(0, 300));
      console.log('=== PDF EXTRACTION SUCCESS ===');
      return pdfData.text;
    }

    // If main text extraction failed, try page-by-page
    console.log('Main text extraction failed, trying page-by-page...');
    
    if (!pdfData.numpages || pdfData.numpages === 0) {
      throw new Error('PDF contains no pages');
    }

    let allText = '';
    for (let pageNum = 1; pageNum <= Math.min(pdfData.numpages, 20); pageNum++) {
      try {
        console.log(`Extracting page ${pageNum}...`);
        const pageData = await pdf(dataBuffer, {
          first: pageNum,
          last: pageNum,
          normalizeWhitespace: true
        });
        
        if (pageData.text) {
          allText += `\n--- Page ${pageNum} ---\n${pageData.text}`;
          console.log(`Page ${pageNum} text length:`, pageData.text.length);
        }
      } catch (pageError) {
        console.log(`Page ${pageNum} extraction failed:`, pageError.message);
      }
    }

    if (allText.trim().length > 0) {
      console.log('Page-by-page extraction successful, total length:', allText.length);
      console.log('=== PDF EXTRACTION SUCCESS ===');
      return allText;
    }

    console.log('=== PDF EXTRACTION FAILED ===');
    throw new Error('PDF appears to contain no extractable text. This might be a scanned document, password-protected, or corrupted.');

  } catch (error) {
    console.error('=== PDF EXTRACTION ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    throw error;
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
  console.log('Content-Type:', req.headers['content-type']);
  
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
        // Don't throw here, just log
      }
    }
  }
}
