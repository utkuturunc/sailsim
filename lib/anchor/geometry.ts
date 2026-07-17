export type AnchorGeometry = {
  chainLength: number;
  suspendedLength: number;
  onSeabed: number;
  touchdownDepth: number;
  horizontalSuspended: number;
  catenaryA: number;
  catenaryBowU: number;
  catenaryTouchU: number;
  laidHorizontal: number;
  laidVertical: number;
  totalHorizontal: number;
  anchorDepth: number;
};

function solveTangentCatenary(arcLength: number, bowDepth: number, slope: number) {
  const terrainTangent = Math.tan(slope);
  const touchU = -Math.asinh(terrainTangent);

  let low = -50;
  let high = touchU - 1e-8;

  for (let i = 0; i < 56; i++) {
    const bowU = (low + high) / 2;
    const a = arcLength / (Math.sinh(touchU) - Math.sinh(bowU));
    const horizontal = a * (touchU - bowU);
    const vertical = a * (Math.cosh(bowU) - Math.cosh(touchU));
    const residual = vertical - horizontal * terrainTangent - bowDepth;

    if (residual > 0) low = bowU;
    else high = bowU;
  }

  const bowU = (low + high) / 2;
  const a = arcLength / (Math.sinh(touchU) - Math.sinh(bowU));

  return {
    a,
    bowU,
    touchU,
    horizontal: a * (touchU - bowU),
    vertical: a * (Math.cosh(bowU) - Math.cosh(touchU))
  };
}

export function solveAnchorGeometry(
  depth: number,
  chainLengthInput: number,
  windStrength: number,
  slope: number
): AnchorGeometry {
  const chainLength = Math.max(chainLengthInput, depth + 0.01);
  const suspensionFactor = 1.35 + (windStrength / 40) * 0.65;
  const suspendedLength = Math.min(chainLength, Math.max(depth + 0.01, depth * suspensionFactor));
  const onSeabed = Math.max(0, chainLength - suspendedLength);

  const catenary = solveTangentCatenary(suspendedLength, depth, slope);
  const touchdownDepth = catenary.vertical;
  const horizontalSuspended = catenary.horizontal;
  const laidHorizontal = onSeabed * Math.cos(slope);
  const laidVertical = onSeabed * Math.sin(slope);

  return {
    chainLength,
    suspendedLength,
    onSeabed,
    touchdownDepth,
    horizontalSuspended,
    catenaryA: catenary.a,
    catenaryBowU: catenary.bowU,
    catenaryTouchU: catenary.touchU,
    laidHorizontal,
    laidVertical,
    totalHorizontal: horizontalSuspended + laidHorizontal,
    anchorDepth: touchdownDepth + laidVertical
  };
}
