import { parseArgs } from 'util';
import dotenv from 'dotenv';
import { z } from 'zod';
import { Config, ConfigSchema, Post, NoteResult } from './types';
import { XAPIClient } from './lib/x-api-client';
import { NoteWriterService } from './services/note-writer';
import { globalLogCollector } from './lib/log-collector';
import { generateHTMLReport } from './services/html-generator';
import { generateBatchHTMLReport } from './services/batch-html-generator';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Load environment variables
dotenv.config();

// Parse command line arguments
const { values } = parseArgs({
  options: {
    'dry-run': {
      type: 'boolean',
      default: false,
    },
    'max-posts': {
      type: 'string',
      default: '5',
    },
    'concurrency': {
      type: 'string',
      default: '5',
    },
    'research-mode': {
      type: 'string',
      default: 'enhanced',
    },
  },
});

import { LogCollector } from './lib/log-collector';

async function processPost(
  post: Post, 
  xClient: XAPIClient, 
  config: Config,
  logCollector: LogCollector
): Promise<{ post: Post; result: NoteResult; logCollector: LogCollector }> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Processing Post: ${post.id}`);
  console.log(`${'='.repeat(50)}`);
  console.log(`\nPost text: ${post.text}`);
  
  if (post.media.length > 0) {
    console.log(`\nMedia: ${post.media.length} item(s)`);
  }
  
  console.log(`\n⏱️  Note: Processing usually takes about 3 minutes per post...`);

  // Start collecting logs for this specific post
  logCollector.startCollecting();
  
  // Create a NoteWriterService with this post's log collector
  const noteWriter = new NoteWriterService(config, logCollector);
  const result: NoteResult = await noteWriter.writeNoteForPost(post);

  if (result.error) {
    console.log(`\n❌ ERROR: ${result.error}`);
  } else if (result.refusal) {
    console.log(`\n✋ REFUSAL: ${result.refusal}`);
  } else if (result.note) {
    console.log(`\n✅ NOTE GENERATED:`);
    console.log(`   ${result.note.note_text}`);
    console.log(`\n📌 Tags: ${result.note.misleading_tags.join(', ')}`);

    if (!config.dry_run) {
      try {
        await xClient.submitNote(result.note, true); // test_mode = true
        console.log(`\n✨ NOTE SUBMITTED SUCCESSFULLY`);
      } catch (error) {
        console.log(`\n⚠️  ERROR SUBMITTING NOTE: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      console.log(`\n🏃 DRY RUN - Note not submitted`);
    }
  }
  
  return { post, result, logCollector };
}

