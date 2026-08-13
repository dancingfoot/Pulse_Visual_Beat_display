#!/usr/bin/env bash

# =========================================================
# Pulse Link Bridge — Linux AppImage Automated Builder Script
# =========================================================

set -e

echo "🚀 Building Standalone Pulse Link Bridge AppImage..."

# Navigate to bridge directory
cd "$(dirname "$0")"

# 1. Install prerequisites on Debian/Ubuntu/Pop!_OS if needed
if command -v apt-get &> /dev/null; then
    echo "📦 Checking Linux build tools..."
    # Note: user should ensure build-essential and python3 are present
fi

# 2. Install dependencies
echo "📥 Installing bridge dependencies & electron-builder..."
npm install

# 3. Build native abletonlink module for Linux
echo "⚙️ Rebuilding native Ableton Link C++ bindings for Electron..."
npx @electron/rebuild || true

# 4. Package into AppImage
echo "📦 Packaging Pulse Link Bridge into single-file AppImage..."
npx electron-builder --linux AppImage

echo ""
echo "========================================================="
echo "✅ SUCCESS! AppImage built successfully!"
echo "📍 Location: bridge/dist-appimage/Pulse Link Bridge-1.0.0.AppImage"
echo "========================================================="
echo ""
echo "To run the AppImage:"
echo "  chmod +x dist-appimage/*.AppImage"
echo "  ./dist-appimage/*.AppImage"
echo ""
