"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

const images = [
  {
    src: "https://images.unsplash.com/photo-1469259943454-aa100abba749?w=900&q=80",
    caption: "Spring ranunculus study",
  },
  {
    src: "https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=900&q=80",
    caption: "Garden rose composition",
  },
  {
    src: "https://images.unsplash.com/photo-1508610048659-a06b669e3321?w=900&q=80",
    caption: "Studio still life",
  },
  {
    src: "https://images.unsplash.com/photo-1519378058457-4c29a0a2efac?w=900&q=80",
    caption: "Autumn dahlia harvest",
  },
  {
    src: "https://images.unsplash.com/photo-1457089328109-e5d9bd499191?w=900&q=80",
    caption: "Wild meadow gathering",
  },
  {
    src: "https://images.unsplash.com/photo-1487070183336-b863922373d4?w=900&q=80",
    caption: "Peony season",
  },
];

/* Vertical scroll drives a horizontal track — the section is tall,
   the viewport-pinned track slides sideways as you move through it. */
export default function Gallery() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const x = useTransform(scrollYProgress, [0, 1], ["2%", "-62%"]);

  return (
    <section ref={ref} id="gallery" className="relative h-[300vh] bg-charcoal">
      <div className="sticky top-0 h-screen flex flex-col justify-center overflow-hidden">
        <div className="max-w-[1400px] w-full mx-auto px-6 md:px-12 mb-12">
          <span className="text-[11px] tracking-[0.5em] uppercase text-gold font-sans font-light">
            The Studio Journal
          </span>
          <h2 className="font-serif text-display text-cream font-light mt-4">
            Recent Work
          </h2>
        </div>

        <motion.div style={{ x }} className="flex gap-6 md:gap-10 pl-6 md:pl-12">
          {images.map((img, i) => (
            <figure key={i} className="group relative shrink-0 w-[70vw] sm:w-[45vw] md:w-[32vw]">
              <div className="img-zoom aspect-[3/4] overflow-hidden">
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-[1.5s] group-hover:scale-105"
                  style={{ backgroundImage: `url('${img.src}')` }}
                />
                <div className="absolute inset-0 bg-charcoal/20 group-hover:bg-charcoal/0 transition-colors duration-700" />
              </div>
              <figcaption className="mt-4 flex items-baseline justify-between">
                <span className="font-serif text-lg text-cream/80 font-light italic">
                  {img.caption}
                </span>
                <span className="text-[10px] tracking-[0.3em] text-cream/30 font-sans">
                  {String(i + 1).padStart(2, "0")} / {String(images.length).padStart(2, "0")}
                </span>
              </figcaption>
            </figure>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
