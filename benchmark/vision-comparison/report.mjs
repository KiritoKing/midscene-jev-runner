import { readFile } from 'node:fs/promises';
const rows = (
  await Promise.all(
    process.argv
      .slice(2)
      .map(async (path) => JSON.parse(await readFile(path, 'utf8')).rows),
  )
)
  .flat()
  .filter((r) => !r.smoke);
const groups = new Map();
for (const row of rows) {
  const key = `${row.profile}/${row.track}/${row.kind ?? 'assertion'}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}
const quantile = (values, p) => {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.max(0, Math.ceil(p * v.length) - 1)] : null;
};
const sumComplete = (rows, key) =>
  rows.length && rows.every((r) => Number.isFinite(r[key]))
    ? rows.reduce((n, r) => n + r[key], 0)
    : null;
console.log(
  JSON.stringify(
    [...groups].map(([group, all]) => {
      const measured = all.filter((r) => r.status !== 'unsupported');
      const negatives = measured.filter((r) => r.truth === false);
      return {
        group,
        recorded: all.length,
        unsupported: all.length - measured.length,
        measured: measured.length,
        indeterminate: measured.filter((r) => r.verdict === 'indeterminate')
          .length,
        errors: measured.filter((r) => r.status === 'error').length,
        correctOrSuccessful: measured.filter(
          (r) => r.correct === true || r.success === true,
        ).length,
        falsePositives: negatives.filter((r) => r.falsePositive === true)
          .length,
        negativeCases: negatives.length,
        p50EndToEndMs: quantile(
          measured.map((r) => r.endToEndMs),
          0.5,
        ),
        p95EndToEndMs: quantile(
          measured.map((r) => r.endToEndMs),
          0.95,
        ),
        p50RequestWallMs: quantile(
          measured.map((r) => r.requestWallMs),
          0.5,
        ),
        p95RequestWallMs: quantile(
          measured.map((r) => r.requestWallMs),
          0.95,
        ),
        costActualUsd: sumComplete(measured, 'costActualUsd'),
        costEstimatedUsd: sumComplete(measured, 'costEstimatedUsd'),
        misclicks: sumComplete(
          measured.filter((r) => r.kind === 'action'),
          'misclicks',
        ),
      };
    }),
    null,
    2,
  ),
);
