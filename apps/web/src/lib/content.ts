export const BRAND_NAME = "Favor Upon You Rentals";

/** Contenu de marque, issu du texte de présentation du propriétaire (Facebook). */
export const SERVICE_AREA = "Houston & surrounding areas";
export const INCLUDED = "Delivery, setup and pick-up included";
export const EVENT_TYPES = ["Baby shower", "Birthday", "Brunch", "Backyard event", "Outdoor celebration"] as const;

export const BRAND_STATEMENT =
  "We provide luxury outdoor umbrella rentals with delivery, setup and pick-up included — making your outdoor events feel elevated, effortless and unforgettable.";

export const STEPS = [
  ["Choose your pieces", "Browse the collection and add what your gathering needs."],
  ["Check your dates", "Pick the day and time. Availability is checked live, so what you see is real."],
  ["Send your request", `Tell us where and when. ${INCLUDED} across ${SERVICE_AREA}.`],
  ["We confirm", "We review every request personally and confirm by email. No payment is taken on the website."],
  ["Pay and enjoy", "Send your payment as instructed and share the details with us. We verify it by hand, then deliver, set up and collect."],
] as const;

export const FAQ = [
  ["What is included?", `${INCLUDED}. You don't need to move, build or return anything.`],
  ["Where do you deliver?", `We're now booking ${SERVICE_AREA}. Not sure whether you're covered? Message us on WhatsApp.`],
  ["What events do you suit?", `${EVENT_TYPES.join(", ")} — anywhere you want shade and a little elegance.`],
  ["How do I pay?", "After we confirm your request, your booking page shows how to pay. You then send us the payment details, and we verify them ourselves. There is no online checkout."],
  ["Can I change or cancel?", "Message us as soon as plans change and we'll do our best to adjust. Your booking page shows the current cancellation policy."],
] as const;
