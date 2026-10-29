// world.wgsl -- a planet's surface on a cube projected onto a sphere (story 5.1). Needs fbm.wgsl
// (and so noise.wgsl and hash.wgsl). TypeScript twin: src/gpu/world/cube-sphere.ts.
//
// Everything is a function of the direction from the planet's centre, evaluated in 3D, so it has
// no pole and no seam: the cube map it is baked into (world-bake.wgsl) is only a cache of it, and
// the hardware filters a cube map across its edges.
//
//   cube_direction(face, s, t) -> vec3f   the direction of a face point, s right and t down in [-1, 1]
//   world_height(d, seed) -> f32          about -1 to 1: continents with wandering coasts, ridged
//                                         mountains on the high ground
//   world_clouds(d, seed) -> f32          0 to 1: cloud density, swirled, banded by latitude
//   world_cities(d, seed, height) -> f32  0 to 1: where the lights are, on lowland coasts and plains
//   world_moisture(d, seed) -> f32        0 to 1: dry to wet, for the colour of the land
//   world_ice(height, latitude, sea, ice_latitude, lapse) -> f32
//                                         0 to 1: the ice line, past `ice_latitude` and nearer the
//                                         equator the higher the ground, softened over a degree

fn cube_direction(face: u32, s: f32, t: f32) -> vec3f {
  switch (face) {
    case 0u: { return vec3f(1.0, -t, -s); }
    case 1u: { return vec3f(-1.0, -t, s); }
    case 2u: { return vec3f(s, 1.0, t); }
    case 3u: { return vec3f(s, -1.0, -t); }
    case 4u: { return vec3f(s, -t, 1.0); }
    default: { return vec3f(-s, -t, -1.0); }
  }
}

fn _world_warp(p: vec3f, octaves: i32) -> vec3f {
  return vec3f(
    fbm_3d(p + vec3f(11.3, 0.0, 0.0), octaves, 2.0, 0.5),
    fbm_3d(p + vec3f(0.0, 23.7, 0.0), octaves, 2.0, 0.5),
    fbm_3d(p + vec3f(0.0, 0.0, 37.1), octaves, 2.0, 0.5),
  );
}

fn world_height(d: vec3f, seed: vec3f) -> f32 {
  // Continents: low frequencies, the sample point itself warped, so coasts wander and bays form.
  let q = d * 1.4 + seed;
  let p = q + 0.7 * _world_warp(q * 0.8, 3);
  let continents = 1.5 * fbm_3d(p, 8, 2.03, 0.5);
  // Mountains: ridges (one minus the noise's magnitude, squared), only on the high ground.
  let r = 1.0 - abs(gnoise_3d(p * 3.7 + 5.0));
  let r2 = 1.0 - abs(gnoise_3d(p * 8.3 + 9.0));
  let ridges = r * r * (0.6 + 0.4 * r2 * r2);
  return continents + 0.35 * ridges * smoothstep(0.02, 0.35, continents);
}

fn world_clouds(d: vec3f, seed: vec3f) -> f32 {
  let q = d * 2.6 + seed + 71.0;
  // Swirled twice, so the cloud reads as weather systems, not as blobs.
  let p = q + 0.9 * _world_warp(q * 0.7, 3);
  let n = fbm_3d(p * 1.6, 6, 2.1, 0.55);
  // Bands by latitude: a wet belt at the equator, storm tracks at mid latitudes, dry subtropics.
  let lat = asin(clamp(d.y, -1.0, 1.0));
  let band = 0.18 * cos(lat * 6.0) + 0.08 * cos(lat * 2.0);
  return clamp(0.5 + 1.3 * n + band, 0.0, 1.0);
}

fn world_cities(d: vec3f, seed: vec3f, height: f32) -> f32 {
  // Clusters of lit ground, then towns within them: two scales of noise, thresholded.
  let regions = smoothstep(0.05, 0.35, fbm_3d(d * 5.0 + seed + 131.0, 4, 2.0, 0.5));
  let towns = smoothstep(0.1, 0.45, fbm_3d(d * 40.0 + seed + 151.0, 3, 2.0, 0.5));
  // On the lowlands, most of all near the coast; none on the mountains.
  let coast = 1.0 - smoothstep(0.0, 0.25, height);
  return regions * towns * (0.35 + 0.65 * coast) * (1.0 - smoothstep(0.3, 0.5, height));
}

fn world_moisture(d: vec3f, seed: vec3f) -> f32 {
  let lat = asin(clamp(d.y, -1.0, 1.0));
  // Dry belts near 25° north and south, as the Hadley cells make them.
  let belt = exp(-pow((abs(lat) - 0.42) / 0.16, 2.0));
  return clamp(0.6 + 0.9 * fbm_3d(d * 2.2 + seed + 211.0, 5, 2.0, 0.5) - 0.55 * belt, 0.0, 1.0);
}

fn world_ice(height: f32, latitude: f32, sea: f32, ice_latitude: f32, lapse: f32) -> f32 {
  let line = ice_latitude - lapse * max(height - sea, 0.0);
  return smoothstep(line - 0.02, line + 0.02, abs(latitude));
}
