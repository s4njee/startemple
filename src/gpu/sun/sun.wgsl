// sun.wgsl -- the Sun's visible surface, the photosphere (story 6.1). Needs hash.wgsl, noise.wgsl
// and blackbody.wgsl. TypeScript twin: src/gpu/sun/sun.ts.
//
// Limb darkening from the physics: looking at the disc's centre we see deeper, hotter gas than at
// its edge, where the line of sight runs slantwise through the top of the photosphere. In a grey
// atmosphere the temperature at optical depth tau is T⁴ = 3/4 T_eff⁴ (tau + 2/3) (Eddington), and
// the light from a point on the disc is about the Planck light of the gas at tau = mu, the cosine
// of the angle from the disc's centre (Eddington-Barbier). So each pixel has a temperature, from
// 6 100 K at the centre to 4 850 K at the limb, and its colour and brightness are a blackbody's:
// the limb is darker and redder by the same law, without fitted coefficients. At 555 nm it falls
// to a third, as the measured profile does.
//
// Granulation: convection cells, hot gas rising in their centres and cool gas sinking in the lanes
// between. Each cell is a weighted Worley cell in 3D on the sphere: a seed that lives for a while,
// its weight rising from zero, holding and falling back, so the cell grows from a point, pushes
// its neighbours aside and shrinks away, and a new one takes its place with no pop. The bright
// centres are a few per cent hotter, which the Planck curve turns into fifteen per cent brighter.
//
//   sun_temperature(mu) -> f32                 the Eddington-Barbier temperature at cosine mu, K
//   sun_light(t) -> vec3f                      a blackbody's light at t, 1 at the disc centre's
//   sun_granulation(p, time) -> vec2f          (granule brightness 0..1, lane closeness 0..1) at p
//                                              (in cell units, on the sphere), time in lifetimes

const SUN_TEFF: f32 = 5772.0;
/// hc / (k · 555 nm), K: the exponent of Planck's law at the eye's peak.
const SUN_C2_555: f32 = 25924.0;

fn sun_temperature(mu: f32) -> f32 {
  return SUN_TEFF * pow(0.75 * (max(mu, 0.0) + 2.0 / 3.0), 0.25);
}

fn _sun_planck(t: f32) -> f32 {
  return 1.0 / (exp(SUN_C2_555 / t) - 1.0);
}

fn sun_light(t: f32) -> vec3f {
  let centre = sun_temperature(1.0);
  return blackbody_fit(t) * _sun_planck(t) / _sun_planck(centre);
}

fn sun_granulation(p: vec3f, time: f32) -> vec2f {
  let cell = vec3i(floor(p));
  let f = p - floor(p);
  var d1 = 1e9;
  var d2 = 1e9;
  var bright = 0.0;
  for (var z = -1; z <= 1; z++) {
    for (var y = -1; y <= 1; y++) {
      for (var x = -1; x <= 1; x++) {
        let c = cell + vec3i(x, y, z);
        let h = ihash_3to3(c);
        // Each cell's seeds live one after another, offset in phase so no two cells keep time.
        let age = time + h.z * 9.0;
        let generation = floor(age);
        let life = age - generation;
        let at = ihash_3to3(c + vec3i(i32(generation) * 7919, 131, 17));
        let site = vec3f(f32(x), f32(y), f32(z)) + 0.1 + 0.8 * at;
        let weight = sin(3.14159265 * life);
        let d = length(site - f) / (0.25 + 0.75 * weight);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          bright = weight;
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
  }
  return vec2f(bright * (1.0 - 0.5 * smoothstep(0.0, 1.0, d1)), 1.0 - smoothstep(0.0, 0.35, d2 - d1));
}