async function main() {
  try {
    // Build config from environment and CLI args
    const config = ConfigSchema.parse({
      x_api_key: process.env.X_API_KEY,
      x_api_key_secret: process.env.X_API_KEY_SECRET,
      x_access_token: process.env.X_ACCESS_TOKEN,
      x_access_token_secret: process.env.X_ACCESS_TOKEN_SECRET,
      openrouter_api_key: process.env.OPENROUTER_API_KEY,
      research_mode: values['research-mode'] || process.env.RESEARCH_MODE || 'enhanced',
      fetch_timeout: parseInt(process.env.FETCH_TIMEOUT || '10000'),
      max_sources_to_fetch: parseInt(process.env.MAX_SOURCES_TO_FETCH || '5'),
      dry_run: values['dry-run'],
      max_posts: parseInt(values['max-posts'] || '10'),
      concurrency: parseInt(values['concurrency'] || '1'),
    });

    console.log(`🤖 Community Notes Writer (TypeScript Edition)`);
    console.log(`📝 Research mode: ${config.research_mode}`);
    console.log(`🔍 Max posts: ${config.max_posts}`);
    console.log(`${config.dry_run ? '🏃 DRY RUN MODE' : '🚀 LIVE MODE'}`);

    // Initialize clients
    const xClient = new XAPIClient(config);

    // Fetch eligible posts
    console.log(`\n📊 Fetching eligible posts...`);
    const allPosts = await xClient.getEligiblePosts(100); // Fetch top 100
    
    if (allPosts.length === 0) {
      console.log(`\n😴 No eligible posts found.`);
      return;
    }

    console.log(`\n📋 Found ${allPosts.length} eligible posts`);
    
    // Randomly select posts based on max_posts config
    const posts: Post[] = [];
    const availablePosts = [...allPosts];
    const numToSelect = Math.min(config.max_posts, availablePosts.length);
    
    for (let i = 0; i < numToSelect; i++) {
      const randomIndex = Math.floor(Math.random() * availablePosts.length);
      posts.push(availablePosts[randomIndex]);
      availablePosts.splice(randomIndex, 1); // Remove selected post to avoid duplicates
    }
    
    console.log(`\n🎲 Randomly selected ${posts.length} post(s) from top ${allPosts.length}`);
    console.log(`   Selected IDs: ${posts.map(p => p.id).join(', ')}`);

    // Process posts and collect results
    const results: { post: Post; result: NoteResult; logCollector: LogCollector }[] = [];
    
    if (config.concurrency > 1) {
      // Process in parallel - each with its own log collector
      const promises = posts.map(post => {
        const postLogCollector = new LogCollector();
        return processPost(post, xClient, config, postLogCollector);
      });
      results.push(...await Promise.all(promises));
    } else {
      // Process sequentially - each with its own log collector
      for (const post of posts) {
        const postLogCollector = new LogCollector();
        const result = await processPost(post, xClient, config, postLogCollector);
        results.push(result);
      }
    }

    // Generate HTML reports
    const reportsDir = join(process.cwd(), 'local_reports');
    mkdirSync(reportsDir, { recursive: true });
    
    // Store individual report paths for batch report
    const batchData: Array<{post: Post; result: NoteResult; logs: string[]; htmlReport: string}> = [];
    
    for (const { post, result, logCollector } of results) {
      const html = generateHTMLReport(post, result, logCollector);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `note_${timestamp}_${post.id}.html`;
      const filepath = join(reportsDir, filename);
      
      writeFileSync(filepath, html, 'utf-8');
      
      // Store for batch report
      batchData.push({
        post,
        result,
        logs: logCollector.getLogs().map(log => log.message),
        htmlReport: filename // Just the filename, not full path
      });
    }
    
    // Generate batch report if multiple posts
    if (results.length > 1) {
      const batchHtml = generateBatchHTMLReport(batchData);
      const batchTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const batchFilename = `batch_${batchTimestamp}_${results.length}posts.html`;
      const batchFilepath = join(reportsDir, batchFilename);
      
      writeFileSync(batchFilepath, batchHtml, 'utf-8');
      console.log(`\n📊 Batch report saved: ${batchFilepath}`);
      
      // Open batch report in browser
      try {
        const openCommand = process.platform === 'darwin' ? 'open' : 
                          process.platform === 'win32' ? 'start' : 'xdg-open';
        await execAsync(`${openCommand} "${batchFilepath}"`);
        console.log(`🌐 Opened batch report in browser`);
      } catch (error) {
        console.log(`ℹ️  Could not open browser automatically`);
      }
    } else if (results.length === 1) {
      // For single post, open individual report
      const filepath = join(reportsDir, batchData[0].htmlReport);
      console.log(`\n📄 HTML report saved: ${filepath}`);
      try {
        const openCommand = process.platform === 'darwin' ? 'open' : 
                          process.platform === 'win32' ? 'start' : 'xdg-open';
        await execAsync(`${openCommand} "${filepath}"`);
        console.log(`🌐 Opened in browser`);
      } catch (error) {
        console.log(`ℹ️  Could not open browser automatically`);
      }
    }

    console.log(`\n✅ Done processing ${posts.length} posts!`);

  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Configuration error:');
      error.errors.forEach(err => {
        console.error(`   - ${err.path.join('.')}: ${err.message}`);
      });
      console.error('\nMake sure all required environment variables are set in your .env file');
      process.exit(1);
    }
    
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the program
main().catch(console.error);