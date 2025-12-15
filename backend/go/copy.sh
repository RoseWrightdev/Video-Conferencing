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

# 2. Combine all Go files (excluding tests and comments) into one file
> "$OUTPUT"  # Clear/create output file
find "$SRC" -maxdepth 1 -name "*.go" ! -name "*_test.go" -print0 | sort -z | while IFS= read -r -d '' file; do
    echo "// File: $file" >> "$OUTPUT"
    # Exclude comments by filtering out lines starting with // or /*
    grep -v '^\s*//' "$file" | grep -v '^\s*/\*' | grep -v '\*/' >> "$OUTPUT"
    echo "" >> "$OUTPUT"
done

echo "Success! Combined files written to '$OUTPUT'"
