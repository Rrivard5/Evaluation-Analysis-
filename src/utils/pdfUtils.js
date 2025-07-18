// Enhanced src/utils/pdfUtils.js with updated PDF.js version
export class PDFUtils {
  static async compressPDF(file, quality = 0.7, onProgress = () => {}) {
    try {
      console.log('=== PDF COMPRESSION START ===');
      console.log('File:', file.name, 'Size:', (file.size / 1024 / 1024).toFixed(2), 'MB');
      
      // Import PDF-lib dynamically with better error handling
      let PDFDocument;
      try {
        const pdfLib = await import('pdf-lib');
        PDFDocument = pdfLib.PDFDocument;
        console.log('PDF-lib imported successfully');
      } catch (importError) {
        console.error('Failed to import PDF-lib:', importError);
        throw new Error('PDF compression library not available');
      }
      
      const arrayBuffer = await file.arrayBuffer();
      console.log('ArrayBuffer created, size:', arrayBuffer.byteLength);
      
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      console.log('PDF loaded successfully');
      
      const pages = pdfDoc.getPages();
      console.log(`Compressing ${pages.length} pages...`);
      
      // Process each page
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        
        // Scale down large pages
        const { width, height } = page.getSize();
        console.log(`Page ${i + 1}: ${width}x${height}`);
        
        if (width > 800 || height > 1000) {
          const scale = Math.min(800 / width, 1000 / height) * quality;
          console.log(`Scaling page ${i + 1} by ${scale.toFixed(2)}`);
          page.scaleContent(scale, scale);
        }
        
        // Update progress
        const progress = 20 + (i / pages.length) * 30;
        onProgress(progress);
      }
      
      // Save compressed PDF
      console.log('Saving compressed PDF...');
      const compressedBytes = await pdfDoc.save({
        useObjectStreams: true,
        addDefaultPage: false,
        objectsPerTick: 50
      });
      
      const compressedFile = new File([compressedBytes], file.name, {
        type: 'application/pdf',
        lastModified: Date.now()
      });
      
      const compressionRatio = compressedFile.size / file.size;
      console.log(`Compression successful: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB (${(compressionRatio * 100).toFixed(1)}%)`);
      
      onProgress(55);
      return compressedFile;
      
    } catch (error) {
      console.error('=== PDF COMPRESSION ERROR ===');
      console.error('Error:', error);
      console.error('Stack:', error.stack);
      console.warn('PDF compression failed, using original file');
      
      // Important: Still call onProgress to continue the flow
      onProgress(55);
      return file;
    }
  }

  static async extractTextAdvanced(file, onProgress = () => {}) {
    try {
      console.log('=== ADVANCED TEXT EXTRACTION START ===');
      console.log('File:', file.name, 'Size:', (file.size / 1024 / 1024).toFixed(2), 'MB');
      
      // Import PDF.js with better error handling
      console.log('Importing PDF.js...');
      let pdfjsLib;
      try {
        pdfjsLib = await import('pdfjs-dist');
        console.log('PDF.js imported successfully');
      } catch (importError) {
        console.error('Failed to import PDF.js:', importError);
        throw new Error('PDF.js library not available');
      }
      
      // Try different worker URLs until one works
      const workerUrls = [
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js',
        'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
      ];
      
      let workerLoaded = false;
      for (const workerUrl of workerUrls) {
        try {
          console.log('Trying worker URL:', workerUrl);
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
          
          // Test if worker loads by creating a simple document
          const testArrayBuffer = await file.arrayBuffer();
          const testDoc = await pdfjsLib.getDocument({ data: testArrayBuffer.slice(0, 1024) }).promise;
          console.log('Worker URL works:', workerUrl);
          workerLoaded = true;
          break;
        } catch (workerError) {
          console.log('Worker URL failed:', workerUrl, workerError.message);
        }
      }
      
      if (!workerLoaded) {
        throw new Error('Could not load PDF.js worker');
      }
      
      console.log('Loading PDF document...');
      const arrayBuffer = await file.arrayBuffer();
      console.log('ArrayBuffer size:', arrayBuffer.byteLength);
      
      const loadingTask = pdfjsLib.getDocument({
        data: arrayBuffer,
        verbosity: 0,
        disableAutoFetch: true,
        disableStream: true,
        disableRange: true
      });
      
      const pdf = await loadingTask.promise;
      console.log(`PDF loaded successfully: ${pdf.numPages} pages`);
      
      let fullText = '';
      const progressStart = 60;
      const progressRange = 35;
      
      // Extract text from all pages
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        try {
          console.log(`Processing page ${pageNum}/${pdf.numPages}`);
          const page = await pdf.getPage(pageNum);
          
          const textContent = await page.getTextContent({
            normalizeWhitespace: false,
            disableCombineTextItems: false
          });
          
          console.log(`Page ${pageNum} text items:`, textContent.items.length);
          
          // Combine text items with better spacing
          let pageText = '';
          textContent.items.forEach((item, index) => {
            if (item.str && item.str.trim()) {
              const nextItem = textContent.items[index + 1];
              let spacing = ' ';
              
              if (nextItem && item.transform && nextItem.transform) {
                const verticalGap = Math.abs(item.transform[5] - nextItem.transform[5]);
                const horizontalGap = Math.abs(item.transform[4] - nextItem.transform[4]);
                
                if (verticalGap > 5) {
                  spacing = '\n';
                } else if (horizontalGap > 50) {
                  spacing = '\t';
                }
              }
              
              pageText += item.str + spacing;
            }
          });
          
          console.log(`Page ${pageNum} text length:`, pageText.length);
          
          if (pageText.trim()) {
            fullText += `\n--- Page ${pageNum} ---\n${pageText}\n`;
          }
          
          // Update progress
          const progress = progressStart + (pageNum / pdf.numPages) * progressRange;
          onProgress(progress);
          
        } catch (pageError) {
          console.error(`Failed to extract text from page ${pageNum}:`, pageError);
        }
      }
      
      console.log('Raw text length before cleaning:', fullText.length);
      
      // Clean and optimize text
      const cleanedText = this.cleanText(fullText);
      console.log('Cleaned text length:', cleanedText.length);
      
      // Show first 500 characters for debugging
      if (cleanedText.length > 0) {
        console.log('First 500 chars:', cleanedText.substring(0, 500));
      }
      
      onProgress(95);
      console.log('=== TEXT EXTRACTION COMPLETE ===');
      
      return cleanedText;
      
    } catch (error) {
      console.error('=== ADVANCED TEXT EXTRACTION ERROR ===');
      console.error('Error:', error);
      console.error('Stack:', error.stack);
      throw new Error(`Text extraction failed: ${error.message}`);
    }
  }

  static cleanText(text) {
    if (!text) {
      console.log('No text to clean');
      return '';
    }
    
    console.log('Cleaning text, original length:', text.length);
    
    // Remove excessive whitespace but preserve structure
    let cleaned = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\t+/g, '\t')
      .replace(/[ ]{2,}/g, ' ')
      .trim();
    
    // Remove common PDF artifacts
    cleaned = cleaned
      .replace(/\x00/g, '') // Remove null characters
      .replace(/\ufffd/g, '') // Remove replacement characters
      .replace(/[^\x20-\x7E\n\t]/g, ' ') // Replace non-printable chars
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\n\s*\n/g, '\n\n'); // Clean up line breaks
    
    console.log('Text after cleaning:', cleaned.length);
    
    // Truncate if too long
    const maxLength = 100000; // 100KB limit
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength) + '\n\n[Text truncated due to length]';
      console.log('Text truncated to', maxLength, 'characters');
    }
    
    return cleaned;
  }

  // Fallback method for when advanced extraction fails
  static async extractTextFallback(file) {
    try {
      console.log('=== FALLBACK TEXT EXTRACTION ===');
      
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const pdfString = new TextDecoder('latin1').decode(uint8Array);
      
      console.log('PDF string length:', pdfString.length);
      
      // Look for text patterns
      const textMatches = [];
      
      // Pattern 1: Text in parentheses (most common)
      const parenRegex = /\(([^)]+)\)/g;
      let match;
      while ((match = parenRegex.exec(pdfString)) !== null) {
        const text = match[1];
        if (text.length > 2 && /[a-zA-Z]/.test(text)) {
          textMatches.push(text);
        }
      }
      
      console.log('Found parentheses matches:', textMatches.length);
      
      // Pattern 2: Text between BT and ET markers
      const btRegex = /BT\s*(.*?)\s*ET/gs;
      while ((match = btRegex.exec(pdfString)) !== null) {
        const btContent = match[1];
        const tjMatches = btContent.match(/\(([^)]+)\)\s*Tj/g);
        if (tjMatches) {
          tjMatches.forEach(tjMatch => {
            const text = tjMatch.match(/\(([^)]+)\)/)[1];
            if (text && /[a-zA-Z]/.test(text)) {
              textMatches.push(text);
            }
          });
        }
      }
      
      console.log('Total matches found:', textMatches.length);
      
      const extractedText = textMatches.join(' ');
      console.log('Fallback extracted text length:', extractedText.length);
      
      if (extractedText.length > 100) {
        console.log('Fallback extraction successful');
        return this.cleanText(extractedText);
      }
      
      throw new Error('Fallback extraction yielded insufficient text');
      
    } catch (error) {
      console.error('Fallback extraction failed:', error);
      throw error;
    }
  }

  // Enhanced method that tries multiple approaches
  static async extractTextRobust(file, onProgress = () => {}) {
    try {
      console.log('=== ROBUST TEXT EXTRACTION START ===');
      
      // Method 1: Try advanced extraction
      try {
        const text = await this.extractTextAdvanced(file, onProgress);
        if (text && text.length > 100) {
          console.log('Advanced extraction successful');
          return text;
        }
      } catch (error) {
        console.warn('Advanced extraction failed:', error.message);
      }
      
      // Method 2: Try fallback extraction
      try {
        onProgress(90);
        const text = await this.extractTextFallback(file);
        if (text && text.length > 100) {
          console.log('Fallback extraction successful');
          onProgress(100);
          return text;
        }
      } catch (error) {
        console.warn('Fallback extraction failed:', error.message);
      }
      
      // Method 3: Try with your original method as last resort
      try {
        console.log('Trying original extraction method...');
        const text = await this.extractTextOriginal(file);
        if (text && text.length > 100) {
          console.log('Original extraction successful');
          onProgress(100);
          return text;
        }
      } catch (error) {
        console.warn('Original extraction failed:', error.message);
      }
      
      throw new Error('All text extraction methods failed');
      
    } catch (error) {
      console.error('=== ROBUST EXTRACTION FAILED ===');
      console.error('Error:', error);
      throw error;
    }
  }

  // Your original extraction method as fallback
  static async extractTextOriginal(file) {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n\n';
    }
    
    return fullText;
  }
}
