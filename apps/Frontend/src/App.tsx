import { Route, Switch } from "wouter";
import { Home } from "./pages/Home";
import { Browse } from "./pages/Browse";
import { ShopPage } from "./pages/ShopPage";
import { VehicleDetail } from "./pages/VehicleDetail";
import { Checkout } from "./pages/Checkout";

import { CustomerLogin } from "./pages/customer/Login";
import { CustomerProfile, CustomerSupport } from "./pages/customer/Profile";
import { MyBookings } from "./pages/customer/MyBookings";

import { MerchantLogin } from "./pages/merchant/Login";
import { MerchantOverview } from "./pages/merchant/Overview";
import { MerchantBookings } from "./pages/merchant/Bookings";
import { MerchantFleet } from "./pages/merchant/Fleet";
import { MerchantBranches } from "./pages/merchant/Branches";
import { MerchantTeam } from "./pages/merchant/Team";
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
import { AdminAdmins } from "./pages/admin/Admins";
import { AdminModels } from "./pages/admin/Models";
import { AdminCoupons } from "./pages/admin/Coupons";
import { AdminLicenceVehicles } from "./pages/admin/LicenceVehicles";
import { AdminMerchants } from "./pages/admin/Merchants";
import "./index.css";

export function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/browse" component={Browse} />
      <Route path="/shops/:shopId" component={ShopPage} />
      <Route path="/vehicles/:id" component={VehicleDetail} />
      <Route path="/checkout" component={Checkout} />

      <Route path="/login" component={CustomerLogin} />
      <Route path="/account/profile" component={CustomerProfile} />
      <Route path="/account/support" component={CustomerSupport} />
      <Route path="/account/bookings" component={MyBookings} />

      <Route path="/merchant/login" component={MerchantLogin} />
      <Route path="/merchant" component={MerchantOverview} />
      <Route path="/merchant/bookings" component={MerchantBookings} />
      <Route path="/merchant/fleet" component={MerchantFleet} />
      <Route path="/merchant/branches" component={MerchantBranches} />
      <Route path="/merchant/team" component={MerchantTeam} />
      <Route path="/merchant/compliance" component={MerchantCompliance} />
      <Route path="/merchant/support" component={MerchantSupport} />
      <Route path="/merchant/payouts" component={MerchantPayouts} />

      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={AdminOverview} />
      <Route path="/admin/tickets" component={AdminTickets} />
      <Route path="/admin/merchant-review" component={AdminMerchantReview} />
      <Route path="/admin/vehicle-review" component={AdminVehicleReview} />
      <Route path="/admin/licensed-vehicles" component={AdminLicenceVehicles} />
      <Route path="/admin/merchants" component={AdminMerchants} />
      <Route path="/admin/booking-ops" component={AdminBookingOps} />
      <Route path="/admin/payments" component={AdminPayments} />
      <Route path="/admin/audit" component={AdminAudit} />
      <Route path="/admin/admins" component={AdminAdmins} />
      <Route path="/admin/models" component={AdminModels} />
      <Route path="/admin/coupons" component={AdminCoupons} />

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
