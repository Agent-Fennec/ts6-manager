import { AppError } from '../middleware/error-handler.js';

export function parseIntParam(val: string | string[], name = 'id'): number {
  const str = Array.isArray(val) ? val[0] : val;
  const n = parseInt(str, 10);
  if (isNaN(n)) throw new AppError(400, `Invalid ${name}: must be a number`);
  return n;
}
