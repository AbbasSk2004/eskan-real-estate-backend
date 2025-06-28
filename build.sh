#!/usr/bin/env bash
# exit on error
set -o errexit

# Install Python and pip if not already installed
if ! command -v python3 &> /dev/null; then
    echo "Installing Python..."
    apt-get update
    apt-get install -y python3 python3-pip
fi

# Install Python dependencies
echo "Installing Python dependencies..."
pip3 install -r requirements.txt

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
npm install

# Build the application
echo "Building the application..."
npm run build --if-present