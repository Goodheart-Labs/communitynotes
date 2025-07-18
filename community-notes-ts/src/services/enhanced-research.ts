import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { Post, NoteResult, MisleadingTag, Config } from '../types';
import { OpenRouterClient } from '../lib/openrouter-client';
import { LogCollector } from '../lib/log-collector';
export class EnhancedResearchService {
  private openRouter: OpenRouterClient;
  private config: Config;

  constructor(config: Config, logCollector?: LogCollector) {
    this.config = config;
    this.openRouter = new OpenRouterClient(config, logCollector);
  }

  async researchAndWriteNote(post: Post, imagesSummary: string = ''): Promise<NoteResult> {
    try {
      // Phase 1: Perform Perplexity search directly with the tweet text
      console.log('🔍 Phase 1: Starting Perplexity search...');
      const searchPrompt = `Find context and information about this tweet: "${post.text}"${imagesSummary ? `\n\nImages in tweet: ${imagesSummary}` : ''}\n\nFocus on authoritative sources and recent information. Include specific URLs with each piece of information.`;
      const searchResults = await this.openRouter.perplexitySearch(searchPrompt);
      console.log('✅ Perplexity search completed');

      // Phase 2: Identify missing context
      console.log('🔍 Phase 2: Identifying missing context...');
      const missingContext = await this.openRouter.identifyMissingContext(
        post.text,
        imagesSummary,
        searchResults
      );
      console.log('✅ Missing context identified:', missingContext.substring(0, 100) + '...');

      // Parse the response category
      const firstLine = missingContext.split('\n')[0].trim();
      
      // Check response categories
      if (firstLine.includes('TWEET NOT SIGNIFICANTLY INCORRECT') || firstLine.includes('NO MISSING CONTEXT')) {
        return {
          post,
          refusal: 'NO NOTE NEEDED - ' + firstLine,
          images_summary: imagesSummary
        };
      }
      
      // If it's a correction without trustworthy citation, we should refuse
      if (firstLine.includes('CORRECTION WITHOUT TRUSTWORTHY CITATION')) {
        return {
          post,
          refusal: 'NOT ENOUGH EVIDENCE TO WRITE A GOOD COMMUNITY NOTE - No trustworthy sources available',
          images_summary: imagesSummary
        };
      }

      // Phase 3: Extract URLs from the missing context claims (not the original search)
      console.log('🔍 Phase 3: Extracting URLs from claims...');
      const claimUrls = this.extractUrlsFromClaims(missingContext);
      console.log(`✅ Found ${claimUrls.length} URLs:`, claimUrls);
      
      // Check if this is supposed to be a correction with trustworthy citation
      const claimedTrustworthyCitation = firstLine.includes('CORRECTION WITH TRUSTWORTHY CITATION');
      
      if (claimUrls.length === 0) {
        if (claimedTrustworthyCitation) {
          // This is an error - AI claimed to have trustworthy citation but didn't provide URLs
          return {
            post,
            error: 'AI ERROR: Claimed "CORRECTION WITH TRUSTWORTHY CITATION" but provided no source URLs',
            images_summary: imagesSummary
          };
        } else {
          return {
            post,
            refusal: 'NOT ENOUGH EVIDENCE TO WRITE A GOOD COMMUNITY NOTE - No sources found in claims',
            images_summary: imagesSummary
          };
        }
      }

      // Use the first URL without source checking
      const mostTrustedUrl = claimUrls[0];

      // Phase 4: Fetch content from source
      console.log(`🔍 Phase 4: Fetching content from ${mostTrustedUrl}...`);
      let sourceContent = await this.fetchWebContent(mostTrustedUrl);
      
      if (!sourceContent && claimUrls.length > 1) {
        console.log(`⚠️  Primary source failed, trying backup: ${claimUrls[1]}...`);
        sourceContent = await this.fetchWebContent(claimUrls[1]);
      }

      if (!sourceContent) {
        return {
          post,
          refusal: 'NOT ENOUGH EVIDENCE TO WRITE A GOOD COMMUNITY NOTE - Could not fetch source content',
          images_summary: imagesSummary
        };
      }

      // Phase 5: Verify context in source
      console.log('🔍 Phase 5: Verifying context in source...');
      const contextVerification = await this.openRouter.findContextInSource(
        sourceContent,
        mostTrustedUrl,
        missingContext
      );
      console.log('✅ Context verification result:', contextVerification);

      let foundValidSource = contextVerification.trim().toUpperCase() === 'YES';
      let validSourceUrl = mostTrustedUrl;

      if (!foundValidSource) {
        // Try other sources
        for (const url of claimUrls.slice(1, 3)) {
          const altContent = await this.fetchWebContent(url);
          if (altContent) {
            const altVerification = await this.openRouter.findContextInSource(
              altContent,
              url,
              missingContext
            );
            if (altVerification.trim().toUpperCase() === 'YES') {
              foundValidSource = true;
              validSourceUrl = url;
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
      console.error('❌ Error in enhanced research pipeline:', error);
      return {
        post,
        error: `Error in enhanced research pipeline: ${error instanceof Error ? error.message : String(error)}`,
        images_summary: imagesSummary
      };
    }
  }

  private extractUrlsFromClaims(missingContext: string): string[] {
    const urls: string[] = [];
    
    // Extract URLs from the response
    // The AI should provide URLs after the correction text
    const lines = missingContext.split('\n');
    
    // Skip the status line and look for URLs in the remaining content
    let foundStatus = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines
      if (!trimmedLine) continue;
      
      // Check if this is a status line
      if (trimmedLine.includes('CORRECTION WITH TRUSTWORTHY CITATION') || 
          trimmedLine.includes('CORRECTION WITHOUT TRUSTWORTHY CITATION') ||
          trimmedLine.includes('NO MISSING CONTEXT') ||
          trimmedLine.includes('TWEET NOT SIGNIFICANTLY INCORRECT')) {
        foundStatus = true;
        continue;
      }
      
      // After status, look for URLs in any line
      if (foundStatus) {
        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+[^\s<>"{}|\\^`\[\].,;:!?\'")\]]/g;
        const matches = trimmedLine.match(urlRegex);
        if (matches) {
          urls.push(...matches);
        }
      }
    }
    
    return [...new Set(urls)]; // Remove duplicates
  }



  private async fetchWebContent(url: string): Promise<string | null> {
    const timeout = 20000;  // 20 seconds timeout
    const startTime = Date.now();
    try {
      console.log(`🌐 Fetching ${url}... (${timeout/1000}s timeout)`);
      const response = await axios.get(url, {
        timeout: timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept-Encoding': 'gzip, deflate'  // Avoid brotli which Bun doesn't support
        },
        validateStatus: (status) => status < 500,  // Accept 4xx responses
        onDownloadProgress: (progressEvent) => {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          if (elapsed > 5 && elapsed % 5 === 0) {
            console.log(`   ⏳ Still fetching... (${elapsed}s elapsed)`);
          }
        }
      });
      
      if (response.status >= 400) {
        console.log(`⚠️  HTTP ${response.status} for ${url}`);
        return null;
      }
      
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
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          console.error(`⚠️  Timeout fetching ${url} after ${timeout/1000}s`);
        } else if (error.response) {
          console.error(`⚠️  HTTP ${error.response.status} error fetching ${url}`);
        } else {
          console.error(`⚠️  Network error fetching ${url}:`, error.message);
        }
      } else {
        console.error(`⚠️  Error fetching ${url}:`, error);
      }
      return null;
    }
  }

  private extractPrimaryContext(missingContext: string): string {
    const lines = missingContext.split('\n').filter(line => line.trim());
    
    // Skip the category line if present
    let startIndex = 0;
    if (lines[0] && (lines[0].includes('CORRECTION WITH TRUSTWORTHY CITATION') || 
                     lines[0].includes('CORRECTION WITHOUT TRUSTWORTHY CITATION'))) {
      startIndex = 1;
    }
    
    // Look for [Correction] marker or just take the first content line
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('[Correction]')) {
        // Extract the text after [Correction]
        const correctionText = line.substring('[Correction]'.length).trim();
        if (correctionText) {
          return correctionText;
        } else if (i + 1 < lines.length) {
          // If [Correction] is on its own line, use the next line
          return lines[i + 1].replace(/^[\d\-\*\.]+\s*/, '').trim();
        }
      }
    }
    
    // Fallback: use the first non-category line
    let primaryContext = lines[startIndex] || '';
    primaryContext = primaryContext.replace(/^[\d\-\*\.]+\s*/, '').trim();
    
    return primaryContext;
  }

  private formatNote(context: string, sourceUrl: string): string {
    // Just return the context and source URL without any prefix
    let note = `${context} ${sourceUrl}`;
    
    // Ensure under 500 characters (new limit)
    if (note.length > 500) {
      const excess = note.length - 500 + 3; // +3 for "..."
      const shortenedContext = context.substring(0, context.length - excess) + '...';
      note = `${shortenedContext} ${sourceUrl}`;
    }
    
    return note;
  }
}