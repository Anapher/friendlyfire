export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

export function domainError(code: string, message: string): DomainError {
  return new DomainError(message, code);
}
