"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const stats = [
  { value: "500+", label: "Weddings Designed" },
  { value: "12", label: "Years of Craft" },
  { value: "100%", label: "Custom Designs" },
];

export default function Weddings() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section
      id="weddings"
      className="relative py-32 md:py-44 overflow-hidden"
    >
      {/* Full background image */}
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 bg-cover bg-center bg-fixed"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1920&q=80')",
          }}
        />
        <div className="absolute inset-0 bg-charcoal/60" />
      </div>

      <div
        ref={ref}
        className="relative z-10 max-w-[1400px] mx-auto px-6 md:px-12"
      >
        <div className="max-w-2xl">
          <motion.span
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.8 }}
            className="text-[11px] tracking-[0.5em] uppercase text-blush-light font-sans font-light"
          >
            Weddings & Events
          </motion.span>

          <motion.h2
            initial={{ opacity: 0, y: 40 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="font-serif text-display text-white font-light mt-6 mb-8"
          >
            Your Vision,
            <br />
            <em className="italic">Our Craft</em>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.9, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="text-white/70 font-sans font-light text-base md:text-lg leading-relaxed mb-12 max-w-lg"
          >
            We collaborate closely with each couple to translate their aesthetic
            into a cohesive floral experience — from ceremony arches and bridal
            bouquets to reception centerpieces and send-off blooms.
          </motion.p>

          <motion.a
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.6 }}
            href="#contact"
            className="inline-flex px-10 py-4 bg-white/10 backdrop-blur-sm border border-white/30 text-white text-xs tracking-[0.25em] uppercase font-sans font-light hover:bg-white hover:text-charcoal transition-all duration-700"
          >
            Start Planning
          </motion.a>
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.9, delay: 0.8 }}
          className="mt-24 flex flex-wrap gap-16 md:gap-24"
        >
          {stats.map((stat) => (
            <div key={stat.label}>
              <div className="font-serif text-5xl md:text-6xl text-white font-light">
                {stat.value}
              </div>
              <div className="text-white/50 text-xs tracking-[0.3em] uppercase font-sans font-light mt-2">
                {stat.label}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
