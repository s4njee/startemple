// atmosphere.wgsl -- a planet's air: Rayleigh and Mie scattering, single and multiple (story 5.2).
// TypeScript twin and reference: src/gpu/world/atmosphere.ts. Units are kilometres, positions
// relative to the planet's centre. Built to be Light Temple's E5-S6 sky as well, so nothing in
// it knows about a camera or a screen.
//
// The air thins exponentially with height: Rayleigh scattering (molecules: blue, scale height 8 km)
// and Mie (aerosols: grey, forward-peaked, 1.2 km). Light reaching the eye along a ray is the sum,
// over points on it, of sunlight that reached the point, scattered towards the eye there, and dimmed
// on the way: the single-scattering integral. Three ways to find the sunlight's dimming at each point:
//
//   ATMO_ANALYTIC   the Chapman function in closed form (its large-planet asymptote): the column of air
//                   from the point to space along the sun's direction, with no second march. A
//                   short march along the view and two closed forms a step. Needs no tables.
//   ATMO_LUT        Hillaire's method (2020): the sun's transmittance read from a 256 × 64 table of
//                   (radius, cosine) baked once, and the light scattered more than once from a
//                   32 × 32 table, Ψ_ms, added at every step as an isotropic source. Seen from inside
//                   the air, the whole sky comes from a 192 × 108 sky-view table baked each frame.
//   ATMO_REFERENCE  a second march to the top of the air at every step: the brute force, to measure
//                   the other two against.
//
// Each step's light is integrated over the step against its own extinction (Hillaire's energy-
// conserving form), so few steps lose less.
//
//   atmo_sphere(ro, rd, radius) -> vec2f          a ray's two crossings of a sphere; x > y if none
//   atmo_density(atmo, r) -> vec2f                (Rayleigh, Mie) density at radius r, 1 at the ground
//   atmo_column(r, mu, ground, height) -> f32     the column to space along cosine mu, Chapman's form
//   atmo_depth_analytic(atmo, r, mu) -> vec3f     optical depth to space along mu, closed form
//   atmo_depth_march(atmo, r, mu, steps) -> vec3f the same by marching
//   atmo_sun_visible(atmo, r, mu) -> f32          0 where the planet hides the sun, soft over its disc
//   atmo_rayleigh_phase(c), atmo_mie_phase(c, g)  phase functions of the angle's cosine
//   atmo_lut_uv(atmo, r, mu), atmo_lut_r_mu(atmo, uv)   the transmittance table's parametrisation
//   atmo_integrate(...) -> AtmoResult             the single (and, with ms, multiple) scattering
//                                                 along a segment of a ray: in-scattered light per
//                                                 unit of sun illuminance, and transmittance

const ATMO_ANALYTIC: u32 = 0u;
const ATMO_LUT: u32 = 1u;
const ATMO_REFERENCE: u32 = 2u;
const ATMO_PI: f32 = 3.14159265358979;
/// The sun's angular radius, radians: the planet's shadow edge is softened over it.
const ATMO_SUN_RADIUS: f32 = 0.00465;

struct Atmo {
  ground: f32,
  top: f32,
  /// Rayleigh scattering at the ground, per km (it absorbs nothing, so it is the extinction too).
  rayleigh: vec3f,
  rayleigh_height: f32,
  /// Mie scattering and extinction at the ground, per km.
  mie: f32,
  mie_extinction: f32,
  mie_height: f32,
  mie_g: f32,
}

struct AtmoResult {
  inscatter: vec3f,
  transmittance: vec3f,
}

fn atmo_sphere(ro: vec3f, rd: vec3f, radius: f32) -> vec2f {
  let b = dot(ro, rd);
  let c = dot(ro, ro) - radius * radius;
  let h = b * b - c;
  if (h < 0.0) {
    return vec2f(1.0, -1.0);
  }
  let s = sqrt(h);
  return vec2f(-b - s, -b + s);
}

fn atmo_density(atmo: Atmo, r: f32) -> vec2f {
  let h = max(r - atmo.ground, 0.0);
  return vec2f(exp(-h / atmo.rayleigh_height), exp(-h / atmo.mie_height));
}

fn atmo_extinction(atmo: Atmo, density: vec2f) -> vec3f {
  return atmo.rayleigh * density.x + vec3f(atmo.mie_extinction * density.y);
}

