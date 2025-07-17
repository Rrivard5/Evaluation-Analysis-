#!/bin/bash

# Course Evaluation Summarizer Deployment Script
# This script helps deploy the application to Vercel

echo "🚀 Course Evaluation Summarizer Deployment"
echo "=========================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Are you in the project root?"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "📦 Installing Vercel CLI..."
    npm install -g vercel
fi

echo "ℹ️  Note: This app now uses user-provided API keys!"
echo "   No environment variables needed for deployment."
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building the project..."
npm run build

# Deploy to Vercel
echo "🚀 Deploying to Vercel..."
vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🎉 Your Course Evaluation Summarizer is ready!"
echo ""
echo "📋 How it works:"
echo "1. Users visit your deployed app"
echo "2. They enter their own Anthropic API key"
echo "3. They upload course evaluation PDFs"
echo "4. The app processes evaluations using their key"
echo ""
echo "🔐 Security benefits:"
echo "• No shared API keys"
echo "• Users control their own costs"
echo "• No server-side key management"
echo "• Enhanced privacy and security"
