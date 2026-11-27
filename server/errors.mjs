export class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}
export const invalid = (message) => { throw new ApiError(400, "validation_error", message); };
