#!/bin/bash

# Usage: ./copy.sh <source_folder> <output_file>

SRC="${1}"
OUTPUT="${2}"

# 1. Validation
if [ -z "$SRC" ] || [ -z "$OUTPUT" ]; then
    echo "Usage: ./copy.sh <source_folder> <output_file>"
    echo "Example: ./copy.sh sfu/src combined.rs"
    exit 1
fi

if [ ! -d "$SRC" ]; then
    echo "Error: Source directory '$SRC' does not exist."
    exit 1
fi

echo "Combining files from '$SRC' into '$OUTPUT'..."

# 2. Combine all Rust files (excluding target and auxiliary folders) into one file
mkdir -p "$(dirname "$OUTPUT")"
> "$OUTPUT"  # Clear/create output file

# Use find to recursively look for .rs files
# Exclude:
# - directories named 'target'
# - directories named 'tests' (integration tests)
# - directories named 'benches' (benchmarks)
# - directories named 'examples'
find "$SRC" \
    -type d \( -name "target" -o -name "tests" -o -name "benches" -o -name "examples" \) -prune -o \
    -type f -name "*.rs" -print0 | \
    sort -z | while IFS= read -r -d '' file; do
    
    echo "--------------------------------------------------------------------------------" >> "$OUTPUT"
    echo "FILE: $file" >> "$OUTPUT"
    echo "--------------------------------------------------------------------------------" >> "$OUTPUT"
    awk '
    BEGIN { in_tests = 0; depth = 0 }
    !in_tests && /^\s*mod\s+tests\s*\{/ {
        in_tests = 1
        depth = 0
    }
    in_tests {
        # count {
        n_open = gsub(/\{/, "{")
        depth += n_open
        # count }
        n_close = gsub(/\}/, "}")
        depth -= n_close
        
        if (depth <= 0) {
            in_tests = 0
            depth = 0
        }
        next
    }
    { print }
    ' "$file" >> "$OUTPUT"
    echo -e "\n\n" >> "$OUTPUT"
done

echo "Success! Combined files written to '$OUTPUT'"
