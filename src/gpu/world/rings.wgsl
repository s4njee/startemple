// rings.wgsl -- a planet's rings as a lit slab (story 5.5). TypeScript twin: src/gpu/world/rings.ts,
// which also builds the table. Lengths in planet radii, the planet a unit sphere at the origin.
//
//   ring_hit(ro, rd, normal) -> f32               where the ray meets the ring plane; < 0 if never
//   ring_sample(table, smp, r) -> vec2f           (optical depth, dust share) at radius r
//   ring_phase(c, dust) -> f32                    the particles' phase function of cos(scattering angle)
//   ring_slab(tau, mu_sun, mu_view, albedo, phase) -> f32
//                                                 light towards the viewer per unit of sunlight; the
//                                                 cosines are signed, the same sign is the lit side
//   ring_planet_shadow(p, sun) -> f32             1 lit, 0 where the planet hides the sun, softened
//   ring_shadow(table, smp, p, sun, normal) -> f32  sunlight reaching planet point p through the rings

const RING_INNER: f32 = 1.1;
const RING_OUTER: f32 = 2.4;
const RING_PI: f32 = 3.14159265358979;

fn ring_hit(ro: vec3f, rd: vec3f, normal: vec3f) -> f32 {
  let along = dot(rd, normal);
  if (abs(along) < 1e-6) {
    return -1.0;
  }
  return -dot(ro, normal) / along;
}

fn ring_sample(table: texture_2d<f32>, smp: sampler, r: f32) -> vec2f {
  if (r < RING_INNER || r > RING_OUTER) {
    return vec2f(0.0);
  }
  let u = (r - RING_INNER) / (RING_OUTER - RING_INNER);
  return textureSampleLevel(table, smp, vec2f(u, 0.5), 0.0).rg;
}

fn _ring_hg(c: f32, g: f32) -> f32 {
  return (1.0 - g * g) / (4.0 * RING_PI * pow(1.0 + g * g - 2.0 * g * c, 1.5));
}

fn ring_phase(c: f32, dust: f32) -> f32 {
  return (1.0 - dust) * _ring_hg(c, -0.3) + dust * _ring_hg(c, 0.7);
}

fn ring_slab(tau: f32, mu_sun: f32, mu_view: f32, albedo: f32, phase: f32) -> f32 {
  let m0 = max(abs(mu_sun), 1e-3);
  let m = max(abs(mu_view), 1e-3);
  if (mu_sun * mu_view > 0.0) {
    return albedo * phase * m0 / (m0 + m) * (1.0 - exp(-tau * (1.0 / m0 + 1.0 / m)));
  }
  if (abs(m0 - m) < 1e-4) {
    return albedo * phase * tau / m * exp(-tau / m);
  }
  return albedo * phase * m0 / (m0 - m) * (exp(-tau / m0) - exp(-tau / m));
}

fn ring_planet_shadow(p: vec3f, sun: vec3f) -> f32 {
  let b = dot(p, sun);
  if (b > 0.0) {
    return 1.0;
  }
  // How far the sun's ray passes from the planet's centre, against its radius: a soft edge, the
  // penumbra of the sun's disc seen from Saturn's distance stretched to read at page scale.
  let miss = sqrt(max(dot(p, p) - b * b, 0.0));
  return smoothstep(0.985, 1.015, miss);
}

fn ring_shadow(table: texture_2d<f32>, smp: sampler, p: vec3f, sun: vec3f, normal: vec3f) -> f32 {
  let t = ring_hit(p, sun, normal);
  if (t <= 0.0) {
    return 1.0;
  }
  let tau = ring_sample(table, smp, length(p + sun * t)).x;
  return exp(-tau / max(abs(dot(sun, normal)), 1e-3));
}
