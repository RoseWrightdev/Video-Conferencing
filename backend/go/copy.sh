#!/bin/bash

# Usage: ./copy.sh <source_folder> <output_file>

SRC="${1}"
OUTPUT="${2}"

# 1. Validation
if [ -z "$SRC" ] || [ -z "$OUTPUT" ]; then
    echo "Usage: ./copy.sh <source_folder> <output_file>"
    echo "Example: ./copy.sh internal/bus combined.go"
    exit 1
fi

if [ ! -d "$SRC" ]; then
    echo "Error: Source directory '$SRC' does not exist."
    exit 1
fi

echo "Combining files from '$SRC' into '$OUTPUT'..."

# 2. Combine all Go files (excluding tests and generated code) into one file
> "$OUTPUT"  # Clear/create output file

# Use find to recursively look for .go files
# Exclude:
# - *_test.go files
# - directories named 'gen'
# - directories named 'vendor'
find "$SRC" \
    -type d \( -name "gen" -o -name "vendor" \) -prune -o \
    -type f -name "*.go" -not -name "*_test.go" -print0 | \
    sort -z | while IFS= read -r -d '' file; do
    
    echo "--------------------------------------------------------------------------------" >> "$OUTPUT"
    echo "FILE: $file" >> "$OUTPUT"
    echo "--------------------------------------------------------------------------------" >> "$OUTPUT"
    cat "$file" >> "$OUTPUT"
    echo -e "\n\n" >> "$OUTPUT"
done

echo "Success! Combined files written to '$OUTPUT'"
