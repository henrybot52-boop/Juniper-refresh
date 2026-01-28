"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const values = [
  {
    number: "01",
    title: "Sourced with Intention",
    text: "We partner with local farms and specialty growers to source blooms you won't find at ordinary florists — ranunculus, garden roses, hellebores, and rare seasonal varieties.",
  },
  {
    number: "02",
    title: "Designed, Not Arranged",
    text: "Every piece is an original composition. We approach florals as a design discipline, considering architecture, negative space, and the interplay of organic forms.",
  },
  {
    number: "03",
    title: "Sustainably Crafted",
    text: "From compostable packaging to zero-waste studio practices, sustainability guides every decision we make — from farm to vase.",
  },
];

export default function Philosophy() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  const imgRef = useRef(null);
  const isImgInView = useInView(imgRef, { once: true, margin: "-100px" });

  return (
    <section id="philosophy" className="py-32 md:py-44 bg-warm-white">
      <div className="max-w-[1400px] mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          {/* Image side */}
          <motion.div
            ref={imgRef}
            initial={{ opacity: 0, x: -40 }}
            animate={isImgInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            <div className="aspect-[3/4] relative overflow-hidden">
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{
                  backgroundImage:
                    "url('https://images.unsplash.com/photo-1508610048659-a06b669e3321?w=800&q=80')",
                }}
              />
            </div>
            {/* Accent frame */}
            <div className="absolute -bottom-6 -right-6 w-full h-full border border-sage/20 -z-10" />
            {/* Small accent image */}
            <div className="absolute -bottom-10 -right-10 w-40 h-52 overflow-hidden shadow-2xl hidden lg:block">
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{
                  backgroundImage:
                    "url('https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=400&q=80')",
                }}
              />
            </div>
          </motion.div>

          {/* Content side */}
          <div ref={ref}>
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="text-[11px] tracking-[0.5em] uppercase text-sage font-sans font-light">
                Our Philosophy
              </span>
              <h2 className="font-serif text-display text-charcoal font-light mt-6 mb-8">
                Not Your Average
                <br />
                <em className="italic">Flower Shop</em>
              </h2>
              <p className="text-warm-gray font-sans font-light text-base leading-relaxed mb-14 max-w-lg">
                At Juniper, we believe flowers are an art form. We reject the
                ordinary in favor of the exceptional — curating each
                arrangement with the same care a gallery applies to its
                collection.
              </p>
            </motion.div>

            {/* Values */}
            <div className="space-y-10">
              {values.map((v, i) => (
                <motion.div
                  key={v.number}
                  initial={{ opacity: 0, y: 30 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{
                    duration: 0.8,
                    delay: 0.2 + i * 0.15,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="flex gap-6"
                >
                  <span className="text-sage font-serif text-2xl font-light mt-0.5">
                    {v.number}
                  </span>
                  <div>
                    <h3 className="font-serif text-xl text-charcoal font-medium mb-2">
                      {v.title}
                    </h3>
                    <p className="text-warm-gray font-sans font-light text-sm leading-relaxed max-w-md">
                      {v.text}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
