"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

type QRCodeDisplayProps = {
  value: string;
  size?: number;
  className?: string;
};

export function QRCodeDisplay({ value, size = 160, className }: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;
    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).catch(() => {});
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={size}
      height={size}
      aria-label={`QR code for ${value}`}
    />
  );
}
