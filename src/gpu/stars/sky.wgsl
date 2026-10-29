// The visitor's sky in WGSL (story 2.6): the twin of src/gpu/stars/sky.ts and
// src/gpu/stars/scintillation.ts, held to them by tests/sky-gpu.test.ts. Needs fbm.wgsl (for the
// horizon's ridge) and flicker.wgsl (for scintillation) included first.
//
//   sky_alt_az(ra, dec, lst, latitude) -> vec2f      altitude, azimuth (from north, through east)
//   sky_vector(alt, az) -> vec3f                     unit vector: x east, y north, z up
//   SkyView, sky_view(alt, az, scale)                 a stereographic view; scale is px per unit
//   sky_project(dir, view, out_size) -> vec3f         (x, y) px from the top left, z > 0 if in front
//   sky_unproject(px, view, out_size) -> vec3f        the direction a pixel looks along
//   sky_airmass(alt) -> f32                           Kasten and Young (1989)
//   sky_ridge(az, height, seed) -> f32                the horizon's skyline, radians above 0
//   scintillation_settings(alt, strength, wind)       the flicker a star twinkles with

const SKY_PI: f32 = 3.14159265358979;

fn sky_alt_az(ra: f32, dec: f32, lst: f32, latitude: f32) -> vec2f {
  let h = lst - ra;
  let sin_alt = sin(latitude) * sin(dec) + cos(latitude) * cos(dec) * cos(h);
  let alt = asin(clamp(sin_alt, -1.0, 1.0));
  let y = sin(h);
  let x = cos(h) * sin(latitude) - tan(dec) * cos(latitude);
  // atan2(0, 0) is NaN on Metal; only a star exactly at the zenith has both zero.
  var az = 0.0;
  if (abs(x) + abs(y) > 0.0) {
    az = atan2(y, x) + SKY_PI;
  }
  return vec2f(alt, az);
}

fn sky_vector(alt: f32, az: f32) -> vec3f {
  return vec3f(cos(alt) * sin(az), cos(alt) * cos(az), sin(alt));
}

struct SkyView {
  forward: vec3f,
  right: vec3f,
  up: vec3f,
  /// Pixels per unit of the stereographic plane.
  scale: f32,
}

fn sky_view(alt: f32, az: f32, scale: f32) -> SkyView {
  let forward = sky_vector(alt, az);
  let right = vec3f(cos(az), -sin(az), 0.0);
  return SkyView(forward, right, cross(right, forward), scale);
}

fn sky_project(dir: vec3f, view: SkyView, out_size: vec2f) -> vec3f {
  let z = dot(dir, view.forward);
  let k = 2.0 / max(1.0 + z, 1e-3);
  let p = vec2f(dot(dir, view.right), -dot(dir, view.up)) * k * view.scale;
  return vec3f(0.5 * out_size + p, z);
}

fn sky_unproject(px: vec2f, view: SkyView, out_size: vec2f) -> vec3f {
  let p = (px - 0.5 * out_size) / view.scale * vec2f(1.0, -1.0);
  let r2 = dot(p, p);
  let d = 4.0 + r2;
  return normalize(view.right * (4.0 * p.x / d) + view.up * (4.0 * p.y / d) + view.forward * ((4.0 - r2) / d));
}

fn sky_airmass(alt: f32) -> f32 {
  let a = max(alt, 0.0);
  return 1.0 / (sin(a) + 0.50572 * pow(degrees(a) + 6.07995, -1.6364));
}

/// A skyline of low hills: seamless round the horizon (noise sampled on a circle of azimuth).
fn sky_ridge(az: f32, height: f32, seed: f32) -> f32 {
  let n = fbm_2d(vec2f(cos(az), sin(az)) * 3.0 + vec2f(seed, 1.7 * seed), 5, 2.0, 0.5);
  return height * clamp(0.5 + 0.9 * n, 0.08, 1.0);
}

const SCINTILLATION_MAX_DEPTH: f32 = 0.85;
const SCINTILLATION_DEPTH_PER_AIRMASS: f32 = 0.07;

fn scintillation_settings(alt: f32, strength: f32, wind: f32) -> FlickerSettings {
  let x = sky_airmass(alt);
  let depth = min(SCINTILLATION_MAX_DEPTH, strength * SCINTILLATION_DEPTH_PER_AIRMASS * x);
  let rate = min(FLICKER_SAFE_MAX_RATE, wind * (1.2 + 0.12 * x));
  let shimmer = select(0.0, min(0.03, depth * 0.1), depth > 0.0);
  return FlickerSettings(rate, depth, shimmer, 14.0);
}
