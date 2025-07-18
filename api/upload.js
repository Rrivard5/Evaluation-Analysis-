const Anthropic = require('@anthropic-ai/sdk');
const formidable = require('formidable');
const pdf = require('pdf-parse');
const fs = require('fs');

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
    console.log('=== ROBUST PDF EXTRACTION START ===');
    console.log('File:', file.originalFilename, 'Size:', file.size);
    
    let dataBuffer;
    if (file.filepath && fs.existsSync(file.filepath)) {
      console.log('Reading from filepath:', file.filepath);
      dataBuffer = fs.readFileSync(file.filepath);
    } else {
      throw new Error('Could not locate uploaded file');
    }
    
    console.log('Buffer loaded, size:', dataBuffer.length);
    
    // Method 1: Try standard pdf-parse
    console.log('=== METHOD 1: Standard PDF Parse ===');
    try {
      const pdfData = await pdf(dataBuffer);
      console.log('PDF Info:', {
        pages: pdfData.numpages,
        textLength: pdfData.text?.length || 0,
        hasInfo: !!pdfData.info,
        version: pdfData.version
      });
      
      if (pdfData.text && pdfData.text.trim().length > 100) {
        console.log('SUCCESS: Method 1 worked');
        console.log('First 200 chars:', pdfData.text.substring(0, 200));
        return pdfData.text;
      }
    } catch (error) {
      console.log('Method 1 failed:', error.message);
    }
    
    // Method 2: Try with different options
    console.log('=== METHOD 2: PDF Parse with Options ===');
    try {
      const pdfData = await pdf(dataBuffer, {
        normalizeWhitespace: true,
        disableCombineTextItems: false,
        max: 0 // Extract all pages
      });
      
      if (pdfData.text && pdfData.text.trim().length > 100) {
        console.log('SUCCESS: Method 2 worked');
        return pdfData.text;
      }
    } catch (error) {
      console.log('Method 2 failed:', error.message);
    }
    
    // Method 3: Extract text from raw PDF content
    console.log('=== METHOD 3: Raw PDF Content Extraction ===');
    try {
      const pdfString = dataBuffer.toString('latin1');
      console.log('PDF string length:', pdfString.length);
      
      // Look for text between parentheses (common PDF text encoding)
      const textPattern1 = /\(([^)]+)\)/g;
      const matches1 = [...pdfString.matchAll(textPattern1)];
      console.log('Found parentheses matches:', matches1.length);
      
      let extractedText = '';
      for (const match of matches1) {
        const text = match[1];
        if (text && text.length > 2 && /[a-zA-Z]/.test(text)) {
          extractedText += text + ' ';
        }
      }
      
      if (extractedText.length > 100) {
        console.log('SUCCESS: Method 3 worked with parentheses');
        console.log('Extracted text length:', extractedText.length);
        return extractedText;
      }
      
      // Try another pattern - text in brackets
      const textPattern2 = /\[([^\]]+)\]/g;
      const matches2 = [...pdfString.matchAll(textPattern2)];
      console.log('Found bracket matches:', matches2.length);
      
      extractedText = '';
      for (const match of matches2) {
        const text = match[1];
        if (text && text.length > 2 && /[a-zA-Z]/.test(text)) {
          extractedText += text + ' ';
        }
      }
      
      if (extractedText.length > 100) {
        console.log('SUCCESS: Method 3 worked with brackets');
        return extractedText;
      }
      
      // Try to find text in streams
      const streamPattern = /stream\s*(.*?)\s*endstream/gs;
      const streamMatches = [...pdfString.matchAll(streamPattern)];
      console.log('Found stream matches:', streamMatches.length);
      
      extractedText = '';
      for (const streamMatch of streamMatches) {
        const streamContent = streamMatch[1];
        // Look for readable text in the stream
        const readableMatches = streamContent.match(/[A-Za-z][A-Za-z0-9\s.,!?;:'"()-]{5,}/g);
        if (readableMatches) {
          extractedText += readableMatches.join(' ') + ' ';
        }
      }
      
      if (extractedText.length > 100) {
        console.log('SUCCESS: Method 3 worked with streams');
        return extractedText;
      }
      
    } catch (error) {
      console.log('Method 3 failed:', error.message);
    }
    
    // Method 4: Try to extract text objects
    console.log('=== METHOD 4: PDF Text Objects ===');
    try {
      const pdfString = dataBuffer.toString('latin1');
      
      // Look for BT (Begin Text) and ET (End Text) markers
      const textObjectPattern = /BT\s*(.*?)\s*ET/gs;
      const textObjects = [...pdfString.matchAll(textObjectPattern)];
      console.log('Found text objects:', textObjects.length);
      
      let extractedText = '';
      for (const textObj of textObjects) {
        const content = textObj[1];
        // Look for Tj or TJ operators (show text)
        const textMatches = content.match(/\(([^)]+)\)\s*Tj/g);
        if (textMatches) {
          for (const match of textMatches) {
            const text = match.match(/\(([^)]+)\)/)[1];
            if (text && /[a-zA-Z]/.test(text)) {
              extractedText += text + ' ';
            }
          }
        }
      }
      
      if (extractedText.length > 100) {
        console.log('SUCCESS: Method 4 worked');
        return extractedText;
      }
      
    } catch (error) {
      console.log('Method 4 failed:', error.message);
    }
    
    console.log('=== ALL METHODS FAILED ===');
    
    // If we get here, let's provide detailed diagnostics
    console.log('PDF Diagnostics:');
    console.log('- File size:', dataBuffer.length);
    console.log('- PDF version:', dataBuffer.slice(0, 8).toString());
    const pdfString = dataBuffer.toString('latin1');
    console.log('- Contains "stream":', pdfString.includes('stream'));
    console.log('- Contains "BT":', pdfString.includes('BT'));
    console.log('- Contains "Tj":', pdfString.includes('Tj'));
    console.log('- Contains parentheses:', (pdfString.match(/\(/g) || []).length);
    
    throw new Error('Could not extract readable text from PDF using any method. The PDF may be image-based, encrypted, or use an unsupported text encoding.');
    
  } catch (error) {
    console.error('=== PDF EXTRACTION ERROR ===');
    console.error('Error:', error.message);
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

module.exports = async function handler(req, res) {
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
};
