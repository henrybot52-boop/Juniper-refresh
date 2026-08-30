"use client";

import { useRef, ReactNode } from "react";
import { motion, useInView } from "framer-motion";

/* Reveals each line of serif display text from behind a mask —
   the signature editorial entrance used across section headings. */
export default function TextReveal({
  lines,
  className = "",
  delay = 0,
  as: Tag = "h2",
}: {
  lines: ReactNode[];
  className?: string;
  delay?: number;
  as?: "h1" | "h2" | "h3";
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <Tag ref={ref} className={className}>
      {lines.map((line, i) => (
        <span key={i} className="block overflow-hidden">
          <motion.span
            className="block"
            initial={{ y: "110%" }}
            animate={isInView ? { y: 0 } : {}}
            transition={{
              duration: 1.1,
              delay: delay + i * 0.12,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}
