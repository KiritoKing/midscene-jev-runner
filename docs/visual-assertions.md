# Experimental visual assertions

The first multimodal increment is read-only and opt-in. Existing `jevAct`, DOM
assertions, YAML, and caller-owned Page lifecycle are unchanged. No coordinate
executor is added. This is an additive minor-version feature, not a release.

```ts
await evaluateJevAssertion(page, {
  prompt: 'The chart contains a green bar taller than the blue bar',
  visual: { maskSelectors: ['[data-private]'] },
});
```

`waitForJevAssertion` accepts the same options and takes a new viewport screenshot
on every check. Node policy `createJevNodes({ getPage, assertion: { visual: {} } })`
applies to both `jevAssert` and `jevWaitFor`. Per-node YAML `options.visual: {}`
enables it, and `options.visual: false` overrides the policy. Omit `visual` for the
legacy DOM-only observation. Both modes retain two independent Noul questions
(condition satisfied and evidence sufficient) and the pass/fail/indeterminate
threshold contract. A high truth score with insufficient evidence never passes.

## Privacy and evidence scope

Visual mode sends **only the current viewport image**, prompt, and caller-provided
trusted context. It does not attach DOM text, facts, page URL, or title. This avoids
leaking screenshot-masked content through a second DOM channel. Password inputs
are always masked; additional selectors are masked in every attached frame using
Playwright. Mask failures stop the request. Mask selectors do not redact prompt or
trusted context. Screenshots may still contain other private information: callers
must choose masks and authorize transmission to their configured provider.

Images stay in memory and are not attached to results, reports, observer events,
or files by this runner. Custom fetch implementations or upstream infrastructure
may independently log requests. Transport exceptions supplied by a custom fetch
are the caller's responsibility. Screenshot/decode errors are sanitized.

This is not pixel-diff testing. Model confidence is not independent ground truth.
Offscreen, obscured, or masked information should be indeterminate. Padding and
resizing can remove detail. A screenshot is not an atomic snapshot with subsequent
page changes. No cross-frame content or closed-shadow-root masking guarantee is
made beyond Playwright's locator/screenshot behavior.

## Transport and limits

Set `MIDSCENE_JEV_MODEL_NAME=jev-1.14.0` explicitly. `jev-latest` and `jev-1.13.0`
also accept images; Box localization needs 1.14, but this feature uses no Box.
Unknown models fail before capture rather than silently switching evidence modes.
Clef/OpenRouter uses an explicit separate transport: set
`visual: { transport: 'openrouter' }`, `MIDSCENE_JEV_MODEL_NAME=cloudflare/clef`,
and the existing OpenRouter key in `MIDSCENE_JEV_API_KEY`. The default endpoint
is `https://openrouter.ai/api/alpha/decisions`; an explicit base URL must be a full
`/decisions` endpoint. No hostname-based auto-detection occurs. OpenRouter sends
an image_url directly in the top-level state array plus text context, without
TypeSafe assets/header. This does not enable visual `jevAct` or imply official
Midscene's JEV adapter supports Clef. No provider is forcibly pinned; compare
actual reported cost rather than assuming one provider's price.

A fresh UUID appears once in `state.browser_evidence.viewport_image`, with PNG
base64 stored separately in top-level `assets`. Requests containing assets send
`TypeSafe-Danger-Zone-Images: true`. Text still has the existing 40KB request budget;
image bytes do not consume that text budget. A single image is bounded to 16MiB
before and after decoding/re-encoding. PNG/JPEG still images are accepted by the
normalizer, corrupt/animated/other formats rejected. Screenshots are captured in
CSS pixels; aspect-preserving resize caps sides at 1568, with white padding to a
minimum 280 on each side. No coordinates are mapped back to the page.

The assertion timeout bounds screenshot, decode, and request together in visual
mode. Cancellation prevents submission after capture and rejects promptly even
if Playwright's underlying screenshot cannot be cancelled. Wait checks receive
only the remaining wait budget. A capture/request timeout or provider error is
an error, not a negative or successful assertion; no fabricated final verdict.

Verified sources (2026-10-21):
- https://docs.typesafe.ai/images
- https://openrouter.ai/docs/guides/community/multimodal-decisions
- https://docs.typesafe.ai/models
- https://docs.typesafe.ai/primitives/box
- https://github.com/web-infra-dev/midscene/pull/3271

TypeSafe labels image support experimental and its protocol/limits may change.
See [official visual profile](official-visual-profile.md) for the separate public
Midscene 1.16.0 comparison. No live model quality or cost claims are made here.

OpenRouter/Clef additionally uses a conservative 180KiB JPEG budget and 4000-byte
text-state budget because its gateway estimates base64 against a 65k-token limit
and may truncate text around 2k tokens. Images are downscaled to at most 1024,
768, or 512 pixels as necessary and encoded at JPEG quality 75; loss of detail is
a real comparison limitation. This is a protective local bound, not a provider
guarantee or a claim that all 4000-byte multilingual text fits its token window.
