#!/bin/bash

# Usage: ./copy_files.sh <source_folder> <destination_folder>

SRC="${1}"
DEST="${2}"

# 1. Validation
if [ -z "$SRC" ] || [ -z "$DEST" ]; then
    echo "Usage: ./copy_files.sh <source_folder> <destination_folder>"
    echo "Example: ./copy_files.sh internal/bus ./my_backup"
    exit 1
fi

if [ ! -d "$SRC" ]; then
    echo "Error: Source directory '$SRC' does not exist."
    exit 1
fi

# 2. Create Destination
mkdir -p "$DEST"

echo "Copying from '$SRC' to '$DEST'..."

# 3. The Magic Command (Find -> Copy)
# -maxdepth 1: Only look in the specific folder (don't go deeper into subfolders)
# -name "*.go": Find Go files
# ! -name "*_test.go": Ignore Test files
# -exec cp: Copy them
find "$SRC" -maxdepth 1 -name "*.go" ! -name "*_test.go" -exec cp {} "$DEST" \;

# 4. Verify
COUNT=$(ls -1 "$DEST"/*.go 2>/dev/null | wc -l)
echo "Success! Copied $COUNT files."