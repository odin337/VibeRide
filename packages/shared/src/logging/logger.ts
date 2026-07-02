export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Readonly<Record<string, unknown>>;

/**
 * Structured logger contract. Frontend uses createConsoleLogger (JSON
 * lines, level-gated); the backend adapts pino to this same interface.
 * Application code never calls console.* directly — enforced by ESLint.
 */
export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

const LEVEL_WEIGHT: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type LogSink = (level: LogLevel, line: string) => void;

/* eslint-disable no-console -- the single sanctioned console sink; every
   other file in the monorepo is denied console access by ESLint. */
const defaultSink: LogSink = (level, line) => {
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.info(line);
  }
};
/* eslint-enable no-console */

class StructuredLogger implements Logger {
  constructor(
    private readonly minLevel: LogLevel,
    private readonly bindings: LogFields,
    private readonly sink: LogSink,
    private readonly now: () => string,
  ) {}

  private log(level: LogLevel, message: string, fields?: LogFields): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.minLevel]) {
      return;
    }
    const record: Record<string, unknown> = {
      level,
      time: this.now(),
      msg: message,
      ...this.bindings,
      ...fields,
    };
    this.sink(level, JSON.stringify(record));
  }

  debug(message: string, fields?: LogFields): void {
    this.log('debug', message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.log('info', message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.log('warn', message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.log('error', message, fields);
  }

  child(bindings: LogFields): Logger {
    return new StructuredLogger(
      this.minLevel,
      { ...this.bindings, ...bindings },
      this.sink,
      this.now,
    );
  }
}

export interface ConsoleLoggerOptions {
  readonly minLevel?: LogLevel;
  readonly bindings?: LogFields;
  /** Injectable for tests. */
  readonly sink?: LogSink;
  /** Injectable clock for tests. */
  readonly now?: () => string;
}

export function createConsoleLogger(options: ConsoleLoggerOptions = {}): Logger {
  return new StructuredLogger(
    options.minLevel ?? 'info',
    options.bindings ?? {},
    options.sink ?? defaultSink,
    options.now ?? (() => new Date().toISOString()),
  );
}

/** Discards everything — useful default for library modules. */
export const noopLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => noopLogger,
};
