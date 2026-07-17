import { test } from 'bun:test';
import assert from 'node:assert/strict';
import physics from './physics.ts';

const closeTo = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected} by more than ${tolerance}`);
};

test('polar data loads the complete half-degree chart', () => {
  assert.deepEqual(physics.POLAR.tws, [4, 6, 8, 10, 12, 14, 16, 20, 25, 30]);
  assert.equal(physics.POLAR.points[0].angle, 0);
  assert.equal(physics.POLAR.points.at(-1).angle, 180);
  assert.equal(physics.POLAR.points.length, 289);
});

test('polar lookup returns exact chart values and is tack-symmetric', () => {
  closeTo(physics.polarSpeed(14, 45), 7.86900814);
  closeTo(physics.polarSpeed(14, 90), 8.918735672);
  closeTo(physics.polarSpeed(14, -90), 8.918735672);
  closeTo(physics.polarSpeed(14, 180), 7.256777012);
});

test('polar lookup interpolates between true-wind-speed columns', () => {
  const expected = (7.639891521 + 7.86900814) / 2;
  closeTo(physics.polarSpeed(13, 45), expected);
});

test('headings inside the published beat angle are no-go', () => {
  assert.equal(physics.polarSpeed(14, 36), 0);
  closeTo(physics.polarSpeed(14, 36.5), 7.368753193);
  assert.equal(physics.polarSpeed(2, 42), 0, 'below-chart wind retains the 4 kn no-go angle');
  const state = physics.solveScenario({ windSpeed:14, windAngle:36 });
  assert.equal(state.polar.noGo, true);
  assert.equal(state.boatSpeed, 0);
  closeTo(state.sailAlpha, 0, 1e-12);
});

test('wind-angle input clamps to the nearest edge of the no-go zone', () => {
  closeTo(physics.clampSailableWindAngle(14, 0, 1), 36.5);
  closeTo(physics.clampSailableWindAngle(14, 0, -1), -36.5);
  closeTo(physics.clampSailableWindAngle(14, 12, -1), 36.5);
  closeTo(physics.clampSailableWindAngle(14, -12, 1), -36.5);
  closeTo(physics.clampSailableWindAngle(14, 60, -1), 60);
});

test('true, induced and apparent wind vectors obey vector addition', () => {
  const state = physics.computeState({
    windAngle:45, windSpeed:14, boatSpeed:6.5, sailAngle:-16, helmAngle:6
  });
  closeTo(state.trueWind.x, -9.8994949366, 1e-9);
  closeTo(state.trueWind.y, -9.8994949366, 1e-9);
  closeTo(state.inducedWind.y, -6.5);
  closeTo(state.apparentWind.x, state.trueWind.x + state.inducedWind.x);
  closeTo(state.apparentWind.y, state.trueWind.y + state.inducedWind.y);
});

test('automatic solution uses polar speed and balances yaw and lateral force', () => {
  const state = physics.solveScenario({ windSpeed:14, windAngle:45 });
  closeTo(state.boatSpeed, physics.polarSpeed(14, 45));
  assert.ok(Math.abs(state.yawMoment) < 1, `yaw residual ${state.yawMoment} Nm`);
  assert.ok(Math.abs(state.lateralResidual) < 0.01, `lateral residual ${state.lateralResidual} N`);
  assert.ok(state.sailAngle < 0, 'starboard wind should put the boom to port');
});

test('default close-hauled case is in longitudinal equilibrium at polar speed', () => {
  const state = physics.solveScenario({ windSpeed:14, windAngle:45 });
  assert.ok(state.sailForce.y > 0, `sail drive should be forward, got ${state.sailForce.y} N`);
  assert.equal(state.resistanceModel, 'polar-equilibrium');
  assert.ok(
    Math.abs(state.totalForce.y) < 1,
    `polar speed is a steady-state target, but longitudinal residual is ${state.totalForce.y} N`
  );
});

test('sail trim stays continuous through the deep-reach transition on both tacks', () => {
  for (const tack of [1, -1]) {
    let previous = null;
    for (let angle = 140; angle <= 150; angle += 1) {
      const sailAngle = physics.solveScenario({ windSpeed:14, windAngle:tack * angle }).sailAngle;
      if (previous !== null) {
        assert.ok(
          Math.abs(sailAngle - previous) < 4,
          `sail jumped from ${previous}° to ${sailAngle}° near TWA ${tack * angle}°`
        );
      }
      previous = sailAngle;
    }
  }
});

test('solver remains finite across the chart', () => {
  for (const windSpeed of [0, 4, 8, 14, 20, 30]) {
    for (const windAngle of [-180, -135, -90, -45, 0, 45, 90, 135, 180]) {
      const state = physics.solveScenario({ windSpeed, windAngle });
      for (const value of [
        state.boatSpeed, state.sailAngle, state.helmAngle, state.awSpeed,
        state.totalForce.x, state.totalForce.y, state.leeway, state.yawMoment
      ]) assert.ok(Number.isFinite(value), `${windSpeed} kn / ${windAngle}° produced ${value}`);
    }
  }
});

test('debug report is a compact, self-contained TDD case', () => {
  const report = physics.debugReport(physics.solveScenario({ windSpeed:14, windAngle:45 }));
  assert.equal(report.schema, 'sailboat-tdd/v1');
  assert.deepEqual(report.input, { twa_from_deg:45, tws_kn:14 });
  assert.equal(report.auto.speed_kn, 7.869);
  assert.equal(report.balance.longitudinal_N, 0);
  assert.equal(report.model, 'polar-equilibrium');
  assert.ok(JSON.stringify(report).length < 1400, 'TDD payload should stay easy to paste');
});
