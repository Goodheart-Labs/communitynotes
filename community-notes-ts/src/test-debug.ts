import dotenv from 'dotenv';
import { ConfigSchema, Post } from './types';
import { NoteWriterService } from './services/note-writer';

// Load environment variables
dotenv.config();

async function testDebug() {
  try {
    // Build test config
    const config = ConfigSchema.parse({
      x_api_key: process.env.X_API_KEY || 'test',
      x_api_key_secret: process.env.X_API_KEY_SECRET || 'test',
      x_access_token: process.env.X_ACCESS_TOKEN || 'test',
      x_access_token_secret: process.env.X_ACCESS_TOKEN_SECRET || 'test',
      openrouter_api_key: process.env.OPENROUTER_API_KEY,
      research_mode: 'enhanced',
      fetch_timeout: 10000,
      max_sources_to_fetch: 5,
      dry_run: true,
      max_posts: 1,
      concurrency: 1,
    });

    // Create a test post
    const testPost: Post = {
      id: '12345',
      text: 'The Earth is flat and NASA is lying to us all.',
      media: [],
      created_at: new Date().toISOString()
    };

    console.log('🧪 Running debug test with fake post...');
    console.log(`Post: ${testPost.text}\n`);

    // Initialize note writer
    const noteWriter = new NoteWriterService(config);
    
    // Process the post
    const result = await noteWriter.writeNoteForPost(testPost);
    
    console.log('\n📊 Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Debug test failed:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
  }
}

testDebug().catch(console.error);