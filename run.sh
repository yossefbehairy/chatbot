#!/bin/bash
cd "$(dirname "$0")"

# Install dependencies if node_modules missing
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Run bot (suppress deprecation warnings)
exec node --no-deprecation bot.js
