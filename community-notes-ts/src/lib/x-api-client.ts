import OAuth from 'oauth-1.0a';
import crypto from 'crypto';
import axios from 'axios';
import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { Post, PostSchema, MediaSchema, ProposedMisleadingNote, Config } from '../types';

export class XAPIClient {
  private oauth: OAuth;
  private config: Config;
  
  constructor(config: Config) {
    this.config = config;
    this.oauth = new OAuth({
      consumer: {
        key: config.x_api_key,
        secret: config.x_api_key_secret,
      },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
      },
    });
  }

  private getAuthHeader(url: string, method: string = 'GET', data?: any) {
    const token = {
      key: this.config.x_access_token,
      secret: this.config.x_access_token_secret,
    };

    const requestData = {
      url,
      method,
      data,
    };

    return this.oauth.toHeader(this.oauth.authorize(requestData, token));
  }

  async getEligiblePosts(maxResults: number = 10): Promise<Post[]> {
    const url = 'https://api.twitter.com/2/notes/search/posts_eligible_for_notes';
    const params = new URLSearchParams({
      max_results: maxResults.toString(),
      'tweet.fields': 'created_at,author_id',
      'media.fields': 'type,url,preview_image_url,height,width,duration_ms,public_metrics',
      'expansions': 'attachments.media_keys',
      'test_mode': 'true'  // Add test_mode parameter
    });

    const fullUrl = `${url}?${params.toString()}`;

    try {
      const response = await axios.get(fullUrl, {
        headers: {
          ...this.getAuthHeader(fullUrl, 'GET'),
          'Content-Type': 'application/json',
        },
      });

      return this.parsePostsResponse(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('X API Error:', error.response?.data);
        
        // If we get a 403, we're not approved for API Note Writer
        if (error.response?.status === 403) {
          console.log('\n⚠️  You need to be approved as an API Note Writer to use this endpoint.');
          console.log('Using mock data for testing instead...\n');
          
          // Return mock data for testing
          return this.getMockPosts(maxResults);
        }
        
        throw new Error(`Failed to fetch eligible posts: ${error.response?.status} ${JSON.stringify(error.response?.data)}`);
      }
      throw error;
    }
  }
  
  private getMockPosts(maxResults: number): Post[] {
    // First, check if there's a tweets-to-check.json file
    const tweetsFile = 'tweets-to-check.json';
    if (existsSync(tweetsFile)) {
      try {
        const fileContent = readFileSync(tweetsFile, 'utf-8');
        const data = JSON.parse(fileContent);
        if (data.tweets && Array.isArray(data.tweets)) {
          console.log(`\n📄 Loaded ${data.tweets.length} tweets from ${tweetsFile}`);
          
          // Validate and format the tweets
          const customPosts: Post[] = data.tweets.map((tweet: any, index: number) => ({
            id: tweet.id || `custom_${index + 1}`,
            author_id: tweet.author_id || `author_${index + 1}`,
            created_at: tweet.created_at || new Date().toISOString(),
            text: tweet.text || '',
            media: tweet.media || []
          })).filter(tweet => tweet.text.trim() !== '');
          
          if (customPosts.length > 0) {
            // Randomly shuffle if more than requested
            const shuffled = [...customPosts].sort(() => Math.random() - 0.5);
            return shuffled.slice(0, Math.min(maxResults, shuffled.length));
          }
        }
      } catch (error) {
        console.error(`Error reading ${tweetsFile}:`, error);
      }
    }
    
    // Fallback to default mock posts
    const mockPosts: Post[] = [
      {
        id: 'mock_post_1',
        author_id: 'mock_author_1',
        created_at: new Date().toISOString(),
        text: 'The new COVID vaccine has a 95% effectiveness rate against all variants.',
        media: []
      },
      {
        id: 'mock_post_2',
        author_id: 'mock_author_2',
        created_at: new Date(Date.now() - 3600000).toISOString(),
        text: 'Breaking: Scientists discover that drinking coffee cures cancer! New study from Harvard proves 3 cups daily eliminates tumors.',
        media: []
      },
      {
        id: 'mock_post_3',
        author_id: 'mock_author_3',
        created_at: new Date(Date.now() - 7200000).toISOString(),
        text: 'URGENT: Banks will freeze all accounts next Monday due to new government regulations. Withdraw your money NOW!',
        media: []
      },
      {
        id: 'mock_post_4',
        author_id: 'mock_author_4',
        created_at: new Date(Date.now() - 10800000).toISOString(),
        text: 'Climate change is a hoax. This photo from 1923 shows the same sea levels as today.',
        media: [
          {
            media_key: 'mock_media_1',
            type: 'photo',
            url: 'https://example.com/fake-comparison.jpg',
            alt_text: 'Two photos comparing sea levels'
          }
        ]
      },
      {
        id: 'mock_post_5',
        author_id: 'mock_author_5',
        created_at: new Date(Date.now() - 14400000).toISOString(),
        text: 'The unemployment rate just hit 2%, the lowest in history!',
        media: []
      },
      {
        id: 'mock_post_6',
        author_id: 'mock_author_6',
        created_at: new Date(Date.now() - 18000000).toISOString(),
        text: '5G towers are causing birds to fall from the sky. This video proves the connection!',
        media: []
      },
      {
        id: 'mock_post_7',
        author_id: 'mock_author_7',
        created_at: new Date(Date.now() - 21600000).toISOString(),
        text: 'Elon Musk just announced Tesla is giving away free cars to the first 1000 people who share this post!',
        media: []
      },
      {
        id: 'mock_post_8',
        author_id: 'mock_author_8',
        created_at: new Date(Date.now() - 25200000).toISOString(),
        text: 'The moon landing was filmed in a Hollywood studio. Here\'s the proof that NASA doesn\'t want you to see.',
        media: []
      },
      {
        id: 'mock_post_9',
        author_id: 'mock_author_9',
        created_at: new Date(Date.now() - 28800000).toISOString(),
        text: 'Eating chocolate every day increases your IQ by 20 points, according to a new MIT study.',
        media: []
      },
      {
        id: 'mock_post_10',
        author_id: 'mock_author_10',
        created_at: new Date(Date.now() - 32400000).toISOString(),
        text: 'BREAKING: The government is putting microchips in the water supply to track citizens.',
        media: []
      }
    ];
    
    // Randomly shuffle the posts
    const shuffled = [...mockPosts].sort(() => Math.random() - 0.5);
    
    return shuffled.slice(0, Math.min(maxResults, shuffled.length));
  }

  private parsePostsResponse(data: any): Post[] {
    const posts: Post[] = [];
    const mediaMap = new Map<string, any>();

    // Build media map from includes
    if (data.includes?.media) {
      for (const media of data.includes.media) {
        mediaMap.set(media.media_key, media);
      }
    }

    // Parse posts
    if (data.data) {
      for (const tweet of data.data) {
        const media = [];
        
        // Attach media to posts
        if (tweet.attachments?.media_keys) {
          for (const mediaKey of tweet.attachments.media_keys) {
            const mediaData = mediaMap.get(mediaKey);
            if (mediaData) {
              media.push({
                media_key: mediaData.media_key,
                type: mediaData.type,
                url: mediaData.url,
                preview_image_url: mediaData.preview_image_url,
                height: mediaData.height,
                width: mediaData.width,
                duration_ms: mediaData.duration_ms,
                view_count: mediaData.public_metrics?.view_count
              });
            }
          }
        }

        posts.push({
          id: tweet.id,
          author_id: tweet.author_id,
          created_at: tweet.created_at,
          text: tweet.text,
          media
        });
      }
    }

    return posts;
  }

  async submitNote(note: ProposedMisleadingNote, testMode: boolean = true): Promise<void> {
    const url = 'https://api.twitter.com/2/notes';
    
    const data = {
      post_id: note.post_id,
      note_text: note.note_text,
      misleading: note.misleading_tags,
      trustworthy_sources: note.trustworthy_sources,
      test_mode: testMode
    };

    try {
      const response = await axios.post(url, data, {
        headers: {
          ...this.getAuthHeader(url, 'POST', data),
          'Content-Type': 'application/json',
        },
      });

      if (response.status !== 201) {
        throw new Error(`Failed to submit note: ${response.status}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Check if we already wrote a note on this post
        if (error.response?.status === 409) {
          throw new Error('Already wrote a note on this post');
        }
        throw new Error(`Failed to submit note: ${error.response?.status} ${error.response?.data}`);
      }
      throw error;
    }
  }

  async hasAlreadyWrittenNote(_postId: string): Promise<boolean> {
    // This is a simplified check - in production you might want to query your submitted notes
    // For now, we'll rely on the 409 error from submitNote
    return false;
  }
}