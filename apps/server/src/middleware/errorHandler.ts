import { Request, Response, NextFunction } from "express";
import { AppError, ValidationError } from "../utils/AppError";
import { HttpStatus } from "../utils/httpStatus";
import { logger } from "../utils/logger";

interface ErrorResponse {
  success: false;
  message: string;
  code?: string;
  errors?: Record<string, string[]>;
  stack?: string;
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Pick a log level based on what kind of failure this is. Previously
  // every error funnelled through logger.error with the full stack —
  // which means routine 4xx noise (a logged-out user polling, a stale
  // session hitting an auth-guarded route, a 404 from a deleted record)
  // flooded the log with ERROR lines and stack traces, drowning real
  // server bugs.
  //
  // Severity rules:
  //   401 / 403  → WARN, one-line. Auth/permission failures are
  //                expected during normal operation (logout in flight,
  //                wrong role on shared dashboards, polling clients
  //                during transitions). Not a server bug.
  //   Other 4xx  → INFO, one-line. Client made a bad request —
  //                worth tracking but not actionable for server team.
  //   5xx / unknown → ERROR with stack. These are real bugs.
  const isAppError = err instanceof AppError;
  const statusCode = isAppError
    ? err.statusCode
    : HttpStatus.INTERNAL_SERVER_ERROR;
  const baseMeta = {
    path: req.path,
    method: req.method,
    ip: req.ip,
  };

  if (statusCode >= 500) {
    logger.error(err.message, { ...baseMeta, stack: err.stack });
  } else if (statusCode === 401 || statusCode === 403) {
    logger.warn(err.message, baseMeta);
  } else if (statusCode >= 400) {
    logger.info(err.message, baseMeta);
  } else {
    // Defensive: anything that fell out of the AppError branches without
    // a clear status — keep the full stack trace for debugging.
    logger.error(err.message, { ...baseMeta, stack: err.stack });
  }

  // Handle known operational errors
  if (err instanceof AppError) {
    const response: ErrorResponse = {
      success: false,
      message: err.message,
      code: err.code,
    };

    // Include validation errors if present
    if (err instanceof ValidationError) {
      response.errors = err.errors;
    }

    // Include stack trace in development
    if (process.env.NODE_ENV === "development") {
      response.stack = err.stack;
    }

    return res.status(err.statusCode).json(response);
  }

  // Handle Prisma errors
  if (err.name === "PrismaClientKnownRequestError") {
    const prismaError = err as any;

    if (prismaError.code === "P2002") {
      return res.status(HttpStatus.CONFLICT).json({
        success: false,
        message: "A record with this value already exists",
        code: "DUPLICATE_ENTRY",
      });
    }

    if (prismaError.code === "P2025") {
      return res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: "Record not found",
        code: "NOT_FOUND",
      });
    }
  }

  // Handle unknown errors
  const response: ErrorResponse = {
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
    code: "INTERNAL_ERROR",
  };

  if (process.env.NODE_ENV === "development") {
    response.stack = err.stack;
  }

  return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(response);
};
