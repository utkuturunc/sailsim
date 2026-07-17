import POLAR from './polar-data.ts';

export type Vector = { x: number; y: number };

export type YachtConfig = {
  sailArea: number;
  keelArea: number;
  rudderArea: number;
  waterlineLength: number;
  displacement: number;
  sailLead: number;
  rudderArm: number;
};

type FoilConfig = {
  slope: number;
  clMax: number;
  stallDeg: number;
  cd0: number;
  aspectRatio: number;
  efficiency: number;
};

export type ComputeOptions = {
  windAngle: number;
  windSpeed: number;
  sailAngle: number;
  helmAngle: number;
  boatSpeed: number;
  yacht?: Partial<YachtConfig>;
  polarEquilibrium?: boolean;
};

export type TrimOptions = Pick<
  ComputeOptions,
  'windAngle' | 'windSpeed' | 'boatSpeed' | 'yacht' | 'polarEquilibrium'
>;
export type ScenarioOptions = Pick<ComputeOptions, 'windAngle' | 'windSpeed' | 'yacht'>;

if (!POLAR) throw new Error('Dufour polar data must be loaded before the physics module.');

const KNOT_TO_MS = 0.514444;
const AIR_DENSITY = 1.225;
const WATER_DENSITY = 1025;
const DEFAULT_YACHT = Object.freeze({
  sailArea: 78.5,
  keelArea: 3.2,
  rudderArea: 0.85,
  waterlineLength: 11.15,
  displacement: 8940,
  sailLead: 0.55,
  rudderArm: 4.2
});

const rad = (degrees: number): number => (degrees * Math.PI) / 180;
const deg = (radians: number): number => (radians * 180) / Math.PI;

const length = (vector: Vector): number => Math.hypot(vector.x, vector.y);
const add = (a: Vector, b: Vector): Vector => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (vector: Vector, factor: number): Vector => ({
  x: vector.x * factor,
  y: vector.y * factor
});
const unit = (vector: Vector): Vector =>
  length(vector) ? scale(vector, 1 / length(vector)) : { x: 0, y: 0 };
const dot = (a: Vector, b: Vector): number => a.x * b.x + a.y * b.y;
const cross = (a: Vector, b: Vector): number => a.x * b.y - a.y * b.x;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, amount: number): number => a + (b - a) * amount;

