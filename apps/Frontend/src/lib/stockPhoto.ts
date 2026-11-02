import hunter350 from "../assets/vehicles/re-hunter-350.jpg";
import classic350 from "../assets/vehicles/re-classic-350.jpg";
import himalayan450 from "../assets/vehicles/re-himalayan-450.jpg";
import jawa42 from "../assets/vehicles/jawa-42-bobber.jpg";
import pulsarNs200 from "../assets/vehicles/bajaj-pulsar-ns200.jpg";
import activa6g from "../assets/vehicles/honda-activa-6g.jpg";
import ather450x from "../assets/vehicles/ather-450x.jpg";
import iqube from "../assets/vehicles/tvs-iqube.jpg";
import fascino125 from "../assets/vehicles/yamaha-fascino-125.jpg";
import chetak from "../assets/vehicles/bajaj-chetak.jpg";

/**
 * Stock photography per catalogue model, bundled with the app.
 *
 * Not a replacement for `vehicle_models.image_key` — that is still what a real
 * photo goes through, and it wins whenever it resolves. This is the floor: R2
 * is unconfigured in dev (`storage.ts` hands back a dev-fallback URL that
 * resolves to nothing), and a grid of "Photo pending" placeholders says less
 * about a scooter than a stock shot of it does.
 *
 * Keyed by `make model` exactly as the catalogue spells it — the same pair the
 * `uq_vehicle_models` unique index is on, so there is one key per model by
 * construction.
 */
const ALL = [
  hunter350,
  classic350,
  himalayan450,
  jawa42,
  pulsarNs200,
  activa6g,
  ather450x,
  iqube,
  fascino125,
  chetak,
];

const INDEX: Record<string, number> = {
  "Royal Enfield Hunter 350": 0,
  "Royal Enfield Classic 350": 1,
  "Royal Enfield Himalayan 450": 2,
  "Jawa 42 Bobber": 3,
  "Bajaj Pulsar NS200": 4,
  "Honda Activa 6G": 5,
  "Ather 450X": 6,
  "TVS iQube": 7,
  "Yamaha Fascino 125": 8,
  "Bajaj Chetak": 9,

  // Shared, deliberately: there are ten photos and twelve models, and these
  // two are the closest body style going. Give them their own art and point
  // these at it.
  "TVS Jupiter 125": 5,
  "Suzuki Access 125": 6,
};

/** How many shots each model pretends to have. See `stockPhotos`. */
const GALLERY_SIZE = 4;

/**
 * The model's own photo, then three more taken off the end of the same list.
 *
 * ponytail: the extras are **not** pictures of this vehicle — they exist so the
 * card's carousel has more than one slide to page through. A real gallery is
 * per *vehicle* (a shop photographs its own scooter), which needs a
 * `vehicle_images` table and an upload flow; neither exists yet. Drop
 * GALLERY_SIZE to 1 and this collapses back to the single honest photo.
 */
export function stockPhotos(make: string, model: string): string[] {
  const start = INDEX[`${make} ${model}`];
  if (start === undefined) return [];
  return Array.from({ length: GALLERY_SIZE }, (_, i) => ALL[(start + i) % ALL.length]!);
}
