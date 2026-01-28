"use client";

import { motion } from "framer-motion";

export default function Hero() {
  return (
    <section className="relative h-screen min-h-[700px] flex items-center justify-center overflow-hidden">
      {/* Background image with parallax effect */}
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 bg-cover bg-center scale-110"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=1920&q=80')",
          }}
        />
        {/* Gradient overlays for depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-charcoal/40 via-charcoal/20 to-charcoal/50" />
        <div className="absolute inset-0 bg-gradient-to-r from-charcoal/30 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center max-w-5xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="mb-6"
        >
          <span className="inline-block text-[11px] tracking-[0.5em] uppercase text-cream/70 font-sans font-light">
            Hamilton, Ontario
          </span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="font-serif text-display-xl text-white font-light mb-8"
        >
          Where Artistry
          <br />
          <em className="italic font-light">Meets Nature</em>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.9 }}
          className="text-cream/80 font-sans font-light text-base md:text-lg max-w-xl mx-auto mb-12 leading-relaxed"
        >
          Bespoke floral design for life&apos;s most meaningful moments.
          Crafted with rare, seasonal blooms.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <a
            href="#collections"
            className="group px-10 py-4 bg-white/10 backdrop-blur-sm border border-white/30 text-white text-xs tracking-[0.25em] uppercase font-sans font-light hover:bg-white hover:text-charcoal transition-all duration-700"
          >
            Explore Collections
          </a>
          <a
            href="#contact"
            className="px-10 py-4 text-white/70 text-xs tracking-[0.25em] uppercase font-sans font-light hover:text-white transition-colors duration-500"
          >
            Book a Consultation
          </a>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="w-px h-12 bg-gradient-to-b from-transparent to-white/50"
        />
      </motion.div>
    </section>
  );
}
