import { describe, expect, test } from 'bun:test';
import { solveAnchorGeometry } from './anchor-geometry.ts';

describe('anchor-chain slope geometry', () => {
  test('preserves the commanded chain length on every terrain', () => {
    for (const slope of [0,Math.PI/36,Math.PI/12]) {
      const geometry=solveAnchorGeometry(8,40,18,slope);
      expect(geometry.suspendedLength+geometry.onSeabed).toBeCloseTo(40,8);
      expect(Number.isFinite(geometry.totalHorizontal)).toBe(true);
      expect(Number.isFinite(geometry.anchorDepth)).toBe(true);
    }
  });

  test('moves the boat toward the anchor as the same chain climbs a slope', () => {
    const flat=solveAnchorGeometry(8,40,18,0);
    const steep=solveAnchorGeometry(8,40,18,Math.PI/12);
    expect(steep.totalHorizontal).toBeLessThan(flat.totalHorizontal);
    expect(steep.anchorDepth).toBeGreaterThan(flat.anchorDepth);
    expect(steep.chainLength).toBe(flat.chainLength);
  });

  test('keeps a 26 metre chain nearly vertical in 25 metres of water', () => {
    const flat=solveAnchorGeometry(25,26,18,0);
    const steep=solveAnchorGeometry(25,26,18,Math.PI/12);
    expect(flat.totalHorizontal).toBeLessThan(5);
    expect(steep.totalHorizontal).toBeLessThan(flat.totalHorizontal);
    expect(steep.suspendedLength).toBeCloseTo(26,8);
  });

  test('meets a steep seabed tangentially without passing underneath it', () => {
    const depth=8;
    const slope=Math.PI/12;
    const geometry=solveAnchorGeometry(depth,35,18,slope);
    const terrainTangent=Math.tan(slope);

    for (let i=0;i<=40;i++) {
      const fraction=i/40;
      const u=geometry.catenaryBowU+
        (geometry.catenaryTouchU-geometry.catenaryBowU)*fraction;
      const x=geometry.catenaryA*(u-geometry.catenaryBowU);
      const y=geometry.catenaryA*(
        Math.cosh(geometry.catenaryBowU)-Math.cosh(u)
      );
      expect(y).toBeLessThanOrEqual(depth+x*terrainTangent+1e-8);
    }

    expect(-Math.sinh(geometry.catenaryTouchU)).toBeCloseTo(terrainTangent,8);
  });
});
