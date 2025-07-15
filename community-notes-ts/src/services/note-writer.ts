import { Post, NoteResult, Media, Config } from '../types';
import { OpenRouterClient } from '../lib/openrouter-client';
import { EnhancedResearchService } from './enhanced-research';

export class NoteWriterService {
  private openRouter: OpenRouterClient;
  private enhancedResearch: EnhancedResearchService;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.openRouter = new OpenRouterClient(config);
    this.enhancedResearch = new EnhancedResearchService(config);
  }

  async writeNoteForPost(post: Post): Promise<NoteResult> {
    try {
      // First, summarize any images in the post
      const imagesSummary = await this.summarizeImages(post.media);
      
      // Use enhanced research pipeline
      return await this.enhancedResearch.researchAndWriteNote(post, imagesSummary);
      
    } catch (error) {
      return {
        post,
        error: `Error writing note: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async summarizeImages(media: Media[]): Promise<string> {
    const summaries: string[] = [];
    
    for (let i = 0; i < media.length; i++) {
      const item = media[i];
      
      if (item.type === 'photo' && item.url) {
        try {
          const description = await this.describeImage(item.url);
          summaries.push(`Image ${i + 1}: ${description}`);
        } catch (error) {
          console.error(`Error describing image ${i + 1}:`, error);
          summaries.push(`Image ${i + 1}: [Error describing image]`);
        }
      } else if (item.type === 'video') {
        summaries.push(`Video ${i + 1}: [Video analysis not supported yet]`);
      }
    }
    
    return summaries.join('\n\n');
  }

  private async describeImage(imageUrl: string): Promise<string> {
    // For now, we'll use Claude to describe the image
    // In production, you might want to use a specialized vision model
    const prompt = `Please describe what you see in this image concisely and factually. Focus on any text, claims, or important visual elements that might need fact-checking.

Image URL: ${imageUrl}

Provide a brief, factual description.`;

    try {
      return await this.openRouter.claudeAnalyze(prompt);
    } catch (error) {
      // If image analysis fails, return a placeholder
      return '[Image present but could not be analyzed]';
    }
  }
}