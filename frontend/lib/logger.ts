export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

interface LoggerConfig {
  minLevel: LogLevel;
  enableTimestamps: boolean;
  enableColors: boolean;
  enabledNamespaces: string[] | '*';
}

const defaultConfig: LoggerConfig = {
  minLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  enableTimestamps: true,
  enableColors: true,
  enabledNamespaces: '*',
};

let globalConfig = { ...defaultConfig };

export function configureLogger(config: Partial<LoggerConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

class Logger {
  constructor(private namespace: string) {}

  private shouldLog(level: LogLevel): boolean {
    if (LOG_LEVEL_VALUES[level] < LOG_LEVEL_VALUES[globalConfig.minLevel]) return false;
    
    if (globalConfig.enabledNamespaces === '*') return true;
    
    return globalConfig.enabledNamespaces.some(ns => 
      this.namespace.startsWith(ns) || ns === this.namespace
    );
  }

  private formatMessage(level: string, message: string, data?: unknown): string {
    const timestamp = globalConfig.enableTimestamps 
      ? `[${new Date().toISOString().split('T')[1].slice(0, -1)}]` 
      : '';
    
    return `${timestamp} [${this.namespace}] ${level}: ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}`;
  }

  private getColor(level: LogLevel): string {
    if (!globalConfig.enableColors) return '';
    
    const colors: Record<LogLevel, string> = {
      debug: 'color: gray',
      info: 'color: green',
      warn: 'color: orange',
      error: 'color: red',
      none: '',
    };
    
    return colors[level];
  }

  debug(message: string, data?: unknown): void {
    if (process.env.NODE_ENV === 'production') return;
    if (!this.shouldLog('debug')) return;
    const formatted = this.formatMessage('DEBUG', message, data);
    console.log(`%c${formatted}`, this.getColor('debug'));
  }

  info(message: string, data?: unknown): void {
    if (process.env.NODE_ENV === 'production') return;
    if (!this.shouldLog('info')) return;
    const formatted = this.formatMessage('INFO', message, data);
    console.log(`%c${formatted}`, this.getColor('info'));
  }

  warn(message: string, data?: unknown): void {
    if (process.env.NODE_ENV === 'production') return;
    if (!this.shouldLog('warn')) return;
    const formatted = this.formatMessage('WARN', message, data);
    console.warn(`%c${formatted}`, this.getColor('warn'));
  }

  error(message: string, error?: unknown): void {
    if (process.env.NODE_ENV === 'production') return;
    if (!this.shouldLog('error')) return;
    const errorData = error instanceof Error 
      ? { message: error.message, stack: error.stack }
      : error;
    const formatted = this.formatMessage('ERROR', message, errorData);
    console.error(`%c${formatted}`, this.getColor('error'));
  }

  time(label: string): { end: () => void } {
    const startTime = performance.now();
    
    return {
      end: () => {
        const duration = performance.now() - startTime;
        this.debug(`${label} took ${duration.toFixed(2)}ms`);
      }
    };
  }

  group(label: string): { end: () => void } {
    if (process.env.NODE_ENV === 'production') return { end: () => {} };
    if (!this.shouldLog('info')) return { end: () => {} };
    
    console.group(`[${this.namespace}] ${label}`);
    return {
      end: () => console.groupEnd()
    };
  }

  table(data: unknown[]): void {
    if (process.env.NODE_ENV === 'production') return;
    if (!this.shouldLog('info')) return;
    console.table(data);
  }

  assert(condition: boolean, message: string): void {
    if (process.env.NODE_ENV === 'production') return;
    if (!condition) {
      this.error(`Assertion failed: ${message}`);
    }
  }

  trace(message: string): void {
    if (process.env.NODE_ENV === 'production') return;
    if (!this.shouldLog('debug')) return;
    console.trace(`[${this.namespace}] ${message}`);
  }
}

const loggerCache = new Map<string, Logger>();

export function createLogger(namespace: string): Logger {
  if (!loggerCache.has(namespace)) {
    loggerCache.set(namespace, new Logger(namespace));
  }
  return loggerCache.get(namespace)!;
}

// Pre-configured loggers for common modules
export const loggers = {
  webrtc: createLogger('WebRTC'),
  websocket: createLogger('WebSocket'),
  media: createLogger('Media'),
  room: createLogger('Room'),
  ui: createLogger('UI'),
};
