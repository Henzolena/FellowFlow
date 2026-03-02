export type Locale = "en" | "am";

export const defaultLocale: Locale = "en";

export type Dictionary = {
  common: {
    register: string; back: string; next: string; cancel: string; free: string;
    free_lower: string; submit: string; loading: string; error: string;
    days: string; day: string; person: string; email: string; phone: string;
    yes: string; no: string; total: string; subtotal: string; lateSurcharge: string;
    backToHome: string; viewReceipt: string; startNewRegistration: string;
    fullConference: string; partial: string; partialMotel: string; motelStay: string;
    noMotel: string; amountDue: string; amountPaid: string; totalPaid: string;
    confirmationId: string; contact: string; event: string; attendee: string;
    pricing: string; category: string; registeredOn: string; paymentViaStripe: string;
    from: string; registrationClosed: string; showingEvents: string;
    noEventsFound: string; searchError: string; noActiveEvents: string;
    calculating: string; estimatedPrice: string; registrants: string; inclSurcharge: string;
  };
  header: { register: string };
  footer: { allRightsReserved: string; admin: string };
  hero: {
    registrationOpen: string; headline1: string; headline2: string; headline3: string;
    subheadline: string; under2Minutes: string; subheadlineEnd: string;
    browseEvents: string; seeHowItWorks: string; ssl: string; stripePowered: string;
    instantConfirmation: string; fastRegistration: string; securePayments: string;
    instantReceipts: string;
  };
  home: {
    upcomingEvent: string; registerForEvent: string; howItWorks: string;
    threeSteps: string; step1Title: string; step1Desc: string; step2Title: string;
    step2Desc: string; step3Title: string; step3Desc: string; securePayments: string;
    instantConfirmation: string; allCardsAccepted: string;
  };
  events: {
    title: string; titleHighlight: string; description: string; searchPlaceholder: string;
    filterByTime: string; allEvents: string; upcoming: string; happeningNow: string;
    past: string; ended: string; myReceipt: string;
  };
  wizard: {
    steps: string[]; whoIsAttending: string; addEveryoneDesc: string;
    addAnotherPerson: string; firstName: string; lastName: string; ageRange: string;
    selectAgeRange: string; infantLabel: string; childLabel: string; youthLabel: string;
    adultLabel: string; attendingFullDuration: string; yesFullConference: string;
    noPartialAttendance: string; stayingInMotel: string; numberOfDays: string;
    contactInfo: string; contactDesc: string; emailRequired: string; phoneOptional: string;
    emailHint: string; reviewAndSubmit: string; reviewDesc: string;
    completeRegistration: string; proceedToPayment: string; priceSummary: string;
    addDetailsToSee: string; nDays: string;
  };
  review: {
    title: string; descriptionGroup: string; descriptionSolo: string;
    registrationNotFound: string; paymentCancelled: string; pay: string;
    people: string; motelStay: string;
  };
  success: {
    confirmed: string; processing: string; freeGroupConfirmed: string;
    freeSoloConfirmed: string; paidGroupConfirmed: string; paidSoloConfirmed: string;
    confirmationEmailSent: string; verifying: string; takingLonger: string;
    checkAgain: string;
  };
  receipt: {
    findYourReceipt: string; findReceiptDesc: string; confirmationIdLabel: string;
    confirmationIdHint: string; lastNameLabel: string; lastNamePlaceholder: string;
    findReceipt: string; viewYourReceipt: string; verifyIdentity: string;
    lookUpDifferent: string; groupReceiptTitle: string; soloReceiptTitle: string;
    printDownload: string; emailReceipt: string; emailSent: string; receiptSentTo: string;
  };
  duplicate: {
    existingFound: string; existingFoundDesc: string; atThisEvent: string;
    confirmed: string; pendingPayment: string; registered: string; viewReceipt: string;
    resendConfirmation: string; sent: string; pendingNote: string; registerAgain: string;
    alreadyConfirmed: string; hasPending: string; canProceed: string; proceedNew: string;
  };
  login: {
    signInDesc: string; emailLabel: string; passwordLabel: string; signIn: string;
  };
  priceSummary: {
    title: string; fullConference: string; partialMotelGuest: string;
    motelStayFree: string; completeForm: string;
  };
  notConfigured: {
    title: string; description: string; backToEvents: string;
  };
  eventPage: {
    allEvents: string;
  };
};

