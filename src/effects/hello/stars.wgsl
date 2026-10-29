#include "hash.wgsl"
#include "params.wgsl"

// Hello: a few hundred stars drifting slowly across a dark field, one instanced draw of quads into
// the HDR scene. Every star's position is a pure function of its index and the time, so there is
// no state and a held frame is exactly reproducible. Each star is a small disc of fixed size with a
// soft edge, added onto the sky.
//
// Deliberately naive: the disc's light is not conserved as it moves between pixels, so a faint
// star crawls and its brightness wavers as the field drifts. Story 2.3 measures that against
// Moon Temple's energy-conserving point layer, which `star-splat` uses.

@group(0) @binding(0) var<uniform> params: Params;

struct Varying {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) light: vec3f,
}

const CORNERS = array(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(1.0, 1.0));
/** The quad's half-width, in disc radii: room for the soft edge. */
const REACH = 1.6;

@vertex fn star_vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Varying {
  let h = hash_2to3(vec2f(f32(i), 7.0));
  let k = hash_2to3(vec2f(f32(i), 19.0));
  // A crude brightness spread: most stars faint, a few bright (light goes as the cube of a uniform
  // draw, a stand-in for 2.1's magnitude distribution).
  let bright = k.x * k.x * k.x;
  // A crude depth: brighter stars drift a little faster, as if nearer. Screen widths a second; the
  // whole field drifts one way, so the speeds stay under the motion check's 0.05 cap.
  let speed = mix(0.006, 0.012, bright) * params.speed;
  let x = fract(h.x - params.time * speed);
  let y = h.y;
  let corner = CORNERS[v];
  // Screen position: x across, y down, with a margin so stars enter and leave off-screen.
  let px = vec2f(x * (params.width + 16.0) - 8.0, y * (params.height + 16.0) - 8.0);
  let p = px + corner * params.size * REACH;
  // Colour: a crude warm-to-blue spread by a second draw (2.1 uses the blackbody fit).
  let warm = vec3f(1.0, 0.78, 0.55);
  let blue = vec3f(0.72, 0.82, 1.0);
  let tint = mix(warm, blue, k.y);
  var out: Varying;
  out.position = vec4f(p.x / params.width * 2.0 - 1.0, 1.0 - p.y / params.height * 2.0, 0.0, 1.0);
  out.local = corner * REACH;
  out.light = tint * mix(0.5, 6.0, bright) * params.gain * f32(i < u32(params.count));
  return out;
}

@fragment fn star_fs(in: Varying) -> @location(0) vec4f {
  let d = length(in.local);
  // A disc of the star's radius with a soft rim (`local` is in radii).
  let a = 1.0 - smoothstep(0.7, 1.15, d);
  return vec4f(in.light * a, 0.0);
}
