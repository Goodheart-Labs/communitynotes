import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { Post, NoteResult, ProposedMisleadingNote, MisleadingTag, Config } from '../types';
import { OpenRouterClient } from '../lib/openrouter-client';

export class EnhancedResearchService {
  private openRouter: OpenRouterClient;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.openRouter = new OpenRouterClient(config);
  }

  async researchAndWriteNote(post: Post, imagesSummary: string = ''): Promise<NoteResult> {
    try {
      // Phase 1: Perform Perplexity search directly with the tweet text
      const searchPrompt = `Find context and information about this tweet: "${post.text}"${imagesSummary ? `\n\nImages in tweet: ${imagesSummary}` : ''}\n\nFocus on authoritative sources and recent information. Include specific URLs with each piece of information.`;
      const searchResults = await this.openRouter.perplexitySearch(searchPrompt);

      // Phase 2: Identify missing context
      const missingContext = await this.openRouter.identifyMissingContext(
        post.text,
        imagesSummary,
        searchResults
      );

      // Check if no context is missing
      if (missingContext.includes('NO MISSING CONTEXT')) {
        return {
          post,
          refusal: 'NO NOTE NEEDED - No important missing context identified',
          images_summary: imagesSummary
        };
      }

      // Phase 3: Extract URLs and evaluate trustworthiness
      const urls = this.extractUrls(searchResults);
      if (urls.length === 0) {
        return {
          post,
          refusal: 'NOT ENOUGH EVIDENCE TO WRITE A GOOD COMMUNITY NOTE - No sources found',
          images_summary: imagesSummary
        };
      }

      const sourcesText = urls.map(url => `- ${url}`).join('\n');
      const trustEvaluation = await this.openRouter.evaluateSourceTrustworthiness(sourcesText);
      
      // Extract most trusted URL
      const mostTrustedUrl = this.extractMostTrustedUrl(trustEvaluation, urls);

      // Phase 4: Fetch content from most trusted source
      let sourceContent = await this.fetchWebContent(mostTrustedUrl);
      
      if (!sourceContent && urls.length > 1) {
        // Try backup source
        sourceContent = await this.fetchWebContent(urls[1]);
      }

      if (!sourceContent) {
        return {
          post,
          refusal: 'NOT ENOUGH EVIDENCE TO WRITE A GOOD COMMUNITY NOTE - Could not fetch source content',
          images_summary: imagesSummary
        };
      }

      // Phase 5: Verify context in source
      const contextVerification = await this.openRouter.findContextInSource(
        sourceContent,
        mostTrustedUrl,
        missingContext
      );

      if (contextVerification.includes('SOURCE DOES NOT ADDRESS CONTEXT')) {
        // Try other sources
        for (const url of urls.slice(1, 3)) {
          const altContent = await this.fetchWebContent(url);
          if (altContent) {
            const altVerification = await this.openRouter.findContextInSource(
              altContent,
              url,
              missingContext
            );
            if (!altVerification.includes('SOURCE DOES NOT ADDRESS CONTEXT')) {
              sourceContent = altContent;
              break;
            }
          }
        }
      }

      // Create the note
      const primaryContext = this.extractPrimaryContext(missingContext);
      const noteText = this.formatNote(primaryContext, mostTrustedUrl);

      return {
        post,
        note: {
          post_id: post.id,
          note_text: noteText,
          misleading_tags: [MisleadingTag.MissingImportantContext],
          trustworthy_sources: true
        },
        images_summary: imagesSummary
      };

    } catch (error) {
      return {
        post,
        error: `Error in enhanced research pipeline: ${error instanceof Error ? error.message : String(error)}`,
        images_summary: imagesSummary
      };
    }
  }

  private extractUrls(text: string): string[] {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+[^\s<>"{}|\\^`\[\].,;:!?\'")\]]/g;
    const urls = text.match(urlRegex) || [];
    return [...new Set(urls)]; // Remove duplicates
  }

  private extractMostTrustedUrl(trustEvaluation: string, urls: string[]): string {
    // Try to parse the most trusted URL from evaluation
    const lines = trustEvaluation.split('\n');
    for (const line of lines) {
      for (const url of urls) {
        if (line.includes(url)) {
          return url;
        }
      }
    }
    // Fallback to first URL
    return urls[0];
  }

  private async fetchWebContent(url: string): Promise<string | null> {
    try {
      const response = await axios.get(url, {
        timeout: this.config.fetch_timeout || 10000,  // Default to 10 seconds
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept-Encoding': 'gzip, deflate'  // Avoid brotli which Bun doesn't support
        }
      });
      
      // Parse HTML with jsdom
      const dom = new JSDOM(response.data, { url });
      
      // Use Readability to extract article content
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      
      if (article && article.textContent) {
        // Return clean text content, limited to 30k chars to leave room for prompts
        const cleanText = article.textContent
          .replace(/\s+/g, ' ')  // Normalize whitespace
          .trim()
          .substring(0, 30000);
        
        console.log(`✓ Extracted ${cleanText.length} chars of clean text from ${url}`);
        return cleanText;
      } else {
        console.log(`⚠️  Could not extract article content from ${url}`);
        // Fallback to basic text extraction from body
        const bodyText = dom.window.document.body?.textContent || '';
        return bodyText.replace(/\s+/g, ' ').trim().substring(0, 30000);
      }
    } catch (error) {
      console.error(`Error fetching ${url}:`, error);
      return null;
    }
  }

  private extractPrimaryContext(missingContext: string): string {
    const lines = missingContext.split('\n').filter(line => line.trim());
    let primaryContext = lines[0] || '';
    
    // Remove numbering or bullet points
    primaryContext = primaryContext.replace(/^[\d\-\*\.]+\s*/, '').trim();
    
    return primaryContext;
  }

  private formatNote(context: string, sourceUrl: string): string {
    let note = `Missing context: ${context} ${sourceUrl}`;
    
    // Ensure under 280 characters
    if (note.length > 280) {
      const excess = note.length - 280 + 3; // +3 for "..."
      const shortenedContext = context.substring(0, context.length - excess) + '...';
      note = `Missing context: ${shortenedContext} ${sourceUrl}`;
    }
    
    return note;
  }
}