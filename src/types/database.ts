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
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
  motel_stay_free: boolean;
  created_at: string;
  updated_at: string;
};

export type AgeCategory = "adult" | "youth" | "child";

export type ExplanationCode =
  | "FULL_MOTEL_FREE"
  | "FULL_ADULT"
  | "FULL_YOUTH"
  | "FULL_CHILD"
  | "PARTIAL_ADULT"
  | "PARTIAL_YOUTH"
  | "PARTIAL_CHILD";

export type Registration = {
  id: string;
  event_id: string;
  user_id: string | null;
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
  computed_amount: number;
  explanation_code: ExplanationCode;
  explanation_detail: string | null;
  status: "pending" | "confirmed" | "cancelled" | "refunded";
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

export type EventWithPricing = Event & {
  pricing_config: PricingConfig[] | PricingConfig | null;
};
