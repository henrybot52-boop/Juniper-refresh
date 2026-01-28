"use client";

import { motion } from "framer-motion";

const words = [
  "Ranunculus",
  "Garden Roses",
  "Hellebores",
  "Peonies",
  "Sweet Peas",
  "Anemones",
  "Dahlias",
  "Lisianthus",
  "Clematis",
  "Fritillaria",
];

export default function Marquee() {
  return (
    <section className="py-12 md:py-16 bg-sage overflow-hidden">
      <motion.div
        animate={{ x: [0, -1920] }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        className="flex items-center whitespace-nowrap"
      >
        {[...words, ...words, ...words].map((word, i) => (
          <span key={i} className="flex items-center">
            <span className="font-serif text-2xl md:text-3xl text-white/90 font-light italic mx-8">
              {word}
            </span>
            <span className="text-white/30 text-sm">&#9679;</span>
          </span>
        ))}
      </motion.div>
    </section>
  );
}
