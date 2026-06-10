type LogLevel = "info" | "warn" | "error" | "debug";

const colors = {
  info: "\x1b[36m", // Cyan
  warn: "\x1b[33m", // Yellow
  error: "\x1b[31m", // Red
  debug: "\x1b[35m", // Magenta
  reset: "\x1b[0m",
};

const formatMessage = (
  level: LogLevel,
  message: string,
  meta?: object,
): string => {
  const timestamp = new Date().toISOString();
  const metaString = meta ? ` ${JSON.stringify(meta)}` : "";
  return `${colors[level]}[${timestamp}] [${level.toUpperCase()}]${colors.reset} ${message}${metaString}`;
};

export const logger = {
  info: (message: string, meta?: object) => {
    console.log(formatMessage("info", message, meta));
  },

  warn: (message: string, meta?: object) => {
    console.warn(formatMessage("warn", message, meta));
  },

  error: (message: string, meta?: object) => {
    console.error(formatMessage("error", message, meta));
  },

  debug: (message: string, meta?: object) => {
    if (process.env.NODE_ENV !== "production") {
      console.log(formatMessage("debug", message, meta));
    }
  },
};
