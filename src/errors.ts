import type { JevRunResult } from './types';

export class JevRunError extends Error {
  readonly result: JevRunResult;

  constructor(message: string, result: JevRunResult, options?: ErrorOptions) {
    super(message, options);
    this.name = 'JevRunError';
    this.result = result;
  }
}
