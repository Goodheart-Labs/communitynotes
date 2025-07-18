import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

interface SourceTrustEntry {
  score: number;
  reason: string;
  lastEvaluated: string;
}

interface SourceTrustCache {
  sources: Record<string, SourceTrustEntry>;
}

export class SourceTrustCacheService {
  private cachePath: string;
  private cache: SourceTrustCache;

  constructor() {
    this.cachePath = join(process.cwd(), 'source-trust-scores.json');
    this.loadCache();
  }

  private loadCache(): void {
    try {
      if (existsSync(this.cachePath)) {
        const data = readFileSync(this.cachePath, 'utf-8');
        this.cache = JSON.parse(data);
      } else {
        this.cache = { sources: {} };
      }
    } catch (error) {
      console.error('Error loading source trust cache:', error);
      this.cache = { sources: {} };
    }
  }

  private saveCache(): void {
    try {
      writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      console.error('Error saving source trust cache:', error);
    }
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  getTrustScore(url: string): { score: number; reason: string } | null {
    const domain = this.extractDomain(url);
    const entry = this.cache.sources[domain];
    
    if (entry) {
      return {
        score: entry.score,
        reason: entry.reason
      };
    }
    
    return null;
  }

  setTrustScore(url: string, score: number, reason: string): void {
    const domain = this.extractDomain(url);
    this.cache.sources[domain] = {
      score,
      reason,
      lastEvaluated: new Date().toISOString()
    };
    this.saveCache();
  }

  // Get all URLs that need evaluation (not in cache)
  filterUncachedUrls(urls: string[]): string[] {
    return urls.filter(url => {
      const domain = this.extractDomain(url);
      return !this.cache.sources[domain];
    });
  }

  // Get cached scores for a list of URLs
  getCachedScores(urls: string[]): { url: string; score: number; reason: string }[] {
    const results: { url: string; score: number; reason: string }[] = [];
    
    for (const url of urls) {
      const cached = this.getTrustScore(url);
      if (cached) {
        results.push({
          url,
          score: cached.score,
          reason: cached.reason
        });
      }
    }
    
    return results;
  }
}