import { z } from '@midscene/test';
import {
  DEFAULT_MAX_STEPS,
  DEFAULT_MAX_TASK_MS,
  MAX_ASSERTION_CONTEXT_LENGTH,
  MAX_GOAL_LENGTH,
} from './constants';

export const jevActInputSchema = z.strictObject({
  goal: z
    .string()
    .max(MAX_GOAL_LENGTH)
    .regex(/\S/u, 'goal must contain a non-whitespace character')
    .describe(
      'A browser action task without text input; orchestration belongs to Midscene Test.',
    ),
  maxSteps: z.number().int().positive().default(DEFAULT_MAX_STEPS),
  maxTaskMs: z.number().int().positive().default(DEFAULT_MAX_TASK_MS),
});

export type JevActNodeInput = z.infer<typeof jevActInputSchema>;

export const jevAssertOptionsInputSchema = z.strictObject({
  context: z
    .string()
    .max(MAX_GOAL_LENGTH)
    .max(MAX_ASSERTION_CONTEXT_LENGTH)
    .optional()
    .describe('Additional trusted facts or constraints for this assertion.'),
});

export const jevAssertInputSchema = z.strictObject({
  prompt: z
    .string()
    .max(MAX_GOAL_LENGTH)
    .regex(/\S/u, 'prompt must contain a non-whitespace character')
    .describe('The observable browser condition that must be true.'),
  message: z.string().optional().describe('The assertion failure message.'),
  options: jevAssertOptionsInputSchema.optional(),
});

export type JevAssertNodeInput = z.infer<typeof jevAssertInputSchema>;

export const jevWaitForInputSchema = z.strictObject({
  prompt: z
    .string()
    .max(MAX_GOAL_LENGTH)
    .regex(/\S/u, 'prompt must contain a non-whitespace character'),
  options: z
    .strictObject({
      timeoutMs: z.number().int().positive().default(15_000),
      checkIntervalMs: z.number().int().positive().default(3_000),
      context: z.string().max(MAX_ASSERTION_CONTEXT_LENGTH).optional(),
    })
    .optional(),
});

export type JevWaitForNodeInput = z.infer<typeof jevWaitForInputSchema>;
