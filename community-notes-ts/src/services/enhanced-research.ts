import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { Post, NoteResult, ProposedMisleadingNote, MisleadingTag, Config } from '../types';
import { OpenRouterClient } from '../lib/openrouter-client';
import { SourceTrustCacheService } from './source-trust-cache';

export class EnhancedResearchService {
  private openRouter: OpenRouterClient;
  private config: Config;
  private trustCache: SourceTrustCacheService;

  constructor(config: Config) {
    this.config = config;
    this.openRouter = new OpenRouterClient(config);
    this.trustCache = new SourceTrustCacheService();
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

      // Phase 3: Extract URLs from the missing context claims (not the original search)
      const claimUrls = this.extractUrlsFromClaims(missingContext);
      if (claimUrls.length === 0) {
        return {
          post,
          refusal: 'NOT ENOUGH EVIDENCE TO WRITE A GOOD COMMUNITY NOTE - No sources found in claims',
          images_summary: imagesSummary
        };
      }

      // Check cache first
      const cachedScores = this.trustCache.getCachedScores(claimUrls);
      const uncachedUrls = this.trustCache.filterUncachedUrls(claimUrls);
      
      // Evaluate only uncached URLs
      let evaluatedSources: { url: string; score: number; reason: string }[] = [];
      if (uncachedUrls.length > 0) {
        const sourcesText = uncachedUrls.map(url => `- ${url}`).join('\n');
        const trustEvaluation = await this.openRouter.evaluateSourceTrustworthiness(sourcesText);
        
        // Extract and cache the evaluated sources
        const parsedEvaluations = this.parseAndCacheTrustEvaluation(trustEvaluation, uncachedUrls);
        evaluatedSources = parsedEvaluations;
      }
      
      // Combine cached and newly evaluated sources
      const allSources = [...cachedScores, ...evaluatedSources];
      
      // Filter for trusted sources (score > 60) and sort by score
      const trustedSources = allSources
        .filter(source => source.score > 60)
        .sort((a, b) => b.score - a.score);
      
      if (trustedSources.length === 0) {
        return {
          post,
          refusal: 'NOT ENOUGH EVIDENCE TO WRITE A GOOD COMMUNITY NOTE - No sources scored above 60',
          images_summary: imagesSummary
        };
      }

      const mostTrustedUrl = trustedSources[0].url;

      // Phase 4: Fetch content from most trusted source
      let sourceContent = await this.fetchWebContent(mostTrustedUrl);
      
      if (!sourceContent && trustedSources.length > 1) {
        // Try backup trusted source
        sourceContent = await this.fetchWebContent(trustedSources[1].url);
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

      let foundValidSource = contextVerification.trim().toUpperCase() === 'YES';
      let validSourceUrl = mostTrustedUrl;

      if (!foundValidSource) {
        // Try other trusted sources (only those scoring > 60)
        for (const source of trustedSources.slice(1, 3)) {
          const altContent = await this.fetchWebContent(source.url);
          if (altContent) {
            const altVerification = await this.openRouter.findContextInSource(
              altContent,
              source.url,
              missingContext
            );
            if (altVerification.trim().toUpperCase() === 'YES') {
              foundValidSource = true;
              validSourceUrl = source.url;
              break;
            }
          }
        }
      }

      // If no source contains the relevant context, refuse to create a note
      if (!foundValidSource) {
        return {
          post,
          refusal: 'NOT ENOUGH EVIDENCE TO WRITE A GOOD COMMUNITY NOTE - Sources do not contain relevant context',
          images_summary: imagesSummary
        };
      }

      // Create the note
      const primaryContext = this.extractPrimaryContext(missingContext);
      const noteText = this.formatNote(primaryContext, validSourceUrl);

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

  private extractUrlsFromClaims(missingContext: string): string[] {
    const urls: string[] = [];
    const lines = missingContext.split('\n');
    let inSourcesSection = false;
    
    for (const line of lines) {
      if (line.trim().toLowerCase() === 'sources:') {
        inSourcesSection = true;
        continue;
      }
      
      if (inSourcesSection && line.trim().startsWith('-')) {
        const urlMatch = line.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+[^\s<>"{}|\\^`\[\].,;:!?\'")\]]/);
        if (urlMatch) {
          urls.push(urlMatch[0]);
        }
      } else if (inSourcesSection && line.trim() && !line.trim().startsWith('-')) {
        // End of sources section
        inSourcesSection = false;
      }
    }
    
    return [...new Set(urls)]; // Remove duplicates
  }

  private parseAndCacheTrustEvaluation(trustEvaluation: string, urls: string[]): { url: string; score: number; reason: string }[] {
    const evaluatedSources: { url: string; score: number; reason: string }[] = [];
    const lines = trustEvaluation.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for lines containing URLs
      for (const url of urls) {
        if (line.includes(url)) {
          // Extract score - look for patterns like "score: 85" or "Trust score: 85" or just "85"
          const scoreMatch = line.match(/(?:score|Score):\s*(\d+)|(?:^|\s)(\d+)(?:\s|$)/);
          if (scoreMatch) {
            const score = parseInt(scoreMatch[1] || scoreMatch[2]);
            
            // Extract reason - usually on the same line or the next line
            let reason = '';
            const reasonMatch = line.match(/(?:reason|Reason):\s*(.+)/);
            if (reasonMatch) {
              reason = reasonMatch[1].trim();
            } else if (i + 1 < lines.length) {
              // Check next line for reason
              reason = lines[i + 1].trim();
            }
            
            // Cache the score
            this.trustCache.setTrustScore(url, score, reason);
            
            evaluatedSources.push({ url, score, reason });
          }
        }
      }
    }
    
    return evaluatedSources;
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
    // Just return the context and source URL without any prefix
    let note = `${context} ${sourceUrl}`;
    
    // Ensure under 280 characters
    if (note.length > 280) {
      const excess = note.length - 280 + 3; // +3 for "..."
      const shortenedContext = context.substring(0, context.length - excess) + '...';
      note = `${shortenedContext} ${sourceUrl}`;
    }
    
    return note;
  }
}