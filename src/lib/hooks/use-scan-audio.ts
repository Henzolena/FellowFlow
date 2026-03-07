"use client";

import { useRef, useCallback } from "react";

/**
 * Plays success/error audio feedback for QR scan results.
 * Audio files must exist at /scan-success.mp3 and /scan-error.mp3 in /public.
 */
export function useScanAudio() {
  const successRef = useRef<HTMLAudioElement | null>(null);
  const errorRef = useRef<HTMLAudioElement | null>(null);

  const getSuccessAudio = useCallback(() => {
    if (!successRef.current) {
      successRef.current = new Audio("/scan-success.mp3");
      successRef.current.volume = 0.7;
    }
    return successRef.current;
  }, []);

  const getErrorAudio = useCallback(() => {
    if (!errorRef.current) {
      errorRef.current = new Audio("/scan-error.mp3");
      errorRef.current.volume = 0.7;
    }
    return errorRef.current;
  }, []);

  const playSuccess = useCallback(() => {
    try {
      const audio = getSuccessAudio();
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch {
      // Audio playback not supported — silent fallback
    }
  }, [getSuccessAudio]);

  const playError = useCallback(() => {
    try {
      const audio = getErrorAudio();
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch {
      // Audio playback not supported — silent fallback
    }
  }, [getErrorAudio]);

  return { playSuccess, playError };
}