/// Chapman's grazing-incidence function for mu >= 0: its asymptotic form for a large planet,
/// sqrt(pi x / 2) erfcx(sqrt(x / 2) mu), 1 overhead and sqrt(pi x / 2) at the horizon, with
/// erfcx(y) = exp(y²) erfc(y) fitted here as 1 / (1.13 y + sqrt(0.41275 y² + 0.04 y + 1)), within
/// 0.2% for every y >= 0. (Schüler's simpler c / ((c − 1) mu + 1) is up to 14% low between 2° and
/// 20° above the horizon, where a low sun spends its evening.)
fn _atmo_chapman(x: f32, mu: f32) -> f32 {
  let y = sqrt(0.5 * x) * mu;
  return sqrt(1.5707963 * x) / (1.13 * y + sqrt(0.41275 * y * y + 0.04 * y + 1.0));
}

fn atmo_column(r: f32, mu: f32, ground: f32, height: f32) -> f32 {
  if (mu >= 0.0) {
    return height * exp((ground - r) / height) * _atmo_chapman(r / height, mu);
  }
  // Downwards: twice the column from the ray's lowest point out, less the part behind the start.
  // The lowest point's radius, r sin(chi), written so it does not cancel near the horizon.
  let s = sqrt(max(1.0 - mu * mu, 0.0));
  let low = r - r * mu * mu / (1.0 + s);
  let deep = min((ground - low) / height, 80.0);
  return height * (2.0 * exp(deep) * _atmo_chapman(low / height, 0.0) -
    exp((ground - r) / height) * _atmo_chapman(r / height, -mu));
}

fn atmo_depth_analytic(atmo: Atmo, r: f32, mu: f32) -> vec3f {
  let rayleigh = atmo_column(r, mu, atmo.ground, atmo.rayleigh_height);
  let mie = atmo_column(r, mu, atmo.ground, atmo.mie_height);
  return atmo.rayleigh * rayleigh + vec3f(atmo.mie_extinction * mie);
}

/// Distance from radius r along cosine mu to the top of the air.
fn atmo_to_top(atmo: Atmo, r: f32, mu: f32) -> f32 {
  return max(-r * mu + sqrt(max(r * r * (mu * mu - 1.0) + atmo.top * atmo.top, 0.0)), 0.0);
}

fn atmo_depth_march(atmo: Atmo, r: f32, mu: f32, steps: i32) -> vec3f {
  let d = atmo_to_top(atmo, r, mu);
  let dt = d / f32(steps);
  var depth = vec3f(0.0);
  for (var i = 0; i < steps; i++) {
    let t = (f32(i) + 0.5) * dt;
    let ri = sqrt(r * r + t * t + 2.0 * r * mu * t);
    depth += atmo_extinction(atmo, atmo_density(atmo, ri)) * dt;
  }
  return depth;
}

fn atmo_sun_visible(atmo: Atmo, r: f32, mu: f32) -> f32 {
  let horizon = -sqrt(max(1.0 - (atmo.ground / r) * (atmo.ground / r), 0.0));
  return smoothstep(horizon - ATMO_SUN_RADIUS, horizon + ATMO_SUN_RADIUS, mu);
}

fn atmo_rayleigh_phase(c: f32) -> f32 {
  return 3.0 / (16.0 * ATMO_PI) * (1.0 + c * c);
}

/// Cornette and Shanks' form of the Henyey-Greenstein phase function, as Hillaire uses.
fn atmo_mie_phase(c: f32, g: f32) -> f32 {
  let g2 = g * g;
  let k = 3.0 / (8.0 * ATMO_PI) * (1.0 - g2) / (2.0 + g2);
  return k * (1.0 + c * c) / pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5);
}

// --- The transmittance table (Bruneton and Neyret's parametrisation) ------------------------------

fn atmo_lut_uv(atmo: Atmo, r: f32, mu: f32) -> vec2f {
  let h = sqrt(max(atmo.top * atmo.top - atmo.ground * atmo.ground, 0.0));
  let rho = sqrt(max(r * r - atmo.ground * atmo.ground, 0.0));
  let d = atmo_to_top(atmo, r, mu);
  let d_min = atmo.top - r;
  let d_max = rho + h;
  return vec2f((d - d_min) / max(d_max - d_min, 1e-6), rho / h);
}

fn atmo_lut_r_mu(atmo: Atmo, uv: vec2f) -> vec2f {
  let h = sqrt(max(atmo.top * atmo.top - atmo.ground * atmo.ground, 0.0));
  let rho = h * uv.y;
  let r = sqrt(rho * rho + atmo.ground * atmo.ground);
  let d_min = atmo.top - r;
  let d_max = rho + h;
  let d = d_min + uv.x * (d_max - d_min);
  var mu = 1.0;
  if (d > 0.0) {
    mu = clamp((h * h - rho * rho - d * d) / (2.0 * r * d), -1.0, 1.0);
  }
  return vec2f(r, mu);
}

fn atmo_lut_transmittance(atmo: Atmo, lut: texture_2d<f32>, smp: sampler, r: f32, mu: f32) -> vec3f {
  return textureSampleLevel(lut, smp, atmo_lut_uv(atmo, r, mu), 0.0).rgb;
}

