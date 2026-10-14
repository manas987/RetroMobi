import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";

export function CustomerStub({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="max-w-[900px] w-full mx-auto px-5 py-10 flex-1">
        <h1 className="text-2xl font-semibold text-ink mb-3">{title}</h1>
        <p className="text-sm text-ink-3 bg-surface-2 rounded-panel px-5 py-4 max-w-md">{reason}</p>
      </div>
      <Footer />
    </div>
  );
}

export function MyBookingsStub() {
  return (
    <CustomerStub
      title="My bookings"
      reason="Not wired up yet — the backend has no endpoint to list a customer's own bookings (only create/cancel/extend exist). Needs a GET /api/user/bookings added."
    />
  );
}

export function ActiveRentalStub() {
  return (
    <CustomerStub
      title="Active rental"
      reason="Not wired up yet — same gap as My bookings: there's no endpoint that resolves which booking is currently active for you."
    />
  );
}

export function WalletStub() {
  return (
    <CustomerStub
      title="Wallet"
      reason="There's no wallet/credit concept in the backend yet — payments go straight through Cashfree per booking, nothing is stored as a balance."
    />
  );
}
