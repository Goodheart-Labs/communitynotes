#!/bin/bash

# Community Notes Runner Script
# Run from project root without needing to cd

# Default values
MAX_POSTS=5
DRY_RUN="--dry-run"
RESEARCH_MODE="enhanced"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --posts)
      MAX_POSTS="$2"
      shift 2
      ;;
    --live)
      DRY_RUN=""
      shift
      ;;
    --research-mode)
      RESEARCH_MODE="$2"
      shift 2
      ;;
    --help)
      echo "Usage: ./run-notes.sh [options]"
      echo "Options:"
      echo "  --posts <number>     Number of posts to process (default: 5)"
      echo "  --live               Run in live mode (actually submit notes)"
      echo "  --research-mode      Research mode: 'grok' or 'enhanced' (default: enhanced)"
      echo "  --help               Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Run the TypeScript version
echo "Running Community Notes bot..."
echo "Processing $MAX_POSTS posts in $RESEARCH_MODE mode"
if [ -z "$DRY_RUN" ]; then
  echo "⚠️  LIVE MODE - Notes will be submitted!"
else
  echo "Dry run mode - no notes will be submitted"
fi
echo ""

cd community-notes-ts && bun run dev --max-posts "$MAX_POSTS" $DRY_RUN --research-mode "$RESEARCH_MODE"