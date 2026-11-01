// Public browser configuration, supplied through the ignored frontend .env.
const MAPBOX_TOKEN = process.env.BUN_PUBLIC_MAPBOX_TOKEN ?? "";

// Stock Mapbox Streets raster style via Leaflet — confirmed working end to
// end. The custom "Faded" Studio style doesn't work here: the legacy raster
// Tiles API can't rasterize it (it's built on Mapbox's newer Standard
// style-imports system) and the mapbox-gl-js vector-rendering path that
// *can* hit an unresolved blank-canvas bug in this dev environment despite
// WebGL itself working fine, a real browser SecurityError being fixed along
// the way, and no console errors left to chase. Reverting to this proven
// baseline rather than keep debugging that blind — revisit the custom style
// separately later.
export const TILE_URL = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}{r}?access_token=${MAPBOX_TOKEN}`;
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export const TILE_MAX_ZOOM = 19;
