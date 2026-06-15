import type { Request, Response, NextFunction } from "express";

// ── Public error class ────────────────────────────────────────────────────────

export class LLMError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "LLMError";
  }

  static notFound(resource = "Resource"): LLMError {
    return new LLMError(404, "NOT_FOUND", `${resource} not found`);
  }

  static badRequest(message: string, details?: unknown): LLMError {
    return new LLMError(400, "BAD_REQUEST", message, details);
  }

  static forbidden(message = "Forbidden"): LLMError {
    return new LLMError(403, "FORBIDDEN", message);
  }

  static internalError(message = "Internal server error"): LLMError {
    return new LLMError(500, "INTERNAL_ERROR", message);
  }
}

// ── 404 catcher ───────────────────────────────────────────────────────────────

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found` },
  });
}

// ── Global error handler ──────────────────────────────────────────────────────

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req as Request & { id?: string }).id;

  if (err instanceof LLMError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? {},
        requestId,
      },
    });
    return;
  }

  // Zod validation errors are surfaced as plain errors with a specific shape.
  if (
    err instanceof Error &&
    "issues" in err &&
    Array.isArray((err as { issues: unknown[] }).issues)
  ) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: (err as { issues: unknown[] }).issues,
        requestId,
      },
    });
    return;
  }

  // Unhandled errors.
  console.error("[api] unhandled error:", err);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: err instanceof Error ? err.message : "An unexpected error occurred",
      requestId,
    },
  });
}
