"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Zap,
  ShieldCheck,
  CreditCard,
  CalendarCheck,
} from "lucide-react";

function FloatingChip({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={`absolute z-10 hidden lg:flex items-center gap-2 rounded-full border border-white/20 bg-white/80 backdrop-blur-xl px-3.5 py-2 text-xs font-medium shadow-brand-md animate-in fade-in zoom-in-95 ${className}`}
      style={{
        animationDelay: `${delay}ms`,
        animationDuration: "800ms",
        animationFillMode: "both",
      }}
    >
      {children}
    </div>
  );
}

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      setMousePos({
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      });
    };

    container.addEventListener("mousemove", handleMouseMove);
    return () => container.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const parallaxX = (mousePos.x - 0.5) * 12;
  const parallaxY = (mousePos.y - 0.5) * 12;

  return (
    <section ref={containerRef} className="relative overflow-hidden min-h-[90vh] flex items-center">
      {/* === Background layers === */}

      {/* Base gradient mesh */}
      <div className="absolute inset-0 -z-20" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted/60" />
      </div>

      {/* Animated gradient orbs */}
      <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div
          className="hero-orb hero-orb-1"
          style={{
            transform: `translate(${parallaxX * 0.5}px, ${parallaxY * 0.5}px)`,
          }}
        />
        <div
          className="hero-orb hero-orb-2"
          style={{
            transform: `translate(${parallaxX * -0.3}px, ${parallaxY * -0.3}px)`,
          }}
        />
        <div
          className="hero-orb hero-orb-3"
          style={{
            transform: `translate(${parallaxX * 0.4}px, ${parallaxY * -0.4}px)`,
          }}
        />
      </div>

      {/* Dot grid pattern */}
      <div className="absolute inset-0 -z-10 hero-dot-grid opacity-[0.35]" aria-hidden="true" />

      {/* Noise overlay */}
      <div className="absolute inset-0 -z-10 hero-noise opacity-[0.025]" aria-hidden="true" />

      {/* === Content === */}
      <div className="relative mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-0">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-20 items-center">

          {/* Left column: Text + CTAs */}
          <div className="space-y-8 text-center lg:text-left order-2 lg:order-1">
            {/* Eyebrow badge */}
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-cyan/20 bg-brand-cyan/5 px-4 py-1.5 text-xs font-semibold text-brand-teal tracking-wide uppercase">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-cyan opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-teal" />
                </span>
                Registration Open
              </span>
            </div>

            {/* Headline */}
            <div className="animate-in fade-in slide-in-from-bottom-3 duration-700" style={{ animationDelay: "100ms", animationFillMode: "both" }}>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-[3.5rem] xl:text-6xl leading-[1.1]">
                <span className="block">Conference</span>
                <span className="block">Registration</span>
                <span className="block mt-1 hero-gradient-text">Made Effortless</span>
              </h1>
            </div>

            {/* Subheadline */}
            <div className="animate-in fade-in slide-in-from-bottom-3 duration-700" style={{ animationDelay: "250ms", animationFillMode: "both" }}>
              <p className="text-base sm:text-lg leading-relaxed text-muted-foreground max-w-lg mx-auto lg:mx-0">
                From sign-up to confirmation in under 2 minutes. Smart pricing, secure
                payments, and instant receipts — all in one seamless flow.
              </p>
            </div>

            {/* CTA buttons */}
            <div
              className="flex flex-col sm:flex-row items-center lg:items-start gap-3 animate-in fade-in slide-in-from-bottom-3 duration-700"
              style={{ animationDelay: "400ms", animationFillMode: "both" }}
            >
              <Link href="/register">
                <Button
                  size="lg"
                  className="group relative text-base px-8 h-12 shadow-brand-md hover:shadow-brand-lg transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    Browse Events
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </Button>
              </Link>
              <Link href="#how-it-works">
                <Button
                  variant="outline"
                  size="lg"
                  className="text-base h-12 px-6 border-border/60 hover:bg-muted/60 transition-all duration-300"
                >
                  See How It Works
                </Button>
              </Link>
            </div>

            {/* Trust row */}
            <div
              className="flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 pt-2 text-xs text-muted-foreground animate-in fade-in duration-700"
              style={{ animationDelay: "600ms", animationFillMode: "both" }}
            >
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-brand-teal" />
                <span>256-bit SSL</span>
              </div>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-brand-cyan" />
                <span>Stripe Powered</span>
              </div>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-brand-amber" />
                <span>Instant Confirmation</span>
              </div>
            </div>
          </div>

          {/* Right column: Hero figure + floating chips */}
          <div className="relative order-1 lg:order-2">
            {/* Glow ring behind image */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] aspect-square rounded-full hero-figure-glow"
              style={{
                transform: `translate(calc(-50% + ${parallaxX * 0.2}px), calc(-50% + ${parallaxY * 0.2}px))`,
              }}
              aria-hidden="true"
            />

            {/* Hero figure */}
            <div
              className="relative mx-auto max-w-md sm:max-w-lg lg:max-w-xl"
              style={{
                transform: `translate(${parallaxX * 0.15}px, ${parallaxY * 0.15}px)`,
                transition: "transform 0.3s ease-out",
              }}
            >
              <div className="relative aspect-square animate-float">
                <Image
                  src="/FellowFlow-hero.png"
                  alt="Conference registration scheduling illustration showing calendar, clock, and planning elements"
                  fill
                  priority
                  className="object-contain drop-shadow-2xl"
                  sizes="(max-width: 768px) 90vw, (max-width: 1024px) 50vw, 40vw"
                />
              </div>
            </div>

            {/* Floating chips around figure */}
            <FloatingChip
              className="top-[8%] -left-4 animate-float-slow"
              delay={800}
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal/10">
                <Zap className="h-3 w-3 text-brand-teal" />
              </div>
              <span className="text-foreground/80">Fast Registration</span>
            </FloatingChip>

            <FloatingChip
              className="bottom-[15%] -left-8 animate-float-slow-reverse"
              delay={1100}
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-cyan/10">
                <CreditCard className="h-3 w-3 text-brand-cyan" />
              </div>
              <span className="text-foreground/80">Secure Payments</span>
            </FloatingChip>

            <FloatingChip
              className="top-[20%] -right-6 animate-float-slow"
              delay={1400}
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-green/10">
                <CalendarCheck className="h-3 w-3 text-brand-green" />
              </div>
              <span className="text-foreground/80">Instant Receipts</span>
            </FloatingChip>
          </div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent" aria-hidden="true" />
    </section>
  );
}
