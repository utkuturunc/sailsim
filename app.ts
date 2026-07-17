import {
  rad, deg, length, unit, solveScenario, debugReport, clampSailableWindAngle,
  type ScenarioState, type Vector
} from './physics.ts';

type ForceArrowOptions = { alpha?:number; width?:number; dashed?:boolean };

(() => {
  const $ = <T extends HTMLElement = HTMLElement>(id:string):T => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing required element #${id}`);
    return element as T;
  };
  const canvas = $<HTMLCanvasElement>('scene');
  const ctx = canvas.getContext('2d');
  const forceCanvas = $<HTMLCanvasElement>('forceScene');
  const fctx = forceCanvas.getContext('2d');
  if (!ctx || !fctx) throw new Error('Canvas 2D rendering is unavailable.');
  const windAngleInput = $<HTMLInputElement>('windAngle');
  const windSpeedInput = $<HTMLInputElement>('windSpeed');
  const debugOutput = $<HTMLTextAreaElement>('debugOutput');
  const inputs = [windAngleInput, windSpeedInput];
  const css = (name:string):string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  let latestState:ScenarioState | null = null;
  let solveFrame = 0;

  function sideLabel(value:number):string {
    if (Math.abs(value) < 0.5) return '0° ahead';
    if (Math.abs(Math.abs(value) - 180) < 0.5) return '180° astern';
    return `${Math.abs(value).toFixed(0)}° ${value > 0 ? 'starboard' : 'port'}`;
  }

  function formatForce(newtons:number):string {
    const abs = Math.abs(newtons);
    return abs >= 1000 ? `${(newtons/1000).toFixed(2)} kN` : `${newtons.toFixed(0)} N`;
  }

  function state():ScenarioState {
    if (!latestState) {
      latestState = solveScenario({ windAngle:+windAngleInput.value, windSpeed:+windSpeedInput.value });
    }
    return latestState;
  }

  function solveAndDraw() {
    latestState = solveScenario({ windAngle:+windAngleInput.value, windSpeed:+windSpeedInput.value });
    draw();
  }

  function handleInput() {
    windAngleInput.value = String(clampSailableWindAngle(
      +windSpeedInput.value, +windAngleInput.value, +windAngleInput.value
    ));
    cancelAnimationFrame(solveFrame);
    solveFrame = requestAnimationFrame(solveAndDraw);
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const forceRect = forceCanvas.getBoundingClientRect();
    forceCanvas.width = Math.round(forceRect.width * dpr);
    forceCanvas.height = Math.round(forceRect.height * dpr);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function arrow(origin:Vector, vector:Vector, color:string, label:string, maxLength = 145, dashed = false, gain = 6, alpha = 1) {
    const magnitude = length(vector);
    if (magnitude < 0.01) return;
    const u = unit(vector);
    const visualLength = Math.min(maxLength, 20 + magnitude * gain);
    const end = { x: origin.x + u.x * visualLength, y: origin.y - u.y * visualLength };
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 3;
    ctx.setLineDash(dashed ? [7, 6] : []);
    ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    ctx.setLineDash([]);
    const screenAngle = Math.atan2(end.y - origin.y, end.x - origin.x);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - 11 * Math.cos(screenAngle - .5), end.y - 11 * Math.sin(screenAngle - .5));
    ctx.lineTo(end.x - 11 * Math.cos(screenAngle + .5), end.y - 11 * Math.sin(screenAngle + .5));
    ctx.closePath(); ctx.fill();
    ctx.font = '500 12px Inter, system-ui, sans-serif';
    ctx.fillText(label, end.x + (u.x >= 0 ? 8 : -ctx.measureText(label).width - 8), end.y + (u.y >= 0 ? -8 : 16));
    ctx.restore();
  }

  function drawBoat(cx:number, cy:number, s:number, helmAngle:number) {
    ctx.save();
    ctx.translate(cx, cy);
    // The keel is underwater; show its planform and center of lateral resistance.
    ctx.strokeStyle = css('--keel');
    ctx.fillStyle = 'rgba(168, 223, 120, .08)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 20*s, 8*s, 40*s, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(235, 245, 241, .12)';
    ctx.strokeStyle = 'rgba(235, 245, 241, .7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -102*s);
    ctx.bezierCurveTo(16*s, -84*s, 30*s, -42*s, 34*s, 18*s);
    ctx.lineTo(31*s, 76*s);
    ctx.quadraticCurveTo(30*s, 83*s, 23*s, 83*s);
    ctx.lineTo(-23*s, 83*s);
    ctx.quadraticCurveTo(-30*s, 83*s, -31*s, 76*s);
    ctx.lineTo(-34*s, 18*s);
    ctx.bezierCurveTo(-30*s, -42*s, -16*s, -84*s, 0, -102*s);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // Flat transom, cockpit and modern open deck details.
    ctx.strokeStyle = 'rgba(235, 245, 241, .34)';
    ctx.beginPath(); ctx.moveTo(-23*s, 75*s); ctx.lineTo(23*s, 75*s); ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(-20*s, 32*s, 40*s, 34*s, 7*s);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -74*s); ctx.lineTo(0, 70*s); ctx.stroke();

    ctx.fillStyle = css('--keel');
    ctx.beginPath(); ctx.arc(0, 20*s, 4, 0, Math.PI*2); ctx.fill();

    // Rudder stock and blade behind the flat transom.
    const rudder = { x: Math.sin(rad(helmAngle)), y: Math.cos(rad(helmAngle)) };
    ctx.strokeStyle = css('--rudder');
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 80*s); ctx.lineTo(rudder.x*27*s, 80*s + rudder.y*27*s); ctx.stroke();
    ctx.fillStyle = css('--rudder');
    ctx.beginPath(); ctx.arc(0, 80*s, 3.5, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawForceCard(st:ScenarioState) {
    const w = forceCanvas.clientWidth, h = forceCanvas.clientHeight;
    fctx.clearRect(0, 0, w, h);
    const origin = { x: w * .5, y: h * .59 };
    const radius = Math.min(72, w * .22);

    // The line is true-wind ±90°; the hatched half-plane points toward the wind source.
    const trueWindScreen = unit({ x:st.trueWind.x, y:-st.trueWind.y });
    if (length(trueWindScreen) > .01) {
      const upwind = { x:-trueWindScreen.x, y:-trueWindScreen.y };
      const tangent = { x:-trueWindScreen.y, y:trueWindScreen.x };
      const extent = Math.hypot(w, h) * 2;
      const edgeA = { x:origin.x + tangent.x * extent, y:origin.y + tangent.y * extent };
      const edgeB = { x:origin.x - tangent.x * extent, y:origin.y - tangent.y * extent };

      fctx.save();
      fctx.beginPath();
      fctx.moveTo(edgeA.x, edgeA.y);
      fctx.lineTo(edgeB.x, edgeB.y);
      fctx.lineTo(edgeB.x + upwind.x * extent, edgeB.y + upwind.y * extent);
      fctx.lineTo(edgeA.x + upwind.x * extent, edgeA.y + upwind.y * extent);
      fctx.closePath();
      fctx.clip();
      fctx.globalAlpha = .16;
      fctx.strokeStyle = css('--true');
      fctx.lineWidth = 1;
      fctx.setLineDash([3, 7]);
      for (let offset = -h; offset < w + h; offset += 17) {
        fctx.beginPath();
        fctx.moveTo(offset, h);
        fctx.lineTo(offset + h, 0);
        fctx.stroke();
      }
      fctx.restore();

      fctx.save();
      fctx.globalAlpha = .48;
      fctx.strokeStyle = css('--true');
      fctx.lineWidth = 1.5;
      fctx.setLineDash([6, 6]);
      fctx.beginPath();
      fctx.moveTo(edgeA.x, edgeA.y);
      fctx.lineTo(edgeB.x, edgeB.y);
      fctx.stroke();
      fctx.setLineDash([]);
      const labelBounds = { left:46, right:w - 46, top:52, bottom:h - 18 };
      const boundaryDistances:number[] = [];
      if (upwind.x > .001) boundaryDistances.push((labelBounds.right - origin.x) / upwind.x);
      if (upwind.x < -.001) boundaryDistances.push((labelBounds.left - origin.x) / upwind.x);
      if (upwind.y > .001) boundaryDistances.push((labelBounds.bottom - origin.y) / upwind.y);
      if (upwind.y < -.001) boundaryDistances.push((labelBounds.top - origin.y) / upwind.y);
      const availableDistance = Math.min(...boundaryDistances);
      const labelDistance = Math.min(radius + 95, availableDistance * .82);
      const labelX = origin.x + upwind.x * labelDistance;
      const labelY = origin.y + upwind.y * labelDistance;
      fctx.globalAlpha = .72;
      fctx.fillStyle = css('--true');
      fctx.font = '500 11px Inter, system-ui, sans-serif';
      fctx.textAlign = 'center';
      fctx.fillText('UPWIND', labelX, labelY);
      fctx.restore();
    }

    fctx.save();
    fctx.strokeStyle = 'rgba(202, 230, 225, .16)';
    fctx.lineWidth = 1;
    fctx.setLineDash([3, 5]);
    fctx.beginPath(); fctx.arc(origin.x, origin.y, radius, 0, Math.PI * 2); fctx.stroke();
    fctx.beginPath(); fctx.moveTo(origin.x-radius, origin.y); fctx.lineTo(origin.x+radius, origin.y); fctx.stroke();
    fctx.beginPath(); fctx.moveTo(origin.x, origin.y-radius); fctx.lineTo(origin.x, origin.y+radius); fctx.stroke();
    fctx.setLineDash([]);
    fctx.fillStyle = css('--ink');
    fctx.beginPath(); fctx.arc(origin.x, origin.y, 4, 0, Math.PI*2); fctx.fill();
    fctx.restore();

    function forceArrow(vector:Vector, color:string, label:string, gain:number, maxLength:number, options:ForceArrowOptions = {}) {
      const magnitude = length(vector);
      if (magnitude < .01) return;
      const u = unit(vector);
      const visualLength = Math.min(maxLength, 22 + magnitude * gain);
      const end = { x: origin.x + u.x * visualLength, y: origin.y - u.y * visualLength };
      const a = Math.atan2(end.y-origin.y, end.x-origin.x);
      fctx.save();
      fctx.globalAlpha = options.alpha ?? 1;
      fctx.strokeStyle = color; fctx.fillStyle = color; fctx.lineWidth = options.width ?? 3;
      fctx.setLineDash(options.dashed ? [6, 5] : []);
      fctx.beginPath(); fctx.moveTo(origin.x, origin.y); fctx.lineTo(end.x, end.y); fctx.stroke();
      fctx.setLineDash([]);
      fctx.beginPath(); fctx.moveTo(end.x,end.y);
      fctx.lineTo(end.x-10*Math.cos(a-.5),end.y-10*Math.sin(a-.5));
      fctx.lineTo(end.x-10*Math.cos(a+.5),end.y-10*Math.sin(a+.5));
      fctx.closePath(); fctx.fill();
      fctx.font = '500 12px Inter, system-ui, sans-serif';
      const labelX = end.x + (u.x >= 0 ? 8 : -fctx.measureText(label).width - 8);
      fctx.fillText(label, labelX, end.y + (u.y >= 0 ? -8 : 16));
      fctx.restore();
    }
    forceArrow(st.trueWind, css('--true'), 'true wind', 3.1, radius + 7, { alpha: .34, width: 1.5, dashed: true });
    forceArrow(st.inducedWind, css('--induced'), 'induced', 5.2, radius, { alpha: .30, width: 1.5, dashed: true });
    forceArrow(st.apparentWind, css('--apparent'), 'apparent', 3.2, radius + 14, { alpha: .72, width: 2, dashed: true });
    const forceMax = Math.max(100, length(st.sailForce), length(st.keelForce), length(st.rudderForce), length(st.hullForce), length(st.totalForce));
    const forceGain = (radius - 8) / forceMax;
    forceArrow(st.sailForce, css('--sail'), 'sail', forceGain, radius + 10);
    forceArrow(st.keelForce, css('--keel'), 'keel', forceGain, radius + 10);
    forceArrow(st.rudderForce, css('--rudder'), 'rudder', forceGain, radius + 4);
    forceArrow(st.hullForce, css('--hull'), 'hull', forceGain, radius + 4, { width: 2 });
    forceArrow(st.totalForce, css('--total'), 'total', forceGain, radius + 22);
  }

  function drawApparentWindField(w:number, h:number, apparentWind:Vector) {
    const magnitude = length(apparentWind);
    if (magnitude < .05) return;
    const u = unit(apparentWind);
    const arrowLength = Math.min(52, 18 + magnitude * 1.65);
    const dx = u.x * arrowLength;
    const dy = -u.y * arrowLength;
    const angle = Math.atan2(dy, dx);
    const spacingX = 100;
    const spacingY = 82;
    ctx.save();
    ctx.globalAlpha = .18;
    ctx.strokeStyle = css('--apparent');
    ctx.fillStyle = css('--apparent');
    ctx.lineWidth = 1.4;
    for (let row = 0, y = 72; y < h + spacingY; row++, y += spacingY) {
      const offset = row % 2 ? spacingX * .5 : 0;
      for (let x = 36 - offset; x < w + spacingX; x += spacingX) {
        const endX = x + dx;
        const endY = y + dy;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(endX, endY); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - 7*Math.cos(angle-.48), endY - 7*Math.sin(angle-.48));
        ctx.lineTo(endX - 7*Math.cos(angle+.48), endY - 7*Math.sin(angle+.48));
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  }

  function draw() {
    const st = state();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const cx = w * (w < 600 ? .5 : .52), cy = h * .52;
    const scaleBoat = Math.max(.78, Math.min(1.15, w / 850));

    ctx.strokeStyle = 'rgba(180, 220, 214, .055)'; ctx.lineWidth = 1;
    const grid = 46;
    for (let x = (cx % grid); x < w; x += grid) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for (let y = (cy % grid); y < h; y += grid) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

    drawApparentWindField(w, h, st.apparentWind);
    drawBoat(cx, cy, scaleBoat, st.helmAngle);

    // Sail and boom.
    const boom = { x: Math.sin(rad(st.sailAngle)), y: Math.cos(rad(st.sailAngle)) };
    const boomEnd = { x: cx + boom.x * 92 * scaleBoat, y: cy + boom.y * 92 * scaleBoat };
    ctx.strokeStyle = css('--sail'); ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(boomEnd.x, boomEnd.y); ctx.stroke();
    ctx.fillStyle = css('--ink'); ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2); ctx.fill();

    // Keep the wind construction in a canvas corner, away from the boat.
    // The selected corner ensures the arrows point inward rather than being clipped.
    const windScreen = { x: st.apparentWind.x, y: -st.apparentWind.y };
    const windOrigin = {
      x: windScreen.x >= 0 ? 105 : w - 105,
      y: windScreen.y >= 0 ? 185 : h - (w < 600 ? 190 : 95)
    };
    ctx.fillStyle = css('--apparent'); ctx.beginPath(); ctx.arc(windOrigin.x, windOrigin.y, 4, 0, Math.PI*2); ctx.fill();
    arrow(windOrigin, st.trueWind, css('--true'), 'true', 115, true, 6, .42);
    arrow(windOrigin, st.inducedWind, css('--induced'), 'induced', 90, true, 6, .34);
    arrow(windOrigin, st.apparentWind, css('--apparent'), 'apparent', 125);
    const sailCenter = { x: cx + boom.x * 48 * scaleBoat, y: cy + boom.y * 48 * scaleBoat };
    const keelCenter = { x: cx, y: cy + 20 * scaleBoat };
    const rudderVector = { x: Math.sin(rad(st.helmAngle)), y: Math.cos(rad(st.helmAngle)) };
    const rudderCenter = { x: cx + rudderVector.x * 14 * scaleBoat, y: cy + (80 + rudderVector.y * 14) * scaleBoat };
    const forceMax = Math.max(100, length(st.sailForce), length(st.keelForce), length(st.rudderForce), length(st.hullForce), length(st.totalForce));
    const forceGain = 78 / forceMax;
    arrow(sailCenter, st.sailForce, css('--sail'), 'sail', 138, false, forceGain);
    arrow(keelCenter, st.keelForce, css('--keel'), 'keel', 138, false, forceGain);
    arrow(rudderCenter, st.rudderForce, css('--rudder'), 'rudder', 100, false, forceGain);
    arrow({x:cx, y:cy+48*scaleBoat}, st.hullForce, css('--hull'), 'hull', 110, false, forceGain, .75);
    arrow({x: cx, y: cy}, st.totalForce, css('--total'), 'total', 170, false, forceGain);

    drawForceCard(st);

    // Heading marker.
    ctx.fillStyle = css('--muted'); ctx.font = '500 11px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('BOW', cx, cy - 112 * scaleBoat);
    ctx.textAlign = 'start';

    $('windAngleOut').textContent = sideLabel(st.windAngle);
    $('windDial').style.setProperty('--angle', `${st.windAngle}deg`);
    $('windDial').style.setProperty('--no-go-start', `${-st.polar.beatAngle}deg`);
    $('windDial').style.setProperty('--no-go-span', `${st.polar.beatAngle * 2}deg`);
    $('noGoCaption').textContent = st.polar.beatAngle > 0
      ? `Red no-go zone · ±${st.polar.beatAngle.toFixed(1)}°`
      : 'No no-go zone in calm wind';
    $('windSpeedOut').textContent = `${st.windSpeed.toFixed(1)} kn`;
    $('sailAngleOut').textContent = sideLabel(st.sailAngle).replace('ahead', 'centered');
    $('helmAngleOut').textContent = Math.abs(st.helmAngle) < .5 ? 'Centered' : `${Math.abs(st.helmAngle).toFixed(0)}° ${st.helmAngle > 0 ? 'starboard' : 'port'}`;
    $('boatSpeedOut').textContent = st.polar.noGo ? '0.00 kn · no-go' : `${st.boatSpeed.toFixed(2)} kn`;
    $('apparentMetric').textContent = `${st.awSpeed.toFixed(1)} kn · ${sideLabel(st.apparentFrom)}`;
    $('sailMetric').textContent = `${formatForce(length(st.sailForce))} · α ${deg(st.sailAlpha).toFixed(1)}°`;
    $('speedMetric').textContent = st.polar.noGo ? `No-go below ${st.polar.beatAngle.toFixed(1)}°` : `${st.boatSpeed.toFixed(2)} kn · ${Math.abs(deg(st.leeway)).toFixed(1)}° leeway`;
    debugOutput.value = JSON.stringify(debugReport(st), null, 2);
  }

  inputs.forEach(input => input.addEventListener('input', handleInput));
  const windDial = $('windDial');
  function bindDial(
    dial:HTMLElement,
    input:HTMLInputElement,
    angleFromPoint:(x:number, y:number) => number
  ) {
    function update(event:PointerEvent) {
      if (input.disabled) return;
      const rect = dial.getBoundingClientRect();
      const x = event.clientX - (rect.left + rect.width / 2);
      const y = (rect.top + rect.height / 2) - event.clientY;
      const proposedAngle = angleFromPoint(x, y);
      input.value = String(clampSailableWindAngle(+windSpeedInput.value, proposedAngle, +input.value));
      handleInput();
    }
    dial.addEventListener('pointerdown', (event) => {
      dial.setPointerCapture(event.pointerId); input.focus(); update(event);
    });
    dial.addEventListener('pointermove', (event) => {
      if (dial.hasPointerCapture(event.pointerId)) update(event);
    });
  }
  bindDial(windDial, windAngleInput, (x, y) => {
    let angle = Math.round(deg(Math.atan2(x, y)));
    return angle === -180 ? 180 : angle;
  });
  $('copyDebug').addEventListener('click', async () => {
    let copied = false;
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(debugOutput.value); copied = true; } catch (_) {}
    }
    if (!copied) {
      debugOutput.focus(); debugOutput.select();
      copied = document.execCommand('copy');
      debugOutput.setSelectionRange(0, 0);
    }
    $('copyStatus').textContent = copied ? 'Copied' : 'Select and copy manually';
    setTimeout(() => { $('copyStatus').textContent = ''; }, 1800);
  });
  new ResizeObserver(resize).observe(canvas);
  resize();
  solveAndDraw();
})();
