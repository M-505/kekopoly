#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.
# set -x # Uncomment for verbose debugging output

# Function to kill background processes on exit
cleanup() {
    echo "Stopping servers..."
    # Kill backend server if PID exists
    if [ -n "$BACKEND_PID" ]; then
        echo "Killing backend process $BACKEND_PID"
        # Use kill and ignore error if process already stopped
        kill $BACKEND_PID 2>/dev/null || true
    fi
    # npm run dev usually handles its own cleanup with Ctrl+C
    echo "Cleanup complete."
}

# Trap SIGINT (Ctrl+C) and EXIT signals to run the cleanup function
trap cleanup SIGINT EXIT

# --- Backend ---
echo "--- Building and starting backend ---"
cd kekopoly-backend || { echo "Failed to cd into kekopoly-backend"; exit 1; }

# Kill any existing backend server process (ignore errors if none exists)
echo "Attempting to kill existing backend server..."
# Use pkill with '-f' to match the full command path, ensuring we kill the right process
pkill -f './kekopoly-server' || echo "No running backend server found or pkill failed."
sleep 1 # Give a moment for the process to terminate if it was running

# Build the backend
echo "Building backend..."
cd cmd/server
go build -o ../../kekopoly-server main.go
cd ../..
echo "Backend built successfully."

# Run the backend server in the background
echo "Starting backend server..."
./kekopoly-server &
BACKEND_PID=$! # Store the PID of the last background process
echo "Backend server started with PID: $BACKEND_PID"
cd .. # Go back to the root directory
echo "--- Backend started ---"

# Wait a few seconds for the backend to initialize fully
echo "Waiting for backend (5s)..."
sleep 5

# --- Frontend ---
echo "--- Starting frontend ---"
cd kekopoly-frontend || { echo "Failed to cd into kekopoly-frontend"; exit 1; }

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo "Node modules not found. Running npm install..."
  npm install
  echo "NPM install complete."
fi

# Start the frontend dev server (this will run in the foreground)
echo "Starting frontend development server (Press Ctrl+C to stop)..."
npm run dev

# Script waits here until npm run dev is stopped (e.g., by Ctrl+C)
# The trap will handle cleanup.

echo "Frontend server stopped. Exiting script."

