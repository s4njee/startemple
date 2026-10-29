#include "fullscreen.wgsl"
#include "fbm.wgsl"
#include "world.wgsl"
#include "bake-params.wgsl"

// The world's cube map, one face per pass (story 5.1): height, cloud, city lights and moisture at
// each texel's direction. Drawn once, when the planet is made or its seed changes.

@group(0) @binding(0) var<uniform> bake: BakeParams;

@fragment fn bake_fs(in: FullscreenVarying) -> @location(0) vec4f {
  let s = 2.0 * in.position.x / bake.size - 1.0;
  let t = 2.0 * in.position.y / bake.size - 1.0;
  let d = normalize(cube_direction(bake.face, s, t));
  let h = world_height(d, bake.seed);
  return vec4f(h, world_clouds(d, bake.seed), world_cities(d, bake.seed, h - bake.sea), world_moisture(d, bake.seed));
}
