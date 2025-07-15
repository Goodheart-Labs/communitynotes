# Community Notes Writer (TypeScript)

A TypeScript implementation of an automated Community Notes writer for X (Twitter) with an enhanced research pipeline using Perplexity search and Claude analysis.

## Features

- 🔍 **Enhanced Research Pipeline**: Uses Perplexity for web search and Claude for analysis
- 🎯 **Context-Focused**: Identifies missing context rather than just flagging misleading content
- 🏛️ **Trusted Sources**: Prioritizes sources that would be trusted across the political spectrum
- 🖼️ **Image Analysis**: Can analyze images in posts (when supported by the API)
- 🚀 **Built with Bun**: Fast, modern TypeScript runtime
- 🔒 **Type-Safe**: Full TypeScript with Zod schema validation

## Prerequisites

- [Bun](https://bun.sh/) installed
- X Developer account with API access
- OpenRouter account for AI services

## Setup

1. Clone the repository and navigate to the TypeScript implementation:
```bash
cd community-notes-ts
```

2. Install dependencies:
```bash
bun install
```

3. Copy the environment template and add your API keys:
```bash
cp .env.example .env
# Edit .env with your actual API keys
```

4. Configure your API keys in `.env`:
- Get X API credentials from https://developer.twitter.com/
- Get OpenRouter API key from https://openrouter.ai/keys

## Usage

### Dry Run (Recommended for testing)
```bash
bun run dry-run
```

### Run with custom parameters
```bash
# Process only 5 posts in dry-run mode
bun run src/index.ts --dry-run --max-posts 5

# Run in live mode (actually submits notes)
bun run src/index.ts --max-posts 10

# Process posts in parallel
bun run src/index.ts --dry-run --concurrency 3
```

### Available Options
- `--dry-run`: Don't actually submit notes, just print what would be submitted
- `--max-posts <number>`: Maximum number of posts to process (default: 10)
- `--concurrency <number>`: Number of posts to process in parallel (default: 1)
- `--research-mode <mode>`: Research mode to use (default: 'enhanced')

## How It Works

1. **Fetch Eligible Posts**: Gets posts from X that are eligible for Community Notes
2. **Image Analysis**: Describes any images in the post using AI
3. **Research Phase**: 
   - Generates search queries based on post content
   - Uses Perplexity to find relevant information and sources
4. **Context Analysis**:
   - Claude identifies missing context that would help readers
   - Evaluates source trustworthiness
5. **Source Verification**:
   - Fetches content from trusted sources
   - Verifies the context is actually addressed
6. **Note Generation**:
   - Creates concise notes focusing on missing context
   - Includes trusted source URL
7. **Submission**: Posts the note to X (unless in dry-run mode)

## Architecture

```
src/
├── types/          # TypeScript type definitions
├── lib/            # Core libraries (X API, OpenRouter clients)
├── services/       # Business logic (research, note writing)
└── index.ts        # CLI entry point
```

## Development

### Type Checking
```bash
bun run check
```

### Run Tests
```bash
bun test
```

## Notes

- The bot starts in "test mode" where notes are evaluated but not shown to users
- Notes must be under 280 characters and include at least one source URL
- Focus is on missing context rather than declaring posts as "misleading"
- Sources are chosen for cross-partisan trustworthiness

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT