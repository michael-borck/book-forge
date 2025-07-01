/**
 * Error handling and validation types for BookForge
 */

// Base error types
export abstract class BookForgeError extends Error {
  abstract readonly code: string;
  abstract readonly category: ErrorCategory;
  readonly timestamp: Date = new Date();
  readonly retryable: boolean = false;
  readonly userMessage?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      cause?: Error;
      userMessage?: string;
      details?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.userMessage = options?.userMessage;
    this.details = options?.details;
    
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

export type ErrorCategory = 
  | 'provider'
  | 'network'
  | 'configuration'
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'rate_limit'
  | 'quota_exceeded'
  | 'file_system'
  | 'export'
  | 'generation'
  | 'system'
  | 'user_input';

// Specific error types
export class ProviderError extends BookForgeError {
  readonly category = 'provider' as const;
  readonly providerId: string;
  
  constructor(
    providerId: string,
    message: string,
    public readonly code: string,
    options?: {
      cause?: Error;
      userMessage?: string;
      details?: Record<string, unknown>;
      retryable?: boolean;
    }
  ) {
    super(message, options);
    this.providerId = providerId;
    Object.setPrototypeOf(this, ProviderError.prototype);
  }
}

export class NetworkError extends BookForgeError {
  readonly category = 'network' as const;
  readonly retryable = true;
  
