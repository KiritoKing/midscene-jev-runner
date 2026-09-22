import { MAX_FIELD_VALUE_LENGTH, MAX_PAGE_TEXT_LENGTH } from './constants';
import { requestJson } from './http';
import type {
  BrowserAction,
  BrowserSnapshot,
  JevRecentAction,
  TextResponse,
} from './internal-types';
import type { JevTextUsage } from './types';
import { endpoint, isRecord, recentActionsForModel, tokenCount } from './utils';

const parseTextModelJson = (content: string): unknown => {
  const trimmed = content.trim();
  const candidates = [trimmed];
  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu))
    if (match[1]) candidates.push(match[1].trim());
  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart)
    candidates.push(trimmed.slice(objectStart, objectEnd + 1));
  for (const candidate of new Set(candidates)) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next bounded JSON representation.
    }
  }
  throw new Error('Text model returned invalid JSON.');
};

export const generateText = async (
  fetchImpl: typeof globalThis.fetch,
  action: BrowserAction,
  snapshot: BrowserSnapshot,
  goal: string,
  signal: AbortSignal,
  timeoutMs: number,
  usage: JevTextUsage,
  recentActions: JevRecentAction[],
): Promise<string> => {
  const apiKey =
    process.env.MIDSCENE_JEV_TEXT_API_KEY || process.env.MIDSCENE_MODEL_API_KEY;
  const baseUrl =
    process.env.MIDSCENE_JEV_TEXT_BASE_URL ||
    process.env.MIDSCENE_MODEL_BASE_URL;
  const model =
    process.env.MIDSCENE_JEV_TEXT_MODEL_NAME || process.env.MIDSCENE_MODEL_NAME;
  if (!apiKey || !baseUrl || !model)
    throw new Error(
      'Text model environment is required for JEV TYPE_TEXT actions.',
    );
  const raw = await requestJson(
    fetchImpl,
    endpoint(baseUrl, 'chat/completions'),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4_096,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Return JSON with exactly one key, text. Supply the exact replacement string for the selected field only when the goal explicitly provides or unambiguously identifies that value. If it does not, return {"text":null} without extended reasoning. Do not invent personal or secret information.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              goal,
              field: {
                label: action.label,
                role: action.role,
                value: action.currentValue,
              },
              page: {
                title: snapshot.title.slice(0, MAX_FIELD_VALUE_LENGTH),
                text: snapshot.text.slice(0, MAX_PAGE_TEXT_LENGTH),
              },
              recent_actions: recentActionsForModel(recentActions.slice(-6)),
            }),
          },
        ],
      }),
    },
    signal,
    timeoutMs,
  );
  usage.calls += 1;
  const response = raw as TextResponse;
  usage.inputTokens += tokenCount(response.usage?.prompt_tokens);
  usage.outputTokens += tokenCount(response.usage?.completion_tokens);
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== 'string')
    throw new Error('Text model returned no content.');
  const parsed = parseTextModelJson(content);
  if (
    !isRecord(parsed) ||
    typeof parsed.text !== 'string' ||
    !parsed.text.trim() ||
    parsed.text.length > 2_000
  )
    throw new Error('Text model returned no usable value.');
  return parsed.text;
};
