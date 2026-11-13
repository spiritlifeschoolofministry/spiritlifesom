/**
 * The two learning modes an applicant can choose. Hybrid is assigned by the
 * school, never chosen, so it is not offered here. Values are what is stored
 * in students.learning_mode.
 */
export const LEARNING_MODES = [
  {
    value: "Physical",
    title: "Physical, Ibadan",
    description: "Attend classes in person on campus.",
    price: "Free",
    details: [] as string[],
  },
  {
    value: "Online",
    title: "Online",
    description: "Join live classes remotely via Zoom. Hybrid is assigned by the school.",
    price: "₦30,000",
    details: [
      "Includes training materials",
      "Live Zoom sessions & class recordings",
      "Must attend physically for project defense and graduation",
    ],
  },
] as const;
