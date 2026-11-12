import type en from "../en/errors";

export default {
  generic: "कुछ गड़बड़ हुई। फिर से कोशिश करें।",
  forbidden: "आपके रोल में यह नहीं हो सकता। दुकान मालिक से कहें।",
  invalid_request: "कुछ जानकारी गलत या अधूरी है। जाँचकर फिर से कोशिश करें।",
  vehicle_unavailable: "यह गाड़ी उस समय के लिए बुक नहीं हो सकती। शायद पहले से बुक है, या इसका रोज़ का किराया तय नहीं है।",
  invalid_duration: "पिकअप और वापसी का समय जाँचें।",
  booking_not_returnable: "यह बुकिंग अभी वापस दर्ज नहीं हो सकती। रिफ़्रेश करके देखें।",
  identity_already_checked: "इस बुकिंग की ID पहले ही जाँच ली गई है।",
  identity_check_missing: "पहले ग्राहक की ID जाँचें।",
  verification_required: "इस ग्राहक का ड्राइविंग लाइसेंस अभी वेरिफ़ाई नहीं हुआ है। गाड़ी न दें।",
  walkin_no_claim: "वॉक-इन का डिपॉज़िट आपके पास नकद है, इसलिए RetroMobi से उसका दावा नहीं हो सकता।",
  claim_exceeds_deposit: "यह इस बुकिंग के डिपॉज़िट से ज़्यादा है।",
  identity_check_failed: "ID मेल नहीं खाई। गाड़ी न दें।",
  rate_limited: "बहुत बार कोशिश हुई। एक मिनट रुककर फिर से करें।",
} satisfies Record<keyof typeof en, string>;
