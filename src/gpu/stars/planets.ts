/*
 * Where the planets are (stories 4.5 and 7.6): E. M. Standish's Keplerian elements for approximate
 * positions of the major planets (JPL, table 1, valid 1800–2050), good to a few arcminutes for the
 * inner planets and better than a degree for the outer, which is far finer than any page needs.
 *
 *   heliocentric(planet, jd)   position in AU, ecliptic and equinox of J2000 (x to the equinox)
 *   geocentric(planet, jd)     right ascension and declination as seen from Earth, and distance
 *   magnitude(planet, jd)      its brightness in the sky, roughly (no rings, simple phase terms)
 *
 * Positions are worked out in double precision here and handed to the GPU only as screen
 * positions, so the solar system's span (4.5 × 10¹² m, where f32 is good to 524 km) never reaches
 * f32: the floating origin of the plan's decisions, in its simplest form.
 */

export type Planet =
  'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';
export const PLANETS: readonly Planet[] = [
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
];

/**
 * a (AU), e, I (°), L mean longitude (°), ϖ longitude of perihelion (°), Ω longitude of the
 * ascending node (°): at J2000, then their rates per Julian century. "earth" is the Earth–Moon
 * barycentre.
 */
const ELEMENTS: Record<Planet, [number[], number[]]> = {
  mercury: [
    [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  ],
  venus: [
    [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  ],
  earth: [
    [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
  ],
  mars: [
    [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  ],
  jupiter: [
    [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  ],
  saturn: [
    [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  ],
  uranus: [
    [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  ],
  neptune: [
    [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  ],
};

/** Absolute magnitude and phase coefficient (magnitudes per degree of phase angle), roughly. */
const BRIGHTNESS: Record<Planet, [number, number]> = {
  mercury: [-0.42, 0.038],
  venus: [-4.4, 0.013],
  earth: [-3.86, 0.01],
  mars: [-1.52, 0.016],
  jupiter: [-9.4, 0.005],
  saturn: [-8.88, 0.044],
  uranus: [-7.19, 0.002],
  neptune: [-6.87, 0],
};

/** The brightest each planet ever appears. */
const BRIGHTEST: Record<Planet, number> = {
  mercury: -2.5,
  venus: -4.9,
  earth: -4,
  mars: -2.9,
  jupiter: -2.94,
  saturn: -0.55,
  uranus: 5.3,
  neptune: 7.7,
};

/** The planets' colours as the eye sees them in the sky, linear. */
export const PLANET_COLOURS: Record<Planet, [number, number, number]> = {
  mercury: [0.78, 0.72, 0.66],
  venus: [1, 0.96, 0.86],
  earth: [0.45, 0.65, 1],
  mars: [1, 0.55, 0.32],
  jupiter: [1, 0.9, 0.74],
  saturn: [1, 0.88, 0.62],
  uranus: [0.7, 0.92, 0.95],
  neptune: [0.5, 0.65, 1],
};

const deg = Math.PI / 180;
/** The obliquity of the ecliptic at J2000. */
const OBLIQUITY = 23.43928 * deg;

export type Vec3 = [number, number, number];

/** Solves Kepler's equation M = E − e sin E for E (radians), by Newton's method. */
export function eccentricAnomaly(m: number, e: number): number {
  let E = m + e * Math.sin(m);
  for (let i = 0; i < 12; i++) {
    const d = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

/** The elements at Julian date `jd`: a, e, I, ω (argument of perihelion), Ω, M (radians but a). */
export function elements(planet: Planet, jd: number) {
  const t = (jd - 2_451_545) / 36_525;
  const [base, rate] = ELEMENTS[planet];
  const v = base.map((b, i) => b + rate[i]! * t);
  const [a, e, I, L, peri, node] = v as [number, number, number, number, number, number];
  const m = ((((L - peri) % 360) + 540) % 360) - 180;
  return { a, e, I: I * deg, omega: (peri - node) * deg, node: node * deg, M: m * deg };
}

/** Heliocentric position in AU, ecliptic and equinox of J2000. */
export function heliocentric(planet: Planet, jd: number): Vec3 {
  const { a, e, I, omega, node, M } = elements(planet, jd);
  return orbitPoint(a, e, I, omega, node, eccentricAnomaly(M, e));
}

/** The point at eccentric anomaly E on an orbit, in the ecliptic frame. */
export function orbitPoint(
  a: number,
  e: number,
  I: number,
  omega: number,
  node: number,
  E: number,
): Vec3 {
  const x = a * (Math.cos(E) - e);
  const y = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const co = Math.cos(omega);
  const so = Math.sin(omega);
  const cn = Math.cos(node);
  const sn = Math.sin(node);
  const ci = Math.cos(I);
  const si = Math.sin(I);
  return [
    (co * cn - so * sn * ci) * x + (-so * cn - co * sn * ci) * y,
    (co * sn + so * cn * ci) * x + (-so * sn + co * cn * ci) * y,
    so * si * x + co * si * y,
  ];
}

/** Right ascension and declination (radians, equinox of J2000) and distance (AU), from Earth. */
export function geocentric(
  planet: Planet,
  jd: number,
): { ra: number; dec: number; distance: number } {
  const p = planet === 'earth' ? ([0, 0, 0] as Vec3) : heliocentric(planet, jd);
  const earth = heliocentric('earth', jd);
  const d: Vec3 = [p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]];
  // Ecliptic to equatorial: a turn by the obliquity about x.
  const x = d[0];
  const y = d[1] * Math.cos(OBLIQUITY) - d[2] * Math.sin(OBLIQUITY);
  const z = d[1] * Math.sin(OBLIQUITY) + d[2] * Math.cos(OBLIQUITY);
  const distance = Math.hypot(x, y, z);
  return {
    ra: (Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI),
    dec: Math.asin(z / distance),
    distance,
  };
}

/** The Sun's right ascension and declination from Earth, from the same elements. */
export function sunPosition(jd: number): { ra: number; dec: number } {
  const earth = heliocentric('earth', jd);
  const x = -earth[0];
  const y = -earth[1] * Math.cos(OBLIQUITY) + earth[2] * Math.sin(OBLIQUITY);
  const z = -earth[1] * Math.sin(OBLIQUITY) - earth[2] * Math.cos(OBLIQUITY);
  return {
    ra: (Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI),
    dec: Math.asin(z / Math.hypot(x, y, z)),
  };
}

/** A planet's magnitude in the sky: H + 5 log10(r Δ) plus a phase term. Rough, no rings. */
export function magnitude(planet: Planet, jd: number): number {
  const p = heliocentric(planet, jd);
  const earth = heliocentric('earth', jd);
  const r = Math.hypot(...p);
  const d: Vec3 = [p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]];
  const delta = Math.hypot(...d);
  // The phase angle at the planet, between the Sun (along −p) and Earth (along −d).
  const cos = (p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) / (r * delta);
  const phase = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  const [h, k] = BRIGHTNESS[planet];
  // A linear phase law is too bright for a crescent Venus or Mercury near the Sun; no planet is
  // brighter than it ever gets.
  return Math.max(BRIGHTEST[planet], h + 5 * Math.log10(r * delta) + k * phase);
}
