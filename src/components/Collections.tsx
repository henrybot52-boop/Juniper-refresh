"use client";

import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";

const collections = [
  {
    title: "Weddings",
    subtitle: "Bespoke bridal florals",
    description:
      "From intimate elopements to grand celebrations, we design floral narratives that reflect your unique love story.",
    image:
      "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=800&q=80",
    span: "md:col-span-2 md:row-span-2",
    aspect: "aspect-[4/5]",
  },
  {
    title: "Sympathy",
    subtitle: "Thoughtful tributes",
    description: "Elegant arrangements honoring life's most tender moments.",
    image:
      "https://images.unsplash.com/photo-1471696035578-3d8c78d99571?w=600&q=80",
    span: "",
    aspect: "aspect-[3/4]",
  },
  {
    title: "Events",
    subtitle: "Curated installations",
    description:
      "Transformative botanical experiences for corporate events and private gatherings.",
    image:
      "https://images.unsplash.com/photo-1464699908537-0954e50791ee?w=600&q=80",
    span: "",
    aspect: "aspect-[3/4]",
  },
  {
    title: "Everyday Luxury",
    subtitle: "Weekly subscriptions",
    description:
      "Rotating seasonal arrangements delivered to your home or office.",
    image:
      "https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=600&q=80",
    span: "md:col-span-2",
    aspect: "aspect-[16/9]",
  },
];

function CollectionCard({
  item,
  index,
}: {
  item: (typeof collections)[0];
  index: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 60 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{
        duration: 0.9,
        delay: index * 0.15,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={`group relative ${item.span}`}
    >
      <div className={`img-zoom relative ${item.aspect} w-full`}>
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-[1.5s] group-hover:scale-105"
          style={{ backgroundImage: `url('${item.image}')` }}
        />
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal/70 via-charcoal/10 to-transparent opacity-80 group-hover:opacity-90 transition-opacity duration-700" />

        {/* Content */}
        <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-10">
          <span className="text-[10px] tracking-[0.4em] uppercase text-white/60 font-sans mb-2">
            {item.subtitle}
          </span>
          <h3 className="font-serif text-heading text-white font-light mb-3">
            {item.title}
          </h3>
          <p className="text-white/70 text-sm font-sans font-light max-w-md leading-relaxed opacity-0 group-hover:opacity-100 transform translate-y-4 group-hover:translate-y-0 transition-all duration-700">
            {item.description}
          </p>
          <div className="mt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-700 delay-100">
            <span className="text-[11px] tracking-[0.3em] uppercase text-white/80 font-sans font-light border-b border-white/30 pb-1">
              Discover
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function Collections() {
  const headerRef = useRef(null);
  const isHeaderInView = useInView(headerRef, { once: true, margin: "-100px" });

  return (
    <section id="collections" className="py-32 md:py-44 bg-cream">
      <div className="max-w-[1400px] mx-auto px-6 md:px-12">
        {/* Section header */}
        <motion.div
          ref={headerRef}
          initial={{ opacity: 0, y: 40 }}
          animate={isHeaderInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-20 md:mb-28"
        >
          <span className="text-[11px] tracking-[0.5em] uppercase text-sage font-sans font-light">
            Our Work
          </span>
          <h2 className="font-serif text-display text-charcoal font-light mt-6 mb-6">
            Curated Collections
          </h2>
          <div className="styled-hr" />
          <p className="mt-8 text-warm-gray font-sans font-light text-base max-w-lg mx-auto leading-relaxed">
            Each arrangement is a considered composition of texture, color, and
            movement — designed to evoke emotion and elevate any space.
          </p>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
          {collections.map((item, i) => (
            <CollectionCard key={item.title} item={item} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
