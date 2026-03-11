export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: "user" | "admin" | "super_admin";
  created_at: string;
  updated_at: string;
};

export type Event = {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  duration_days: number;
  adult_age_threshold: number;
  youth_age_threshold: number;
  infant_age_threshold: number;
  is_active: boolean;
  wristband_config: WristbandMapping[];
  created_at: string;
  updated_at: string;
};

export type WristbandMapping = {
  access_tier: AccessTier;
  color: string;
  label: string;
};

export type CheckInMethod = 'qr_scan' | 'manual' | 'code_entry';

export type CheckIn = {
  id: string;
  registration_id: string;
  event_id: string;
  checked_in_by: string | null;
  checked_in_at: string;
  wristband_color: string | null;
  access_tier: AccessTier | null;
  method: CheckInMethod;
  notes: string | null;
  created_at: string;
};

export type Church = {
  id: string;
  name: string;
  city: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AttendanceType = 'full_conference' | 'partial' | 'kote';

export type AccessTier = 'FULL_ACCESS' | 'KOTE_ACCESS' | 'MOTEL_ACCESS' | 'MEAL_ACCESS' | 'STAFF' | 'VIP';

export type Gender = 'male' | 'female';

export type RegistrationStatus = 'draft' | 'invited' | 'pending' | 'confirmed' | 'cancelled' | 'refunded';

export type RegistrationSource = 'self' | 'admin_prefill' | 'admin_direct';

export type SurchargeTier = {
  start_date: string;
  end_date: string;
  amount: number;
  label: string;
};

export type PricingConfig = {
  id: string;
  event_id: string;
  adult_full_price: number;
  adult_daily_price: number;
  youth_full_price: number;
  youth_daily_price: number;
  child_full_price: number;
  child_daily_price: number;
  kote_daily_price: number;
  lodging_fee: number;
  late_surcharge_tiers: SurchargeTier[];
  created_at: string;
  updated_at: string;
};

export type AgeCategory = "adult" | "youth" | "child";

export type ExplanationCode =
  | "FREE_INFANT"
  | "FULL_ADULT"
  | "FULL_YOUTH"
  | "FULL_CHILD"
  | "PARTIAL_ADULT"
  | "PARTIAL_YOUTH"
  | "PARTIAL_CHILD"
  | "KOTE";

export type Registration = {
  id: string;
  event_id: string;
  user_id: string | null;
  group_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  date_of_birth: string;
  age_at_event: number;
  category: AgeCategory;
  is_full_duration: boolean;
  is_staying_in_motel: boolean | null;
  num_days: number | null;
  selected_days: number[] | null;
  computed_amount: number;
  explanation_code: ExplanationCode;
  explanation_detail: string | null;
  status: RegistrationStatus;
  gender: Gender | null;
  city: string | null;
  church_id: string | null;
  church_name_custom: string | null;
  attendance_type: AttendanceType;
  public_confirmation_code: string;
  access_tier: AccessTier | null;
  completion_token: string | null;
  registration_source: RegistrationSource;
  payment_waived: boolean;
  admin_notes: string | null;
  prefill_token_expires_at: string | null;
  invited_by_admin: string | null;
  invitation_code: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
};

export type Payment = {
  id: string;
  registration_id: string;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "refunded" | "expired";
  idempotency_key: string | null;
  webhook_received_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RegistrationWithPayment = Registration & {
  payments: Payment[];
};

export type EventImage = {
  id: string;
  event_id: string;
  storage_path: string;
  url: string;
  image_type: 'cover' | 'gallery' | 'banner';
  display_order: number;
  alt_text: string | null;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
};

export type RoomType = 'standard' | 'double' | 'suite' | 'accessible';
export type BedType = 'single' | 'double' | 'bunk_top' | 'bunk_bottom' | 'queen' | 'king' | 'floor';

export type Motel = {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  address: string | null;
  total_rooms: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Room = {
  id: string;
  motel_id: string;
  room_number: string;
  room_type: RoomType;
  capacity: number;
  floor: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Bed = {
  id: string;
  room_id: string;
  bed_label: string;
  bed_type: BedType;
  is_occupied: boolean;
  created_at: string;
  updated_at: string;
};

export type LodgingAssignment = {
  id: string;
  registration_id: string;
  bed_id: string;
  check_in_date: string | null;
  check_out_date: string | null;
  assigned_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type RoomWithBeds = Room & { beds: Bed[] };
export type MotelWithRooms = Motel & { rooms: RoomWithBeds[] };

/* ── Service Check-In System ──────────────────────────────────────── */

export type ServiceCategory = 'main_service' | 'meal' | 'custom';
export type MealType = 'breakfast' | 'lunch' | 'dinner';
export type EntitlementStatus = 'allowed' | 'blocked' | 'waived' | 'paid_extra';
export type ScanResult = 'approved' | 'denied' | 'duplicate' | 'not_entitled' | 'blocked';

export type ServiceCatalogItem = {
  id: string;
  event_id: string;
  service_name: string;
  service_code: string;
  service_category: ServiceCategory;
  meal_type: MealType | null;
  service_date: string | null;
  start_time: string | null;
  end_time: string | null;
  is_active: boolean;
  scan_limit_per_attendee: number;
  requires_payment: boolean;
  notes: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type ServiceEntitlement = {
  id: string;
  registration_id: string;
  service_id: string;
  status: EntitlementStatus;
  quantity_allowed: number;
  quantity_used: number;
  granted_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ServiceUsageLog = {
  id: string;
  registration_id: string;
  service_id: string;
  scanned_by: string | null;
  scanned_at: string;
  result: ScanResult;
  reason: string | null;
  station_label: string | null;
  created_at: string;
};

export type ServiceEntitlementWithService = ServiceEntitlement & {
  service_catalog: ServiceCatalogItem;
};

export type ServiceUsageLogWithDetails = ServiceUsageLog & {
  service_catalog: ServiceCatalogItem;
  registrations?: {
    first_name: string;
    last_name: string;
    public_confirmation_code: string;
  };
};

/* ── Venue Documentation System ─────────────────────────────────── */

export type FacilityType = 'hotel' | 'dorm' | 'conference_room' | 'hall' | 'cottage' | 'amenity' | 'other';
export type RateCategory = 'accommodation' | 'meal' | 'amenity' | 'fee';
export type MealName = 'breakfast' | 'lunch' | 'dinner';

export type OfficeHours = {
  day: string;
  hours: string;
  note: string | null;
};

export type Venue = {
  id: string;
  event_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  website: string | null;
  contract_date: string | null;
  reservation_start: string | null;
  reservation_end: string | null;
  arrival_time: string | null;
  departure_time: string | null;
  organization_name: string | null;
  organization_address: string | null;
  organization_city_state_zip: string | null;
  organization_phone: string | null;
  group_name: string | null;
  group_leader: string | null;
  group_leader_email: string | null;
  group_leader_phone: string | null;
  deposit_total: number;
  deposit_paid: number;
  deposit_balance: number;
  deposit_due_date: string | null;
  payment_notes: string | null;
  guaranteed_hotel_rooms: number;
  guaranteed_dorm_beds: number;
  total_rooms_reserved: number;
  office_hours: OfficeHours[];
  rules: string[];
  general_info: string[];
  created_at: string;
  updated_at: string;
};

export type VenueFacility = {
  id: string;
  venue_id: string;
  name: string;
  facility_type: FacilityType;
  capacity: number | null;
  capacity_unit: string | null;
  rate_per_night: number | null;
  rate_unit: string | null;
  tables_count: number | null;
  table_types: string | null;
  equipment: string[];
  linens_provided: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type VenueRate = {
  id: string;
  venue_id: string;
  rate_name: string;
  rate_category: RateCategory;
  amount: number;
  unit: string;
  age_restriction: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
};

export type VenueMealSchedule = {
  id: string;
  venue_id: string;
  meal_date: string;
  meal_name: MealName;
  meal_time: string;
  expected_count: number;
  notes: string | null;
  sort_order: number;
  created_at: string;
};

export type VenueWithDetails = Venue & {
  venue_facilities: VenueFacility[];
  venue_rates: VenueRate[];
  venue_meal_schedule: VenueMealSchedule[];
};

/* ── Composite types ─────────────────────────────────────────────── */

export type EventWithPricing = Event & {
  pricing_config: PricingConfig[] | PricingConfig | null;
};

export type EventWithImages = Event & {
  pricing_config: PricingConfig[] | PricingConfig | null;
  event_images: EventImage[];
};
