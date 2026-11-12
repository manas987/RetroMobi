import type en from "../en/status";

export default {
  stage_AWAITING_PAYMENT: "पेमेंट बाकी",
  stage_UPCOMING: "आने वाली",
  stage_PICKUP_TODAY: "आज ले जाएँगे",
  stage_PICKUP_LATE: "लेने नहीं आए",
  stage_ON_RIDE: "सवारी पर",
  stage_RETURN_TODAY: "आज वापस आएगी",
  stage_OVERDUE: "वापसी में देर",
  stage_RETURNED: "वापस आ गई",
  stage_DEPOSIT_CLAIMED: "नुकसान के लिए डिपॉज़िट रोका",
  verify_UNVERIFIED: "जाँच के लिए नहीं भेजा",
  verify_PENDING: "RetroMobi जाँच रहा है",
  verify_VERIFIED: "मंज़ूर",
  verify_REJECTED: "सुधार चाहिए",
  listed: "RetroMobi पर दिख रही है",
  notListed: "नहीं दिख रही",
  deposit_HELD: "डिपॉज़िट आपके पास",
  deposit_RELEASED: "डिपॉज़िट लौटाया",
  deposit_CLAIMED: "डिपॉज़िट रोका",
  deposit_PARTIALLY_DEDUCTED: "डिपॉज़िट का कुछ हिस्सा रोका",
} satisfies Record<keyof typeof en, string>;
