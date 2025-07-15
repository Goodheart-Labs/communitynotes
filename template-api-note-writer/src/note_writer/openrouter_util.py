import os
from typing import Dict, List, Optional

import dotenv
import requests


def _make_openrouter_request(payload: dict) -> str:
    """
    Make a request to OpenRouter API.
    Similar to existing _make_request but for OpenRouter.
    """
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {os.getenv('OPENROUTER_API_KEY')}",
        "HTTP-Referer": os.getenv("OPENROUTER_REFERER", "https://github.com/nathanpmyoung/communitynotes"),
        "X-Title": "Community Notes Writer"
    }
    
    response = requests.post(url, headers=headers, json=payload)
    if response.status_code != 200:
        raise Exception(f"Error making OpenRouter request: {response.status_code} {response.text}")
    
    return response.json()["choices"][0]["message"]["content"]


def perplexity_search(query: str, temperature: float = 0.0) -> str:
    """
    Use Perplexity via OpenRouter to search for information.
    Returns search results with sources.
    """
    payload = {
        "model": "perplexity/llama-3.1-sonar-large-128k-online",
        "messages": [
            {
                "role": "system",
                "content": "You are a research assistant. Always include specific URLs for your sources directly in the text."
            },
            {
                "role": "user",
                "content": query
            }
        ],
        "temperature": temperature,
    }
    
    return _make_openrouter_request(payload)


def claude_analyze(prompt: str, temperature: float = 0.0) -> str:
    """
    Use Claude Sonnet via OpenRouter for analysis tasks.
    """
    payload = {
        "model": "anthropic/claude-3.5-sonnet",
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": temperature,
    }
    
    return _make_openrouter_request(payload)


def identify_missing_context(post_text: str, images_summary: str, search_results: str) -> str:
    """
    Use Claude to identify missing context from a post.
    Returns the most important missing context or "NO MISSING CONTEXT".
    """
    prompt = f"""Given this X post and search results about it, identify the most important pieces of context that are missing from the post that would help readers understand the full picture.

Focus only on factual context that materially changes the interpretation of the post. Do not flag opinions, predictions, or minor details.

If no important context is missing, respond with exactly: "NO MISSING CONTEXT"

If important context is missing, list the 1-3 most critical missing pieces in order of importance. Be specific and concise.

Post text:
```
{post_text}
```

Images in post:
```
{images_summary if images_summary else "No images"}
```

Search results:
```
{search_results}
```
"""
    
    return claude_analyze(prompt)


def evaluate_source_trustworthiness(sources_text: str) -> str:
    """
    Use Claude to evaluate which sources would be most trusted across political spectrum.
    Returns ranked sources with trust analysis.
    """
    prompt = f"""Evaluate these sources and rank them by how likely they are to be trusted by a broad, politically diverse audience.

Consider:
- Domain reputation and credibility
- Primary vs secondary sources  
- Institutional vs partisan sources
- Track record for accuracy
- Cross-partisan acceptance

For each source, provide:
1. The URL
2. Trust score (0-100)
3. Brief reason for the score

Rank them from most to least trusted.

Sources to evaluate:
```
{sources_text}
```

Format your response as a numbered list with each entry containing the URL, score, and reason.
"""
    
    return claude_analyze(prompt)


def extract_urls_from_text(text: str) -> List[str]:
    """
    Extract URLs from text using a simple regex pattern.
    """
    import re
    
    # Match URLs starting with http:// or https://
    url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+[^\s<>"{}|\\^`\[\].,;:!?\'")\]]'
    urls = re.findall(url_pattern, text)
    
    # Remove duplicates while preserving order
    seen = set()
    unique_urls = []
    for url in urls:
        if url not in seen:
            seen.add(url)
            unique_urls.append(url)
    
    return unique_urls


def fetch_webpage_content(url: str, timeout: int = 10) -> Optional[str]:
    """
    Fetch and extract text content from a webpage.
    Returns None if fetch fails.
    """
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (compatible; CommunityNotesBot/1.0)'
        }
        response = requests.get(url, headers=headers, timeout=timeout)
        response.raise_for_status()
        
        # Basic text extraction - in production you'd want to use BeautifulSoup or similar
        # For now, just return raw HTML and let Claude handle it
        return response.text[:50000]  # Limit to first 50k chars to avoid token limits
        
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None


def find_context_in_source(source_content: str, source_url: str, missing_context: str) -> str:
    """
    Use Claude to find specific quotes/sections in a source that address the missing context.
    """
    prompt = f"""Given this source content and a piece of missing context, find the specific quotes or sections that provide this context.

Missing context needed:
```
{missing_context}
```

Source URL: {source_url}

Source content:
```
{source_content[:30000]}  # Limit to avoid token issues
```

If this source contains information addressing the missing context, provide:
1. The most relevant quote(s) or section(s) from the source
2. A brief explanation of how it addresses the missing context

If this source does not adequately address the missing context, respond with: "SOURCE DOES NOT ADDRESS CONTEXT"

Keep quotes concise but complete enough to be meaningful.
"""
    
    return claude_analyze(prompt)


if __name__ == "__main__":
    # Test the functions
    dotenv.load_dotenv()
    
    # Test Perplexity search
    print("Testing Perplexity search...")
    results = perplexity_search("What are the latest COVID-19 vaccine recommendations from the CDC?")
    print(results)
    print("\n" + "="*50 + "\n")
    
    # Test Claude analysis
    print("Testing Claude analysis...")
    analysis = claude_analyze("What is 2+2? Please be very brief.")
    print(analysis)