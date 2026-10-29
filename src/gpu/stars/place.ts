/*
 * Where the visitor is, roughly, without asking (story 2.6): their time zone names a city, and the
 * city's latitude and longitude are good enough for the sky. A degree or two of latitude moves the
 * pole by as much, which nobody can see in a page's sky; the longitude only shifts the time a star
 * rises. Geolocation is used only if the page asks for it and the visitor grants it.
 */

export interface Place {
  /** Degrees, north and east positive. */
  latitude: number;
  longitude: number;
  /** What the place was taken from, for the page to say. */
  source: string;
}

/** The main IANA zones by their city: latitude, longitude. Others fall back on the UTC offset. */
const ZONES: Record<string, [number, number]> = {
  'America/New_York': [40.71, -74.01],
  'America/Chicago': [41.88, -87.63],
  'America/Denver': [39.74, -104.99],
  'America/Phoenix': [33.45, -112.07],
  'America/Los_Angeles': [34.05, -118.24],
  'America/Anchorage': [61.22, -149.9],
  'America/Toronto': [43.65, -79.38],
  'America/Vancouver': [49.28, -123.12],
  'America/Mexico_City': [19.43, -99.13],
  'America/Sao_Paulo': [-23.55, -46.63],
  'America/Argentina/Buenos_Aires': [-34.6, -58.38],
  'America/Bogota': [4.71, -74.07],
  'America/Lima': [-12.05, -77.04],
  'America/Santiago': [-33.45, -70.67],
  'Pacific/Honolulu': [21.31, -157.86],
  'Europe/London': [51.51, -0.13],
  'Europe/Dublin': [53.35, -6.26],
  'Europe/Lisbon': [38.72, -9.14],
  'Europe/Paris': [48.86, 2.35],
  'Europe/Madrid': [40.42, -3.7],
  'Europe/Berlin': [52.52, 13.4],
  'Europe/Rome': [41.9, 12.5],
  'Europe/Amsterdam': [52.37, 4.9],
  'Europe/Stockholm': [59.33, 18.07],
  'Europe/Helsinki': [60.17, 24.94],
  'Europe/Athens': [37.98, 23.73],
  'Europe/Istanbul': [41.01, 28.98],
  'Europe/Moscow': [55.76, 37.62],
  'Africa/Cairo': [30.04, 31.24],
  'Africa/Lagos': [6.52, 3.38],
  'Africa/Nairobi': [-1.29, 36.82],
  'Africa/Johannesburg': [-26.2, 28.05],
  'Asia/Dubai': [25.2, 55.27],
  'Asia/Kolkata': [22.57, 88.36],
  'Asia/Colombo': [6.93, 79.86],
  'Asia/Bangkok': [13.76, 100.5],
  'Asia/Singapore': [1.35, 103.82],
  'Asia/Shanghai': [31.23, 121.47],
  'Asia/Hong_Kong': [22.32, 114.17],
  'Asia/Tokyo': [35.68, 139.69],
  'Asia/Seoul': [37.57, 126.98],
  'Asia/Jakarta': [-6.21, 106.85],
  'Australia/Sydney': [-33.87, 151.21],
  'Australia/Melbourne': [-37.81, 144.96],
  'Australia/Perth': [-31.95, 115.86],
  'Pacific/Auckland': [-36.85, 174.76],
};

/** A place from a time zone name and its UTC offset now (minutes east), with a fallback. */
export function placeFromTimeZone(zone: string | undefined, offsetMinutes: number): Place {
  const known = zone ? ZONES[zone] : undefined;
  if (known) return { latitude: known[0], longitude: known[1], source: zone! };
  // Unknown zone: its offset gives the longitude to about 15°; a northern mid-latitude, where most
  // visitors are, for the latitude.
  return { latitude: 40, longitude: (offsetMinutes / 60) * 15, source: 'time zone offset' };
}

/** The visitor's place from the browser's time zone. */
export function visitorPlace(now = new Date()): Place {
  let zone: string | undefined;
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    zone = undefined;
  }
  return placeFromTimeZone(zone, -now.getTimezoneOffset());
}
