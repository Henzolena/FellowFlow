"use client";

import { useState } from "react";

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

export function isRegistrantComplete(r: Registrant): boolean {
  if (!r.firstName.trim() || !r.lastName.trim() || !r.ageRange) return false;
  if (!r.gender) return false;
  if (!r.city.trim()) return false;
  if (!r.attendanceType) return false;

  if (r.attendanceType === "full_conference") {
    return true;
  }
  if (r.attendanceType === "kote") {
    return r.selectedDays.length >= 1;
  }
  // partial: needs at least one day selected
  return r.selectedDays.length >= 1;
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

  const allRegistrantsComplete = registrants.every(isRegistrantComplete);
  const canProceedStep0 = allRegistrantsComplete;
  const canProceedStep1 = contact.email.trim() !== "" && contact.phone.trim() !== "";

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
  };
}
