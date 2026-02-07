#!/bin/bash

# iOS XCode Deploy Script - Forces fresh build for Capacitor
# Run this after making changes to update the XCode build

set -e

echo "Starting iOS XCode deployment..."

# Clear all caches
echo "Clearing caches..."
rm -rf node_modules/.vite
rm -rf dist
rm -rf .vite

# Build fresh production version
echo "Building fresh production version..."
npm run build

# Sync with Capacitor (copies dist to iOS project)
echo "Syncing with Capacitor..."
npx cap sync ios

echo ""
echo "Build complete!"
echo ""
echo "Next steps:"
echo "   1. Open XCode: npx cap open ios"
echo "   2. Clean build folder: Product > Clean Build Folder (Cmd+Shift+K)"
echo "   3. Build and run on your device (Cmd+R)"
echo ""
echo "If changes still don't appear in XCode:"
echo "   - Delete the app from your phone completely"
echo "   - Clean build folder in XCode"
echo "   - Rebuild and reinstall"
echo ""
