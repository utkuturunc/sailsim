export type AnchorGeometry = {
  chainLength: number;
  suspendedLength: number;
  onSeabed: number;
  laidOnSeabed: number;
  piledOnSeabed: number;
  bowDepth: number;
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
  dropDepth: number,
  chainLengthInput: number,
  windStrength: number,
  slope: number
): AnchorGeometry {
  const chainLength = Math.max(chainLengthInput, dropDepth + 0.01);
  const suspensionFactor = 1.35 + (windStrength / 40) * 0.65;
  let suspendedLength = Math.min(
    chainLength,
    Math.max(dropDepth + 0.01, dropDepth * suspensionFactor)
  );

  const minimumBowDepth = 0.01;
  const anchorDepthAt = (bowDepth: number, laidLength: number) => {
    const catenary = solveTangentCatenary(suspendedLength, bowDepth, slope);
    return {
      catenary,
      anchorDepth: catenary.vertical + laidLength * Math.sin(slope)
    };
  };

  while (suspendedLength > dropDepth + 0.011) {
    if (anchorDepthAt(minimumBowDepth, 0).anchorDepth <= dropDepth) break;
    suspendedLength = Math.max(dropDepth + 0.01, suspendedLength * 0.96);
  }

  const onSeabed = Math.max(0, chainLength - suspendedLength);

  let laidLow = 0;
  let laidHigh = onSeabed;

  for (let i = 0; i < 48; i++) {
    const laidLength = (laidLow + laidHigh) / 2;
    if (anchorDepthAt(minimumBowDepth, laidLength).anchorDepth <= dropDepth) laidLow = laidLength;
    else laidHigh = laidLength;
  }

  const laidOnSeabed = laidLow;
  const piledOnSeabed = onSeabed - laidOnSeabed;

  let bowLow = minimumBowDepth;
  let bowHigh = dropDepth;

  for (let i = 0; i < 56; i++) {
    const bowDepth = (bowLow + bowHigh) / 2;
    if (anchorDepthAt(bowDepth, laidOnSeabed).anchorDepth < dropDepth) bowLow = bowDepth;
    else bowHigh = bowDepth;
  }

  const bowDepth = (bowLow + bowHigh) / 2;
  const { catenary } = anchorDepthAt(bowDepth, laidOnSeabed);

  const touchdownDepth = catenary.vertical;
  const horizontalSuspended = catenary.horizontal;
  const laidHorizontal = laidOnSeabed * Math.cos(slope);
  const laidVertical = laidOnSeabed * Math.sin(slope);

  return {
    chainLength,
    suspendedLength,
    onSeabed,
    laidOnSeabed,
    piledOnSeabed,
    bowDepth,
    touchdownDepth,
    horizontalSuspended,
    catenaryA: catenary.a,
    catenaryBowU: catenary.bowU,
    catenaryTouchU: catenary.touchU,
    laidHorizontal,
    laidVertical,
    totalHorizontal: horizontalSuspended + laidHorizontal,
    anchorDepth: dropDepth
  };
}
