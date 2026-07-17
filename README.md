# Sailboat Force Lab

A zero-dependency, top-down sailboat force visualizer written in TypeScript and bundled with Bun.

```sh
bun run dev
```

The server listens on `0.0.0.0:8000` by default. Override it with `HOST` and `PORT` environment variables.
`bun run build` creates a production bundle in the gitignored `dist/` directory.

## Model

- The desired heading is fixed at 0° with the bow pointing up.
- True-wind direction and speed are the only user inputs.
- Boat speed is interpolated from the Dufour 41x v2 polar chart using true-wind speed and absolute true-wind angle.
- The chart covers 4–30 kn and 0–180°. Speeds below 4 kn are scaled from the 4 kn curve; headings inside the interpolated beat angle are treated as no-go.
- Apparent wind is `true wind - boat velocity`.
- Sail, keel, and rudder loads use `F = ½ρV²SC`, finite-wing induced drag, and smooth post-stall behavior.
- Leeway is solved iteratively to balance lateral force.
- Sail angle is optimized automatically, and helm is solved continuously to minimize yaw moment.
- At the chart-derived steady speed, hull resistance is inferred from longitudinal balance so the force model agrees with the polar instead of predicting a contradictory acceleration or deceleration.
- The live TDD panel exports a compact, self-contained JSON case with the input, automatic outputs, wind vectors, foil coefficients, forces, and balance residuals.

The reference yacht uses Dufour 410 Grand Large dimensions: 11.15 m waterline, 8,940 kg light displacement, and a 78.5 m² standard sail plan. Keel and rudder planform areas remain modeled estimates.

## Files

- `index.html` — application markup and styling.
- `app.ts` — typed browser entry point and canvas rendering.
- `polar-data.ts` — TypeScript module containing the embedded Dufour 41x v2 chart digitized from the Dufour “Designed to Seduce” brochure.
- `physics.ts` — TypeScript module for polar interpolation, wind math, foil forces, leeway, trim, and scenario solving.
- `physics.test.ts` — unit and chart-regression tests.
- `server.ts` — Bun server for the bundled `dist/` output.

## Tests

```sh
bun test
```