  constructor(
    message: string,
    public readonly code: string,
    options?: {
      cause?: Error;
      userMessage?: string;
      details?: Record<string, unknown>;
    }
  ) {
    super(message, options);
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

export class ConfigurationError extends BookForgeError {
  readonly category = 'configuration' as const;
  readonly retryable = false;
  
  constructor(
    message: string,
    public readonly code: string,
    options?: {
      cause?: Error;
      userMessage?: string;
      details?: Record<string, unknown>;
    }
  ) {
    super(message, options);
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

export class ValidationError extends BookForgeError {
  readonly category = 'validation' as const;
  readonly retryable = false;
  readonly fieldErrors: FieldError[];
  
  constructor(
    message: string,
    public readonly code: string,
    fieldErrors: FieldError[] = [],
    options?: {
      cause?: Error;
      userMessage?: string;
      details?: Record<string, unknown>;
    }
  ) {
    super(message, options);
    this.fieldErrors = fieldErrors;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class RateLimitError extends BookForgeError {
  readonly category = 'rate_limit' as const;
  readonly retryable = true;
  readonly retryAfter?: Date;
  
  constructor(
    message: string,
    public readonly code: string,
    retryAfter?: Date,
    options?: {
      cause?: Error;
      userMessage?: string;
      details?: Record<string, unknown>;
    }
  ) {
    super(message, options);
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

export class QuotaExceededError extends BookForgeError {
  readonly category = 'quota_exceeded' as const;
  readonly retryable = false;
  readonly quotaType: 'daily' | 'monthly' | 'total';
  readonly resetTime?: Date;
  
  constructor(
    message: string,
    public readonly code: string,
    quotaType: 'daily' | 'monthly' | 'total',
    resetTime?: Date,
    options?: {
      cause?: Error;
      userMessage?: string;
      details?: Record<string, unknown>;
    }
  ) {
    super(message, options);
    this.quotaType = quotaType;
    this.resetTime = resetTime;
    Object.setPrototypeOf(this, QuotaExceededError.prototype);
  }
}

export class FileSystemError extends BookForgeError {
  readonly category = 'file_system' as const;
  readonly filePath?: string;
  
  constructor(
    message: string,
    public readonly code: string,
    filePath?: string,
    options?: {
      cause?: Error;
      userMessage?: string;
      details?: Record<string, unknown>;
      retryable?: boolean;
    }
  ) {
    super(message, options);
    this.filePath = filePath;
    Object.setPrototypeOf(this, FileSystemError.prototype);
  }
}

export class ExportError extends BookForgeError {
  readonly category = 'export' as const;
  readonly format: string;
  
  constructor(
    message: string,
    public readonly code: string,
    format: string,
    options?: {
      cause?: Error;
      userMessage?: string;
      details?: Record<string, unknown>;
      retryable?: boolean;
    }
  ) {
    super(message, options);
    this.format = format;
    Object.setPrototypeOf(this, ExportError.prototype);
  }
}

export class GenerationError extends BookForgeError {
  readonly category = 'generation' as const;
  readonly bookId?: string;
  readonly chapterId?: string;
  
  constructor(
    message: string,
    public readonly code: string,
    options?: {
      cause?: Error;
      userMessage?: string;
      details?: Record<string, unknown>;
      retryable?: boolean;
      bookId?: string;
      chapterId?: string;
    }
  ) {
    super(message, options);
    this.bookId = options?.bookId;
    this.chapterId = options?.chapterId;
    Object.setPrototypeOf(this, GenerationError.prototype);
  }
}

// Field-level validation errors
export interface FieldError {
  field: string;
  message: string;
  code: string;
  value?: unknown;
}

// Error codes enumeration
export const ERROR_CODES = {
  // Provider errors
  PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  PROVIDER_INVALID_CONFIG: 'PROVIDER_INVALID_CONFIG',
  PROVIDER_API_ERROR: 'PROVIDER_API_ERROR',
  PROVIDER_MODEL_NOT_FOUND: 'PROVIDER_MODEL_NOT_FOUND',
  
  // Network errors
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  NETWORK_CONNECTION_FAILED: 'NETWORK_CONNECTION_FAILED',
  NETWORK_DNS_ERROR: 'NETWORK_DNS_ERROR',
  
  // Configuration errors
  CONFIG_INVALID_FORMAT: 'CONFIG_INVALID_FORMAT',
  CONFIG_MISSING_REQUIRED: 'CONFIG_MISSING_REQUIRED',
  CONFIG_INVALID_VALUE: 'CONFIG_INVALID_VALUE',
  
  // Validation errors
  VALIDATION_REQUIRED_FIELD: 'VALIDATION_REQUIRED_FIELD',
  VALIDATION_INVALID_FORMAT: 'VALIDATION_INVALID_FORMAT',
  VALIDATION_OUT_OF_RANGE: 'VALIDATION_OUT_OF_RANGE',
  VALIDATION_INVALID_TYPE: 'VALIDATION_INVALID_TYPE',
  
  // Authentication errors
  AUTH_INVALID_API_KEY: 'AUTH_INVALID_API_KEY',
  AUTH_EXPIRED_TOKEN: 'AUTH_EXPIRED_TOKEN',
  AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_INSUFFICIENT_PERMISSIONS',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  
  // File system errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_ACCESS_DENIED: 'FILE_ACCESS_DENIED',
  FILE_ALREADY_EXISTS: 'FILE_ALREADY_EXISTS',
  DIRECTORY_NOT_FOUND: 'DIRECTORY_NOT_FOUND',
  DISK_SPACE_INSUFFICIENT: 'DISK_SPACE_INSUFFICIENT',
  
  // Export errors
  EXPORT_FORMAT_NOT_SUPPORTED: 'EXPORT_FORMAT_NOT_SUPPORTED',
  EXPORT_TEMPLATE_NOT_FOUND: 'EXPORT_TEMPLATE_NOT_FOUND',
  EXPORT_CONVERSION_FAILED: 'EXPORT_CONVERSION_FAILED',
  
  // Generation errors
  GENERATION_TOPIC_REQUIRED: 'GENERATION_TOPIC_REQUIRED',
  GENERATION_MODEL_UNAVAILABLE: 'GENERATION_MODEL_UNAVAILABLE',
  GENERATION_CONTENT_FILTERED: 'GENERATION_CONTENT_FILTERED',
  GENERATION_CONTEXT_TOO_LONG: 'GENERATION_CONTEXT_TOO_LONG',
  
  // System errors
  SYSTEM_OUT_OF_MEMORY: 'SYSTEM_OUT_OF_MEMORY',
  SYSTEM_PERMISSION_DENIED: 'SYSTEM_PERMISSION_DENIED',
  SYSTEM_RESOURCE_UNAVAILABLE: 'SYSTEM_RESOURCE_UNAVAILABLE',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// Error context for better debugging and logging
export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  operation?: string;
  component?: string;
  stackTrace?: string;
  systemInfo?: {
    platform: string;
    version: string;
    memory: number;
    uptime: number;
  };
}

// Error reporting and recovery
export interface ErrorReport {
  error: BookForgeError;
  context: ErrorContext;
  timestamp: Date;
  recoveryActions?: RecoveryAction[];
}

export interface RecoveryAction {
  action: string;
  description: string;
  automatic: boolean;
  execute?: () => Promise<void>;
}

// Error handler interface
export interface ErrorHandler {
  canHandle(error: Error): boolean;
  handle(error: BookForgeError, context: ErrorContext): Promise<ErrorHandlerResult>;
}

export interface ErrorHandlerResult {
  handled: boolean;
  retry: boolean;
  userNotification?: {
    type: 'error' | 'warning' | 'info';
    message: string;
    actions?: Array<{
      label: string;
      action: () => void;
    }>;
  };
}

// Utility functions for error handling
export function createProviderError(
  providerId: string,
  message: string,
  code: ErrorCode,
  options?: {
    cause?: Error;
    userMessage?: string;
    details?: Record<string, unknown>;
    retryable?: boolean;
  }
): ProviderError {
  return new ProviderError(providerId, message, code, options);
}

export function createValidationError(
  message: string,
  fieldErrors: FieldError[],
  code: ErrorCode = ERROR_CODES.VALIDATION_INVALID_FORMAT
): ValidationError {
  return new ValidationError(message, code, fieldErrors);
}

export function isRetryableError(error: Error): boolean {
  if (error instanceof BookForgeError) {
    return error.retryable;
  }
  
  // Check for common retryable error patterns
  const retryablePatterns = [
    /timeout/i,
    /connection/i,
    /network/i,
    /rate limit/i,
    /temporary/i,
    /503/,
    /502/,
    /504/,
  ];
  
  return retryablePatterns.some(pattern => pattern.test(error.message));
}

export function getErrorSeverity(error: BookForgeError): 'low' | 'medium' | 'high' | 'critical' {
  switch (error.category) {
    case 'system':
      return 'critical';
    case 'file_system':
    case 'configuration':
      return 'high';
    case 'provider':
    case 'generation':
    case 'export':
      return 'medium';
    default:
      return 'low';
  }
}