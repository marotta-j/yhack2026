/**
 * Returns real-time grid carbon intensity (gCO₂eq/kWh) for the given coordinates.
 *
 * TODO: Replace stub with real ElectricityMap API call:
 *   GET https://api.electricitymap.org/v3/carbon-intensity/latest?lat={lat}&lon={lng}
 *   Headers: { "auth-token": process.env.ELECTRICITYMAP_API_KEY }
 *   Response: { carbonIntensity: number, zone: string, datetime: string }
 *
 * Sign up at https://www.electricitymap.org/api to get an API key.
 * Set ELECTRICITYMAP_API_KEY in .env.local once ready to wire in.
 */
export async function getGridCarbonIntensity(
  lat: number,
  lng: number,
): Promise<number> {
  // STUB: returns placeholder value until ElectricityMap API is wired in
  console.warn(
    `[electricitymap] STUB: returning 400 gCO₂/kWh for (${lat.toFixed(2)}, ${lng.toFixed(2)})`,
  );
  return 400;
}
