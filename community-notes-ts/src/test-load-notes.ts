import fs from 'fs/promises';
import path from 'path';
import { Post } from './types';
import { XAPIClient } from './lib/x-api-client';

/**
 * Test script to load eligible posts and save them to JSON
 * No note writing - just loads posts eligible for Community Notes
 */
async function loadEligiblePosts() {
  console.log('Loading eligible posts for Community Notes...');
  
  try {
    // Initialize X API client
    const xClient = new XAPIClient();
    
    // Load posts (will use mock data or tweets-to-check.json)
    console.log('Fetching eligible posts...');
    const posts = await xClient.getEligiblePosts();
    
    // Limit to 10-50 posts as requested
    const postsToExport = posts.slice(0, Math.min(posts.length, 50));
    console.log(`Found ${postsToExport.length} eligible posts`);
    
    // Create output object with metadata
    const output = {
      metadata: {
        exported_at: new Date().toISOString(),
        total_posts: postsToExport.length,
        source: 'community-notes-ts',
        description: 'Posts eligible for Community Notes writing'
      },
      posts: postsToExport
    };
    
    // Save to JSON file
    const outputPath = path.join(process.cwd(), 'eligible-posts.json');
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
    
    console.log(`\n✓ Successfully saved ${postsToExport.length} posts to: ${outputPath}`);
    
    // Print summary
    console.log(`\nSummary:`);
    console.log(`- Total posts: ${postsToExport.length}`);
    console.log(`- Date range: ${postsToExport[0]?.created_at} to ${postsToExport[postsToExport.length - 1]?.created_at}`);
    console.log(`- Posts with media: ${postsToExport.filter(p => p.media && p.media.length > 0).length}`);
    
  } catch (error) {
    console.error('Error loading posts:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  loadEligiblePosts().then(() => {
    console.log('\n✓ Export completed successfully');
    process.exit(0);
  }).catch(error => {
    console.error('\n✗ Export failed:', error);
    process.exit(1);
  });
}

export { loadEligiblePosts };