/// The multiple-scattering table: (cosine of the sun's zenith angle, height through the air).
fn atmo_ms_uv(atmo: Atmo, r: f32, mu_sun: f32) -> vec2f {
  return vec2f(0.5 + 0.5 * mu_sun, clamp((r - atmo.ground) / (atmo.top - atmo.ground), 0.0, 1.0));
}

/// The sun's light reaching radius r, cosine mu_sun, through the air, by `method`.
fn atmo_sun_transmittance(
  atmo: Atmo,
  method: u32,
  lut: texture_2d<f32>,
  smp: sampler,
  r: f32,
  mu_sun: f32,
) -> vec3f {
  let visible = atmo_sun_visible(atmo, r, mu_sun);
  if (method == ATMO_LUT) {
    return atmo_lut_transmittance(atmo, lut, smp, r, mu_sun) * visible;
  }
  if (method == ATMO_REFERENCE) {
    return exp(-atmo_depth_march(atmo, r, mu_sun, 32)) * visible;
  }
  return exp(-atmo_depth_analytic(atmo, r, mu_sun)) * visible;
}

/// Light scattered towards the eye along ro + rd t, t from t0 to t1, per unit of sun illuminance,
/// and the transmittance over that stretch. `ms` adds Hillaire's multiple scattering (ATMO_LUT only).
fn atmo_integrate(
  atmo: Atmo,
  ro: vec3f,
  rd: vec3f,
  t0: f32,
  t1: f32,
  sun: vec3f,
  steps: i32,
  method: u32,
  ms: bool,
  lut: texture_2d<f32>,
  ms_lut: texture_2d<f32>,
  smp: sampler,
) -> AtmoResult {
  var out: AtmoResult;
  out.inscatter = vec3f(0.0);
  out.transmittance = vec3f(1.0);
  if (t1 <= t0) {
    return out;
  }
  let dt = (t1 - t0) / f32(steps);
  let c = dot(rd, sun);
  let pr = atmo_rayleigh_phase(c);
  let pm = atmo_mie_phase(c, atmo.mie_g);
  for (var i = 0; i < steps; i++) {
    let p = ro + rd * (t0 + (f32(i) + 0.5) * dt);
    let r = length(p);
    let mu_sun = dot(p, sun) / r;
    let density = atmo_density(atmo, r);
    let extinction = atmo_extinction(atmo, density);
    let rayleigh = atmo.rayleigh * density.x;
    let mie = atmo.mie * density.y;
    let lit = atmo_sun_transmittance(atmo, method, lut, smp, r, mu_sun);
    var source = (rayleigh * pr + vec3f(mie * pm)) * lit;
    if (ms) {
      source += (rayleigh + vec3f(mie)) * textureSampleLevel(ms_lut, smp, atmo_ms_uv(atmo, r, mu_sun), 0.0).rgb;
    }
    let step = exp(-extinction * dt);
    out.inscatter += out.transmittance * (source - source * step) / max(extinction, vec3f(1e-9));
    out.transmittance *= step;
  }
  return out;
}

// --- Seen from inside the air: the sky-view table's parametrisation -------------------------------

/// The elevation of the horizon from radius r: below zero, the planet's curve.
fn atmo_horizon_elevation(atmo: Atmo, r: f32) -> f32 {
  return -acos(clamp(sqrt(max(r * r - atmo.ground * atmo.ground, 0.0)) / r, -1.0, 1.0));
}

/// (azimuth from the sun, 0 to pi, elevation) to the table's uv: the rows crowd at the horizon.
fn atmo_sky_uv(atmo: Atmo, r: f32, azimuth: f32, elevation: f32) -> vec2f {
  let e = atmo_horizon_elevation(atmo, r);
  var v = 0.5;
  if (elevation >= e) {
    v = 0.5 + 0.5 * sqrt((elevation - e) / (0.5 * ATMO_PI - e));
  } else {
    v = 0.5 - 0.5 * sqrt((e - elevation) / (e + 0.5 * ATMO_PI));
  }
  return vec2f(clamp(azimuth / ATMO_PI, 0.0, 1.0), clamp(v, 0.0, 1.0));
}

fn atmo_sky_direction(atmo: Atmo, r: f32, uv: vec2f) -> vec2f {
  let e = atmo_horizon_elevation(atmo, r);
  var elevation = e;
  if (uv.y >= 0.5) {
    let k = 2.0 * uv.y - 1.0;
    elevation = e + k * k * (0.5 * ATMO_PI - e);
  } else {
    let k = 1.0 - 2.0 * uv.y;
    elevation = e - k * k * (e + 0.5 * ATMO_PI);
  }
  return vec2f(uv.x * ATMO_PI, elevation);
}
