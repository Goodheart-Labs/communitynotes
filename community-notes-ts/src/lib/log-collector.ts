export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

export interface APICallLog {
  timestamp: string;
  method: string;
  url: string;
  model?: string;
  requestBody?: any;
  responseStatus?: number;
  responseBody?: any;
  duration: number;
  error?: string;
}

export class LogCollector {
  private logs: LogEntry[] = [];
  private apiCalls: APICallLog[] = [];
  private originalConsole: {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
  };
  private intercepting = false;

  constructor() {
    // Store original console methods
    this.originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug
    };
  }

  startCollecting() {
    if (this.intercepting) return;
    
    this.intercepting = true;
    this.logs = [];
    this.apiCalls = [];

    // Intercept console methods
    console.log = (...args) => {
      this.addLog('info', args.join(' '));
      this.originalConsole.log(...args);
    };

    console.warn = (...args) => {
      this.addLog('warn', args.join(' '));
      this.originalConsole.warn(...args);
    };

    console.error = (...args) => {
      this.addLog('error', args.join(' '));
      this.originalConsole.error(...args);
    };

    console.debug = (...args) => {
      this.addLog('debug', args.join(' '));
      this.originalConsole.debug(...args);
    };
  }

  stopCollecting() {
    if (!this.intercepting) return;
    
    // Restore original console methods
    console.log = this.originalConsole.log;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.debug = this.originalConsole.debug;
    
    this.intercepting = false;
  }

  addLog(level: LogEntry['level'], message: string, data?: any) {
    this.logs.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    });
  }

  addAPICall(call: APICallLog) {
    this.apiCalls.push(call);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  getAPICalls(): APICallLog[] {
    return [...this.apiCalls];
  }

  clear() {
    this.logs = [];
    this.apiCalls = [];
  }

  getSummary() {
    const totalAPICalls = this.apiCalls.length;
    const totalDuration = this.apiCalls.reduce((sum, call) => sum + call.duration, 0);
    const errors = this.logs.filter(log => log.level === 'error').length;
    const apiErrors = this.apiCalls.filter(call => call.error).length;

    return {
      totalLogs: this.logs.length,
      totalAPICalls,
      totalDuration,
      errors,
      apiErrors,
      logs: this.logs,
      apiCalls: this.apiCalls
    };
  }
}

// Global instance for easy access
export const globalLogCollector = new LogCollector();