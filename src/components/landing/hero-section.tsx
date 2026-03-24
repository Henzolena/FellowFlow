"use client";

import { useEffect, useRef, useCallback } from "react";
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
import { useTranslation } from "@/lib/i18n/context";

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
      className={`absolute z-10 hidden lg:flex items-center gap-2 rounded-full border border-white/20 bg-white/80 backdrop-blur-xl px-3.5 py-2 text-xs font-medium shadow-brand-md animate-in fade-in zoom-in-95 motion-reduce:animate-none ${className}`}
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
  const { dict } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const prefersReducedMotion = useRef(false);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (prefersReducedMotion.current) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 12;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 12;
      container.style.setProperty("--px", `${x}px`);
      container.style.setProperty("--py", `${y}px`);
    });
  }, []);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const container = containerRef.current;
    if (!container || prefersReducedMotion.current) return;

    container.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => {
      container.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [handleMouseMove]);

  return (
    <section
      ref={containerRef}
      className="relative overflow-hidden min-h-[80vh] sm:min-h-[90vh] flex items-center"
      style={{ "--px": "0px", "--py": "0px" } as React.CSSProperties}
    >
      {/* === Background layers === */}

      {/* Base gradient mesh */}
      <div className="absolute inset-0 -z-20" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted/60" />
      </div>

      {/* Animated gradient orbs — driven by CSS custom props, no re-renders */}
      <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div
          className="hero-orb hero-orb-1 will-change-transform motion-reduce:!transform-none"
          style={{
            transform: `translate(calc(var(--px) * 0.5), calc(var(--py) * 0.5))`,
          }}
        />
        <div
          className="hero-orb hero-orb-2 will-change-transform motion-reduce:!transform-none"
          style={{
            transform: `translate(calc(var(--px) * -0.3), calc(var(--py) * -0.3))`,
          }}
        />
        <div
          className="hero-orb hero-orb-3 will-change-transform motion-reduce:!transform-none"
          style={{
            transform: `translate(calc(var(--px) * 0.4), calc(var(--py) * -0.4))`,
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
                {dict.hero.registrationOpen}
              </span>
            </div>

            {/* Headline */}
            <div className="animate-in fade-in slide-in-from-bottom-3 duration-700" style={{ animationDelay: "100ms", animationFillMode: "both" }}>
              <h1 className="relative">
                <span className="block text-[2rem] xs:text-[2.75rem] sm:text-6xl lg:text-7xl xl:text-[5rem] font-black tracking-[-0.02em] leading-[0.95] mb-3">
                  <span className="relative inline-block">
                    {dict.hero.headline1}
                    <svg className="absolute -bottom-2 left-0 w-full h-3 text-brand-cyan/20" viewBox="0 0 200 12" preserveAspectRatio="none">
                      <path d="M0,7 Q50,0 100,7 T200,7" fill="none" stroke="currentColor" strokeWidth="3" />
                    </svg>
                  </span>
                </span>
                <span className="block text-[2rem] xs:text-[2.75rem] sm:text-6xl lg:text-7xl xl:text-[5rem] font-black tracking-[-0.02em] leading-[0.95]">
                  {dict.hero.headline2}
                </span>
                <span className="block text-[2.25rem] xs:text-[3rem] sm:text-[4rem] lg:text-[5rem] xl:text-[5.5rem] font-black tracking-[-0.03em] leading-[0.9] mt-2 sm:mt-4 hero-gradient-text-enhanced">
                  {dict.hero.headline3}
                </span>
              </h1>
            </div>

            {/* Subheadline */}
            <div className="animate-in fade-in slide-in-from-bottom-3 duration-700" style={{ animationDelay: "250ms", animationFillMode: "both" }}>
              <p className="text-base sm:text-lg md:text-xl leading-relaxed text-foreground/70 max-w-xl mx-auto lg:mx-0 font-medium">
                {dict.hero.subheadline}{" "}
                <span className="relative inline-block">
                  <span className="relative z-10 text-foreground font-semibold">{dict.hero.under2Minutes}</span>
                  <span className="absolute bottom-0 left-0 w-full h-2 bg-brand-amber/20 -rotate-1" />
                </span>
                {dict.hero.subheadlineEnd}
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
                    {dict.hero.browseEvents}
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
                  {dict.hero.seeHowItWorks}
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
                <span>{dict.hero.ssl}</span>
              </div>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-brand-cyan" />
                <span>{dict.hero.stripePowered}</span>
              </div>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-brand-amber" />
                <span>{dict.hero.instantConfirmation}</span>
              </div>
            </div>
          </div>

          {/* Right column: Hero figure + floating chips */}
          <div className="relative order-1 lg:order-2">
            {/* Glow ring behind image */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] aspect-square rounded-full hero-figure-glow will-change-transform motion-reduce:!transform-none"
              style={{
                transform: `translate(calc(-50% + var(--px) * 0.2), calc(-50% + var(--py) * 0.2))`,
              }}
              aria-hidden="true"
            />

            {/* Hero figure */}
            <div
              className="relative mx-auto max-w-md sm:max-w-lg lg:max-w-xl will-change-transform motion-reduce:!transform-none"
              style={{
                transform: `translate(calc(var(--px) * 0.15), calc(var(--py) * 0.15))`,
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
              <span className="text-foreground/80">{dict.hero.fastRegistration}</span>
            </FloatingChip>

            <FloatingChip
              className="bottom-[15%] -left-8 animate-float-slow-reverse"
              delay={1100}
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-cyan/10">
                <CreditCard className="h-3 w-3 text-brand-cyan" />
              </div>
              <span className="text-foreground/80">{dict.hero.securePayments}</span>
            </FloatingChip>

            <FloatingChip
              className="top-[20%] -right-6 animate-float-slow"
              delay={1400}
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-green/10">
                <CalendarCheck className="h-3 w-3 text-brand-green" />
              </div>
              <span className="text-foreground/80">{dict.hero.instantReceipts}</span>
            </FloatingChip>
          </div>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent" aria-hidden="true" />
    </section>
  );
}
