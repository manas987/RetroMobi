const PHOTOS: Record<string, number[]> = {
  "Royal Enfield Hunter 350": [require("../../../assets/vehicles/re-hunter-350.jpg")],
  "Royal Enfield Classic 350": [require("../../../assets/vehicles/re-classic-350.jpg")],
  "Royal Enfield Himalayan 450": [require("../../../assets/vehicles/re-himalayan-450.jpg")],
  "Jawa 42 Bobber": [require("../../../assets/vehicles/jawa-42-bobber.jpg")],
  "Bajaj Pulsar NS200": [require("../../../assets/vehicles/bajaj-pulsar-ns200.jpg")],
  "Honda Activa 6G": [require("../../../assets/vehicles/honda-activa-6g.jpg")],
  "Ather 450X": [require("../../../assets/vehicles/ather-450x.jpg")],
  "TVS iQube": [require("../../../assets/vehicles/tvs-iqube.jpg")],
  "Yamaha Fascino 125": [require("../../../assets/vehicles/yamaha-fascino-125.jpg")],
  "Bajaj Chetak": [require("../../../assets/vehicles/bajaj-chetak.jpg")],
  "TVS Jupiter 125": [require("../../../assets/vehicles/tvs-jupiter-125-side.webp"), require("../../../assets/vehicles/tvs-jupiter-125-front.webp")],
  "Suzuki Access 125": [require("../../../assets/vehicles/suzuki-access-125-gold.png"), require("../../../assets/vehicles/suzuki-access-125-black.png")],
};

export function stockPhotos(make: string, model: string): number[] {
  return PHOTOS[`${make} ${model}`] ?? [];
}
