/*
 * A planet's surface as a cube projected onto a sphere (story 5.1).
 *
 * A latitude-longitude map pinches at the poles: a whole row of texels meets in one point, and
 * noise sampled in it streaks there. A cube does not. Each of its six faces is a square grid, and a
 * direction from the centre lands on exactly one face, so every texel covers a patch of sphere of
 * about the same size (within a factor of 5.2 between a face's centre and its corners, for this
 * gnomonic projection, against the infinite spread of a lat-long map's last row).
 *
 * The cube here is the GPU's own cube map, so a shader samples it with a direction and the
 * hardware picks the face and filters across the edges, seamlessly. This file is its CPU twin:
 * which direction a face texel stands for, in WebGPU's face order and orientation (+X, −X, +Y, −Y,
 * +Z, −Z; s to the right, t down, as the Vulkan and D3D specifications define the faces), and the
 * inverse. The bake (`world.wgsl`) evaluates everything at the texel's direction in 3D, so there
 * is no seam to hide in the first place: two texels either side of an edge are two points on the
 * sphere a texel apart. `tests/world.test.ts` checks both, on the CPU and on the GPU.
 *
 * Then what a texel is: rock above the sea level, ocean below it, ice where it is cold enough, by
 * latitude and by height.
 */

export type Vec3 = [number, number, number];

/** WebGPU's cube face order: the layer index of each face. */
export const FACES = ['+x', '-x', '+y', '-y', '+z', '-z'] as const;

/**
 * The direction (not normalised) of face `face` at face coordinates `s`, `t` in [−1, 1], s to
 * the right and t down when the face is drawn as a texture. `world.wgsl`'s `cube_direction`.
 */
export function cubeDirection(face: number, s: number, t: number): Vec3 {
  switch (face) {
    case 0:
      return [1, -t, -s];
    case 1:
      return [-1, -t, s];
    case 2:
      return [s, 1, t];
    case 3:
      return [s, -1, -t];
    case 4:
      return [s, -t, 1];
    default:
      return [-s, -t, -1];
  }
}

/** Which face a direction lands on, and where: the inverse of `cubeDirection`. */
export function cubeFace(d: readonly number[]): { face: number; s: number; t: number } {
  const [x, y, z] = d as Vec3;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  if (ax >= ay && ax >= az) {
    return x > 0 ? { face: 0, s: -z / ax, t: -y / ax } : { face: 1, s: z / ax, t: -y / ax };
  }
  if (ay >= az) {
    return y > 0 ? { face: 2, s: x / ay, t: z / ay } : { face: 3, s: x / ay, t: -z / ay };
  }
  return z > 0 ? { face: 4, s: x / az, t: -y / az } : { face: 5, s: -x / az, t: -y / az };
}

/** The unit direction of texel (x, y) of a face `size` texels wide, at the texel's centre. */
export function texelDirection(face: number, x: number, y: number, size: number): Vec3 {
  const s = (2 * (x + 0.5)) / size - 1;
  const t = (2 * (y + 0.5)) / size - 1;
  return normalise(cubeDirection(face, s, t));
}

/** The solid angle a texel at (s, t) covers, over a centre texel's: 1 at the centre, 0.19 at a corner. */
export function texelArea(s: number, t: number): number {
  return (1 + s * s + t * t) ** -1.5;
}

export function normalise(v: readonly number[]): Vec3 {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / l, v[1]! / l, v[2]! / l];
}

// --- What the surface is -------------------------------------------------------------------------

export type Surface = 'ocean' | 'land' | 'ice';

export interface SurfaceRule {
  /** Height below which a texel is ocean, in the bake's units (about −1 to 1). */
  seaLevel: number;
  /** Latitude, radians, past which the ground is ice at sea level. */
  iceLatitude: number;
  /** How far height pushes the ice line towards the equator: radians per unit of height. */
  iceLapse: number;
}

export const EARTHLIKE: SurfaceRule = { seaLevel: 0, iceLatitude: 1.2, iceLapse: 0.9 };

/**
 * Ice where it is cold: past `iceLatitude`, and nearer the equator the higher the ground (mountains
 * hold snow). The sea freezes too, past the ice line, as the Arctic does. `world.wgsl`'s
 * `world_ice`, which returns the same line softened.
 */
export function surfaceAt(
  height: number,
  latitude: number,
  rule: SurfaceRule = EARTHLIKE,
): Surface {
  const above = Math.max(0, height - rule.seaLevel);
  const line = rule.iceLatitude - rule.iceLapse * above;
  if (Math.abs(latitude) >= line) return 'ice';
  return height < rule.seaLevel ? 'ocean' : 'land';
}
