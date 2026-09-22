import { z } from '@midscene/test';
import { DEFAULT_MAX_STEPS, DEFAULT_MAX_TASK_MS } from './constants';

export const jevActInputSchema = z.strictObject({
  goal: z.string().min(1).describe('The browser task for JEV to complete.'),
  maxSteps: z.number().int().positive().default(DEFAULT_MAX_STEPS),
  maxTaskMs: z.number().int().positive().default(DEFAULT_MAX_TASK_MS),
});

export type JevActNodeInput = z.infer<typeof jevActInputSchema>;
