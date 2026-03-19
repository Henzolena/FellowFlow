"use client";

import { useState, useCallback } from "react";

type AgeRangeKey = "infant" | "child" | "youth" | "adult" | "";
export type AttendanceTypeKey = "full_conference" | "partial" | "kote" | "";
export type GenderKey = "male" | "female" | "";

export type Registrant = {
  id: string;
  firstName: string;
  lastName: string;
  ageRange: AgeRangeKey;
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
    ageRange: "",
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

export function getRegistrantErrors(r: Registrant): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!r.firstName.trim()) errors.firstName = "First name is required";
  if (!r.lastName.trim()) errors.lastName = "Last name is required";
  if (!r.ageRange) errors.ageRange = "Age range is required";
  if (!r.gender) errors.gender = "Gender is required";
  if (!r.city.trim()) errors.city = "City is required";
  if (!r.attendanceType) errors.attendanceType = "Attendance type is required";
  if (r.attendanceType && r.attendanceType !== "full_conference" && r.selectedDays.length < 1) {
    errors.selectedDays = "Select at least one day";
  }
  return errors;
}

export function isRegistrantComplete(r: Registrant): boolean {
  return Object.keys(getRegistrantErrors(r)).length === 0;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s()\-+.]{7,20}$/;

export function getContactErrors(c: ContactInfo): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!c.email.trim()) {
    errors.email = "Email is required";
  } else if (!EMAIL_REGEX.test(c.email.trim())) {
    errors.email = "Please enter a valid email address";
  }
  if (!c.phone.trim()) {
    errors.phone = "Phone number is required";
  } else if (!PHONE_REGEX.test(c.phone.trim())) {
    errors.phone = "Please enter a valid phone number";
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

  const allRegistrantsComplete = registrants.every(isRegistrantComplete);
  const canProceedStep0 = allRegistrantsComplete;
  const contactErrors = getContactErrors(contact);
  const canProceedStep1 = Object.keys(contactErrors).length === 0;

  const tryProceedStep0 = useCallback(() => {
    setAttemptedStep0(true);
    if (!allRegistrantsComplete) {
      // Expand the first incomplete registrant
      const idx = registrants.findIndex((r) => !isRegistrantComplete(r));
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
