#include "fullscreen.wgsl"
#include "fbm.wgsl"
#include "volume.wgsl"
#include "params.wgsl"

// nebula-volume (story 3.4): a ray-marched emission nebula, in four passes.
//
//   bake        once: 3D noise into a 96³ texture, four fields, so the march reads one filtered
//               fetch per step instead of computing a fractal sum (Fire Temple's lesson for flames).
//   march       at a reduced resolution: each pixel's ray through the cloud's box, front to back,
//               with Fire Temple's emission-absorption kernel (src/wgsl/volume.wgsl). The gas glows
//               in 3.1's emission lines, brightest near the stars inside it that ionise it, and its
//               dust absorbs, a little more in blue. The start of each ray is jittered, and the
//               jitter moves every frame.
//   accumulate  the new march blended into the history (an exponential average over about four
//               frames), so the jitter's grain averages away. The view turns slowly enough that the
//               history barely lags it.
//   composite   the accumulated cloud upsampled over the scene: scene × transmittance + light.

@group(0) @binding(0) var<uniform> params: Params;

// --- bake ---------------------------------------------------------------------------------------

@group(0) @binding(1) var noise_out: texture_storage_3d<rgba16float, write>;

@compute @workgroup_size(4, 4, 4) fn bake(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(noise_out);
  if (any(id >= size)) {
    return;
  }
  let p = (vec3f(id) + 0.5) / vec3f(size) * 4.0 + params.seed;
  let gas = fbm_3d(p, 5, 2.0, 0.5);
  let hot = fbm_3d(p * 1.3 + 7.1, 4, 2.0, 0.5);
  let dust = fbm_3d(p * 1.7 - 3.3, 5, 2.0, 0.55);
  let warp = fbm_3d(p * 0.7 + 11.0, 3, 2.0, 0.5);
  textureStore(noise_out, id, vec4f(gas, hot, dust, warp) * 0.5 + 0.5);
}

// --- march --------------------------------------------------------------------------------------

@group(0) @binding(2) var noise: texture_3d<f32>;
@group(0) @binding(3) var noise_sampler: sampler;
/// The stars inside the cloud: (position, light).
@group(0) @binding(4) var<storage, read> lamps: array<vec4f>;

fn field(p: vec3f) -> vec4f {
  // p in [-1, 1]³; the texture spans it once.
  let uvw = p * 0.5 + 0.5;
  let w = textureSampleLevel(noise, noise_sampler, uvw * 0.6 + 0.2, 0.0).a - 0.5;
  return textureSampleLevel(noise, noise_sampler, uvw + vec3f(w * 0.12), 0.0) * 2.0 - 1.0;
}

fn ray_dir(pixel: vec2f, size: vec2f) -> vec3f {
  let ndc = (pixel / size) * 2.0 - 1.0;
  return normalize(params.forward + ndc.x * params.tan_fov.x * params.right - ndc.y * params.tan_fov.y * params.up);
}

@fragment fn march(in: FullscreenVarying) -> @location(0) vec4f {
  let dir = ray_dir(in.position.xy, params.march_size);
  let span = volume_ray_box(params.eye, dir, vec3f(-1.0), vec3f(1.0));
  if (!volume_hit(span)) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  let jitter = volume_jitter(in.position.xy, u32(params.frame));
  let m = volume_march_steps(span, i32(params.steps), jitter);
  var acc = volume_start();
  for (var i = 0; i < m.steps; i++) {
    let p = params.eye + dir * volume_march_t(m, i);
    let f = field(p);
    // A soft ball, so the cloud has an edge inside the box rather than the box's own.
    let ball = smoothstep(1.0, 0.45, length(p));
    let gas = smoothstep(-0.12, 0.35, f.x) * ball;
    let hot = smoothstep(0.0, 0.35, f.y) * gas;
    let dust = smoothstep(0.05, 0.4, f.z) * ball * params.dust;
    // The lamps light the gas near them: ionised gas glows brightest close to the stars.
    var lit = 0.0;
    for (var k = 0u; k < u32(params.lamp_count); k++) {
      let d = lamps[k].xyz - p;
      lit += lamps[k].w / (dot(d, d) + 0.04);
    }
    let excite = params.ambient + lit;
    let emission =
      (params.hydrogen_alpha * gas * params.strength.y +
       params.hydrogen_beta * gas * params.strength.w +
       params.oxygen * hot * params.strength.z * (0.5 + lit) +
       params.sulphur * gas * (1.0 - hot) * params.strength.x) * excite * params.glow;
    // Dust absorbs, a little more of the blue; the gas itself is thin.
    let sigma = dust * params.density * vec3f(0.8, 1.0, 1.2) + gas * 0.15;
    acc = volume_accumulate_medium(acc, volume_emitter(emission, sigma), m.ds);
    if (volume_opaque(acc, 0.01)) {
      break;
    }
  }
  return volume_resolve(acc, 0.01);
}

// --- accumulate and composite --------------------------------------------------------------------

@group(0) @binding(5) var current: texture_2d<f32>;
@group(0) @binding(6) var history: texture_2d<f32>;

@fragment fn accumulate(in: FullscreenVarying) -> @location(0) vec4f {
  let px = vec2i(in.position.xy);
  let now = textureLoad(current, px, 0);
  let before = textureLoad(history, px, 0);
  return mix(before, now, params.blend);
}

@group(0) @binding(7) var cloud: texture_2d<f32>;
@group(0) @binding(8) var cloud_sampler: sampler;

@fragment fn composite(in: FullscreenVarying) -> @location(0) vec4f {
  return textureSampleLevel(cloud, cloud_sampler, in.uv, 0.0);
}
