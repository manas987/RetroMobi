import { AdminLayout } from "./Layout";
import { VerificationQueue } from "../../components/VerificationQueue";

/**
 * Customers' driving licences that need a person to decide.
 *
 * Different in kind from the merchant-side queues: there is no document to
 * look at, only evidence to weigh — a photo the customer supplied rather than
 * the authority, a licence the RTO returned no status for, the same licence on
 * another account, or a verification from before the current checks existed.
 * See docs/dl-verification.md.
 */
export function AdminRiderReview() {
  return (
    <AdminLayout>
      <h1 className="text-2xl font-semibold text-ink mb-1">Rider licences</h1>
      <p className="text-sm text-ink-3 mb-6">
        Driving licence checks that could not be decided automatically. Approving one overrides the
        automated evidence, so a reason is required and recorded.
      </p>
      <VerificationQueue types={["RIDER_VERIFICATION"]} />
    </AdminLayout>
  );
}
