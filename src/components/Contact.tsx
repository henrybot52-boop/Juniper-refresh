"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

export default function Contact() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="contact" className="py-32 md:py-44 bg-warm-white">
      <div
        ref={ref}
        className="max-w-[1400px] mx-auto px-6 md:px-12"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24">
          {/* Left: Info */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-[11px] tracking-[0.5em] uppercase text-sage font-sans font-light">
              Get in Touch
            </span>
            <h2 className="font-serif text-display text-charcoal font-light mt-6 mb-8">
              Let&apos;s Create
              <br />
              <em className="italic">Together</em>
            </h2>
            <p className="text-warm-gray font-sans font-light text-base leading-relaxed mb-14 max-w-md">
              Whether you&apos;re planning a wedding, searching for the perfect
              gift, or looking to elevate your space, we&apos;d love to hear
              from you.
            </p>

            {/* Details */}
            <div className="space-y-8">
              <div>
                <h4 className="text-[10px] tracking-[0.4em] uppercase text-sage font-sans mb-3">
                  Visit Our Studio
                </h4>
                <p className="font-sans font-light text-charcoal text-sm leading-relaxed">
                  227 James Street North
                  <br />
                  Hamilton, ON L8R 2L2
                </p>
              </div>
              <div>
                <h4 className="text-[10px] tracking-[0.4em] uppercase text-sage font-sans mb-3">
                  Hours
                </h4>
                <p className="font-sans font-light text-charcoal text-sm leading-relaxed">
                  Tuesday — Saturday: 10am — 6pm
                  <br />
                  Sunday & Monday: By Appointment
                </p>
              </div>
              <div>
                <h4 className="text-[10px] tracking-[0.4em] uppercase text-sage font-sans mb-3">
                  Contact
                </h4>
                <p className="font-sans font-light text-charcoal text-sm leading-relaxed">
                  hello@juniperfloralstudio.com
                  <br />
                  (905) 523-7890
                </p>
              </div>
            </div>
          </motion.div>

          {/* Right: Form */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[10px] tracking-[0.3em] uppercase text-warm-gray font-sans mb-3">
                    First Name
                  </label>
                  <input
                    type="text"
                    className="w-full bg-transparent border-b border-light-gray py-3 text-charcoal font-sans font-light text-sm focus:outline-none focus:border-sage transition-colors duration-300 placeholder:text-taupe/50"
                    placeholder="Jane"
                  />
                </div>
                <div>
                  <label className="block text-[10px] tracking-[0.3em] uppercase text-warm-gray font-sans mb-3">
                    Last Name
                  </label>
                  <input
                    type="text"
                    className="w-full bg-transparent border-b border-light-gray py-3 text-charcoal font-sans font-light text-sm focus:outline-none focus:border-sage transition-colors duration-300 placeholder:text-taupe/50"
                    placeholder="Smith"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] tracking-[0.3em] uppercase text-warm-gray font-sans mb-3">
                  Email
                </label>
                <input
                  type="email"
                  className="w-full bg-transparent border-b border-light-gray py-3 text-charcoal font-sans font-light text-sm focus:outline-none focus:border-sage transition-colors duration-300 placeholder:text-taupe/50"
                  placeholder="jane@example.com"
                />
              </div>

              <div>
                <label className="block text-[10px] tracking-[0.3em] uppercase text-warm-gray font-sans mb-3">
                  Occasion
                </label>
                <select className="w-full bg-transparent border-b border-light-gray py-3 text-charcoal font-sans font-light text-sm focus:outline-none focus:border-sage transition-colors duration-300 appearance-none cursor-pointer">
                  <option value="">Select an occasion</option>
                  <option value="wedding">Wedding</option>
                  <option value="event">Event</option>
                  <option value="sympathy">Sympathy</option>
                  <option value="gift">Gift</option>
                  <option value="subscription">Weekly Subscription</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] tracking-[0.3em] uppercase text-warm-gray font-sans mb-3">
                  Tell Us More
                </label>
                <textarea
                  rows={4}
                  className="w-full bg-transparent border-b border-light-gray py-3 text-charcoal font-sans font-light text-sm focus:outline-none focus:border-sage transition-colors duration-300 resize-none placeholder:text-taupe/50"
                  placeholder="Share your vision, event date, or any details..."
                />
              </div>

              <button
                type="submit"
                className="mt-4 px-10 py-4 bg-charcoal text-cream text-xs tracking-[0.25em] uppercase font-sans font-light hover:bg-sage transition-colors duration-700 w-full sm:w-auto"
              >
                Send Inquiry
              </button>
            </form>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
