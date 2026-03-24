/** Strukturierte API-Fehler */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentifizierung erforderlich') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Keine Berechtigung') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Ressource') {
    super(404, 'NOT_FOUND', `${resource} nicht gefunden`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, string[]>) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class TenantSuspendedError extends AppError {
  constructor() {
    super(403, 'TENANT_SUSPENDED', 'Ihr Account ist gesperrt. Bitte kontaktieren Sie den Support.');
  }
}

export class TrialExpiredError extends AppError {
  constructor() {
    super(403, 'TRIAL_EXPIRED', 'Ihre Testphase ist abgelaufen. Bitte wählen Sie ein Abo.');
  }
}