function normalizeSignedAngle(angle: number): number {
  const wrapped = ((((angle + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

function bracket(values: number[], value: number) {
  if (value <= values[0]) return { lo: 0, hi: 0, amount: 0 };

  const last = values.length - 1;
  if (value >= values[last]) return { lo: last, hi: last, amount: 0 };

  let lo = 0;
  while (lo < last && values[lo + 1] < value) lo++;

  const hi = lo + 1;
  return { lo, hi, amount: (value - values[lo]) / (values[hi] - values[lo]) };
}

function interpolateColumns(values: number[], windSpeed: number, scaleBelowChart = true): number {
  if (windSpeed <= 0) return 0;

  if (windSpeed < POLAR.tws[0]) {
    return scaleBelowChart ? (values[0] * windSpeed) / POLAR.tws[0] : values[0];
  }

  const wind = bracket(POLAR.tws, windSpeed);
  return lerp(values[wind.lo], values[wind.hi], wind.amount);
}

function polarMetadata(windSpeed: number) {
  const beatAngle = interpolateColumns(POLAR.metadata.beatAngles, windSpeed, false);
  const beatVmg = interpolateColumns(POLAR.metadata.beatVmg, windSpeed);
  const runAngle = interpolateColumns(POLAR.metadata.runAngles, windSpeed, false);
  const runVmg = interpolateColumns(POLAR.metadata.runVmg, windSpeed);
  return { beatAngle, beatVmg, runAngle, runVmg };
}

function polarSpeed(windSpeed: number, windAngle: number): number {
  const tws = Math.max(0, windSpeed);
  const twa = Math.abs(normalizeSignedAngle(windAngle));

  if (tws <= 0) return 0;

  const meta = polarMetadata(tws);
  if (twa + 1e-9 < meta.beatAngle) return 0;

  const angles = POLAR.points.map((point) => point.angle);
  const angle = bracket(angles, twa);
  const atLowAngle = interpolateColumns(POLAR.points[angle.lo].speeds, tws);
  const atHighAngle = interpolateColumns(POLAR.points[angle.hi].speeds, tws);
  return lerp(atLowAngle, atHighAngle, angle.amount);
}

function clampSailableWindAngle(windSpeed: number, windAngle: number, preferredSign = 1): number {
  const angle = normalizeSignedAngle(Number(windAngle) || 0);
  const beatAngle = polarMetadata(Math.max(0, Number(windSpeed) || 0)).beatAngle;

  if (Math.abs(angle) + 1e-9 >= beatAngle) return angle;

  const side = Math.sign(angle) || Math.sign(preferredSign) || 1;
  return side * beatAngle;
}

function signedAoA(chord: Vector, flow: Vector): number {
  let angle = Math.atan2(cross(chord, flow), dot(chord, flow));
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;
  return angle;
}

function foilCoefficients(alpha: number, config: FoilConfig) {
  const absAlpha = Math.abs(alpha);
  const sign = Math.sign(alpha) || 1;
  const stall = rad(config.stallDeg);

  let cl;
  if (absAlpha <= stall) {
    cl = sign * Math.min(config.clMax, config.slope * absAlpha);
  } else {
    const postStall = clamp((absAlpha - stall) / (Math.PI / 2 - stall), 0, 1);
    cl = sign * config.clMax * Math.cos((postStall * Math.PI) / 2);
  }

  const induced = (cl * cl) / (Math.PI * config.aspectRatio * config.efficiency);
  const separation =
    absAlpha > stall
      ? 1.05 * Math.sin(absAlpha) ** 2 * clamp((absAlpha - stall) / rad(22), 0, 1)
      : 0;
  return { cl, cd: config.cd0 + induced + separation };
}

function foilForce(
  flowVelocity: Vector,
  chord: Vector,
  density: number,
  area: number,
  config: FoilConfig
) {
  const speed = length(flowVelocity);
  if (speed < 0.01 || area <= 0) return { force: { x: 0, y: 0 }, alpha: 0, cl: 0, cd: 0 };

  const flow = unit(flowVelocity);
  const alpha = signedAoA(chord, flow);
  const coefficients = foilCoefficients(alpha, config);
  const dynamicArea = 0.5 * density * speed * speed * area;

  const liftNormal = { x: -flow.y, y: flow.x };
  const lift = scale(liftNormal, dynamicArea * coefficients.cl);
  const drag = scale(flow, dynamicArea * coefficients.cd);
  return { force: add(lift, drag), alpha, cl: coefficients.cl, cd: coefficients.cd };
}

function computeState(options: ComputeOptions) {
  const yacht = { ...DEFAULT_YACHT, ...(options.yacht || {}) };
  const windAngle = normalizeSignedAngle(Number(options.windAngle) || 0);
  const windSpeed = Math.max(0, Number(options.windSpeed) || 0);
  const sailAngle = clamp(Number(options.sailAngle) || 0, -90, 90);
  const helmAngle = clamp(Number(options.helmAngle) || 0, -35, 35);
  const boatSpeed = Math.max(0, Number(options.boatSpeed) || 0);
  const polarEquilibrium = Boolean(options.polarEquilibrium);

  const from = { x: Math.sin(rad(windAngle)), y: Math.cos(rad(windAngle)) };
  const trueWind = scale(from, -windSpeed);
  const boatVelocity = { x: 0, y: boatSpeed };
  const inducedWind = scale(boatVelocity, -1);
  const apparentWind = add(trueWind, inducedWind);
  const awSpeed = length(apparentWind);
  const apparentWindMS = scale(apparentWind, KNOT_TO_MS);

  // Aerodynamic load from the combined main and headsail model.
  const chord = { x: Math.sin(rad(sailAngle)), y: -Math.cos(rad(sailAngle)) };
  const sailResult = foilForce(apparentWindMS, chord, AIR_DENSITY, yacht.sailArea, {
    slope: 5.4,
    clMax: 1.28,
    stallDeg: 16,
    cd0: 0.035,
    aspectRatio: 4.2,
    efficiency: 0.72
  });
  const sailForce = sailResult.force;

  // Hydrodynamic foil and hull parameters.
  const boatSpeedMS = boatSpeed * KNOT_TO_MS;
  const keelConfig = {
    slope: 4.7,
    clMax: 1.05,
    stallDeg: 12,
    cd0: 0.012,
    aspectRatio: 2.25,
    efficiency: 0.75
  };
  const rudderConfig = {
    slope: 4.9,
    clMax: 1.1,
    stallDeg: 14,
    cd0: 0.014,
    aspectRatio: 2.1,
    efficiency: 0.72
  };
  const hullSpeedMS = 1.34 * Math.sqrt(yacht.waterlineLength * 3.28084) * KNOT_TO_MS;
  const displacementScale = (yacht.displacement / 8940) ** (2 / 3);

  function hydroAt(leeway: number) {
    if (boatSpeedMS < 0.05) {
      return {
        keelForce: { x: 0, y: 0 },
        rudderForce: { x: 0, y: 0 },
        hullForce: { x: 0, y: 0 },
        keelAlpha: 0,
        keelCl: 0,
        keelCd: 0,
        rudderAlpha: 0,
        rudderCl: 0,
        rudderCd: 0,
        drivingForce: sailForce.y,
        hullResistance: 0,
        speedRatio: 0,
        waterFlow: { x: 0, y: 0 },
        lateral: sailForce.x
      };
    }

    const boatVelocityMS = { x: Math.sin(leeway) * boatSpeedMS, y: Math.cos(leeway) * boatSpeedMS };
    const waterFlow = scale(boatVelocityMS, -1);

    const keel = foilForce(waterFlow, { x: 0, y: -1 }, WATER_DENSITY, yacht.keelArea, keelConfig);
    const rudderChord = { x: Math.sin(rad(helmAngle)), y: -Math.cos(rad(helmAngle)) };
    const rudder = foilForce(waterFlow, rudderChord, WATER_DENSITY, yacht.rudderArea, rudderConfig);

    const speedRatio = boatSpeedMS / Math.max(0.1, hullSpeedMS);
    const drivingForce = sailForce.y + keel.force.y + rudder.force.y;
    const empiricalResistance =
      145 * displacementScale * boatSpeedMS * boatSpeedMS * (1 + 0.55 * speedRatio ** 4);
    const hullResistance = polarEquilibrium
      ? Math.max(0, drivingForce) / Math.max(0.2, Math.cos(leeway))
      : empiricalResistance;
    const hullForce = scale(unit(boatVelocityMS), -hullResistance);

    return {
      keelForce: keel.force,
      rudderForce: rudder.force,
      hullForce,
      keelAlpha: keel.alpha,
      keelCl: keel.cl,
      keelCd: keel.cd,
      rudderAlpha: rudder.alpha,
      rudderCl: rudder.cl,
      rudderCd: rudder.cd,
      drivingForce,
      hullResistance,
      speedRatio,
      waterFlow,
      lateral: sailForce.x + keel.force.x + rudder.force.x + hullForce.x
    };
  }

  let leeway = 0;

  if (boatSpeedMS >= 0.05) {
    let lo = rad(-18),
      hi = rad(18);
    let lowResidual = hydroAt(lo).lateral;
    const highResidual = hydroAt(hi).lateral;
    if (lowResidual * highResidual <= 0) {
      for (let index = 0; index < 34; index++) {
        const mid = (lo + hi) / 2;
        const midResidual = hydroAt(mid).lateral;
        if (lowResidual * midResidual <= 0) hi = mid;
        else {
          lo = mid;
          lowResidual = midResidual;
        }
      }
      leeway = (lo + hi) / 2;
    } else {
      let best = { angle: 0, error: Infinity };
      for (let index = 0; index <= 72; index++) {
        const angle = rad(-18 + index * 0.5);
        const error = Math.abs(hydroAt(angle).lateral);
        if (error < best.error) best = { angle, error };
      }
      leeway = best.angle;
    }
  }

  // Compose the solved forces and moments into one renderable state.
  const hydro = hydroAt(leeway);
  const totalForce = add(add(add(sailForce, hydro.keelForce), hydro.rudderForce), hydro.hullForce);
  const yawMoment = -yacht.sailLead * sailForce.x + yacht.rudderArm * hydro.rudderForce.x;
  const apparentFrom = normalizeSignedAngle(deg(Math.atan2(-apparentWind.x, -apparentWind.y)));
  return {
    windAngle,
    windSpeed,
    sailAngle,
    helmAngle,
    boatSpeed,
    yacht,
    trueWind,
    inducedWind,
    apparentWind,
    apparentWindMS,
    awSpeed,
    apparentFrom,
    sailForce,
    keelForce: hydro.keelForce,
    rudderForce: hydro.rudderForce,
    hullForce: hydro.hullForce,
    totalForce,
    sailAlpha: sailResult.alpha,
    sailCl: sailResult.cl,
    sailCd: sailResult.cd,
    keelAlpha: hydro.keelAlpha,
    keelCl: hydro.keelCl,
    keelCd: hydro.keelCd,
    rudderAlpha: hydro.rudderAlpha,
    rudderCl: hydro.rudderCl,
    rudderCd: hydro.rudderCd,
    leeway,
    yawMoment,
    boatSpeedMS,
    hullSpeedMS,
    speedRatio: hydro.speedRatio,
    drivingForce: hydro.drivingForce,
    hullResistance: hydro.hullResistance,
    resistanceModel: polarEquilibrium ? 'polar-equilibrium' : 'empirical',
    waterFlow: hydro.waterFlow,
    lateralResidual: hydro.lateral
  };
}

export type PhysicsState = ReturnType<typeof computeState>;

function trimAtSpeed(options: TrimOptions) {
  const base = {
    windAngle: options.windAngle,
    windSpeed: options.windSpeed,
    boatSpeed: options.boatSpeed,
    yacht: options.yacht,
    polarEquilibrium: Boolean(options.polarEquilibrium)
  };
  if (base.windSpeed < 0.1 || base.boatSpeed < 0.05) {
    const sailAngle = clamp(-normalizeSignedAngle(base.windAngle), -90, 90);
    const result = computeState({ ...base, sailAngle, helmAngle: 0 });
    return { sailAngle, helmAngle: 0, result };
  }

  const tackSign = normalizeSignedAngle(base.windAngle) >= 0 ? -1 : 1;

  function evaluate(sailAngle: number, helmAngle: number) {
    return computeState({ ...base, sailAngle, helmAngle });
  }

  // Prefer roughly 15° incidence when near-equal post-stall solutions exist.
  // This prevents the optimizer from snapping between equivalent deep-reach trims.
  const apparentFrom = Math.abs(evaluate(0, 0).apparentFrom);
  const targetSailMagnitude = clamp(apparentFrom - 15, 0, 90);

  function balancedHelm(sailAngle: number) {
    let best = { helmAngle: 0, result: evaluate(sailAngle, 0) };
    let previous = { helmAngle: -25, result: evaluate(sailAngle, -25) };
    if (Math.abs(previous.result.yawMoment) < Math.abs(best.result.yawMoment)) best = previous;

    let bracketed = null;
    for (let helm = -24; helm <= 25; helm += 1) {
      const current = { helmAngle: helm, result: evaluate(sailAngle, helm) };
      if (Math.abs(current.result.yawMoment) < Math.abs(best.result.yawMoment)) best = current;
      if (!bracketed && previous.result.yawMoment * current.result.yawMoment <= 0)
        bracketed = { lo: previous, hi: current };
      previous = current;
    }

    if (bracketed) {
      let lo = bracketed.lo;
      let hi = bracketed.hi;
      for (let index = 0; index < 18; index++) {
        const helmAngle = (lo.helmAngle + hi.helmAngle) / 2;
        const mid = { helmAngle, result: evaluate(sailAngle, helmAngle) };
        if (Math.abs(mid.result.yawMoment) < Math.abs(best.result.yawMoment)) best = mid;
        if (lo.result.yawMoment * mid.result.yawMoment <= 0) hi = mid;
        else lo = mid;
      }
    }

    return {
      sailAngle,
      helmAngle: best.helmAngle,
      result: best.result,
      score:
        best.result.drivingForce -
        0.5 * (Math.abs(sailAngle) - targetSailMagnitude) ** 2 -
        0.15 * Math.abs(best.result.yawMoment)
    };
  }

  let best = balancedHelm(0);
  for (let magnitude = 2; magnitude <= 90; magnitude += 2) {
    const candidate = balancedHelm(tackSign * magnitude);
    if (candidate.score > best.score) best = candidate;
  }

  const coarse = Math.abs(best.sailAngle);
  for (
    let magnitude = Math.max(0, coarse - 2);
    magnitude <= Math.min(90, coarse + 2);
    magnitude += 0.25
  ) {
    const candidate = balancedHelm(tackSign * magnitude);
    if (candidate.score > best.score) best = candidate;
  }

  const sailAngle = best.sailAngle;
  const helmAngle = best.helmAngle;
  return { sailAngle, helmAngle, result: evaluate(sailAngle, helmAngle) };
}

function solveScenario(options: ScenarioOptions) {
  const windAngle = normalizeSignedAngle(Number(options.windAngle) || 0);
  const windSpeed = Math.max(0, Number(options.windSpeed) || 0);
  const boatSpeed = polarSpeed(windSpeed, windAngle);

  const trim = trimAtSpeed({
    windAngle,
    windSpeed,
    boatSpeed,
    yacht: options.yacht,
    polarEquilibrium: boatSpeed > 0
  });

  const metadata = polarMetadata(windSpeed);
  return {
    ...trim.result,
    polar: {
      speed: boatSpeed,
      source: POLAR.source,
      withinChartWindRange:
        windSpeed >= POLAR.tws[0] && windSpeed <= POLAR.tws[POLAR.tws.length - 1],
      noGo: Math.abs(windAngle) + 1e-9 < metadata.beatAngle,
      ...metadata
    }
  };
}

export type ScenarioState = ReturnType<typeof solveScenario>;

const rounded = (value: number, digits = 4): number => {
  const result = Number(value.toFixed(digits));
  return Object.is(result, -0) ? 0 : result;
};

const xyReport = (vector: Vector, digits = 3) => ({
  x: rounded(vector.x, digits),
  y: rounded(vector.y, digits)
});

function debugReport(state: ScenarioState) {
  return {
    schema: 'sailboat-tdd/v1',
    axes: 'x=starboard, y=forward; wind vectors point toward',
    input: {
      twa_from_deg: rounded(state.windAngle, 2),
      tws_kn: rounded(state.windSpeed, 2)
    },
    auto: {
      speed_kn: rounded(state.boatSpeed, 3),
      sail_deg: rounded(state.sailAngle, 2),
      helm_deg: rounded(state.helmAngle, 2),
      leeway_deg: rounded(deg(state.leeway), 3)
    },
    polar: {
      no_go: state.polar.noGo,
      beat_deg: rounded(state.polar.beatAngle, 2)
    },
    wind_kn: {
      true: xyReport(state.trueWind),
      induced: xyReport(state.inducedWind),
      apparent: xyReport(state.apparentWind),
      apparent_from_deg: rounded(state.apparentFrom, 2)
    },
    foil: {
      sail: {
        alpha_deg: rounded(deg(state.sailAlpha), 3),
        cl: rounded(state.sailCl),
        cd: rounded(state.sailCd)
      },
      keel: {
        alpha_deg: rounded(deg(state.keelAlpha), 3),
        cl: rounded(state.keelCl),
        cd: rounded(state.keelCd)
      },
      rudder: {
        alpha_deg: rounded(deg(state.rudderAlpha), 3),
        cl: rounded(state.rudderCl),
        cd: rounded(state.rudderCd)
      }
    },
    force_N: {
      sail: xyReport(state.sailForce, 1),
      keel: xyReport(state.keelForce, 1),
      rudder: xyReport(state.rudderForce, 1),
      hull: xyReport(state.hullForce, 1),
      total: xyReport(state.totalForce, 1)
    },
    balance: {
      lateral_N: rounded(state.lateralResidual, 2),
      longitudinal_N: rounded(state.totalForce.y, 2),
      yaw_Nm: rounded(state.yawMoment, 2)
    },
    model: state.resistanceModel
  };
}

const api = Object.freeze({
  KNOT_TO_MS,
  AIR_DENSITY,
  WATER_DENSITY,
  DEFAULT_YACHT,
  POLAR,
  rad,
  deg,
  length,
  add,
  scale,
  unit,
  dot,
  cross,
  clamp,
  normalizeSignedAngle,
  polarMetadata,
  polarSpeed,
  clampSailableWindAngle,
  signedAoA,
  foilCoefficients,
  foilForce,
  computeState,
  trimAtSpeed,
  solveScenario,
  debugReport
});

export {
  KNOT_TO_MS,
  AIR_DENSITY,
  WATER_DENSITY,
  DEFAULT_YACHT,
  POLAR,
  rad,
  deg,
  length,
  add,
  scale,
  unit,
  dot,
  cross,
  clamp,
  normalizeSignedAngle,
  polarMetadata,
  polarSpeed,
  clampSailableWindAngle,
  signedAoA,
  foilCoefficients,
  foilForce,
  computeState,
  trimAtSpeed,
  solveScenario,
  debugReport
};

export default api;
