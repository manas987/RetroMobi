import { useLayoutEffect, useRef } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { Home } from "./pages/Home";
import { Browse } from "./pages/Browse";
import { ShopPage } from "./pages/ShopPage";
import { VehicleDetail } from "./pages/VehicleDetail";
import { Checkout } from "./pages/Checkout";
import { CheckoutPay, CheckoutReturn } from "./pages/CheckoutPay";

import { CustomerLogin } from "./pages/customer/Login";
import { CustomerProfile } from "./pages/customer/Profile";
import { CustomerSupport } from "./pages/customer/Support";
import { MyBookings } from "./pages/customer/MyBookings";

import { MerchantLogin } from "./pages/merchant/Login";
import { MerchantOverview } from "./pages/merchant/Overview";
import { MerchantBookings } from "./pages/merchant/Bookings";
import { MerchantFleet } from "./pages/merchant/Fleet";
import { MerchantVehicle } from "./pages/merchant/fleet/VehiclePage";
import { MerchantSetup } from "./pages/merchant/Setup";
import { MerchantShop } from "./pages/merchant/Shop";
import { MerchantBranches } from "./pages/merchant/Branches";
import { MerchantPapers } from "./pages/merchant/Papers";
import { MerchantAllVehicles } from "./pages/merchant/AllVehicles";
import { MerchantStaff } from "./pages/merchant/Staff";
import { MerchantActivity } from "./pages/merchant/Activity";
import { MerchantSupport } from "./pages/merchant/Support";
import { MerchantEarnings } from "./pages/merchant/Earnings";
import { MerchantReports } from "./pages/merchant/Reports";

import { AdminLogin } from "./pages/admin/Login";
import { AdminOverview } from "./pages/admin/Overview";
import { AdminMerchantReview } from "./pages/admin/MerchantReview";
import { AdminVehicleReview } from "./pages/admin/VehicleReview";
import { AdminRiderReview } from "./pages/admin/RiderReview";
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
  const [path] = useLocation();
  const previousPath = useRef(path);

  useLayoutEffect(() => {
    if (previousPath.current === path) return;
    previousPath.current = path;
    // Let in-page links such as How it works scroll to their own target.
    if (!window.location.hash) window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [path]);

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/browse" component={Browse} />
      <Route path="/shops/:shopId" component={ShopPage} />
      <Route path="/vehicles/:id" component={VehicleDetail} />
      <Route path="/checkout" component={Checkout} />
      {/* The payment step is its own URL so a refresh, a back button or a
          return from the gateway does not lose it. /checkout/return is the
          return_url Cashfree is given when the order is created. */}
      <Route path="/checkout/return" component={CheckoutReturn} />
      <Route path="/checkout/pay/:groupId" component={CheckoutPay} />

      <Route path="/login" component={CustomerLogin} />
      <Route path="/account/profile" component={CustomerProfile} />
      <Route path="/account/support" component={CustomerSupport} />
      <Route path="/account/bookings" component={MyBookings} />

      <Route path="/merchant/login" component={MerchantLogin} />
      <Route path="/merchant" component={MerchantOverview} />
      <Route path="/merchant/bookings" component={MerchantBookings} />
      <Route path="/merchant/fleet" component={MerchantFleet} />
      <Route path="/merchant/fleet/:vehicleId" component={MerchantVehicle} />
      <Route path="/merchant/setup" component={MerchantSetup} />
      <Route path="/merchant/shop" component={MerchantShop} />
      <Route path="/merchant/shops" component={MerchantBranches} />
      <Route path="/merchant/papers" component={MerchantPapers} />
      <Route path="/merchant/all-vehicles" component={MerchantAllVehicles} />
      <Route path="/merchant/staff" component={MerchantStaff} />
      <Route path="/merchant/activity" component={MerchantActivity} />
      <Route path="/merchant/support" component={MerchantSupport} />
      <Route path="/merchant/earnings" component={MerchantEarnings} />
      <Route path="/merchant/reports" component={MerchantReports} />
      {/* Old URLs, kept so bookmarks and links in old messages still land. */}
      <Route path="/merchant/branches"><Redirect to="/merchant/shops" replace /></Route>
      <Route path="/merchant/compliance"><Redirect to="/merchant/papers" replace /></Route>
      <Route path="/merchant/team"><Redirect to="/merchant/staff" replace /></Route>
      <Route path="/merchant/payouts"><Redirect to="/merchant/earnings" replace /></Route>

      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin" component={AdminOverview} />
      <Route path="/admin/tickets" component={AdminTickets} />
      <Route path="/admin/merchant-review" component={AdminMerchantReview} />
      <Route path="/admin/vehicle-review" component={AdminVehicleReview} />
      <Route path="/admin/rider-review" component={AdminRiderReview} />
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