const en: Dictionary = {
  common: {
    register: "Register",
    back: "Back",
    next: "Next",
    cancel: "Cancel",
    free: "FREE",
    free_lower: "Free",
    submit: "Submit",
    loading: "Loading...",
    error: "Something went wrong. Please try again.",
    days: "days",
    day: "day",
    person: "Person",
    email: "Email",
    phone: "Phone",
    yes: "Yes",
    no: "No",
    total: "Total",
    subtotal: "Subtotal",
    lateSurcharge: "Late Surcharge",
    backToHome: "Back to Home",
    viewReceipt: "View Receipt",
    startNewRegistration: "Start New Registration",
    fullConference: "Full Conference",
    partial: "Partial",
    partialMotel: "Partial — Motel",
    motelStay: "Motel Stay",
    noMotel: "No Motel",
    amountDue: "Amount Due",
    amountPaid: "Amount Paid",
    totalPaid: "Total Paid",
    confirmationId: "Confirmation ID",
    contact: "Contact",
    event: "Event",
    attendee: "Attendee",
    pricing: "Pricing",
    category: "Category",
    registeredOn: "Registered on",
    paymentViaStripe: "Payment: {status} via Stripe",
    from: "From",
    registrationClosed: "Registration Closed",
    showingEvents: "Showing {count} event{s}",
    noEventsFound: "No events found",
    searchError: "Try a different search term or filter.",
    noActiveEvents: "There are no active events at the moment. Check back later.",
    calculating: "Calculating...",
    estimatedPrice: "Estimated Price",
    registrants: "Registrants",
    inclSurcharge: "incl. {amount} surcharge",
  },

  header: {
    register: "Register",
  },

  footer: {
    allRightsReserved: "All rights reserved.",
    admin: "Admin",
  },

  hero: {
    registrationOpen: "Registration Open",
    headline1: "Conference",
    headline2: "Registration",
    headline3: "Made Effortless",
    subheadline: "From sign-up to confirmation in",
    under2Minutes: "under 2 minutes",
    subheadlineEnd: ". Smart pricing, secure payments, and instant receipts — all in one seamless flow.",
    browseEvents: "Browse Events",
    seeHowItWorks: "See How It Works",
    ssl: "256-bit SSL",
    stripePowered: "Stripe Powered",
    instantConfirmation: "Instant Confirmation",
    fastRegistration: "Fast Registration",
    securePayments: "Secure Payments",
    instantReceipts: "Instant Receipts",
  },

  home: {
    upcomingEvent: "Upcoming Event",
    registerForEvent: "Register for this Event",
    howItWorks: "How It Works",
    threeSteps: "Three simple steps to register",
    step1Title: "1. Tell Us About You",
    step1Desc: "Answer a few quick questions about your attendance plans and provide your contact information.",
    step2Title: "2. See Your Price",
    step2Desc: "Pricing is calculated automatically based on your age, attendance type, and accommodation.",
    step3Title: "3. Pay & Confirm",
    step3Desc: "Complete your registration with secure online payment and receive instant confirmation.",
    securePayments: "Secure Payments via Stripe",
    instantConfirmation: "Instant Confirmation",
    allCardsAccepted: "All Major Cards Accepted",
  },

  events: {
    title: "Upcoming",
    titleHighlight: "Events",
    description: "Browse available conferences and register for the one that fits you best.",
    searchPlaceholder: "Search events by name or description...",
    filterByTime: "Filter by time",
    allEvents: "All Events",
    upcoming: "Upcoming",
    happeningNow: "Happening Now",
    past: "Past",
    ended: "Ended",
    myReceipt: "My Receipt",
  },

  wizard: {
    steps: ["Registrants", "Contact Info", "Review"],
    whoIsAttending: "Who is attending?",
    addEveryoneDesc: "Add everyone you'd like to register for {eventName}",
    addAnotherPerson: "Add Another Person",
    firstName: "First Name",
    lastName: "Last Name",
    ageRange: "Age Range",
    selectAgeRange: "Select age range",
    infantLabel: "0–{max} years (Infant)",
    childLabel: "{min}–{max} years (Child)",
    youthLabel: "{min}–{max} years (Youth)",
    adultLabel: "{min}+ years (Adult)",
    attendingFullDuration: "Attending for the full duration?",
    yesFullConference: "Yes, full conference ({days} days)",
    noPartialAttendance: "No, partial attendance",
    stayingInMotel: "Staying in the motel?",
    numberOfDays: "Number of days",
    contactInfo: "Contact Information",
    contactDesc: "Provide the email for registration confirmations and receipts",
    emailRequired: "Email *",
    phoneOptional: "Phone (optional)",
    emailHint: "Confirmation emails and receipts will be sent to this address",
    reviewAndSubmit: "Review & Submit",
    reviewDesc: "Verify all details before submitting",
    completeRegistration: "Complete Registration",
    proceedToPayment: "Proceed to Payment",
    priceSummary: "Price Summary",
    addDetailsToSee: "Add registrant details to see pricing",
    nDays: "Day(s)",
  },

  review: {
    title: "Review & Pay",
    descriptionGroup: "Review {count} registrations and complete payment",
    descriptionSolo: "Review your registration and complete payment",
    registrationNotFound: "Registration Not Found",
    paymentCancelled: "Payment was cancelled. You can try again below.",
    pay: "Pay",
    people: "people",
    motelStay: "Motel Stay",
  },

  success: {
    confirmed: "Registration Confirmed!",
    processing: "Processing Payment...",
    freeGroupConfirmed: "All {count} free registrations have been confirmed. No payment is required.",
    freeSoloConfirmed: "Your free registration has been confirmed. No payment is required.",
    paidGroupConfirmed: "Your payment was successful and all {count} registrations are confirmed.",
    paidSoloConfirmed: "Your payment was successful and your registration is confirmed.",
    confirmationEmailSent: "A confirmation email will be sent to your registered email address.",
    verifying: "Your payment is being verified. This usually takes a few seconds.",
    takingLonger: "Verification is taking longer than expected. You can check again or view your receipt — your registration will be confirmed shortly.",
    checkAgain: "Check Again",
  },

  receipt: {
    findYourReceipt: "Find Your Receipt",
    findReceiptDesc: "Enter your Confirmation ID and last name to access your registration receipt.",
    confirmationIdLabel: "Confirmation ID",
    confirmationIdHint: "Found in your confirmation email or on the success page.",
    lastNameLabel: "Last Name",
    lastNamePlaceholder: "Enter your last name",
    findReceipt: "Find Receipt",
    viewYourReceipt: "View Your Receipt",
    verifyIdentity: "Enter your last name to verify your identity.",
    lookUpDifferent: "Look up a different registration",
    groupReceiptTitle: "Group Registration Receipt",
    soloReceiptTitle: "Registration Receipt",
    printDownload: "Print / Download",
    emailReceipt: "Email Receipt",
    emailSent: "Email Sent!",
    receiptSentTo: "Receipt sent to {email}",
  },

  duplicate: {
    existingFound: "Existing Registration Found",
    existingFoundDesc: "We found {count} existing registration{s} for",
    atThisEvent: "at this event.",
    confirmed: "Confirmed",
    pendingPayment: "Pending Payment",
    registered: "Registered",
    viewReceipt: "View Receipt",
    resendConfirmation: "Resend Confirmation",
    sent: "Sent!",
    pendingNote: "This registration is pending payment. You can complete payment or register again.",
    registerAgain: "Want to register again anyway?",
    alreadyConfirmed: "You already have a confirmed registration. A new one will create an additional entry.",
    hasPending: "You have a pending registration. Consider completing that payment instead.",
    canProceed: "You can proceed with a new registration if needed.",
    proceedNew: "Proceed with New Registration",
  },

  login: {
    signInDesc: "Sign in to access the admin portal",
    emailLabel: "Email",
    passwordLabel: "Password",
    signIn: "Sign In",
  },

  priceSummary: {
    title: "Price Summary",
    fullConference: "Full Conference",
    partialMotelGuest: "Partial — Motel Guest",
    motelStayFree: "Motel Stay (Free)",
    completeForm: "Complete the form to see pricing",
  },

  notConfigured: {
    title: "Pricing Not Configured",
    description: "This event does not have pricing configured yet. Please check back later.",
    backToEvents: "Back to Events",
  },

  eventPage: {
    allEvents: "All Events",
  },
};

