# Course Evaluation Summarizer

A modern web application that helps instructors analyze course evaluations by filtering out harsh comments and highlighting constructive feedback and positive remarks using Anthropic's Claude AI.

## Features

- **User-Provided API Keys**: Secure, user-controlled API key system - no shared keys needed
- **PDF Upload**: Upload course evaluation PDFs directly with drag-and-drop support
- **AI-Powered Analysis**: Uses Anthropic Claude 4 Sonnet to process and categorize feedback
- **Constructive Filtering**: Removes mean or unhelpful comments while preserving actionable feedback
- **Frequency Analysis**: Shows how often specific suggestions appear
- **Positive Highlights**: Extracts uplifting comments verbatim
- **Progress Tracking**: Visual progress indicator during processing
- **Download Results**: Export summaries as text files
- **Responsive Design**: Works perfectly on mobile, tablet, and desktop

## Technology Stack

- **Frontend**: React 18, Modern CSS3, Responsive Design
- **Backend**: Node.js, Vercel Serverless Functions (ES Modules)
- **AI**: Anthropic Claude 4 Sonnet
- **PDF Processing**: pdf-parse library
- **File Upload**: formidable for multipart handling
- **Hosting**: Vercel (free tier compatible)

## Deployment on Vercel

### Prerequisites
- Node.js 18+ installed
- Vercel account
- Users will need their own Anthropic API key (get one at https://console.anthropic.com/)

### Setup Instructions

1. **Clone and Install**
   ```bash
   git clone <your-repo-url>
   cd course-evaluation-summarizer
   npm install
   ```

2. **No Environment Variables Needed**
   This application now uses user-provided API keys, so no server-side environment variables are required for the API key.

3. **Deploy to Vercel**
   ```bash
   npm install -g vercel
   vercel
   ```

4. **No Additional Configuration Required**
   The app is ready to use once deployed - users enter their own API keys in the interface.

### Local Development

```bash
npm start
```

The app will run at `http://localhost:3000`

## How It Works

1. **API Key Setup**: Users enter their own Anthropic API key, which is validated securely
2. **Upload**: Users upload a PDF containing course evaluations via drag-and-drop or file selector
3. **Extract**: The app extracts text content from the PDF using pdf-parse
4. **Process**: Anthropic Claude 4 analyzes the text using the user's API key to:
   - Filter out mean/unhelpful comments
   - Categorize constructive feedback by theme with frequency counts
   - Extract positive comments verbatim
   - Provide overall sentiment analysis
5. **Display**: Results are shown in a clean, readable format with proper typography
6. **Download**: Users can download the complete summary as a text file

## Security & Privacy

- **No Shared API Keys**: Each user provides their own Anthropic API key
- **No Key Storage**: API keys are never stored on the server
- **User Cost Control**: Users control their own API usage and costs
- **File Processing**: Files are processed and immediately deleted from the server
- **Enhanced Privacy**: No data persistence or tracking

## File Structure

```
course-evaluation-summarizer/
├── api/
│   ├── upload.js          # Main PDF processing endpoint (ES modules)
│   └── test-key.js        # API key validation endpoint (ES modules)
├── public/
│   ├── index.html         # HTML template
│   └── manifest.json      # PWA manifest
├── src/
│   ├── App.js             # Main React component with API key management
│   ├── App.css            # Styling and responsive design
│   └── index.js           # React entry point
├── package.json           # Dependencies and scripts (ES modules enabled)
├── vercel.json            # Vercel configuration
└── README.md              # This file
```

## API Configuration

The application uses Anthropic's Claude 4 Sonnet model with the following configuration:
- **Model**: `claude-sonnet-4-20250514`
- **Max Tokens**: 2000
- **Temperature**: 0.3 (for consistent, focused responses)
- **Timeout**: 30 seconds for processing
- **Enhanced Safety**: Includes Claude 4's new refusal handling for safety

## Features in Detail

### User-Provided API Keys
- **Secure Validation**: API keys are tested before use
- **No Server Storage**: Keys are only used for the current session
- **Cost Transparency**: Users see exactly what they're paying for
- **Easy Setup**: Simple interface for entering and validating keys

### AI Analysis
- **Constructive Filtering**: Removes purely negative comments without constructive value
- **Theme Categorization**: Groups similar feedback with frequency indicators
- **Positive Extraction**: Preserves uplifting comments exactly as written
- **Sentiment Analysis**: Provides overall evaluation tone assessment

### User Experience
- **Two-Step Process**: API key setup, then file upload
- **Progress Tracking**: Visual progress bar during processing
- **Error Handling**: Clear error messages for common issues
- **File Validation**: Ensures only PDF files are processed
- **Responsive Design**: Optimized for all device sizes
- **Accessibility**: Semantic HTML and proper contrast ratios

## Troubleshooting

### Common Issues

1. **"Valid Anthropic API key required"**
   - Ensure your API key starts with `sk-ant-` and is valid
   - Get a new key from https://console.anthropic.com/
   - Check that the key has sufficient credits

2. **"Failed to extract text from PDF"**
   - Ensure the PDF contains readable text (not just images)
   - Try a different PDF file to verify the issue

3. **"Request timed out"**
   - The PDF might be too large or complex
   - Try with a smaller file or fewer pages

4. **Build errors on Vercel**
   - Ensure `"type": "module"` is in package.json
   - Check that all API files use ES module syntax (`import`/`export`)

### Development Tips

- Use `npm start` for local development with hot reload
- Check browser console for detailed error messages
- Test with various PDF formats to ensure compatibility
- Monitor Vercel function logs for deployment issues

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the GNU General Public License v3.0 - see the LICENSE file for details.

## Support

For issues or questions:
- Check the troubleshooting section above
- Review Vercel function logs for deployment issues
- Ensure your Anthropic API key is valid and has sufficient credits
- Contact the maintainer through the GitHub repository

## Acknowledgments

- Built with [Anthropic Claude 4](https://www.anthropic.com/) for superior AI analysis
- Deployed on [Vercel](https://vercel.com/) for seamless hosting
- Uses [pdf-parse](https://www.npmjs.com/package/pdf-parse) for PDF text extraction
- Designed with educators in mind for better course improvement insights
- Enhanced security through user-provided API keys
