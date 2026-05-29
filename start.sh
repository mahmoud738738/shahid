#!/bin/bash
echo "Starting شاهد server..."
echo "Movies data: $(cat data/movies.json 2>/dev/null | grep -o '"title"' | wc -l) movies cached"
node server.js
