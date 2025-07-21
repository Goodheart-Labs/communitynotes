import { Post, NoteResult } from '../types';
import { LogCollector } from '../lib/log-collector';

interface BatchResult {
  post: Post;
  result: NoteResult;
  logs: string[];
  htmlReport: string;
}

export function generateBatchHTMLReport(results: BatchResult[]): string {
  const timestamp = new Date().toISOString();
  
  // Count results by type
  const stats = {
    total: results.length,
    notesGenerated: results.filter(r => r.result.note).length,
    refusals: results.filter(r => r.result.refusal).length,
    errors: results.filter(r => r.result.error).length,
  };

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Community Notes Batch Report - ${timestamp}</title>
  <style>
    * {
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    
    .header {
      background: white;
      padding: 30px;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      margin-bottom: 30px;
    }
    
    h1 {
      margin: 0 0 20px 0;
      color: #1da1f2;
      font-size: 32px;
    }
    
    .stats {
      display: flex;
      gap: 20px;
      margin-top: 20px;
    }
    
    .stat-card {
      flex: 1;
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      text-align: center;
    }
    
    .stat-number {
      font-size: 36px;
      font-weight: bold;
      color: #1da1f2;
    }
    
    .stat-label {
      color: #666;
      font-size: 14px;
    }
    
    .results-container {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    
    .result-card {
      background: white;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    
    .result-header {
      padding: 20px;
      cursor: pointer;
      user-select: none;
      display: flex;
      align-items: start;
      gap: 15px;
    }
    
    .result-status {
      font-size: 24px;
      flex-shrink: 0;
    }
    
    .result-summary {
      flex: 1;
    }
    
    .post-text {
      font-size: 16px;
      margin: 10px 0;
      color: #333;
    }
    
    .note-generated {
      background: #e8f5e9;
      padding: 15px;
      border-radius: 5px;
      margin: 10px 0;
    }
    
    .refusal-message {
      background: #fff3cd;
      padding: 15px;
      border-radius: 5px;
      margin: 10px 0;
      color: #856404;
    }
    
    .error-message {
      background: #f8d7da;
      padding: 15px;
      border-radius: 5px;
      margin: 10px 0;
      color: #721c24;
    }
    
    .expand-arrow {
      font-size: 20px;
      color: #666;
      transition: transform 0.3s;
    }
    
    .expanded .expand-arrow {
      transform: rotate(90deg);
    }
    
    .result-details {
      display: none;
      border-top: 1px solid #e0e0e0;
      background: #f8f9fa;
    }
    
    .expanded .result-details {
      display: block;
    }
    
    .details-content {
      padding: 20px;
    }
    
    .phase-section {
      margin-bottom: 20px;
      padding: 15px;
      background: white;
      border-radius: 5px;
    }
    
    .phase-title {
      font-weight: bold;
      color: #1da1f2;
      margin-bottom: 10px;
    }
    
    .log-entry {
      font-family: monospace;
      font-size: 13px;
      margin: 5px 0;
      padding: 5px;
      background: #f5f5f5;
      border-radius: 3px;
    }
    
    .post-id {
      color: #666;
      font-size: 12px;
      margin-top: 5px;
    }
    
    @media (max-width: 768px) {
      .stats {
        flex-direction: column;
      }
    }
  </style>
  <script>
    function toggleResult(index) {
      const card = document.getElementById('result-' + index);
      card.classList.toggle('expanded');
    }
  </script>
</head>
<body>
  <div class="header">
    <h1>🤖 Community Notes Batch Report</h1>
    <div style="color: #666;">Generated: ${timestamp}</div>
    
    <div class="stats">
      <div class="stat-card">
        <div class="stat-number">${stats.total}</div>
        <div class="stat-label">Posts Processed</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${stats.notesGenerated}</div>
        <div class="stat-label">Notes Generated</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${stats.refusals}</div>
        <div class="stat-label">Refusals</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${stats.errors}</div>
        <div class="stat-label">Errors</div>
      </div>
    </div>
  </div>
  
  <div class="results-container">
    ${results.map((batch, index) => {
      const { post, result } = batch;
      let statusIcon = '❓';
      let statusColor = '#666';
      
      if (result.note) {
        statusIcon = '✅';
        statusColor = '#4caf50';
      } else if (result.refusal) {
        statusIcon = '✋';
        statusColor = '#ff9800';
      } else if (result.error) {
        statusIcon = '❌';
        statusColor = '#f44336';
      }
      
      return `
        <div class="result-card" id="result-${index}">
          <div class="result-header" onclick="toggleResult(${index})">
            <div class="result-status" style="color: ${statusColor};">${statusIcon}</div>
            <div class="result-summary">
              ${result.note ? `
                <div class="note-generated">
                  <strong>Note:</strong> ${escapeHtml(result.note.note_text)}
                </div>
              ` : ''}
              ${result.refusal ? `
                <div class="refusal-message">
                  <strong>Refusal:</strong> ${escapeHtml(result.refusal)}
                </div>
              ` : ''}
              ${result.error ? `
                <div class="error-message">
                  <strong>Error:</strong> ${escapeHtml(result.error)}
                </div>
              ` : ''}
              <div class="post-id">Post ID: ${post.id}</div>
            </div>
            <div class="expand-arrow">▶</div>
          </div>
          
          <div class="result-details">
            <div class="details-content">
              <iframe src="${batch.htmlReport}" style="width: 100%; height: 800px; border: none; border-radius: 5px;"></iframe>
            </div>
          </div>
        </div>
      `;
    }).join('')}
  </div>
</body>
</html>`;

  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}