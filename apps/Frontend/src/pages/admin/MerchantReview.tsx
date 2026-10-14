import { AdminLayout } from "./Layout";
import { VerificationQueue } from "../../components/VerificationQueue";

export function AdminMerchantReview() {
  return (
    <AdminLayout>
      <h1 className="text-2xl font-semibold text-ink mb-1">Merchant review</h1>
      <p className="text-sm text-ink-3 mb-6">Shop, licence and merchant document verification.</p>
      <VerificationQueue types={["SHOP", "SHOP_LICENCE", "MERCHANT_DOCUMENT"]} />
    </AdminLayout>
  );
}
