import axios from 'axios';
import { Config } from '../types';
import { LogCollector, globalLogCollector } from './log-collector';

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
  private logCollector: LogCollector;
  
  constructor(config: Config, logCollector?: LogCollector) {
    this.apiKey = config.openrouter_api_key;
    this.logCollector = logCollector || globalLogCollector;
  }

  private async makeRequest(payload: OpenRouterRequest): Promise<string> {
    console.log(`🔄 Making OpenRouter request to model: ${payload.model}`);
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
      
      this.logCollector.addAPICall(apiCall);
      
      const content = response.data.choices[0].message.content;
      console.log(`✅ OpenRouter response received (${apiCall.duration}ms)`);
      return content;
    } catch (error) {
      apiCall.duration = Date.now() - startTime;
      
      if (axios.isAxiosError(error)) {
        apiCall.responseStatus = error.response?.status || 0;
        apiCall.error = `${error.response?.status} ${error.response?.data?.error?.message || error.message}`;
        this.logCollector.addAPICall(apiCall);
        console.error(`❌ OpenRouter API error: ${apiCall.error}`);
        throw new Error(`OpenRouter API error: ${apiCall.error}`);
      }
      
      apiCall.error = error instanceof Error ? error.message : String(error);
      this.logCollector.addAPICall(apiCall);
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

Please start by responding with one of the following statuses "TWEET NOT SIGNIFICANTLY INCORRECT" "NO MISSING CONTEXT" "CORRECTION WITH TRUSTWORTHY CITATION" "CORRECTION WITHOUT TRUSTWORTHY CITATION"

If important context is missing, write a community note to correct the claim. Always include a URL, if no url is possible respond with the relevant status. After the status, no more than 500 characters, including the URL

[Status]

[Short correction of most significant error]

[URL of most trustworthy source]

Post perhaps in need of community note:
\`\`\`
${postText}
\`\`\`

Images in post:
\`\`\`
${imagesSummary || 'No images'}
\`\`\`

Perpelexity search results (please use citations in these to correct post):
\`\`\`
${searchResults}
\`\`\``;

    return this.claudeAnalyze(prompt, 0.0, true);  // Use Sonnet 4 for missing context
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
- "YES" if the source justifies the claim, such that a person could read it and agree with the correction
- "NO" if the source is not very clear on the claim given, in any way.

Do not provide any other text, quotes, or explanations. Just respond with YES or NO.`;

    return this.claudeAnalyze(prompt, 0.0, true);  // Use Sonnet 4 for context verification
  }

}