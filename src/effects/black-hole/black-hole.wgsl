diagnostic(off, derivative_uniformity);

#include "fullscreen.wgsl"
#include "hash.wgsl"
#include "fbm.wgsl"
#include "blackbody.wgsl"
#include "../../gpu/gravity/geodesic.wgsl"
#include "params.wgsl"

// black-hole (story 4.3): a Schwarzschild black hole with an accretion disc, every pixel's ray
// traced through the metric (src/gpu/gravity/geodesic.wgsl), after James, von Tunzelmann, Franklin
// and Thorne's paper on the hole in _Interstellar_.
//
//   trace       at a reduced resolution: each ray from the camera, step by step. One that falls
//               through the horizon is black. One that crosses the disc's plane between its inner
//               edge (the innermost stable orbit, 3) and its outer edge picks up the disc's light
//               there, and goes on, dimmed, so the far side's image bent over the top shows
//               too. One that escapes looks up the sky in the direction it leaves along.
//   accumulate  the new trace into the history, with a jittered ray each frame, so the edges average.
//   composite   the history upsampled into the scene.
//
// The disc. Its temperature falls with radius as a thin disc's does (Shakura and Sunyaev), its gas
// orbits at the circular speed, so the side coming towards the viewer is Doppler-brightened and
// shifted blue, the far side dimmed and reddened; and light climbing out of the hole's well is
// redshifted by sqrt(1 − 1/r), which dims the inner edge.

@group(0) @binding(0) var<uniform> params: Params;

/// The sky along `dir`, where `across` and `down` are how far `dir` moves for one trace pixel
/// across and down the image: the lens's mapping from the image to the sky, here.
fn sky(dir: vec3f, across: vec3f, down: vec3f, edge: bool) -> vec3f {
  // Stars: a star in some cells of a fine grid of directions. A star is a point, so it is drawn as a
  // spot of fixed size in the image, not in the sky: its offset from this pixel's direction is
  // taken back through the mapping into image pixels (least squares, the directions being 3D),
  // and its light is scaled by the lens's magnification, the pixel's angle squared over the area
  // the pixel sees on the sky. Drawn a fixed angle wide in the sky instead, a star sheared by the
  // lens becomes a long arc, and round the hole those arcs line up into rings: a striped pattern.
  let aa = dot(across, across);
  let ab = dot(across, down);
  let bb = dot(down, down);
  let det = aa * bb - ab * ab;
  let seen = length(cross(across, down));
  let magnification = clamp(params.pixel_angle * params.pixel_angle / max(seen, 1e-12), 0.0, 4.0);
  let lon = atan2(dir.z, dir.x);
  let lat = asin(clamp(dir.y, -1.0, 1.0));
  let cells = vec2f(params.sky_cells * 2.0, params.sky_cells);
  let uv = vec2f(lon / 6.2831853 + 0.5, lat / 3.1415927 + 0.5) * cells;
  var light = vec3f(0.0);
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let cell = floor(uv) + vec2f(f32(i), f32(j));
      let h = hash_2to3(cell);
      if (h.z > params.sky_density) {
        continue;
      }
      let centre = (cell + h.xy) / cells;
      let slon = (centre.x - 0.5) * 6.2831853;
      let slat = (centre.y - 0.5) * 3.1415927;
      let s = vec3f(cos(slat) * cos(slon), sin(slat), cos(slat) * sin(slon));
      let offset = s - dir;
      let along = vec2f(dot(across, offset), dot(down, offset));
      let pixels = vec2f(bb * along.x - ab * along.y, aa * along.y - ab * along.x) / det;
      let bright = (pow(fract(h.z * 91.7), 4.0) * 2.5 + 0.06) * params.sky_stars;
      let tint = mix(vec3f(1.0, 0.82, 0.62), vec3f(0.72, 0.82, 1.0), fract(h.x * 37.3));
      light += tint * bright * exp(-0.5 * dot(pixels, pixels) / (STAR_SIGMA * STAR_SIGMA));
    }
  }
  // Where the mapping is lost (a pixel beside the shadow, whose neighbour fell in, or one so
  // demagnified it is degenerate) there are no stars, only the glow.
  light *= select(magnification, 0.0, edge || det <= 0.0);
  // A faint band of the galaxy's light, mottled.
  let band = exp(-pow(dot(dir, normalize(vec3f(0.3, 0.9, 0.2))) / 0.25, 2.0));
  let mottle = 0.5 + 0.5 * fbm_3d(dir * 4.0, 4, 2.0, 0.5);
  return light + vec3f(0.035, 0.03, 0.028) * band * mottle * params.sky_glow;
}

