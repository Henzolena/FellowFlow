"use client";

import { useState, useCallback } from "react";

// Canonical age keys only — ALL registrants use these regardless of service language
type AgeRangeKey = "infant" | "child" | "youth" | "adult" | "";
export type AttendanceTypeKey = "full_conference" | "partial" | "kote" | "";
export type GenderKey = "male" | "female" | "";
export type ServiceLanguageKey = "amharic" | "english" | "";
export type GradeLevelKey = "7th-8th" | "9th-10th" | "11th" | "12th" | "college_career" | "";

export type Registrant = {
  id: string;
  firstName: string;
  lastName: string;
  serviceLanguage: ServiceLanguageKey;
  ageRange: AgeRangeKey;
  serviceAgeBand: string;
  gradeLevel: GradeLevelKey;
  gender: GenderKey;
  city: string;
  churchId: string;
  churchNameCustom: string;
  attendanceType: AttendanceTypeKey;
  isFullDuration: boolean | null;
  isStayingInMotel: boolean | null;
  numDays: number;
  selectedDays: number[];
  selectedMealIds: string[];
  tshirtSize: string;
};

export type ContactInfo = {
  email: string;
  phone: string;
};

let nextId = 1;
function genId() {
  return `reg-${nextId++}`;
}

export function createEmptyRegistrant(): Registrant {
  return {
    id: genId(),
    firstName: "",
    lastName: "",
    serviceLanguage: "",
    ageRange: "",
    serviceAgeBand: "",
    gradeLevel: "",
    gender: "",
    city: "",
    churchId: "",
    churchNameCustom: "",
    attendanceType: "",
    isFullDuration: null,
    isStayingInMotel: null,
    numDays: 0,
    selectedDays: [],
    selectedMealIds: [],
    tshirtSize: "",
  };
}

export type ValidationLabels = {
  firstNameRequired: string; lastNameRequired: string; ageRangeRequired: string;
  genderRequired: string; cityRequired: string; attendanceTypeRequired: string;
  selectAtLeastOneDay: string; emailRequired: string; validEmailRequired: string;
  phoneRequired: string; validPhoneRequired: string;
  serviceLanguageRequired: string; gradeLevelRequired: string;
};

const defaultValidationLabels: ValidationLabels = {
  firstNameRequired: "First name is required",
  lastNameRequired: "Last name is required",
  ageRangeRequired: "Age range is required",
  genderRequired: "Gender is required",
  cityRequired: "City is required",
  attendanceTypeRequired: "Attendance type is required",
  selectAtLeastOneDay: "Select at least one day",
  emailRequired: "Email is required",
  validEmailRequired: "Please enter a valid email address",
  phoneRequired: "Phone number is required",
  validPhoneRequired: "Please enter a valid phone number",
  serviceLanguageRequired: "Service selection is required",
  gradeLevelRequired: "Grade / level is required",
};

export function getRegistrantErrors(r: Registrant, labels: ValidationLabels = defaultValidationLabels): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!r.firstName.trim()) errors.firstName = labels.firstNameRequired;
  if (!r.lastName.trim()) errors.lastName = labels.lastNameRequired;
  if (!r.serviceLanguage) errors.serviceLanguage = labels.serviceLanguageRequired;
  if (!r.ageRange) errors.ageRange = labels.ageRangeRequired;
  if (!r.gender) errors.gender = labels.genderRequired;
  if (!r.city.trim()) errors.city = labels.cityRequired;
  if (!r.attendanceType) errors.attendanceType = labels.attendanceTypeRequired;
  if (r.attendanceType && r.attendanceType !== "full_conference" && r.selectedDays.length < 1) {
    errors.selectedDays = labels.selectAtLeastOneDay;
  }
  // Grade level required for English service sub-bands with grade selector
  if (r.serviceLanguage === "english" && (r.serviceAgeBand === "teens" || r.serviceAgeBand === "young_adults") && !r.gradeLevel) {
    errors.gradeLevel = labels.gradeLevelRequired;
  }
  return errors;
}

export function isRegistrantComplete(r: Registrant): boolean {
  return Object.keys(getRegistrantErrors(r)).length === 0;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s()\-+.]{7,20}$/;

export function getContactErrors(c: ContactInfo, labels: ValidationLabels = defaultValidationLabels): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!c.email.trim()) {
    errors.email = labels.emailRequired;
  } else if (!EMAIL_REGEX.test(c.email.trim())) {
    errors.email = labels.validEmailRequired;
  }
  if (!c.phone.trim()) {
    errors.phone = labels.phoneRequired;
  } else if (!PHONE_REGEX.test(c.phone.trim())) {
    errors.phone = labels.validPhoneRequired;
  }
  return errors;
}

export function useWizardState() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrants, setRegistrants] = useState<Registrant[]>([createEmptyRegistrant()]);
  const [expandedIdx, setExpandedIdx] = useState(0);
  const [contact, setContact] = useState<ContactInfo>({ email: "", phone: "" });

  function updateRegistrant(idx: number, fields: Partial<Registrant>) {
    setRegistrants((prev) => prev.map((r, i) => (i === idx ? { ...r, ...fields } : r)));
  }

  function addRegistrant() {
    const newReg = createEmptyRegistrant();
    setRegistrants((prev) => [...prev, newReg]);
    setExpandedIdx(registrants.length);
  }

  function removeRegistrant(idx: number) {
    if (registrants.length <= 1) return;
    setRegistrants((prev) => prev.filter((_, i) => i !== idx));
    setExpandedIdx(Math.min(expandedIdx, registrants.length - 2));
  }

  const [attemptedStep0, setAttemptedStep0] = useState(false);
  const [attemptedStep1, setAttemptedStep1] = useState(false);

  const allRegistrantsComplete = registrants.every((r) => Object.keys(getRegistrantErrors(r)).length === 0);
  const canProceedStep0 = allRegistrantsComplete;
  const contactErrors = getContactErrors(contact);
  const canProceedStep1 = Object.keys(contactErrors).length === 0;

  const tryProceedStep0 = useCallback(() => {
    setAttemptedStep0(true);
    if (!allRegistrantsComplete) {
      // Expand the first incomplete registrant
      const idx = registrants.findIndex((r) => Object.keys(getRegistrantErrors(r)).length > 0);
      if (idx >= 0) setExpandedIdx(idx);
      return false;
    }
    return true;
  }, [allRegistrantsComplete, registrants, setExpandedIdx]);

  const tryProceedStep1 = useCallback(() => {
    setAttemptedStep1(true);
    return canProceedStep1;
  }, [canProceedStep1]);

  return {
    step,
    setStep,
    loading,
    setLoading,
    error,
    setError,
    registrants,
    expandedIdx,
    setExpandedIdx,
    contact,
    setContact,
    updateRegistrant,
    addRegistrant,
    removeRegistrant,
    canProceedStep0,
    canProceedStep1,
    isRegistrantComplete,
    getRegistrantErrors,
    attemptedStep0,
    attemptedStep1,
    tryProceedStep0,
    tryProceedStep1,
    contactErrors,
  };
}
