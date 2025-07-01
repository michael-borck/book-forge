#!/bin/bash

echo "Starting BookForge in development mode..."

# Start Next.js in the background
cd src/renderer && npm run dev &
NEXT_PID=$!

# Wait for Next.js to be ready
echo "Waiting for Next.js to start..."
sleep 5

# Start Electron with sandbox disabled
cd ../..
NODE_ENV=development npx electron ./src/main/index.ts --no-sandbox --disable-gpu-sandbox

# Kill Next.js when Electron exits
kill $NEXT_PID