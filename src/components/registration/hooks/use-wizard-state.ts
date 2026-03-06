"use client";

import { useState } from "react";

type AgeRangeKey = "infant" | "child" | "youth" | "adult" | "";

export type Registrant = {
  id: string;
  firstName: string;
  lastName: string;
  ageRange: AgeRangeKey;
  isFullDuration: boolean | null;
  isStayingInMotel: boolean | null;
  numDays: number;
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
    isFullDuration: null,
    isStayingInMotel: null,
    numDays: 1,
  };
}

export function isRegistrantComplete(r: Registrant): boolean {
  if (!r.firstName.trim() || !r.lastName.trim() || !r.ageRange) return false;
  if (r.isFullDuration === null) return false;
  if (!r.isFullDuration) {
    if (r.isStayingInMotel === null) return false;
    if (!r.isStayingInMotel && r.numDays < 1) return false;
  }
  return true;
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
  const canProceedStep1 = contact.email.trim() !== "";

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
