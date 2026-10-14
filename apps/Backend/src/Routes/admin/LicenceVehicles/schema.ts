import { z } from "zod";

export const LinkVehicleSchema = z.object({
  vehicleId: z.string().uuid(),
  registrationNumber: z.string().min(1),
});
