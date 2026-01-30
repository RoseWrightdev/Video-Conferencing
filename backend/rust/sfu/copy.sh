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
    BEGIN { in_tests = 0; depth = 0; buffer = ""; looking_for_brace = 0 }
    
    # If we'"'"'re already inside a test block, handle brace counting
    in_tests {
        n_open = gsub(/\{/, "{")
        depth += n_open
        n_close = gsub(/\}/, "}")
        depth -= n_close
        
        if (depth <= 0) {
            in_tests = 0
            depth = 0
        }
        next
    }

    # Check for #[cfg(test)] on its own line. 
    # Using [ \t] instead of \s for better compatibility.
    /^[ \t]*#\[cfg\(test\)\][ \t]*$/ {
        buffer = $0
        next
    }

    # Check for #[tokio::test].
    # This marks the start of a function we want to delete.
    /^[ \t]*#\[tokio::test(\(.*\))?\][ \t]*$/ {
        in_tests = 1
        depth = 0
        # Wait for the opening brace of the function to start counting
        looking_for_brace = 1
        next
    }
    
    # If we are looking for the start of the block (after tokio::test)
    looking_for_brace {
        # Check if this line has the opening brace
        if ($0 ~ /\{/) {
             looking_for_brace = 0
             # Count braces in this line
             temp_line = $0
             n_open = gsub(/\{/, "{", temp_line)
             depth += n_open
             n_close = gsub(/\}/, "}", temp_line)
             depth -= n_close
             
             if (depth <= 0) {
                 in_tests = 0
                 depth = 0
             }
        }
        # Swallow the line
        next
    }

    # Check for start of mod tests
    # Matches: "mod tests {" or "#[cfg(test)] mod tests {"
    /^[ \t]*(#\[cfg\(test\)\][ \t]*)?mod[ \t]+tests[ \t]*\{/ {
        in_tests = 1
        depth = 0
        
        # Count braces in this starting line to initialize depth
        # We work on a copy to avoid messing up if we needed to print (we don'"'"'t here)
        temp_line = $0
        n_open = gsub(/\{/, "{", temp_line)
        depth += n_open
        n_close = gsub(/\}/, "}", temp_line)
        depth -= n_close
        
        if (depth <= 0) {
            in_tests = 0
            depth = 0
        }
        
        # Clear buffer (discard any preceding #[cfg(test)])
        buffer = ""
        next
    }
    
    # If we have a buffered line that wasn'"'"'t consumed by mod tests, print it now
    buffer != "" {
        print buffer
        buffer = ""
    }

    # Print the current line (if we'"'"'re not in tests)
    { print }
    ' "$file" >> "$OUTPUT"
    echo -e "\n\n" >> "$OUTPUT"
done

echo "Success! Combined files written to '$OUTPUT'"
