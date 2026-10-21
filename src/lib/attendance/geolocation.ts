/**
 * Geolocation & Haversine Distance Calculation Utilities
 * 100% Free, zero external APIs, runs on server CPU in < 1ms.
 */

/**
 * Calculates the great-circle distance between two GPS points on Earth in meters
 * using the Haversine formula.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth mean radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Validates coordinate inputs from client.
 */
export function validateCoordinates(
  lat: any,
  lon: any,
  accuracy: any
): { valid: boolean; error?: string } {
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    return { valid: false, error: "GPS latitude and longitude coordinates are required." };
  }

  const numLat = Number(lat);
  const numLon = Number(lon);
  const numAcc = Number(accuracy);

  if (isNaN(numLat) || !isFinite(numLat) || isNaN(numLon) || !isFinite(numLon)) {
    return { valid: false, error: "Latitude and longitude must be valid numerical values." };
  }

  if (numLat < -90 || numLat > 90) {
    return { valid: false, error: "Latitude must be between -90 and 90 degrees." };
  }

  if (numLon < -180 || numLon > 180) {
    return { valid: false, error: "Longitude must be between -180 and 180 degrees." };
  }

  if (isNaN(numAcc) || !isFinite(numAcc) || numAcc < 0) {
    return { valid: false, error: "GPS accuracy must be a non-negative numerical value." };
  }

  return { valid: true };
}
