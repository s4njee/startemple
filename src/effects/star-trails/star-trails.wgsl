#include "fullscreen.wgsl"
#include "fbm.wgsl"
#include "../../gpu/stars/spot-core.wgsl"
#include "params.wgsl"

// star-trails (story 2.5): a long exposure facing the celestial pole, in closed form. Over an
// exposure of E hours every star sweeps an arc of 15° an hour round the pole, so each star's trail
// is an arc whose length grows with the exposure. Nothing accumulates: every frame draws each arc
// at the exposure's current length, so there is nothing to truncate and nothing left after a
// resize.
//
//   sky_fs      the sky's glow, brightest towards the horizon.
//   trail_vs/fs one instanced quad per piece of each star's arc (SEGMENTS pieces a star). The trail
//               is the star spot drawn along the arc: a Gaussian of `sigma` integrated across each
//               pixel radially, and the arc's ends softened by the same Gaussian along it. The
//               pieces' coverages add up to the whole arc's exactly, so they join without seams.
//               A star's light is spread along its arc as a photograph spreads it: a star spends
//               less time on each pixel the farther it is from the pole, so its trail is fainter
//               there, by 1 / r.
//   ground_fs   a skyline of hills along the bottom, over the trails.

@group(0) @binding(0) var<uniform> params: Params;

struct Trail {
  /// Distance from the pole (in frame heights), start angle (radians), light, unused.
  at: vec4f,
  colour: vec4f,
}

@group(0) @binding(1) var<storage, read> trails: array<Trail>;

const TRAIL_PI: f32 = 3.14159265358979;
/// Pieces each star's arc is drawn in. Up to 45° of arc, each piece's chord is within 0.2 px of
/// the arc at 1 500 px from the pole.
const SEGMENTS: u32 = 24u;

fn wrap_signed(a: f32) -> f32 {
  return a - 2.0 * TRAIL_PI * floor((a + TRAIL_PI) / (2.0 * TRAIL_PI));
}

/// The standard normal's cumulative distribution, from erfc so its tails keep their precision.
fn trail_cdf(z: f32) -> f32 {
  let e = 0.5 * spot_erfc(abs(z) * 0.70710678);
  return select(1.0 - e, e, z < 0.0);
}

fn skyline(x: f32) -> f32 {
  // Height of the hills above the frame's bottom, as a share of its height.
  let n = fbm_2d(vec2f(x * 2.6 + params.seed, params.seed * 0.37), 5, 2.0, 0.5);
  return params.hills * (0.55 + 0.7 * n);
}

// --- Sky and ground -------------------------------------------------------------------------------

@fragment fn sky_fs(in: FullscreenVarying) -> @location(0) vec4f {
  // Brighter towards the bottom of the frame, where the line of sight runs through more air.
  let low = smoothstep(0.2, 1.0, in.uv.y);
  return vec4f(mix(params.zenith, params.horizon, low * low) * params.glow, 1.0);
}

@fragment fn ground_fs(in: FullscreenVarying) -> @location(0) vec4f {
  let top = 1.0 - skyline(in.uv.x);
  // A one-pixel edge, so the hills' outline does not stair-step.
  let cover = clamp((in.uv.y - top) * params.out_size.y + 0.5, 0.0, 1.0);
  return vec4f(params.horizon * params.glow * 0.05, cover);
}

// --- Trails ---------------------------------------------------------------------------------------

struct TrailVarying {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) radius: f32,
  /// The piece's middle angle and half-length along the arc, px.
  @location(1) @interpolate(flat) piece: vec2f,
  @location(2) @interpolate(flat) light: vec3f,
}

@vertex fn trail_vs(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> TrailVarying {
  let star = trails[instance / SEGMENTS];
  let k = f32(instance % SEGMENTS);
  let r = star.at.x * params.scale;
  // The arc runs from where the star is now (the leading end) back to where the exposure began.
  // Seen facing the pole, the sky turns anticlockwise: decreasing angle, with y down.
  let a1 = star.at.y - params.sweep * k / f32(SEGMENTS);
  let a0 = star.at.y - params.sweep * (k + 1.0) / f32(SEGMENTS);
  let mid = 0.5 * (a0 + a1);
  let half_length = 0.5 * (a1 - a0) * r;
  // The quad: the piece's annular sector, padded by the spot's reach all round.
  let reach = SPOT_REACH * params.sigma + 1.5;
  let pad = reach / max(r, 1.0);
  let corner = array(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0), vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0))[vertex];
  let angle = mix(a0 - pad, a1 + pad, corner.x);
  // The chord of a piece sits inside its arc by its sagitta; one extra pixel covers it.
  let radius = mix(max(r - reach, 0.0), r + reach + 1.0, corner.y);
  let pixel = params.pole + radius * vec2f(cos(angle), sin(angle));
  var out: TrailVarying;
  out.position = vec4f(pixel / params.out_size * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  out.radius = r;
  out.piece = vec2f(mid, half_length);
  // Light per pixel of trail: the star's light over its speed across the frame, ∝ 1 / r.
  out.light = star.colour.rgb * star.at.z * params.gain / max(r, params.min_radius);
  if (params.sweep <= 0.0) {
    out.position = vec4f(2.0, 2.0, 0.0, 1.0);
  }
  return out;
}

@fragment fn trail_fs(in: TrailVarying) -> @location(0) vec4f {
  let d = in.position.xy - params.pole;
  let rho = length(d);
  let phi = atan2(d.y, d.x);
  let across = spot_span(rho - in.radius, params.sigma);
  // Along the arc, from the piece's middle, px.
  let x = wrap_signed(phi - in.piece.x) * in.radius;
  let along = trail_cdf((in.piece.y - x) / params.sigma) - trail_cdf((-in.piece.y - x) / params.sigma);
  let share = across * along;
  if (share <= 0.0) {
    discard;
  }
  return vec4f(in.light * share, 0.0);
}
