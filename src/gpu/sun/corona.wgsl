// corona.wgsl -- what is above the Sun's limb (story 6.2): the corona, the chromosphere and
// prominences. Needs noise.wgsl and fbm.wgsl. TypeScript twin: src/gpu/sun/sun.ts. Positions are
// on the sky in solar radii from the disc's centre, x along the solar equator, y to the north.
// Every brightness is relative to the centre of the disc: the corona is a millionth of it, which
// is why it shows only when the Moon covers the disc.
//
//   corona_k(r) -> f32                the K corona's radial profile (Baumbach 1937): sunlight
//                                     scattered by free electrons, in millionths of the disc
//   corona(p, activity, seed) -> f32  that profile shaped: helmet streamers along the equator at
//                                     solar minimum, all round at maximum (`activity` 0 to 1), fine
//                                     radial rays everywhere, plumes over the poles
//   chromosphere(p, time) -> f32      the thin red layer just above the limb, ragged with spicules
//   prominence(p, arch, time) -> f32  one arch of gas along a magnetic loop: `arch` is (position
//                                     angle of its middle, half its span in angle, its height in
//                                     radii, its thickness), all on the sky

fn corona_k(r: f32) -> f32 {
  return 0.0532 * pow(r, -2.5) + 1.425 * pow(r, -7.0) + 2.565 * pow(r, -17.0);
}

fn corona(p: vec2f, activity: f32, seed: f32) -> f32 {
  let r = length(p);
  if (r < 1.0) {
    return 0.0;
  }
  let a = atan2(p.y, p.x);
  let lr = log(r);
  // Distance from the equator in angle: 0 along it, pi/2 over the poles.
  let from_equator = abs(atan2(p.y, abs(p.x)));
  let equatorial = exp(-pow(from_equator / 0.5, 2.0));
  let where_streamers = mix(equatorial, 0.65, activity);
  // Streamers: bright stalks, wide at the base and narrowing outwards, which bend a little.
  let s = 0.5 + 0.5 * fbm_2d(vec2f(a * 2.6 + seed, lr * 0.7 - seed), 4, 2.0, 0.5) * 1.6;
  let streamers = pow(clamp(s, 0.0, 1.0), 3.0) * 2.4;
  // Fine rays, everywhere, and plumes over the poles when the Sun is quiet.
  let rays = 0.5 + 0.5 * gnoise_2d(vec2f(a * 70.0 + seed, lr * 1.2));
  let polar = (1.0 - equatorial) * (1.0 - activity) * pow(0.5 + 0.5 * gnoise_2d(vec2f(a * 140.0, lr * 0.8 + seed)), 4.0);
  return corona_k(r) * (0.3 + where_streamers * streamers + 0.25 * rays + 0.6 * polar);
}

fn chromosphere(p: vec2f, time: f32) -> f32 {
  let r = length(p);
  if (r < 1.0) {
    return 0.0;
  }
  let a = atan2(p.y, p.x);
  // Spicules: jets a few thousand km high, so the layer's top is ragged.
  let top = 0.006 + 0.005 * (0.5 + 0.5 * gnoise_2d(vec2f(a * 300.0, time * 0.3)));
  return exp(-(r - 1.0) / (0.35 * top)) * smoothstep(top * 1.6, top * 0.4, r - 1.0);
}

fn prominence(p: vec2f, arch: vec4f, time: f32) -> f32 {
  let r = length(p);
  if (r < 1.0 || arch.z <= 0.0 || r > 1.0 + arch.z * 1.4 + arch.w * 3.0) {
    return 0.0;
  }
  let c = vec2f(cos(arch.x), sin(arch.x));
  // Nowhere near this arch's stretch of the limb: nothing to draw, and no noise to evaluate.
  if (dot(p / r, c) < cos(arch.y * 1.3 + arch.z + arch.w * 3.0)) {
    return 0.0;
  }
  let t = vec2f(-c.y, c.x);
  // The arch stands on the chord between its feet; above the chord, the limb bulges 1 - cos(span).
  let half_chord = sin(arch.y);
  let base = cos(arch.y);
  let height = arch.z + 1.0 - base;
  let u = dot(p, t) / half_chord;
  let v = (dot(p, c) - base) / height;
  if (v < 0.0) {
    return 0.0;
  }
  let along = atan2(v, u);
  let radial = length(vec2f(u, v));
  let distance = abs(radial - 1.0) * min(half_chord, height);
  // Strands: the arch is threads of gas along the field, some brighter, drifting slowly; and a
  // fainter sheet fills it below, as a hedgerow prominence does.
  let strands = 0.35 + 0.65 * smoothstep(-0.3, 0.6, fbm_2d(vec2f(along * 7.0, radial * 14.0 + time * 0.03), 5, 2.0, 0.55));
  let thick = arch.w * (0.6 + 0.8 * (0.5 + 0.5 * gnoise_2d(vec2f(along * 4.0, 3.0))));
  let sheet = 0.35 * smoothstep(1.0, 0.6, radial) * (0.5 + 0.5 * fbm_2d(vec2f(u * 30.0, v * 8.0 + time * 0.02), 4, 2.0, 0.5));
  return (exp(-pow(distance / thick, 2.0)) + sheet) * strands;
}
