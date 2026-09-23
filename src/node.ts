import {
  NodeDefinitionError,
  type NodeDefinitionWithSchema,
  NodeExecutionError,
  defineNode,
} from '@midscene/test';
import { evaluateJevAssertion } from './assertion';
import { runJev } from './runner';
import {
  jevActInputSchema,
  jevAssertInputSchema,
  jevWaitForInputSchema,
} from './schema';
import type {
  JevAssertionResult,
  JevNodeOptions,
  JevRunResult,
  JevWaitForResult,
} from './types';
import { waitForJevAssertion } from './wait-for';

type JevNodeDefinition<TContext> =
  | NodeDefinitionWithSchema<typeof jevActInputSchema, JevRunResult, TContext>
  | NodeDefinitionWithSchema<
      typeof jevAssertInputSchema,
      JevAssertionResult,
      TContext
    >
  | NodeDefinitionWithSchema<
      typeof jevWaitForInputSchema,
      JevWaitForResult,
      TContext
    >;

/** Create strict-schema JEV nodes for a caller-owned Playwright Page. */
export const createJevNodes = <TContext>(
  options: JevNodeOptions<TContext>,
): readonly JevNodeDefinition<TContext>[] => {
  if (
    !options ||
    typeof options !== 'object' ||
    typeof options.getPage !== 'function'
  )
    throw new NodeDefinitionError('createJevNodes() requires getPage.');
  return [
    defineNode<typeof jevActInputSchema, JevRunResult, TContext>({
      name: 'jevAct',
      description:
        'Use JEV to perform a browser action task without text input on the caller-owned Playwright Page.',
      stringInputKey: false,
      inputSchema: jevActInputSchema,
      async execute(execution) {
        const page = await options.getPage(execution);
        execution.signal.throwIfAborted();
        const result = await runJev(page, {
          ...execution.input,
          signal: execution.signal,
          verifyCompletion: options.verifyCompletion,
          observer: options.observer,
        });
        return {
          summary: `JEV finished after ${result.steps} decision(s); completion ${result.completionVerified ? 'independently verified' : 'reported by the model'}.`,
          data: result,
        };
      },
    }),
    defineNode<typeof jevAssertInputSchema, JevAssertionResult, TContext>({
      name: 'jevAssert',
      description:
        'Use JEV to assert an observable condition on the caller-owned Playwright Page.',
      stringInputKey: 'prompt',
      inputSchema: jevAssertInputSchema,
      async execute(execution) {
        const input =
          typeof execution.input === 'string'
            ? { prompt: execution.input }
            : execution.input;
        const page = await options.getPage(execution);
        execution.signal.throwIfAborted();
        const result = await evaluateJevAssertion(page, {
          prompt: input.prompt,
          context: input.options?.context,
          ...options.assertion,
          signal: execution.signal,
        });
        const summary = `JEV assertion ${result.verdict}: ${input.prompt}`;
        const output = { summary, data: result };
        if (!result.pass) {
          const defaultMessage =
            result.verdict === 'fail'
              ? `Assertion failed: ${input.prompt}`
              : `Assertion was indeterminate because the current evidence was insufficient or ambiguous: ${input.prompt}`;
          throw new NodeExecutionError(
            'jevAssert',
            new Error(input.message || defaultMessage),
            output,
          );
        }
        return output;
      },
    }),
    defineNode<typeof jevWaitForInputSchema, JevWaitForResult, TContext>({
      name: 'jevWaitFor',
      description:
        'Wait for an observable condition on the caller-owned Playwright Page using repeated read-only JEV assertions.',
      stringInputKey: 'prompt',
      inputSchema: jevWaitForInputSchema,
      async execute(execution) {
        const input =
          typeof execution.input === 'string'
            ? { prompt: execution.input }
            : execution.input;
        const page = await options.getPage(execution);
        execution.signal.throwIfAborted();
        const result = await waitForJevAssertion(page, {
          prompt: input.prompt,
          context: input.options?.context,
          timeoutMs: input.options?.timeoutMs,
          checkIntervalMs: input.options?.checkIntervalMs,
          ...options.assertion,
          signal: execution.signal,
        });
        const output = {
          summary: `JEV wait ${result.pass ? 'satisfied' : 'timed out'} after ${result.attempts} check(s): ${input.prompt}`,
          data: result,
        };
        if (!result.pass)
          throw new NodeExecutionError(
            'jevWaitFor',
            new Error(
              `Condition was not observed before timeout: ${input.prompt}`,
            ),
            output,
          );
        return output;
      },
    }),
  ];
};
