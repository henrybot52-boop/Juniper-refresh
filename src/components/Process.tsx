"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import TextReveal from "./TextReveal";

const steps = [
  {
    number: "01",
    title: "Consultation",
    text: "We begin with a conversation — your story, your palette, the feeling you want the room to hold. Over coffee at the studio or by video, we listen first.",
  },
  {
    number: "02",
    title: "Concept & Palette",
    text: "We compose a bespoke design study: mood imagery, bloom selections, vessel pairings, and a palette built around your season and setting.",
  },
  {
    number: "03",
    title: "Sourcing",
    text: "Orders go to our growers weeks ahead. Stems are cut to order — never warehoused — and conditioned in the studio for peak openness on your day.",
  },
  {
    number: "04",
    title: "The Reveal",
    text: "Our team installs, styles, and finesses every placement on site, then returns after the last dance so you never lift a stem.",
  },
];

export default function Process() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="process" className="py-32 md:py-44 bg-cream">
      <div ref={ref} className="max-w-[1400px] mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          {/* Sticky heading */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-32">
              <motion.span
                initial={{ opacity: 0 }}
                animate={isInView ? { opacity: 1 } : {}}
                transition={{ duration: 0.8 }}
                className="text-[11px] tracking-[0.5em] uppercase text-sage font-sans font-light"
              >
                The Experience
              </motion.span>
              <TextReveal
                delay={0.15}
                className="font-serif text-display text-charcoal font-light mt-6 mb-8"
                lines={[
                  "From First Call",
                  <em key="i" className="italic">
                    to Final Petal
                  </em>,
                ]}
              />
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.9, delay: 0.4 }}
                className="text-warm-gray font-sans font-light text-base leading-relaxed max-w-md"
              >
                A considered, unhurried process refined over twelve years and
                five hundred celebrations. You bring the occasion; we carry
                everything else.
              </motion.p>
            </div>
          </div>

          {/* Steps */}
          <div className="lg:col-span-7">
            {steps.map((step, i) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 50 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{
                  duration: 0.9,
                  delay: 0.3 + i * 0.15,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="group border-t border-charcoal/10 py-12 md:py-14 grid grid-cols-[auto_1fr] gap-8 md:gap-14 hover:border-sage/40 transition-colors duration-500"
              >
                <span className="font-serif text-4xl md:text-5xl text-sage/40 font-light group-hover:text-sage transition-colors duration-500">
                  {step.number}
                </span>
                <div>
                  <h3 className="font-serif text-2xl md:text-3xl text-charcoal font-light mb-4">
                    {step.title}
                  </h3>
                  <p className="text-warm-gray font-sans font-light text-sm md:text-base leading-relaxed max-w-lg">
                    {step.text}
                  </p>
                </div>
              </motion.div>
            ))}
            <div className="border-t border-charcoal/10" />
          </div>
        </div>
      </div>
    </section>
  );
}
