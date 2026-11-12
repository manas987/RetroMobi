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
import jupiterSide from "../assets/vehicles/tvs-jupiter-125-side.webp";
import jupiterFront from "../assets/vehicles/tvs-jupiter-125-front.webp";
import accessGold from "../assets/vehicles/suzuki-access-125-gold.png";
import accessBlack from "../assets/vehicles/suzuki-access-125-black.png";

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
const PHOTOS: Record<string, string[]> = {
  "Royal Enfield Hunter 350": [hunter350],
  "Royal Enfield Classic 350": [classic350],
  "Royal Enfield Himalayan 450": [himalayan450],
  "Jawa 42 Bobber": [jawa42],
  "Bajaj Pulsar NS200": [pulsarNs200],
  "Honda Activa 6G": [activa6g],
  "Ather 450X": [ather450x],
  "TVS iQube": [iqube],
  "Yamaha Fascino 125": [fascino125],
  "Bajaj Chetak": [chetak],
  "TVS Jupiter 125": [jupiterSide, jupiterFront],
  "Suzuki Access 125": [accessGold, accessBlack],
};

export function stockPhotos(make: string, model: string): string[] {
  return PHOTOS[`${make} ${model}`] ?? [];
}
