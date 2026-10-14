import { Route, Switch } from "wouter";
import { Home } from "./pages/Home";
import { Browse } from "./pages/Browse";
import { VehicleDetail } from "./pages/VehicleDetail";

import { CustomerLogin } from "./pages/customer/Login";
import { CustomerProfile, CustomerSupport } from "./pages/customer/Profile";
import { MyBookingsStub, ActiveRentalStub, WalletStub } from "./pages/customer/Stub";

import { MerchantLogin } from "./pages/merchant/Login";
import { MerchantOverview } from "./pages/merchant/Overview";
import { MerchantBookings } from "./pages/merchant/Bookings";
import { MerchantFleet } from "./pages/merchant/Fleet";
import { MerchantBranches } from "./pages/merchant/Branches";
import { MerchantCompliance } from "./pages/merchant/Compliance";
import { MerchantSupport } from "./pages/merchant/Support";
import { MerchantPayouts } from "./pages/merchant/Payouts";

import { AdminLogin } from "./pages/admin/Login";
import { AdminOverview } from "./pages/admin/Overview";
import { AdminMerchantReview } from "./pages/admin/MerchantReview";
import { AdminVehicleReview } from "./pages/admin/VehicleReview";
import { AdminBookingOps } from "./pages/admin/BookingOps";
import { AdminPayments } from "./pages/admin/Payments";
import { AdminAudit } from "./pages/admin/Audit";
import { AdminTickets } from "./pages/admin/Tickets";
import "./index.css";

export function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/browse" component={Browse} />
      <Route path="/vehicles/:id" component={VehicleDetail} />

      <Route path="/login" component={CustomerLogin} />
      <Route path="/account/profile" component={CustomerProfile} />
      <Route path="/account/support" component={CustomerSupport} />
      <Route path="/account/bookings" component={MyBookingsStub} />
      <Route path="/account/active-rental" component={ActiveRentalStub} />
      <Route path="/account/wallet" component={WalletStub} />

      <Route path="/merchant/login" component={MerchantLogin} />
      <Route path="/merchant" component={MerchantOverview} />
      <Route path="/merchant/bookings" component={MerchantBookings} />
      <Route path="/merchant/fleet" component={MerchantFleet} />
      <Route path="/merchant/branches" component={MerchantBranches} />
      <Route path="/merchant/compliance" component={MerchantCompliance} />
      <Route path="/merchant/support" component={MerchantSupport} />
      <Route path="/merchant/payouts" component={MerchantPayouts} />

      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={AdminOverview} />
      <Route path="/admin/tickets" component={AdminTickets} />
      <Route path="/admin/merchant-review" component={AdminMerchantReview} />
      <Route path="/admin/vehicle-review" component={AdminVehicleReview} />
      <Route path="/admin/booking-ops" component={AdminBookingOps} />
      <Route path="/admin/payments" component={AdminPayments} />
      <Route path="/admin/audit" component={AdminAudit} />

      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center text-ink-3 text-sm">
      Page not found.
    </div>
  );
}

export default App;
