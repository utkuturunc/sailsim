import { solveAnchorGeometry } from './geometry.ts';

type Point = { x: number; y: number };

function get2DContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D rendering is unavailable.');
  return context;
}

(() => {
  const get = <T extends HTMLElement>(id: string): T => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing required element #${id}`);
    return element as T;
  };

  const canvas = get<HTMLCanvasElement>('anchorScene');
  const ctx = get2DContext(canvas);

  const depthInput = get<HTMLInputElement>('depth');
  const chainInput = get<HTMLInputElement>('chainLength');
  const windInput = get<HTMLInputElement>('windStrength');
  const terrainInput = get<HTMLSelectElement>('terrain');

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = (name: string): string =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const BOAT_DRAFT_M = 2.1;

  let targetDepth = +depthInput.value;
  let targetChain = +chainInput.value;
  let targetWind = +windInput.value;
  let targetSlope = 0;
  let displayDepth = targetDepth;
  let displayChain = targetChain;
  let displayWind = targetWind;
  let displaySlope = targetSlope;
  let boatX = Number.NaN;
  let boatVelocity = 0;
  let lastTime = 0;
  let windPhase = 0;

  function drawBoat(x: number, waterY: number, scale: number, bob: number) {
    ctx.save();
    ctx.translate(x, waterY + bob);

    // Fin keel, bulb, and rudder sit behind the opaque hull.
    const keelBottom = 53 * scale;
    const bulbCenter = keelBottom - 4 * scale;
    const keelMid = 12 * scale + (bulbCenter - 12 * scale) * 0.58;
    const rudderBottom = 40 * scale;

    ctx.fillStyle = css('--keel-metal');
    ctx.strokeStyle = 'rgba(84,113,117,.58)';
    ctx.lineWidth = 1.4;

    ctx.beginPath();
    ctx.moveTo(-8 * scale, 12 * scale);
    ctx.quadraticCurveTo(-6 * scale, keelMid, 1 * scale, bulbCenter);
    ctx.lineTo(12 * scale, bulbCenter);
    ctx.quadraticCurveTo(7 * scale, keelMid, 14 * scale, 10 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(7 * scale, bulbCenter, 11 * scale, 4 * scale, -0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-53 * scale, 10 * scale);
    ctx.lineTo(-57 * scale, rudderBottom);
    ctx.lineTo(-47 * scale, rudderBottom - 3 * scale);
    ctx.lineTo(-42 * scale, 8 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Flat, illustrated hull with a bold silhouette.
    ctx.fillStyle = css('--hull');
    ctx.strokeStyle = 'rgba(84,113,117,.62)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-70 * scale, -15 * scale);
    ctx.lineTo(54 * scale, -15 * scale);
    ctx.quadraticCurveTo(74 * scale, -13 * scale, 84 * scale, -4 * scale);
    ctx.quadraticCurveTo(67 * scale, 18 * scale, 34 * scale, 24 * scale);
    ctx.quadraticCurveTo(-14 * scale, 29 * scale, -60 * scale, 17 * scale);
    ctx.lineTo(-70 * scale, 7 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Waterline boot stripe and transom detail.
    ctx.strokeStyle = css('--hull-shadow');
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-66 * scale, 10 * scale);
    ctx.quadraticCurveTo(12 * scale, 24 * scale, 73 * scale, 5 * scale);
    ctx.stroke();
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-69 * scale, -14 * scale);
    ctx.lineTo(-69 * scale, 7 * scale);
    ctx.stroke();

    ctx.fillStyle = css('--water');
    for (const px of [-47, -30]) {
      ctx.beginPath();
      ctx.arc(px * scale, -3 * scale, 3.5 * scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mast, boom, and two restrained sail shapes.
    ctx.strokeStyle = 'rgba(84,113,117,.72)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(3 * scale, -15 * scale);
    ctx.lineTo(3 * scale, -128 * scale);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(3 * scale, -17 * scale);
    ctx.lineTo(-54 * scale, -17 * scale);
    ctx.stroke();
    ctx.fillStyle = css('--sail-cloth');
    ctx.strokeStyle = 'rgba(84,113,117,.58)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, -120 * scale);
    ctx.lineTo(0, -19 * scale);
    ctx.lineTo(-52 * scale, -19 * scale);
    ctx.quadraticCurveTo(-30 * scale, -80 * scale, 0, -120 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(7 * scale, -113 * scale);
    ctx.lineTo(8 * scale, -19 * scale);
    ctx.lineTo(68 * scale, -16 * scale);
    ctx.quadraticCurveTo(46 * scale, -72 * scale, 7 * scale, -113 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = css('--chain');
    ctx.beginPath();
    ctx.arc(80 * scale, -5 * scale, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawAnchor(x: number, seabedY: number, scale: number, burial: number) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvas.clientWidth, seabedY + 3);
    ctx.clip();
    ctx.translate(x, seabedY + burial);
    ctx.scale(scale, scale);

    const metal = css('--anchor-metal');
    ctx.strokeStyle = metal;
    ctx.fillStyle = 'rgba(220,231,228,.22)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(-18, -2);
    ctx.quadraticCurveTo(-11, -18, 6, -24);
    ctx.quadraticCurveTo(24, -22, 36, -7);
    ctx.quadraticCurveTo(14, 2, -18, 4);
    ctx.quadraticCurveTo(-28, 3, -34, -1);
    ctx.quadraticCurveTo(-27, -6, -18, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(30, -9);
    ctx.quadraticCurveTo(20, -22, 2, -35);
    ctx.lineTo(-3, -31);
    ctx.quadraticCurveTo(11, -17, 19, -5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(220,231,228,.34)';
    ctx.beginPath();
    ctx.moveTo(12, -19);
    ctx.lineTo(36, -7);
    ctx.lineTo(18, -5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(3, -27);
    ctx.quadraticCurveTo(15, -29, 24, -18);
    ctx.stroke();

    ctx.fillStyle = css('--water');
    ctx.beginPath();
    ctx.arc(-2, -34, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-29, -1);
    ctx.quadraticCurveTo(-8, -11, 27, -8);
    ctx.stroke();
    ctx.restore();
  }

  function drawDimension(
    x: number,
    y1: number,
    y2: number,
    label: string,
    labelSide: 'center' | 'left' | 'right' = 'center'
  ) {
    ctx.save();

    ctx.strokeStyle = 'rgba(152,170,167,.68)';
    ctx.fillStyle = css('--muted');
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const y of [y1, y2]) {
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 6, y);
      ctx.stroke();
    }

    ctx.font = '500 12px Inter, system-ui, sans-serif';
    ctx.textAlign = labelSide === 'left' ? 'right' : labelSide === 'right' ? 'left' : 'center';
    const labelX = labelSide === 'left' ? x - 10 : labelSide === 'right' ? x + 10 : x;
    ctx.fillText(label, labelX, (y1 + y2) / 2 - 8);
    ctx.restore();
  }

  function drawHorizontalDistance(startX: number, endX: number, y: number, label: string) {
    if (Math.abs(endX - startX) < 1) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(152,170,167,.58)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const x of [startX, endX]) {
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x, y + 6);
      ctx.stroke();
    }

    const x = (startX + endX) / 2;
    ctx.font = '500 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const width = ctx.measureText(label).width;

    ctx.fillStyle = 'rgba(7,27,33,.78)';
    ctx.fillRect(x - width / 2 - 6, y - 24, width + 12, 18);
    ctx.fillStyle = css('--muted');
    ctx.fillText(label, x, y - 11);
    ctx.restore();
  }

  function drawScaleBar(pxPerMetre: number, canvasHeight: number) {
    const targetMetres = 72 / pxPerMetre;
    const magnitude = 10 ** Math.floor(Math.log10(targetMetres));
    const normalized = targetMetres / magnitude;
    const step = [1, 2, 5, 10].reduce((closest, candidate) =>
      Math.abs(candidate - normalized) < Math.abs(closest - normalized) ? candidate : closest
    );
    const metres = step * magnitude;
    const width = metres * pxPerMetre;
    const x = 24;
    const y = canvasHeight - 24;

    ctx.save();

    ctx.strokeStyle = css('--muted');
    ctx.fillStyle = css('--muted');
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y - 7);
    ctx.stroke();

    ctx.font = '500 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${metres.toLocaleString(undefined, { maximumFractionDigits: 1 })} m`,
      x + width / 2,
      y - 11
    );
    ctx.restore();
  }

  function drawWind(
    w: number,
    waterY: number,
    boatCenterX: number,
    strength: number,
    phase: number
  ) {
    if (strength < 0.2) return;

    const left = boatCenterX + 105;
    const span = Math.max(80, w - left + 55);
    const count = 3 + Math.round(strength / 14);
    const windTop = 28;
    const windBottom = Math.max(windTop + 24, waterY - 30);
    const verticalSpan = windBottom - windTop;
    const random = (seed: number) => {
      const value = Math.sin(seed * 91.371) * 43758.5453;
      return value - Math.floor(value);
    };

    ctx.save();
    ctx.strokeStyle = css('--wind');
    const baseAlpha = 0.28 + (strength / 40) * 0.42;
    const boatBowX = boatCenterX + 80;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < count; i++) {
      const spacing = span / count;
      const xJitter = (random(i + 2) - 0.5) * spacing * 0.42;
      const yJitter = (random(i + 41) - 0.5) * 15;
      const x = left + ((((i * spacing + xJitter - phase) % span) + span) % span);
      const y = windTop + ((i + 0.5) / count) * verticalSpan + yJitter;
      const size = 0.8 + (random(i + 83) - 0.5) * 0.06;
      const gustLength = (32 + strength * 0.54) * size;
      const distanceFromBow = x - gustLength - boatBowX;
      const fadeProgress = Math.max(0, Math.min(1, distanceFromBow / 55));
      ctx.globalAlpha = baseAlpha * fadeProgress * fadeProgress * (3 - 2 * fadeProgress);
      ctx.lineWidth = (1.35 + (strength / 40) * 0.75) * size;

      // Main streamline with the rounded curl of a hand-drawn wind glyph.
      ctx.beginPath();
      ctx.moveTo(x - gustLength, y);
      ctx.bezierCurveTo(x - gustLength * 0.68, y - 2, x - gustLength * 0.34, y + 2, x - 7, y);
      ctx.bezierCurveTo(x + 7, y - 1, x + 9, y - 12, x + 1, y - 14);
      ctx.bezierCurveTo(x - 6, y - 16, x - 9, y - 10, x - 5, y - 7);
      ctx.stroke();

      // Two shorter wisps keep each gust light rather than arrow-like.
      ctx.beginPath();
      ctx.moveTo(x - gustLength * 0.78, y - 9);
      ctx.bezierCurveTo(x - gustLength * 0.55, y - 12, x - gustLength * 0.33, y - 7, x - 15, y - 9);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - gustLength * 0.68, y + 9);
      ctx.bezierCurveTo(x - gustLength * 0.42, y + 6, x - 18, y + 12, x - 8, y + 9);
      ctx.bezierCurveTo(x + 2, y + 7, x + 4, y + 15, x - 2, y + 17);
      ctx.stroke();
    }
    ctx.restore();
  }

  function updateTargets() {
    targetDepth = +depthInput.value;
    if (+chainInput.value < targetDepth + 0.5)
      chainInput.value = String(Math.ceil(targetDepth + 0.5));

    targetChain = +chainInput.value;
    targetWind = +windInput.value;
    targetSlope =
      terrainInput.value === 'steep'
        ? Math.PI / 12
        : terrainInput.value === 'little'
          ? Math.PI / 36
          : 0;

    get('depthOut').textContent = `${targetDepth.toFixed(1)} m`;
    get('chainLengthOut').textContent = `${targetChain.toFixed(0)} m`;
    get('windStrengthOut').textContent = `${targetWind.toFixed(0)} kn`;
  }

  function render(time: number, dt: number) {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;

    ctx.clearRect(0, 0, w, h);

    const geometry = solveAnchorGeometry(displayDepth, displayChain, displayWind, displaySlope);
    const { onSeabed, touchdownDepth } = geometry;
    const horizontalSuspendedM = geometry.horizontalSuspended;
    const laidHorizontalM = geometry.laidHorizontal;
    const cameraGeometry = solveAnchorGeometry(displayDepth, displayChain, 40, displaySlope);

    const baseBoatScale = Math.max(0.72, Math.min(1.05, w / 900));
    const baseAnchorScale = baseBoatScale * 0.68;
    const baseWorldPxPerM = 18;
    const sceneWidth =
      cameraGeometry.totalHorizontal * baseWorldPxPerM + 150 * baseBoatScale + 70 * baseAnchorScale;
    const sceneHeight =
      cameraGeometry.anchorDepth * baseWorldPxPerM + 130 * baseBoatScale + 50 * baseAnchorScale;
    const sceneTop = 68;
    const sceneZoom = Math.max(
      0.14,
      Math.min(1, (w - 48) / sceneWidth, (h - sceneTop - 24) / sceneHeight)
    );

    const horizontalPxPerM = baseWorldPxPerM * sceneZoom;
    const boatScale = baseBoatScale * sceneZoom;
    const anchorScale = baseAnchorScale * sceneZoom;
    const anchorBurial = 8 * anchorScale;
    const anchorX = w - 24 - 36 * anchorScale;
    const anchorEyeX = anchorX - 2 * anchorScale;
    const touchdownX = anchorEyeX - laidHorizontalM * horizontalPxPerM;
    const targetBowX = touchdownX - horizontalSuspendedM * horizontalPxPerM;
    const targetBoatX = targetBowX - 80 * boatScale;
    const dropSiteTargetY = h - 56;
    const waterY = dropSiteTargetY - displayDepth * horizontalPxPerM;

    if (!Number.isFinite(boatX)) boatX = targetBoatX;
    if (reduceMotion) {
      boatX = targetBoatX;
      boatVelocity = 0;
    } else {
      const acceleration = (targetBoatX - boatX) * 22 - boatVelocity * 6.4;
      boatVelocity += acceleration * dt;
      boatX += boatVelocity * dt;
    }

    const bob = reduceMotion ? 0 : Math.sin(time * 0.0015) * (displayWind / 40) * 2.2;
    const bow: Point = { x: boatX + 80 * boatScale, y: waterY - 5 * boatScale + bob };
    const seabedAtBowY = waterY + geometry.bowDepth * horizontalPxPerM;
    const visualSlope = Math.tan(displaySlope);
    const terrainYAt = (x: number) => seabedAtBowY + (x - targetBowX) * visualSlope;
    const touchdownY = terrainYAt(touchdownX);
    const anchorSeabedY = terrainYAt(anchorX);
    const anchorEye: Point = {
      x: anchorEyeX,
      y: anchorSeabedY + anchorBurial - 34 * anchorScale
    };

    const dropSiteY = terrainYAt(anchorEye.x);
    const dropSiteDepthM = (dropSiteY - waterY) / horizontalPxPerM;
    const boatSiteY = terrainYAt(bow.x);
    const boatSiteDepthM = (boatSiteY - waterY) / horizontalPxPerM;

    const waterGradient = ctx.createLinearGradient(0, waterY, 0, h);
    waterGradient.addColorStop(0, 'rgba(62,139,155,.18)');
    waterGradient.addColorStop(1, 'rgba(18,67,76,.08)');
    ctx.fillStyle = waterGradient;
    ctx.fillRect(0, waterY, w, h - waterY);

    ctx.fillStyle = css('--sand');
    ctx.globalAlpha = 0.56;
    ctx.beginPath();
    ctx.moveTo(0, terrainYAt(0));
    ctx.lineTo(w, terrainYAt(w));
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(231,239,236,.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, terrainYAt(0));
    ctx.lineTo(w, terrainYAt(w));
    ctx.stroke();

    ctx.strokeStyle = css('--water-line');
    ctx.globalAlpha = 0.82;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const y = waterY + Math.sin(x * 0.045 + time * 0.0018) * (1 + (displayWind / 40) * 1.7);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    drawWind(w, waterY, boatX, displayWind, windPhase);

    const horizontalDistanceM = Math.abs(anchorEye.x - bow.x) / horizontalPxPerM;
    const distanceY = waterY + Math.min(48, displayDepth * horizontalPxPerM * 0.25);
    drawHorizontalDistance(
      bow.x,
      anchorEye.x,
      distanceY,
      `Horizontal drop distance ${horizontalDistanceM.toFixed(1)} m`
    );
    drawDimension(bow.x, waterY, boatSiteY, `${boatSiteDepthM.toFixed(1)} m boat`, 'right');
    drawDimension(anchorEye.x, waterY, dropSiteY, `${dropSiteDepthM.toFixed(1)} m drop`, 'left');

    ctx.strokeStyle = css('--chain');
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();

    const points = 70;
    for (let i = 0; i <= points; i++) {
      const u = i / points;
      const catenaryU =
        geometry.catenaryBowU + (geometry.catenaryTouchU - geometry.catenaryBowU) * u;
      const xm = geometry.catenaryA * (catenaryU - geometry.catenaryBowU);
      const ym =
        horizontalSuspendedM < 1e-5
          ? touchdownDepth * u
          : geometry.catenaryA * (Math.cosh(geometry.catenaryBowU) - Math.cosh(catenaryU));
      const x =
        horizontalSuspendedM < 1e-5
          ? bow.x + (touchdownX - bow.x) * u
          : bow.x + (xm * (touchdownX - bow.x)) / horizontalSuspendedM;
      const y = bow.y + (ym * (touchdownY - bow.y)) / touchdownDepth;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(anchorEye.x, dropSiteY);
    ctx.quadraticCurveTo(anchorX - 12 * anchorScale, anchorSeabedY, anchorEye.x, anchorEye.y);
    ctx.stroke();

    drawBoat(boatX, waterY, boatScale, bob);
    drawAnchor(anchorX, anchorSeabedY, anchorScale, anchorBurial);

    ctx.fillStyle = css('--muted');
    ctx.font = '500 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const chainLabelX = Math.max(bow.x + 70, (bow.x + anchorX) / 2);
    ctx.fillText(`${targetChain.toFixed(0)} m chain`, chainLabelX, terrainYAt(chainLabelX) - 18);
    ctx.textAlign = 'start';

    drawScaleBar(horizontalPxPerM, h);

    get('seabedOut').textContent = `${onSeabed.toFixed(1)} m`;
    get('scopeOut').textContent = `${(geometry.chainLength / dropSiteDepthM).toFixed(1)} : 1`;
    get('depthReadingOut').textContent = `${(dropSiteDepthM - BOAT_DRAFT_M).toFixed(1)} m`;
    canvas.setAttribute(
      'aria-label',
      `Animated side view of a sailboat with ${targetDepth.toFixed(1)} metres of water at the anchor drop point over ${terrainInput.selectedOptions[0]?.text.toLowerCase() ?? 'flat terrain'}, using ${targetChain.toFixed(0)} metres of chain, with ${targetWind.toFixed(0)} knots of wind from the bow.`
    );
  }

  function frame(time: number) {
    const dt = lastTime ? Math.min(0.033, (time - lastTime) / 1000) : 1 / 60;
    lastTime = time;

    if (reduceMotion) {
      displayDepth = targetDepth;
      displayChain = targetChain;
      displayWind = targetWind;
      displaySlope = targetSlope;
    } else {
      const depthEase = 1 - Math.exp(-7 * dt),
        chainEase = 1 - Math.exp(-6 * dt),
        windEase = 1 - Math.exp(-8 * dt);
      displayDepth += (targetDepth - displayDepth) * depthEase;
      displayChain += (targetChain - displayChain) * chainEase;
      displayWind += (targetWind - displayWind) * windEase;
      displaySlope += (targetSlope - displaySlope) * depthEase;
      windPhase = (windPhase + dt * (28 + displayWind * 3.2)) % 10000;
    }

    render(time, dt);
    requestAnimationFrame(frame);
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    boatX = Number.NaN;
  }

  [depthInput, chainInput, windInput, terrainInput].forEach((input) =>
    input.addEventListener('input', updateTargets)
  );
  new ResizeObserver(resize).observe(canvas);
  updateTargets();
  resize();
  requestAnimationFrame(frame);
})();