const am: Dictionary = {
  common: {
    register: "ይመዝገቡ",
    back: "ተመለስ",
    next: "ቀጣይ",
    cancel: "ሰርዝ",
    free: "ነፃ",
    free_lower: "ነፃ",
    submit: "አስገባ",
    loading: "በመጫን ላይ...",
    error: "ችግር ተፈጥሯል። እባክዎ እንደገና ይሞክሩ።",
    days: "ቀናት",
    day: "ቀን",
    person: "ሰው",
    email: "ኢሜይል",
    phone: "ስልክ",
    yes: "አዎ",
    no: "አይ",
    total: "ድምር",
    subtotal: "ንዑስ ድምር",
    lateSurcharge: "የዘገየ ተጨማሪ ክፍያ",
    backToHome: "ወደ መነሻ ተመለስ",
    viewReceipt: "ደረሰኝ ይመልከቱ",
    startNewRegistration: "አዲስ ምዝገባ ጀምር",
    fullConference: "ሙሉ ጉባዔ",
    partial: "ከፊል",
    partialMotel: "ከፊል — ሞቴል",
    motelStay: "ሞቴል ቆይታ",
    noMotel: "ሞቴል የለም",
    amountDue: "የሚከፈል መጠን",
    amountPaid: "የተከፈለ መጠን",
    totalPaid: "ጠቅላላ የተከፈለ",
    confirmationId: "የማረጋገጫ መለያ",
    contact: "አድራሻ",
    event: "ዝግጅት",
    attendee: "ተሳታፊ",
    pricing: "ዋጋ",
    category: "ምድብ",
    registeredOn: "የተመዘገበበት",
    paymentViaStripe: "ክፍያ: {status} በStripe",
    from: "ከ",
    registrationClosed: "ምዝገባ ተዘግቷል",
    showingEvents: "{count} ዝግጅት{s} በማሳየት ላይ",
    noEventsFound: "ምንም ዝግጅት አልተገኘም",
    searchError: "ሌላ የፍለጋ ቃል ይሞክሩ።",
    noActiveEvents: "በአሁኑ ጊዜ ምንም ንቁ ዝግጅት የለም። ቆይተው ይመልከቱ።",
    calculating: "በማስላት ላይ...",
    estimatedPrice: "የሚገመት ዋጋ",
    registrants: "ተመዝጋቢዎች",
    inclSurcharge: "{amount} ተጨማሪ ክፍያ ጨምሮ",
  },

  header: {
    register: "ይመዝገቡ",
  },

  footer: {
    allRightsReserved: "መብቱ በሕግ የተጠበቀ ነው።",
    admin: "አስተዳዳሪ",
  },

  hero: {
    registrationOpen: "ምዝገባ ክፍት ነው",
    headline1: "የጉባዔ",
    headline2: "ምዝገባ",
    headline3: "ቀላል ተደርጓል",
    subheadline: "ከምዝገባ እስከ ማረጋገጫ በ",
    under2Minutes: "2 ደቂቃ ውስጥ",
    subheadlineEnd: "። ዘመናዊ ዋጋ ስሌት፣ አስተማማኝ ክፍያ እና ፈጣን ደረሰኝ — ሁሉም በአንድ ቦታ።",
    browseEvents: "ዝግጅቶችን ይመልከቱ",
    seeHowItWorks: "እንዴት እንደሚሰራ ይመልከቱ",
    ssl: "256-bit SSL",
    stripePowered: "በStripe የተጎላበተ",
    instantConfirmation: "ፈጣን ማረጋገጫ",
    fastRegistration: "ፈጣን ምዝገባ",
    securePayments: "አስተማማኝ ክፍያ",
    instantReceipts: "ፈጣን ደረሰኞች",
  },

  home: {
    upcomingEvent: "የሚመጣ ዝግጅት",
    registerForEvent: "ለዚህ ዝግጅት ይመዝገቡ",
    howItWorks: "እንዴት ይሰራል",
    threeSteps: "በሶስት ቀላል ደረጃዎች ይመዝገቡ",
    step1Title: "1. ስለእርስዎ ይንገሩን",
    step1Desc: "ስለ ተሳትፎ ዕቅድዎ ጥቂት ጥያቄዎችን ይመልሱ እና የአድራሻ መረጃዎን ያቅርቡ።",
    step2Title: "2. ዋጋዎን ይመልከቱ",
    step2Desc: "ዋጋ በዕድሜዎ፣ በተሳትፎ ዓይነት እና በማረፊያ ላይ በመመስረት በራስ-ሰር ይሰላል።",
    step3Title: "3. ይክፈሉ እና ያረጋግጡ",
    step3Desc: "በአስተማማኝ የመስመር ላይ ክፍያ ምዝገባዎን ያጠናቅቁ እና ፈጣን ማረጋገጫ ይቀበሉ።",
    securePayments: "በStripe አስተማማኝ ክፍያ",
    instantConfirmation: "ፈጣን ማረጋገጫ",
    allCardsAccepted: "ሁሉም ዋና ካርዶች ይቀበላሉ",
  },

  events: {
    title: "የሚመጡ",
    titleHighlight: "ዝግጅቶች",
    description: "ያሉትን ጉባዔዎች ይመልከቱ እና ለእርስዎ የሚስማማውን ይመዝገቡ።",
    searchPlaceholder: "ዝግጅቶችን በስም ወይም በመግለጫ ይፈልጉ...",
    filterByTime: "በጊዜ ያጣሩ",
    allEvents: "ሁሉም ዝግጅቶች",
    upcoming: "የሚመጡ",
    happeningNow: "አሁን እየተካሄደ",
    past: "ያለፉ",
    ended: "ተጠናቋል",
    myReceipt: "ደረሰኜ",
  },

  wizard: {
    steps: ["ተመዝጋቢዎች", "የአድራሻ መረጃ", "ግምገማ"],
    whoIsAttending: "ማን ይሳተፋል?",
    addEveryoneDesc: "ለ{eventName} ሊመዘግቧቸው የሚፈልጓቸውን ሁሉ ያክሉ",
    addAnotherPerson: "ሌላ ሰው ያክሉ",
    firstName: "ስም",
    lastName: "የአባት ስም",
    ageRange: "የዕድሜ ክልል",
    selectAgeRange: "የዕድሜ ክልል ይምረጡ",
    infantLabel: "0–{max} ዓመት (ህፃን)",
    childLabel: "{min}–{max} ዓመት (ልጅ)",
    youthLabel: "{min}–{max} ዓመት (ወጣት)",
    adultLabel: "{min}+ ዓመት (አዋቂ)",
    attendingFullDuration: "ሙሉ ጊዜ ይሳተፋሉ?",
    yesFullConference: "አዎ፣ ሙሉ ጉባዔ ({days} ቀናት)",
    noPartialAttendance: "አይ፣ ከፊል ተሳትፎ",
    stayingInMotel: "በሞቴል ይቆያሉ?",
    numberOfDays: "የቀናት ብዛት",
    contactInfo: "የአድራሻ መረጃ",
    contactDesc: "ለምዝገባ ማረጋገጫ እና ደረሰኞች ኢሜይል ያቅርቡ",
    emailRequired: "ኢሜይል *",
    phoneOptional: "ስልክ (አማራጭ)",
    emailHint: "የማረጋገጫ ኢሜይሎች እና ደረሰኞች ወደዚህ አድራሻ ይላካሉ",
    reviewAndSubmit: "ገምግመው ያስገቡ",
    reviewDesc: "ከማስገባትዎ በፊት ሁሉንም ዝርዝሮች ያረጋግጡ",
    completeRegistration: "ምዝገባ ያጠናቅቁ",
    proceedToPayment: "ወደ ክፍያ ይቀጥሉ",
    priceSummary: "የዋጋ ማጠቃለያ",
    addDetailsToSee: "ዋጋ ለማየት የተመዝጋቢ ዝርዝሮችን ያክሉ",
    nDays: "ቀን(ዎች)",
  },

  review: {
    title: "ገምግመው ይክፈሉ",
    descriptionGroup: "{count} ምዝገባዎችን ገምግመው ክፍያ ያጠናቅቁ",
    descriptionSolo: "ምዝገባዎን ገምግመው ክፍያ ያጠናቅቁ",
    registrationNotFound: "ምዝገባ አልተገኘም",
    paymentCancelled: "ክፍያ ተሰርዟል። ከዚህ በታች እንደገና መሞከር ይችላሉ።",
    pay: "ክፈል",
    people: "ሰዎች",
    motelStay: "ሞቴል ቆይታ",
  },

  success: {
    confirmed: "ምዝገባ ተረጋግጧል!",
    processing: "ክፍያ በማስኬድ ላይ...",
    freeGroupConfirmed: "ሁሉም {count} ነፃ ምዝገባዎች ተረጋግጠዋል። ክፍያ አያስፈልግም።",
    freeSoloConfirmed: "ነፃ ምዝገባዎ ተረጋግጧል። ክፍያ አያስፈልግም።",
    paidGroupConfirmed: "ክፍያዎ ተሳክቷል እና ሁሉም {count} ምዝገባዎች ተረጋግጠዋል።",
    paidSoloConfirmed: "ክፍያዎ ተሳክቷል እና ምዝገባዎ ተረጋግጧል።",
    confirmationEmailSent: "የማረጋገጫ ኢሜይል ወደ ተመዝጋቢ ኢሜይል አድራሻዎ ይላካል።",
    verifying: "ክፍያዎ በማረጋገጥ ላይ ነው። ይህ ብዙ ጊዜ ጥቂት ሰከንዶች ይወስዳል።",
    takingLonger: "ማረጋገጫ ከተጠበቀው በላይ ጊዜ እየወሰደ ነው። እንደገና መመልከት ወይም ደረሰኝዎን ማየት ይችላሉ — ምዝገባዎ በቅርቡ ይረጋገጣል።",
    checkAgain: "እንደገና ይመልከቱ",
  },

  receipt: {
    findYourReceipt: "ደረሰኝዎን ያግኙ",
    findReceiptDesc: "የምዝገባ ደረሰኝዎን ለማየት የማረጋገጫ መለያ እና የአባት ስምዎን ያስገቡ።",
    confirmationIdLabel: "የማረጋገጫ መለያ",
    confirmationIdHint: "በማረጋገጫ ኢሜይልዎ ወይም በስኬት ገጹ ላይ ይገኛል።",
    lastNameLabel: "የአባት ስም",
    lastNamePlaceholder: "የአባት ስምዎን ያስገቡ",
    findReceipt: "ደረሰኝ ፈልግ",
    viewYourReceipt: "ደረሰኝዎን ይመልከቱ",
    verifyIdentity: "ማንነትዎን ለማረጋገጥ የአባት ስมዎን ያስገቡ።",
    lookUpDifferent: "ሌላ ምዝገባ ይፈልጉ",
    groupReceiptTitle: "የቡድን ምዝገባ ደረሰኝ",
    soloReceiptTitle: "የምዝገባ ደረሰኝ",
    printDownload: "አትም / አውርድ",
    emailReceipt: "ደረሰኝ በኢሜይል ላክ",
    emailSent: "ኢሜይል ተልኳል!",
    receiptSentTo: "ደረሰኝ ወደ {email} ተልኳል",
  },

  duplicate: {
    existingFound: "ያለ ምዝገባ ተገኝቷል",
    existingFoundDesc: "በዚህ ዝግጅት {count} ያለ ምዝገባ{s} አግኝተናል ለ",
    atThisEvent: "።",
    confirmed: "ተረጋግጧል",
    pendingPayment: "ክፍያ በመጠባበቅ ላይ",
    registered: "ተመዝግቧል",
    viewReceipt: "ደረሰኝ ይመልከቱ",
    resendConfirmation: "ማረጋገጫ እንደገና ላክ",
    sent: "ተልኳል!",
    pendingNote: "ይህ ምዝገባ ክፍያ በመጠባበቅ ላይ ነው። ክፍያውን ማጠናቀቅ ወይም እንደገና መመዝገብ ይችላሉ።",
    registerAgain: "እንደገና መመዝገብ ይፈልጋሉ?",
    alreadyConfirmed: "ቀደም ሲል የተረጋገጠ ምዝገባ አለዎት። አዲስ ምዝገባ ተጨማሪ ግቤት ይፈጥራል።",
    hasPending: "ያልተጠናቀቀ ምዝገባ አለዎት። ያንን ክፍያ ማጠናቀቅ ያስቡበት።",
    canProceed: "ከፈለጉ በአዲስ ምዝገባ መቀጠል ይችላሉ።",
    proceedNew: "በአዲስ ምዝገባ ቀጥል",
  },

  login: {
    signInDesc: "የአስተዳዳሪ ፖርታልን ለመድረስ ይግቡ",
    emailLabel: "ኢሜይል",
    passwordLabel: "የይለፍ ቃል",
    signIn: "ግባ",
  },

  priceSummary: {
    title: "የዋጋ ማጠቃለያ",
    fullConference: "ሙሉ ጉባዔ",
    partialMotelGuest: "ከፊል — የሞቴል እንግዳ",
    motelStayFree: "ሞቴል ቆይታ (ነፃ)",
    completeForm: "ዋጋ ለማየት ቅጹን ያጠናቅቁ",
  },

  notConfigured: {
    title: "ዋጋ አልተዋቀረም",
    description: "ለዚህ ዝግጅት ዋጋ ገና አልተዋቀረም። እባክዎ ቆይተው ይመልከቱ።",
    backToEvents: "ወደ ዝግጅቶች ተመለስ",
  },

  eventPage: {
    allEvents: "ሁሉም ዝግጅቶች",
  },
};

export const dictionaries: Record<Locale, Dictionary> = { en, am };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}
