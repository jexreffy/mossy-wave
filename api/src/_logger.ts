type Level = 'INFO' | 'WARN' | 'ERROR';

function log(level: Level, message: string, extra?: Record<string, unknown>) {
  // CloudWatch ingests one JSON object per line
  console.log(JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...extra,
  }));
}

export const logger = {
  info:  (msg: string, extra?: Record<string, unknown>) => log('INFO',  msg, extra),
  warn:  (msg: string, extra?: Record<string, unknown>) => log('WARN',  msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => log('ERROR', msg, extra),
};
