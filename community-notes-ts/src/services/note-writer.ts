import { Post, NoteResult, Media, Config } from '../types';
import { EnhancedResearchService } from './enhanced-research';
import { LogCollector } from '../lib/log-collector';

export class NoteWriterService {
  private enhancedResearch: EnhancedResearchService;

  constructor(config: Config, logCollector?: LogCollector) {
    this.enhancedResearch = new EnhancedResearchService(config, logCollector);
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
    if (media.length === 0) {
      return '';
    }
    
    const imageCount = media.filter(m => m.type === 'photo').length;
    const videoCount = media.filter(m => m.type === 'video').length;
    
    let summary = '🚩 MEDIA PRESENT BUT NOT PROCESSED:\n';
    
    if (imageCount > 0) {
      summary += `- ${imageCount} image(s) present and not analyzed\n`;
    }
    
    if (videoCount > 0) {
      summary += `- ${videoCount} video(s) present and not analyzed\n`;
    }
    
    return summary;
  }

}