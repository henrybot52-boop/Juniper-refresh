"use client";

import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";

const testimonials = [
  {
    quote:
      "Juniper created the most breathtaking arrangements for our wedding. Every single guest commented on the flowers. They truly elevated the entire experience.",
    author: "Sarah & Michael",
    event: "Fall Wedding, 2024",
  },
  {
    quote:
      "Working with Juniper feels like collaborating with an artist. They understood our vision immediately and brought it to life in ways we never imagined possible.",
    author: "Emma & David",
    event: "Garden Reception, 2024",
  },
  {
    quote:
      "The weekly arrangements for our boutique hotel have become a defining feature of our guest experience. Juniper's artistry is unmatched in Hamilton.",
    author: "The Linden Hotel",
    event: "Commercial Partnership",
  },
];

export default function Testimonials() {
  const [current, setCurrent] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section
      id="testimonials"
      className="py-32 md:py-44 bg-cream"
    >
      <div
        ref={ref}
        className="max-w-[1000px] mx-auto px-6 md:px-12 text-center"
      >
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="text-[11px] tracking-[0.5em] uppercase text-sage font-sans font-light">
            Kind Words
          </span>
          <h2 className="font-serif text-display text-charcoal font-light mt-6 mb-20">
            From Our Clients
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.9, delay: 0.3 }}
        >
          {/* Quote icon */}
          <div className="mb-10">
            <svg
              className="w-10 h-10 mx-auto text-sage/30"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
            </svg>
          </div>

          <div className="relative min-h-[200px]">
            {testimonials.map((t, i) => (
              <div
                key={i}
                className={`absolute inset-0 transition-all duration-700 ${
                  i === current
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-4 pointer-events-none"
                }`}
              >
                <blockquote className="font-serif text-heading text-charcoal font-light italic leading-relaxed mb-10">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <div className="styled-hr mb-8" />
                <cite className="not-italic">
                  <div className="font-serif text-lg text-charcoal font-medium">
                    {t.author}
                  </div>
                  <div className="text-warm-gray text-xs tracking-[0.2em] uppercase font-sans font-light mt-1">
                    {t.event}
                  </div>
                </cite>
              </div>
            ))}
          </div>

          {/* Navigation dots */}
          <div className="flex items-center justify-center gap-3 mt-16">
            {testimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`transition-all duration-500 ${
                  i === current
                    ? "w-8 h-1 bg-sage"
                    : "w-4 h-1 bg-sage/20 hover:bg-sage/40"
                }`}
                aria-label={`Go to testimonial ${i + 1}`}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
