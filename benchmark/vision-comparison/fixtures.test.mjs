import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, seeds, tasks } from './fixtures.mjs';

test('gold is independent of model verdicts and rejects wrong actions', () => {
  for (const seed of seeds) {
    const byId = (id) =>
      fixture(
        tasks.find((t) => t.id === id),
        seed,
      );
    const identity = byId('dom-identity');
    assert.equal(identity.success(), false);
    identity.record('Cedar');
    assert.equal(identity.success(), true);
    identity.record('Maple');
    assert.equal(identity.success(), false);
    const prerequisite = byId('dom-prerequisite');
    prerequisite.record('submitted');
    prerequisite.record('consent-on');
    assert.equal(prerequisite.success(), false);
    assert.equal(byId('canvas-present').truth, true);
    assert.equal(byId('canvas-absent').truth, false);
    const preserve = byId('dom-preserve');
    assert.equal(preserve.success(), true);
    preserve.record('off');
    assert.equal(preserve.success(), false);
  }
});

test('canvas hit oracle rejects red-square and out-of-target clicks', () => {
  for (const seed of seeds) {
    const task = tasks.find((t) => t.id === 'canvas-target');
    const sample = fixture(task, seed);
    assert.equal(sample.success(), false);
    sample.record({
      x: 120 + ((seed * 47) % 400),
      y: 150 + ((seed * 31) % 220),
    });
    assert.equal(sample.success(), true);
    sample.record({ x: 750, y: 170 });
    assert.equal(sample.success(), false);
    assert.equal(sample.misclicks(), 1);
  }
});
