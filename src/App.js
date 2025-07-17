import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

// Import our enhanced PDF utilities
import { PDFUtils } from './utils/pdfUtils';

function App() {
  const [apiKey, setApiKey] = useState('');
  const [apiKeyValid, setApiKeyValid] = useState(false);
  const [file, setFile] = useState(null);
  const [originalFile, setOriginalFile] = useState(null); // Store original file reference
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState('api-key');
  const [compressionInfo, setCompressionInfo] = useState(null); // Track compression results

  const validateApiKey = (key) => {
    return key && key.startsWith('sk-ant-') && key.length > 20;
  };

  const handleApiKeyChange = (e) => {
    const key = e.target.value.trim();
    setApiKey(key);
    setApiKeyValid(validateApiKey(key));
    setError("");
  };

  const handleApiKeySubmit = async () => {
    if (!validateApiKey(apiKey)) {
      setError("Please enter a valid Anthropic API key (starts with 'sk-ant-')");
      return;
    }

    setLoading(true);
    setError("");
    
    try {
      const response = await axios.post('/api/test-key', {
        apiKey: apiKey
      });
      
      if (response.data.valid) {
        setApiKeyValid(true);
        setStep('upload');
      } else {
        setError("Invalid API key. Please check your key and try again.");
      }
    } catch (err) {
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError("Unable to validate API key. Please check your key and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Enhanced file change handler with compression (Option 2)
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile || selectedFile.type !== 'application/pdf') {
      setError("Please select a valid PDF file.");
      setFile(null);
      setOriginalFile(null);
      return;
    }

    setError("");
    setLoading(true);
    setProgress(0);
    setCompressionInfo(null);
    
    try {
      const fileSizeMB = selectedFile.size / 1024 / 1024;
      console.log(`Selected file: ${selectedFile.name}, Size: ${fileSizeMB.toFixed(2)}MB`);
      
      // Store original file reference
      setOriginalFile(selectedFile);
      
      // If file is large (>5MB), compress it first
      if (selectedFile.size > 5 * 1024 * 1024) {
        console.log('File is large, compressing...');
        
        const compressedFile = await PDFUtils.compressPDF(selectedFile, 0.7, (progress) => {
          setProgress(progress);
        });
        
        const originalSizeMB = selectedFile.size / 1024 / 1024;
        const compressedSizeMB = compressedFile.size / 1024 / 1024;
        const compressionRatio = (compressedSizeMB / originalSizeMB) * 100;
        
        setCompressionInfo({
          originalSize: originalSizeMB,
          compressedSize: compressedSizeMB,
          compressionRatio: compressionRatio
        });
        
        setFile(compressedFile);
        console.log(`Compressed: ${originalSizeMB.toFixed(2)}MB → ${compressedSizeMB.toFixed(2)}MB (${compressionRatio.toFixed(1)}%)`);
      } else {
        // File is small enough, use as-is
        setFile(selectedFile);
        console.log('File size is acceptable, no compression needed');
      }
      
      setStep('confirm');
      
    } catch (error) {
      console.error('File processing error:', error);
      setError(`File processing failed: ${error.message}`);
      setFile(null);
      setOriginalFile(null);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Enhanced drop handler with compression (Option 2)
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const droppedFile = e.dataTransfer.files[0];
    if (!droppedFile || droppedFile.type !== 'application/pdf') {
      setError("Please drop a valid PDF file.");
      setFile(null);
      setOriginalFile(null);
      return;
    }

    // Use the same logic as handleFileChange
    const event = { target: { files: [droppedFile] } };
    await handleFileChange(event);
  };

  // Enhanced text extraction using our utilities
  const extractTextClientSide = async (file) => {
    try {
      console.log('Extracting text with enhanced processing...');
      
      const text = await PDFUtils.extractTextAdvanced(file, (progress) => {
        setProgress(progress * 0.7); // Use 70% of progress bar for extraction
      });
      
      if (!text || text.trim().length === 0) {
        throw new Error('No text found in PDF. This might be a scanned document or contain only images.');
      }
      
      console.log('Enhanced extraction completed. Text length:', text.length);
      return text;
      
    } catch (error) {
      console.error('Enhanced extraction failed:', error);
      throw error;
    }
  };

  const handleConfirmUpload = () => {
    setStep('processing');
    handleUpload();
  };

  const handleCancelUpload = () => {
    setFile(null);
    setOriginalFile(null);
    setCompressionInfo(null);
    setStep('upload');
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';
  };

  const simulateProgress = () => {
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + Math.random() * 10;
      });
    }, 1000);
    return interval;
  };

  // Updated upload handler that uses enhanced extraction
  const handleUpload = async () => {
    if (!file) {
      setError("Please select a PDF file first.");
      return;
    }

    setLoading(true);
    setError("");
    setResponse("");
    
    const progressInterval = simulateProgress();
    
    try {
      // Extract text using enhanced method
      const extractedText = await extractTextClientSide(file);
      
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No text found in PDF. This might be a scanned document or contain only images.');
      }
      
      // Update progress
      setProgress(75);
      
      // Send only the text to the server
      const res = await axios.post('/api/process-text', {
        text: extractedText,
        apiKey: apiKey,
        filename: originalFile ? originalFile.name : file.name
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      });
      
      clearInterval(progressInterval);
      setProgress(100);
      setResponse(res.data.result);
      setStep('results');
      
    } catch (err) {
      clearInterval(progressInterval);
      setProgress(0);
      
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError(`Processing failed: ${err.message || "Please try again."}`);
      }
      setStep('upload'); // Go back to upload step on error
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!response) return;

    const blob = new Blob([response], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `course-evaluation-summary-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setFile(null);
    setOriginalFile(null);
    setCompressionInfo(null);
    setResponse("");
    setError("");
    setProgress(0);
    setStep('upload');
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = '';
  };

  const handleNewApiKey = () => {
    setStep('api-key');
    setApiKey('');
    setApiKeyValid(false);
    setFile(null);
    setOriginalFile(null);
    setCompressionInfo(null);
    setResponse('');
    setError('');
    setProgress(0);
  };

  // API Key Step
  if (step === 'api-key') {
    return (
      <div className="app">
        <div className="container">
          <header className="header">
            <div className="header-content">
              <h1 className="title">Course Evaluation Summarizer</h1>
              <p className="subtitle">
                Transform your course evaluations into constructive insights with AI
              </p>
              <div className="powered-by">
                <span>Powered by</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="anthropic-logo">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor"/>
                  <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
                <span>Anthropic Claude</span>
              </div>
            </div>
          </header>

          <main className="main">
            <div className="api-key-section">
              <div className="api-key-card">
                <div className="api-key-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <circle cx="12" cy="16" r="1"/>
                    <path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                </div>
                
                <h2 className="api-key-title">Enter Your Anthropic API Key</h2>
                <p className="api-key-description">
                  You'll need your own Anthropic API key to use this service. Your key is processed securely and never stored.
                </p>
                
                <div className="api-key-input-container">
                  <input
                    type="password"
                    placeholder="sk-ant-..."
                    value={apiKey}
                    onChange={handleApiKeyChange}
                    className={`api-key-input ${apiKeyValid ? 'valid' : ''}`}
                  />
                  {apiKeyValid && (
                    <div className="api-key-valid-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 12l2 2 4-4"/>
                        <circle cx="12" cy="12" r="10"/>
                      </svg>
                    </div>
                  )}
                </div>

                <div className="api-key-help">
                  <p>Don't have an API key?</p>
                  <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="api-key-link">
                    Get one from Anthropic Console
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                      <path d="M15 3h6v6"/>
                      <path d="M10 14L21 3"/>
                    </svg>
                  </a>
                </div>

                {error && (
                  <div className="error-message">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="15" y1="9" x2="9" y2="15"/>
                      <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    {error}
                  </div>
                )}

                <button
                  onClick={handleApiKeySubmit}
                  disabled={!apiKeyValid || loading}
                  className="btn btn-primary"
                >
                  {loading ? (
                    <>
                      <div className="spinner"></div>
                      Validating...
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 12l2 2 4-4"/>
                        <circle cx="12" cy="12" r="10"/>
                      </svg>
                      Continue
                    </>
                  )}
                </button>
              </div>
            </div>
          </main>

          <footer className="footer">
            <p>Built with care for educators everywhere • Powered by Anthropic Claude</p>
          </footer>
        </div>
      </div>
    );
  }

  // Upload Step
  if (step === 'upload') {
    return (
      <div className="app">
        <div className="container">
          <header className="header">
            <div className="header-content">
              <h1 className="title">Course Evaluation Summarizer</h1>
              <p className="subtitle">
                Transform your course evaluations into constructive insights with AI
              </p>
              <div className="api-key-status">
                <span className="api-key-indicator">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 12l2 2 4-4"/>
                    <circle cx="12" cy="12" r="10"/>
                  </svg>
                  API Key Connected
                </span>
                <button onClick={handleNewApiKey} className="btn-link">
                  Change Key
                </button>
              </div>
            </div>
          </header>

          <main className="main">
            <div className="upload-section">
              <div 
                className="upload-card"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <div className="upload-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                  </svg>
                </div>
                
                <h2 className="upload-title">Upload Your PDF</h2>
                <p className="upload-description">
                  Select or drag and drop a PDF file containing course evaluations
                  <br />
                  <small style={{ color: '#718096' }}>
                    Large files will be automatically compressed for optimal processing
                  </small>
                </p>
                
                {loading && (
                  <div className="progress-container">
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                    <p className="progress-text">
                      {progress < 30 ? "Analyzing PDF..." : 
                       progress < 70 ? "Compressing file..." : 
                       "Finalizing..."}
                    </p>
                  </div>
                )}
                
                <div className="file-input-container">
                  <input
                    id="file-input"
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="file-input"
                    disabled={loading}
                  />
                  <label htmlFor="file-input" className="file-input-label">
                    {loading ? (
                      <span>
                        <div className="spinner" style={{ width: '16px', height: '16px', display: 'inline-block', marginRight: '8px' }}></div>
                        Processing...
                      </span>
                    ) : (
                      <span>Choose PDF file or drag here</span>
                    )}
                  </label>
                </div>

                {error && (
                  <div className="error-message">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="15" y1="9" x2="9" y2="15"/>
                      <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    {error}
                  </div>
                )}
              </div>
            </div>
          </main>

          <footer className="footer">
            <p>Built with care for educators everywhere • Powered by Anthropic Claude</p>
          </footer>
        </div>
      </div>
    );
  }

  // Confirmation Step - Enhanced with compression info
  if (step === 'confirm') {
    return (
      <div className="app">
        <div className="container">
          <header className="header">
            <div className="header-content">
              <h1 className="title">Course Evaluation Summarizer</h1>
              <p className="subtitle">
                Transform your course evaluations into constructive insights with AI
              </p>
              <div className="api-key-status">
                <span className="api-key-indicator">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 12l2 2 4-4"/>
                    <circle cx="12" cy="12" r="10"/>
                  </svg>
                  API Key Connected
                </span>
                <button onClick={handleNewApiKey} className="btn-link">
                  Change Key
                </button>
              </div>
            </div>
          </header>

          <main className="main">
            <div className="upload-section">
              <div className="upload-card">
                <div className="upload-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 12l2 2 4-4"/>
                    <circle cx="12" cy="12" r="10"/>
                  </svg>
                </div>
                
                <h2 className="upload-title">Confirm Upload</h2>
                <p className="upload-description">
                  Ready to analyze your course evaluation PDF
                </p>
                
                <div className="file-selected" style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
                  </svg>
                  <strong>{originalFile ? originalFile.name : file?.name}</strong>
                </div>

                <div style={{ marginBottom: '1rem', color: '#718096' }}>
                  {compressionInfo ? (
                    <div>
                      <p><strong>Original size:</strong> {compressionInfo.originalSize.toFixed(2)} MB</p>
                      <p><strong>Compressed size:</strong> {compressionInfo.compressedSize.toFixed(2)} MB</p>
                      <p><strong>Compression ratio:</strong> {compressionInfo.compressionRatio.toFixed(1)}% of original</p>
                      <p style={{ color: '#48bb78', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                        ✓ File compressed successfully for optimal processing
                      </p>
                    </div>
                  ) : (
                    <p>File size: {file ? (file.size / 1024 / 1024).toFixed(2) : 0} MB</p>
                  )}
                </div>

                <div style={{ marginBottom: '2rem', color: '#718096' }}>
                  <p>Text will be extracted and analyzed using AI to provide constructive feedback.</p>
                </div>

                <div className="button-group">
                  <button
                    onClick={handleConfirmUpload}
                    className="btn btn-primary"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 1v6m0 0l4-4m-4 4L8 3"/>
                      <path d="M8 5H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
                    </svg>
                    Analyze Evaluations
                  </button>
                  
                  <button
                    onClick={handleCancelUpload}
                    className="btn btn-secondary"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                    Choose Different File
                  </button>
                </div>
              </div>
            </div>
          </main>

          <footer className="footer">
            <p>Built with care for educators everywhere • Powered by Anthropic Claude</p>
          </footer>
        </div>
      </div>
    );
  }

  // Processing Step
  if (step === 'processing') {
    return (
      <div className="app">
        <div className="container">
          <header className="header">
            <div className="header-content">
              <h1 className="title">Course Evaluation Summarizer</h1>
              <p className="subtitle">
                Processing your course evaluations...
              </p>
            </div>
          </header>

          <main className="main">
            <div className="upload-section">
              <div className="upload-card">
                <div className="upload-icon">
                  <div className="spinner" style={{ width: '48px', height: '48px', borderWidth: '4px' }}></div>
                </div>
                
                <h2 className="upload-title">Analyzing Your PDF</h2>
                <p className="upload-description">
                  Please wait while we process your course evaluations
                </p>

                {loading && (
                  <div className="progress-container">
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                    <p className="progress-text">
                      {progress < 30 ? "Extracting text from PDF..." : 
                       progress < 70 ? "Analyzing with AI..." : 
                       "Generating summary..."}
                    </p>
                  </div>
                )}

                {error && (
                  <div className="error-message">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="15" y1="9" x2="9" y2="15"/>
                      <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    {error}
                  </div>
                )}

                {error && (
                  <div className="button-group">
                    <button
                      onClick={handleReset}
                      className="btn btn-secondary"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8"/>
                        <path d="M21 3v5h-5"/>
                        <path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16"/>
                        <path d="M3 21v-5h5"/>
                      </svg>
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            </div>
          </main>

          <footer className="footer">
            <p>Built with care for educators everywhere • Powered by Anthropic Claude</p>
          </footer>
        </div>
      </div>
    );
  }

  // Results Step
  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <div className="header-content">
            <h1 className="title">Course Evaluation Summarizer</h1>
            <p className="subtitle">
              Transform your course evaluations into constructive insights with AI
            </p>
            <div className="api-key-status">
              <span className="api-key-indicator">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4"/>
                  <circle cx="12" cy="12" r="10"/>
                </svg>
                Analysis Complete
              </span>
              <button onClick={handleNewApiKey} className="btn-link">
                Change Key
              </button>
            </div>
          </div>
        </header>

        <main className="main">
          {response && (
            <div className="results-section">
              <div className="results-card">
                <div className="results-header">
                  <h3 className="results-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 12l2 2 4-4"/>
                      <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z"/>
                    </svg>
                    Analysis Complete
                  </h3>
                  <div className="button-group">
                    <button
                      onClick={handleDownload}
                      className="btn btn-download"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                        <path d="M7 10l5 5 5-5"/>
                        <path d="M12 15V3"/>
                      </svg>
                      Download Summary
                    </button>
                    <button
                      onClick={handleReset}
                      className="btn btn-secondary"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8"/>
                        <path d="M21 3v5h-5"/>
                        <path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16"/>
                        <path d="M3 21v-5h5"/>
                      </svg>
                      Analyze Another PDF
                    </button>
                  </div>
                </div>
                
                <div className="results-content">
                  <div className="results-text">{response}</div>
                </div>
              </div>
            </div>
          )}
        </main>

        <footer className="footer">
          <p>Built with care for educators everywhere • Powered by Anthropic Claude</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
