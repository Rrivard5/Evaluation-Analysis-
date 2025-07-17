
// src/utils/pdfUtils.js
// Utility functions for enhanced PDF processing

export class PDFUtils {
  static async compressPDF(file, quality = 0.7, onProgress = () => {}) {
    try {
      console.log('Starting PDF compression...');
      
      // Import PDF-lib dynamically
      const { PDFDocument } = await import('pdf-lib');
      
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      
      const pages = pdfDoc.getPages();
      console.log(`Compressing ${pages.length} pages...`);
      
      // Process each page
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        
        // Scale down large pages
        const { width, height } = page.getSize();
        if (width > 800 || height > 1000) {
          const scale = Math.min(800 / width, 1000 / height) * quality;
          page.scaleContent(scale, scale);
        }
        
        // Update progress (20% to 50% for compression)
        const progress = 20 + (i / pages.length) * 30;
        onProgress(progress);
      }
      
      // Save compressed PDF
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
      console.log(`Compression: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB (${(compressionRatio * 100).toFixed(1)}%)`);
      
      onProgress(55);
      return compressedFile;
      
    } catch (error) {
      console.warn('PDF compression failed, using original file:', error.message);
      return file;
    }
  }

  static async extractTextAdvanced(file, onProgress = () => {}) {
    try {
      console.log('Starting advanced text extraction...');
      
      // Import PDF.js
      const pdfjsLib = await import('pdfjs-dist/webpack');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({
        data: arrayBuffer,
        verbosity: 0,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/',
        disableAutoFetch: false,
        disableStream: false,
        disableRange: false
      }).promise;
      
      console.log(`PDF loaded: ${pdf.numPages} pages`);
      
      let fullText = '';
      const progressStart = 60; // Start after compression
      const progressRange = 35; // Use 35% of progress bar
      
      // Extract text from all pages
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        try {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent({
            normalizeWhitespace: false,
            disableCombineTextItems: false
          });
          
          // Combine text items with better spacing
          let pageText = '';
          textContent.items.forEach((item, index) => {
            if (item.str && item.str.trim()) {
              const nextItem = textContent.items[index + 1];
              let spacing = ' ';
              
              if (nextItem) {
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
          
          if (pageText.trim()) {
            fullText += `\n--- Page ${pageNum} ---\n${pageText}\n`;
          }
          
          // Update progress
          const progress = progressStart + (pageNum / pdf.numPages) * progressRange;
          onProgress(progress);
          
        } catch (pageError) {
          console.warn(`Failed to extract text from page ${pageNum}:`, pageError.message);
        }
      }
      
      // Clean and optimize text
      const cleanedText = this.cleanText(fullText);
      
      onProgress(95);
      console.log(`Text extraction completed: ${cleanedText.length} characters`);
      
      return cleanedText;
      
    } catch (error) {
      console.error('Advanced text extraction failed:', error);
      throw new Error(`Text extraction failed: ${error.message}`);
    }
  }

  static cleanText(text) {
    if (!text) return '';
    
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
    
    // Truncate if too long
    const maxLength = 100000; // 100KB limit
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength) + '\n\n[Text truncated due to length]';
    }
    
    return cleaned;
  }
}
