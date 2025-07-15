import { Post, NoteResult } from '../types';
import { LogCollector } from '../lib/log-collector';

export function generateHTMLReport(
  post: Post,
  result: NoteResult,
  logCollector: LogCollector
): string {
  const timestamp = new Date().toISOString();
  const summary = logCollector.getSummary();
  
  // Format API calls nicely
  const apiCallsHTML = summary.apiCalls.map((call, i) => {
    // Get the full prompt by combining all messages
    let fullPrompt = '';
    if (call.requestBody?.messages) {
      fullPrompt = call.requestBody.messages.map((msg: any) => {
        return `[${msg.role.toUpperCase()}]:\n${msg.content}`;
      }).join('\n\n');
    }
    
    const responseContent = call.responseBody?.choices?.[0]?.message?.content || '';
    
    return `
      <div class="api-call ${call.error ? 'error' : 'success'}">
        <div class="api-header">
          <span class="api-number">#${i + 1}</span>
          <span class="api-model">${call.model || 'Unknown Model'}</span>
          <span class="api-duration">${call.duration}ms</span>
          <span class="api-status ${call.error ? 'status-error' : 'status-success'}">
            ${call.error ? '❌ Error' : '✅ Success'}
          </span>
        </div>
        
        <div class="api-content">
          <div class="section">
            <h4>Full Request (Exactly as sent to LLM):</h4>
            <pre>${fullPrompt || 'No request body'}</pre>
          </div>
          
          ${responseContent ? `
            <div class="section">
              <h4>Response:</h4>
              <pre>${responseContent}</pre>
            </div>
          ` : ''}
          
          ${call.error ? `
            <div class="section error-section">
              <h4>Error:</h4>
              <pre>${call.error}</pre>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Community Notes Analysis - ${post.id}</title>
  <style>
    * {
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    
    .header {
      background: white;
      padding: 30px;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    
    h1 {
      margin: 0 0 10px 0;
      color: #1da1f2;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .timestamp {
      color: #666;
      font-size: 14px;
    }
    
    .post-section {
      background: white;
      padding: 30px;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    
    .post-content {
      font-size: 18px;
      padding: 20px;
      background: #f8f9fa;
      border-left: 4px solid #1da1f2;
      border-radius: 5px;
    }
    
    .result-section {
      background: white;
      padding: 30px;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    
    .note-text {
      font-size: 16px;
      padding: 20px;
      background: #e8f5e9;
      border: 2px solid #4caf50;
      border-radius: 5px;
      margin: 20px 0;
    }
    
    .refusal {
      font-size: 16px;
      padding: 20px;
      background: #fff3cd;
      border: 2px solid #ffc107;
      border-radius: 5px;
      margin: 20px 0;
    }
    
    .error {
      font-size: 16px;
      padding: 20px;
      background: #f8d7da;
      border: 2px solid #dc3545;
      border-radius: 5px;
      margin: 20px 0;
    }
    
    .api-calls-section {
      background: white;
      padding: 30px;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    
    .api-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    
    .summary-card {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      text-align: center;
    }
    
    .summary-value {
      font-size: 24px;
      font-weight: bold;
      color: #1da1f2;
    }
    
    .summary-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
    }
    
    .api-call {
      border: 1px solid #dee2e6;
      border-radius: 8px;
      margin-bottom: 20px;
      overflow: hidden;
    }
    
    .api-call.error {
      border-color: #dc3545;
    }
    
    .api-header {
      background: #f8f9fa;
      padding: 15px;
      display: flex;
      align-items: center;
      gap: 15px;
      border-bottom: 1px solid #dee2e6;
    }
    
    .api-call.error .api-header {
      background: #f8d7da;
    }
    
    .api-number {
      background: #1da1f2;
      color: white;
      padding: 5px 10px;
      border-radius: 5px;
      font-weight: bold;
    }
    
    .api-model {
      font-weight: bold;
      flex: 1;
    }
    
    .api-duration {
      color: #666;
    }
    
    .status-success {
      color: #28a745;
    }
    
    .status-error {
      color: #dc3545;
    }
    
    .api-content {
      padding: 20px;
    }
    
    .section {
      margin-bottom: 20px;
    }
    
    .section:last-child {
      margin-bottom: 0;
    }
    
    .section h4 {
      margin: 0 0 10px 0;
      color: #495057;
    }
    
    pre {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-wrap: break-word;
      margin: 0;
      font-size: 14px;
      line-height: 1.5;
    }
    
    .error-section pre {
      background: #f8d7da;
      color: #721c24;
    }
    
    .metadata {
      display: flex;
      gap: 20px;
      font-size: 14px;
      color: #666;
      margin-top: 10px;
    }
    
    .tag {
      background: #e9ecef;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔍 Community Notes Analysis Report</h1>
    <div class="timestamp">Generated: ${new Date(timestamp).toLocaleString()}</div>
  </div>
  
  <div class="post-section">
    <h2>📝 Original Post</h2>
    <div class="post-content">${post.text}</div>
    <div class="metadata">
      <span>Post ID: ${post.id}</span>
      <span>Author: ${post.author_id}</span>
      <span>Created: ${new Date(post.created_at).toLocaleString()}</span>
      ${post.media.length > 0 ? `<span>📷 ${post.media.length} media item(s)</span>` : ''}
    </div>
  </div>
  
  <div class="result-section">
    <h2>📊 Analysis Result</h2>
    ${result.note ? `
      <div class="note-text">
        <strong>✅ Generated Note:</strong><br>
        ${result.note.note_text}
      </div>
      <div class="metadata">
        <span>Character count: ${result.note.note_text.length}/280</span>
        ${result.note.misleading_tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
      </div>
    ` : ''}
    
    ${result.refusal ? `
      <div class="refusal">
        <strong>ℹ️ No Note Generated:</strong><br>
        ${result.refusal}
      </div>
    ` : ''}
    
    ${result.error ? `
      <div class="error">
        <strong>❌ Error:</strong><br>
        ${result.error}
      </div>
    ` : ''}
  </div>
  
  <div class="api-calls-section">
    <h2>🔧 API Call Details</h2>
    
    <div class="api-summary">
      <div class="summary-card">
        <div class="summary-value">${summary.totalAPICalls}</div>
        <div class="summary-label">Total API Calls</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${(summary.totalDuration / 1000).toFixed(1)}s</div>
        <div class="summary-label">Total Duration</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${summary.apiErrors}</div>
        <div class="summary-label">API Errors</div>
      </div>
    </div>
    
    <h3>Call History</h3>
    ${apiCallsHTML || '<p>No API calls recorded.</p>'}
  </div>
</body>
</html>`;
}