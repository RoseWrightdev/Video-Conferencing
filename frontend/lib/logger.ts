import { v4 as uuidv4 } from 'uuid';

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlation_id: string;
  service: 'frontend';
  [key: string]: any;
}

class Logger {
  private correlationId: string;
  private backendUrl: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';

  constructor() {
    // Generate or retrieve correlation ID (could be from session storage if we want persistence across reloads)
    if (typeof window !== 'undefined') {
      let cid = sessionStorage.getItem('correlation_id');
      if (!cid) {
        cid = uuidv4();
        sessionStorage.setItem('correlation_id', cid);
      }
      this.correlationId = cid;
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

  private async log(level: LogLevel, message: string, context: Record<string, any> = {}) {
    // Redact context
    const redactedContext = this.redact(context);

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlation_id: this.correlationId,
      service: 'frontend',
      ...redactedContext,
    };

    // Console logging (always in dev, maybe restricted in prod)
    const consoleMethod = level === 'info' ? console.log : level === 'warn' ? console.warn : console.error;
    consoleMethod(`[${level.toUpperCase()}] ${message}`, redactedContext);

    // Send to backend in production (or if configured)
    // For this MVP, we indiscriminately try to send errors and warnings to backend
    if (level === 'error' || level === 'warn') {
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
    } catch (e) {
      // Prevent infinite loops if logging fails
    }
  }

  public info(message: string, context?: Record<string, any>) {
    this.log('info', message, context);
  }

  public warn(message: string, context?: Record<string, any>) {
    this.log('warn', message, context);
  }

  public error(message: string, context?: Record<string, any>) {
    this.log('error', message, context);
  }
}

export const logger = new Logger();
