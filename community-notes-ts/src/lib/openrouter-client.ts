import axios from 'axios';
import { Config } from '../types';
import { globalLogCollector } from './log-collector';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
}

export class OpenRouterClient {
  private apiKey: string;
  private baseURL = 'https://openrouter.ai/api/v1/chat/completions';
  
  constructor(config: Config) {
    this.apiKey = config.openrouter_api_key;
  }

  private async makeRequest(payload: OpenRouterRequest): Promise<string> {
    const startTime = Date.now();
    const apiCall = {
      timestamp: new Date().toISOString(),
      method: 'POST',
      url: this.baseURL,
      model: payload.model,
      requestBody: payload,
      responseStatus: 0,
      responseBody: null,
      duration: 0,
      error: undefined as string | undefined
    };

    try {
      const response = await axios.post(this.baseURL, payload, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/nathanpmyoung/communitynotes',
          'X-Title': 'Community Notes Writer'
        }
      });

      apiCall.responseStatus = response.status;
      apiCall.responseBody = response.data;
      apiCall.duration = Date.now() - startTime;
      
      globalLogCollector.addAPICall(apiCall);

      return response.data.choices[0].message.content;
    } catch (error) {
      apiCall.duration = Date.now() - startTime;
      
      if (axios.isAxiosError(error)) {
        apiCall.responseStatus = error.response?.status || 0;
        apiCall.error = `${error.response?.status} ${error.response?.data?.error?.message || error.message}`;
        globalLogCollector.addAPICall(apiCall);
        throw new Error(`OpenRouter API error: ${apiCall.error}`);
      }
      
      apiCall.error = error instanceof Error ? error.message : String(error);
      globalLogCollector.addAPICall(apiCall);
      throw error;
    }
  }

  async perplexitySearch(query: string, temperature: number = 0.0): Promise<string> {
    // Using Perplexity's Sonar Reasoning Pro model for web search
    const payload: OpenRouterRequest = {
      model: 'perplexity/sonar-reasoning-pro',  // Perplexity model with web search capabilities
      messages: [
        {
          role: 'system',
          content: 'You are an context and factchecking tool. Search the web for information relating to the following query and always include specific URLs for your sources directly in the text.'
        },
        {
          role: 'user',
          content: query
        }
      ],
      temperature
    };

    return this.makeRequest(payload);
  }

  async claudeAnalyze(prompt: string, temperature: number = 0.0, useSonnet4: boolean = false): Promise<string> {
    const payload: OpenRouterRequest = {
      model: useSonnet4 ? 'anthropic/claude-sonnet-4' : 'anthropic/claude-3.5-sonnet',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature
    };

    return this.makeRequest(payload);
  }

  async identifyMissingContext(postText: string, imagesSummary: string, searchResults: string): Promise<string> {
    const prompt = `Given this X post and search results about it, identify the most important pieces of context that are missing from the post that would help readers understand the full picture.

Focus only on factual context that materially and significantly changes the interpretation of the post. Do not flag opinions, predictions, or minor details.

If no important context is missing, respond with exactly: "NO MISSING CONTEXT"

If important context is missing, list the the most critical missing pieces in order of importance. Be specific and concise. Avoid technicalities, these should be significant errors. With each claim, write all the urls or sources that relate to that claim, in the format. In rare cases, list multiple claims if there are several of equal importance:

[Claim]
Sources:
- Source URL
- Source URL

Post text:
\`\`\`
${postText}
\`\`\`

Images in post:
\`\`\`
${imagesSummary || 'No images'}
\`\`\`

Search results:
\`\`\`
${searchResults}
\`\`\``;

    return this.claudeAnalyze(prompt, 0.0, true);  // Use Sonnet 4 for missing context
  }

  async evaluateSourceTrustworthiness(sourcesText: string): Promise<string> {
    const prompt = `  how likely they are to be trusted by a broad, politically diverse audience.

Consider:
- Domain reputation and credibility
- Primary vs secondary sources  
- Institutional vs partisan sources
- Track record for accuracy
- Cross-partisan acceptance

For each source, provide:
1. The URL
2. Brief reason for the score
3. Trust score (0-100)

Rank them from most to least trusted.

Sources to evaluate:
\`\`\`
${sourcesText}
\`\`\`

Format your response as a numbered list with each entry containing the URL, score, and reason.`;

    return this.claudeAnalyze(prompt, 0.0, true);  // Use Sonnet 4 for source evaluation
  }

  async findContextInSource(sourceContent: string, sourceUrl: string, missingContext: string): Promise<string> {
    const prompt = `Given this source content and a piece of missing context, determine if the source contains information that addresses the missing context.

Missing context needed:
\`\`\`
${missingContext}
\`\`\`

Source URL: ${sourceUrl}

Source content:
\`\`\`
${sourceContent.substring(0, 30000)} // Limit to avoid token issues
\`\`\`

Analyze the source carefully and respond with ONLY:
- "YES" if the source contains relevant information that addresses the missing context
- "NO" if the source does not contain relevant information about the missing context

Do not provide any other text, quotes, or explanations. Just respond with YES or NO.`;

    return this.claudeAnalyze(prompt, 0.0, true);  // Use Sonnet 4 for context verification
  }

}