fn disc(p: vec3f, ray_dir: vec3f) -> vec3f {
  let r = length(p.xz);
  // Thin-disc temperature, peaking just outside the inner edge.
  let profile = pow(params.disc_inner / r, 0.75) * pow(max(1.0 - sqrt(params.disc_inner / r), 0.0), 0.25) / 0.488;
  // Gas on circular orbits about +y: its speed as a static observer sees it, β = sqrt(0.5 / (r − 1)).
  let beta = sqrt(0.5 / (r - 1.0));
  let gamma = 1.0 / sqrt(1.0 - beta * beta);
  let along = normalize(vec3f(-p.z, 0.0, p.x));
  // Light that reaches the camera leaves along −ray_dir.
  let doppler = 1.0 / (gamma * (1.0 - beta * dot(along, -ray_dir) * params.beaming));
  let gravity = select(1.0, sqrt(1.0 - 1.0 / r), params.redshift > 0.5);
  let g = doppler * gravity;
  let temperature = params.disc_temperature * profile * g;
  // Intensity: a blackbody's grows as T⁴; beaming adds g³ for light seen in one band. Tamed, so
  // the far side still shows.
  let intensity = pow(profile, 2.0) * pow(g, 3.0);
  // Faint, irregular streaks in the gas, so its motion reads. Sharp evenly spaced rings here read
  // as a striped pattern to the pattern analyser, so they are soft, warped and shallow.
  let q = vec2f(r * 1.3, atan2(p.z, p.x) * 1.5 + params.time * 0.3 / r);
  let streaks = 0.9 + 0.1 * fbm_2d(q + 0.6 * vec2f(fbm_2d(q * 0.7, 3, 2.0, 0.5), 0.0), 3, 2.0, 0.5);
  let fade = smoothstep(params.disc_outer, params.disc_outer * 0.7, r);
  return blackbody_fit(clamp(temperature, 900.0, 40000.0)) * intensity * streaks * fade * params.disc_glow;
}

/// A star's width, trace pixels.
const STAR_SIGMA = 0.6;

fn camera_ray(pixel: vec2f, size: vec2f, jitter: vec2f) -> vec3f {
  // Shifted so the hole sits where the page wants it, off the frame's centre.
  let ndc = ((pixel + jitter - 0.5) / size) * 2.0 - 1.0 - params.shift;
  return normalize(params.forward + ndc.x * params.tan_fov.x * params.right - ndc.y * params.tan_fov.y * params.up);
}

@fragment fn trace(in: FullscreenVarying) -> @location(0) vec4f {
  // One offset for the whole frame, so neighbouring rays stay a pixel apart (the sky's mapping
  // below is taken from them); it moves each frame so the history averages the edges.
  let jitter = hash_2to2(vec2f(params.frame * 7.31, params.frame * 3.17));
  let start = camera_ray(in.position.xy, params.trace_size, jitter);
  var ray = GrRay(params.eye, start);
  let h2 = gr_h2(ray);
  var light = vec3f(0.0);
  var through = 1.0;
  let escape = length(params.eye) * 1.5;
  var captured = false;
  for (var i = 0; i < i32(params.steps); i++) {
    let r = length(ray.x);
    if (r < 1.0) {
      // Through the horizon: nothing comes back.
      captured = true;
      break;
    }
    if (r > escape && dot(ray.x, ray.v) > 0.0) {
      break;
    }
    let next = gr_step(ray, h2, gr_step_length(r));
    // Crossing the disc's plane: where, by linear interpolation, and whether it is in the disc.
    if (ray.x.y * next.x.y < 0.0) {
      let t = ray.x.y / (ray.x.y - next.x.y);
      let p = mix(ray.x, next.x, t);
      let rp = length(p.xz);
      if (rp > params.disc_inner && rp < params.disc_outer) {
        light += through * disc(p, normalize(ray.v));
        through *= params.disc_transmission;
      }
    }
    ray = next;
  }
  // Every pixel comes here, captured or not, so the derivatives see their neighbours.
  let out = normalize(ray.v);
  let across = dpdx(out);
  let down = dpdy(out);
  let edge = fwidth(select(0.0, 1.0, captured)) > 0.0;
  if (captured) {
    return vec4f(light, 1.0);
  }
  light += through * sky(out, across, down, edge);
  return vec4f(light, 1.0);
}

@group(0) @binding(1) var current: texture_2d<f32>;
@group(0) @binding(2) var history: texture_2d<f32>;

@fragment fn accumulate(in: FullscreenVarying) -> @location(0) vec4f {
  let px = vec2i(in.position.xy);
  return mix(textureLoad(history, px, 0), textureLoad(current, px, 0), params.blend);
}

@group(0) @binding(3) var image: texture_2d<f32>;
@group(0) @binding(4) var image_sampler: sampler;

@fragment fn composite(in: FullscreenVarying) -> @location(0) vec4f {
  return textureSampleLevel(image, image_sampler, in.uv, 0.0);
}
