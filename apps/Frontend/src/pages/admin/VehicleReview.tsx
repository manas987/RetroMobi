import { AdminLayout } from "./Layout";
import { VerificationQueue } from "../../components/VerificationQueue";

export function AdminVehicleReview() {
  return (
    <AdminLayout>
      <h1 className="text-2xl font-semibold text-ink mb-1">Vehicle review</h1>
      <p className="text-sm text-ink-3 mb-6">Vehicle registration and document verification.</p>
      <VerificationQueue types={["VEHICLE", "VEHICLE_DOCUMENT"]} />
    </AdminLayout>
  );
}
