import {
  NodeDefinitionError,
  type NodeDefinitionWithSchema,
  defineNode,
} from '@midscene/test';
import { runJev } from './runner';
import { jevActInputSchema } from './schema';
import type { JevNodeOptions, JevRunResult } from './types';

/** Create the strict-schema `jevAct` node for a caller-owned Playwright Page. */
export const createJevNodes = <TContext>(
  options: JevNodeOptions<TContext>,
): readonly NodeDefinitionWithSchema<
  typeof jevActInputSchema,
  JevRunResult,
  TContext
>[] => {
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
        'Use JEV to complete a browser goal on the caller-owned Playwright Page.',
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
          summary: `JEV completed ${result.steps} step(s) in ${result.elapsedMs}ms.`,
          data: result,
        };
      },
    }),
  ];
};
