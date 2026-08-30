"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import TextReveal from "./TextReveal";

export default function Hero() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "25%"]);
  const contentY = useTransform(scrollYProgress, [0, 1], ["0%", "60%"]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1.1, 1.25]);

  return (
    <section
      ref={ref}
      className="relative h-screen min-h-[700px] flex items-center justify-center overflow-hidden"
    >
      {/* Parallax background */}
      <motion.div style={{ y: bgY, scale }} className="absolute inset-0">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=1920&q=80')",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-charcoal/50 via-charcoal/20 to-charcoal/60" />
        <div className="absolute inset-0 bg-gradient-to-r from-charcoal/30 to-transparent" />
      </motion.div>

      {/* Content */}
      <motion.div
        style={{ y: contentY, opacity: contentOpacity }}
        className="relative z-10 text-center max-w-5xl mx-auto px-6"
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 2.6 }}
          className="mb-8 flex items-center justify-center gap-4"
        >
          <span className="h-px w-10 bg-gold/60" />
          <span className="text-[11px] tracking-[0.5em] uppercase text-cream/70 font-sans font-light">
            Hamilton, Ontario
          </span>
          <span className="h-px w-10 bg-gold/60" />
        </motion.div>

        <TextReveal
          as="h1"
          delay={2.7}
          className="font-serif text-display-xl text-white font-light mb-10"
          lines={[
            "Where Artistry",
            <em key="i" className="italic font-light">
              Meets Nature
            </em>,
          ]}
        />

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 3.2 }}
          className="text-cream/80 font-sans font-light text-base md:text-lg max-w-xl mx-auto mb-12 leading-relaxed"
        >
          Bespoke floral design for life&apos;s most meaningful moments.
          Crafted with rare, seasonal blooms.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 3.4 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <a
            href="#collections"
            className="group relative px-10 py-4 overflow-hidden border border-white/30 text-white text-xs tracking-[0.25em] uppercase font-sans font-light transition-colors duration-500 hover:text-charcoal"
          >
            <span className="absolute inset-0 bg-white translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" />
            <span className="relative">Explore Collections</span>
          </a>
          <a
            href="#contact"
            className="link-hover px-10 py-4 text-white/70 text-xs tracking-[0.25em] uppercase font-sans font-light hover:text-white transition-colors duration-500"
          >
            Book a Consultation
          </a>
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 4 }}
        style={{ opacity: contentOpacity }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3"
      >
        <span className="text-[9px] tracking-[0.4em] uppercase text-white/40 font-sans">
          Scroll
        </span>
        <motion.div
          animate={{ scaleY: [0, 1, 0], originY: [0, 0, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          className="w-px h-14 bg-white/50"
        />
      </motion.div>
    </section>
  );
}
