#!/bin/bash

#!/bin/bash
# Usage: ./copy-frontend.sh <output_file> <src_dir1> [<src_dir2> ...]
# Example: ./copy-frontend.sh temp/all-frontend-code.ts app lib hooks

OUTPUT="${1}"
shift
SRC_DIRS=("$@")

# Ensure output directory exists
mkdir -p "$(dirname "$OUTPUT")"


# Find all .ts, .tsx, .js, .jsx files in all source dirs (exclude test files and storybook)

# Exclude components/ui explicitly
FILES=$(find "${SRC_DIRS[@]}" -type f \
  \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) \
  ! -name "*.test.*" ! -name "*.spec.*" ! -name "*.stories.*" ! -path "*/__tests__/*" \
  ! -path "*/components/ui/*" \
  | sort)

> "$OUTPUT"  # Clear output file

for file in $FILES; do
  echo "// --- FILE: $file ---" >> "$OUTPUT"
  # Remove single-line and multi-line comments, blank lines
  sed -E '/^\s*\/\//d; /\/\*/,/\*\//d; /^\s*$/d' "$file" >> "$OUTPUT"
  echo "" >> "$OUTPUT"
done
