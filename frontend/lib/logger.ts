import { v4 as uuidv4 } from 'uuid';


type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlation_id: string;
  service: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class Logger {
  private correlationId: string;
  private backendUrl: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';
  private serviceName: string;

  constructor(serviceName: string = 'frontend') {
    this.serviceName = serviceName;
    // Generate or retrieve correlation ID (could be from session storage if we want persistence across reloads)
    if (typeof window !== 'undefined') {
      let cid = sessionStorage.getItem('correlation_id');
      if (!cid) {
        cid = uuidv4();
        sessionStorage.setItem('correlation_id', cid || '');
      }
      this.correlationId = cid || '';
    } else {
      this.correlationId = uuidv4();
    }
  }

  public getCorrelationId(): string {
    return this.correlationId;
  }

  private redact(obj: any): any {
    if (typeof obj === 'string') {
      // Simple email redaction
      if (obj.includes('@')) {
        return obj.replace(/([\w.]+)@([\w.]+)/g, (match, local, domain) => {
          return '***@' + domain;
        });
      }
      return obj;
    }

    if (typeof obj === 'object' && obj !== null) {
      const newObj: any = Array.isArray(obj) ? [] : {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          // Sensitive keys to redact fully
          if (['password', 'token', 'secret', 'authorization'].some(k => key.toLowerCase().includes(k))) {
            newObj[key] = '[REDACTED]';
          } else {
            newObj[key] = this.redact(obj[key]);
          }
        }
      }
      return newObj;
    }

    return obj;
  }

  private async log(level: LogLevel, message: any, ...args: any[]) {
    // Determine message string and context
    let msgStr = '';
    let context: Record<string, any> = {};

    if (typeof message === 'string') {
      msgStr = message;
      // If the last argument is an object and not an error, treat it as context
      if (args.length > 0) {
        const lastArg = args[args.length - 1];
        if (typeof lastArg === 'object' && lastArg !== null && !(lastArg instanceof Error)) {
          context = lastArg;
        }
      }
    } else if (message !== undefined && message !== null) {
      msgStr = String(message);
    }

    // Redact context
    const redactedContext = this.redact(context);

    // Merge args into context if needed, or just pass them to console?
    // For structured logging, we mainly care about the extracted context.

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: msgStr,
      correlation_id: this.correlationId,
      service: this.serviceName,
      ...redactedContext,
    };

    // Console logging (always in dev, maybe restricted in prod)
    const consoleMethod = level === 'info' ? console.log :
      level === 'warn' ? console.warn :
        level === 'error' ? console.error :
          console.debug;

    consoleMethod(`[${level.toUpperCase()}] [${this.serviceName}] ${msgStr}`, ...args);

    // Send to backend in production (or if configured)
    // We send INFO, WARN, and ERROR to the backend for observability.
    if (level === 'error' || level === 'warn' || level === 'info') {
      this.sendToBackend(entry);
    }
  }

  private async sendToBackend(entry: LogEntry) {
    try {
      if (typeof window === 'undefined') return; // Don't try sending from server-side rendering yet

      // Fire and forget, or define logic elsewhere
      fetch(`${this.backendUrl}/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': this.correlationId,
        },
        body: JSON.stringify(entry),
        keepalive: true, // Attempt to ensure request sends even if page unloads
      }).catch(err => {
        console.error('Failed to send log to backend', err);
      });
    } catch {
      // Prevent infinite loops if logging fails
    }
  }

  public debug(message?: any, ...args: any[]) {
    this.log('debug', message, ...args);
  }

  public info(message?: any, ...args: any[]) {
    this.log('info', message, ...args);
  }

  public warn(message?: any, ...args: any[]) {
    this.log('warn', message, ...args);
  }

  public error(message?: any, ...args: any[]) {
    this.log('error', message, ...args);
  }
}

export const logger = new Logger();

export const createLogger = (name: string) => new Logger(name);

// Backwards compatibility for code expecting separated loggers
export const loggers = {
  media: new Logger('media'),
  room: new Logger('room'),
  ui: new Logger('ui'),
  auth: new Logger('auth'),
  // Add other categories as discovered or needed
};
