import os
from typing import List, Optional, Tuple

from data_models import Post, NoteResult, ProposedMisleadingNote, MisleadingTag
from note_writer.openrouter_util import (
    perplexity_search,
    identify_missing_context,
    evaluate_source_trustworthiness,
    extract_urls_from_text,
    fetch_webpage_content,
    find_context_in_source,
    claude_analyze
)


def _get_search_query_for_post(post: Post, images_summary: str) -> str:
    """
    Generate a search query based on the post content for fact-checking.
    """
    prompt = f"""Based on this X post, generate a search query to fact-check its claims and find relevant context.

Post text:
```
{post.text}
```

Images summary:
```
{images_summary if images_summary else "No images"}
```

Generate a concise search query that will help find:
1. Facts related to the main claims
2. Official sources or primary documents
3. Recent developments or updates

Return only the search query, nothing else.
"""
    
    return claude_analyze(prompt, temperature=0.0)


def _format_note_with_context(missing_context: str, source_url: str) -> str:
    """
    Format the final Community Note with missing context and source.
    Must be under 280 characters.
    """
    # Try to create a concise note
    note = f"Missing context: {missing_context} {source_url}"
    
    # If too long, shorten the context description
    if len(note) > 280:
        # Calculate how much we need to shorten
        excess = len(note) - 280 + 3  # +3 for "..."
        shortened_context = missing_context[:len(missing_context) - excess] + "..."
        note = f"Missing context: {shortened_context} {source_url}"
    
    return note


def enhanced_research_and_write_note(
    post: Post,
    images_summary: str = ""
) -> NoteResult:
    """
    Enhanced research pipeline using Perplexity search and Claude analysis.
    """
    try:
        # Phase 1: Initial Research with Perplexity
        search_query = _get_search_query_for_post(post, images_summary)
        search_results = perplexity_search(
            f"Search for information about: {search_query}. "
            f"Focus on authoritative sources and recent information. "
            f"Include specific URLs with each piece of information."
        )
        
        # Phase 2: Identify Missing Context
        missing_context = identify_missing_context(
            post.text,
            images_summary,
            search_results
        )
        
        # Check if no context is missing
        if "NO MISSING CONTEXT" in missing_context:
            return NoteResult(
                post=post,
                refusal="NO NOTE NEEDED - No important missing context identified",
                images_summary=images_summary
            )
        
        # Phase 3: Extract and evaluate sources
        urls = extract_urls_from_text(search_results)
        if not urls:
            return NoteResult(
                post=post,
                refusal="NOT ENOUGH EVIDENCE TO WRITE A GOOD COMMUNITY NOTE - No sources found",
                images_summary=images_summary
            )
        
        # Create a formatted list of sources for trustworthiness evaluation
        sources_text = "\n".join([f"- {url}" for url in urls])
        trust_evaluation = evaluate_source_trustworthiness(sources_text)
        
        # Extract the most trusted source URL from the evaluation
        # This is a simple extraction - in production you'd parse more carefully
        lines = trust_evaluation.strip().split('\n')
        most_trusted_url = None
        for line in lines:
            if 'http' in line:
                # Extract URL from line
                for url in urls:
                    if url in line:
                        most_trusted_url = url
                        break
                if most_trusted_url:
                    break
        
        if not most_trusted_url:
            # Fallback to first URL if parsing fails
            most_trusted_url = urls[0]
        
        # Phase 4: Fetch content from most trusted source
        source_content = fetch_webpage_content(most_trusted_url)
        if not source_content:
            # Try next best source if available
            if len(urls) > 1:
                source_content = fetch_webpage_content(urls[1])
                most_trusted_url = urls[1]
        
        if not source_content:
            return NoteResult(
                post=post,
                refusal="NOT ENOUGH EVIDENCE TO WRITE A GOOD COMMUNITY NOTE - Could not fetch source content",
                images_summary=images_summary
            )
        
        # Phase 5: Find specific context in source
        context_verification = find_context_in_source(
            source_content,
            most_trusted_url,
            missing_context
        )
        
        if "SOURCE DOES NOT ADDRESS CONTEXT" in context_verification:
            # Try with other sources if available
            for url in urls[1:3]:  # Try up to 2 more sources
                source_content = fetch_webpage_content(url)
                if source_content:
                    context_verification = find_context_in_source(
                        source_content,
                        url,
                        missing_context
                    )
                    if "SOURCE DOES NOT ADDRESS CONTEXT" not in context_verification:
                        most_trusted_url = url
                        break
        
        # If still no good source, return refusal
        if "SOURCE DOES NOT ADDRESS CONTEXT" in context_verification:
            return NoteResult(
                post=post,
                refusal="NOT ENOUGH EVIDENCE TO WRITE A GOOD COMMUNITY NOTE - Sources don't adequately address missing context",
                images_summary=images_summary
            )
        
        # Create the note
        # Extract the first/most important missing context point
        context_lines = missing_context.strip().split('\n')
        primary_context = context_lines[0].strip()
        if primary_context.startswith('1.') or primary_context.startswith('-'):
            primary_context = primary_context[2:].strip()
        
        note_text = _format_note_with_context(primary_context, most_trusted_url)
        
        # Determine appropriate misleading tag
        # Since we're focusing on missing context, this will usually be "missing_important_context"
        misleading_tag = MisleadingTag.missing_important_context
        
        return NoteResult(
            post=post,
            note=ProposedMisleadingNote(
                post_id=post.post_id,
                note_text=note_text,
                misleading_tags=[misleading_tag]
            ),
            images_summary=images_summary
        )
        
    except Exception as e:
        return NoteResult(
            post=post,
            error=f"Error in enhanced research pipeline: {str(e)}",
            images_summary=images_summary
        )


def _simple_prompt_note_writing(post: Post, images_summary: str, search_results: str) -> str:
    """
    Alternative approach: Let Claude write the entire note based on research.
    This is a fallback option that's more similar to the original approach.
    """
    prompt = f"""Based on this X post and search results, write a Community Note if important context is missing.

The note should:
- Focus on missing context that materially changes understanding
- Be under 280 characters
- Include exactly one trusted source URL
- Be written neutrally for broad political acceptance
- Start with "Missing context:" if context is needed

If no important context is missing, respond with "NO NOTE NEEDED"

Post text:
```
{post.text}
```

Images:
```
{images_summary if images_summary else "No images"}
```

Search results:
```
{search_results}
```

Write the note or "NO NOTE NEEDED":
"""
    
    return claude_analyze(prompt)