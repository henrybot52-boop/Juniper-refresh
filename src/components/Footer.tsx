"use client";

const footerLinks = {
  Studio: ["About", "Our Team", "Careers", "Press"],
  Services: ["Weddings", "Events", "Sympathy", "Subscriptions"],
  Resources: ["Care Guide", "Blog", "FAQ", "Shipping"],
};

export default function Footer() {
  return (
    <footer className="bg-charcoal text-white/70 pt-24 pb-10">
      <div className="max-w-[1400px] mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-20">
          {/* Brand */}
          <div className="md:col-span-4">
            <h3 className="font-serif text-3xl text-white font-light mb-2">
              Juniper
            </h3>
            <span className="text-[10px] tracking-[0.35em] uppercase text-white/40 font-sans font-light">
              Floral Studio
            </span>
            <p className="mt-6 font-sans font-light text-sm leading-relaxed text-white/50 max-w-xs">
              Artisanal floral design for life&apos;s most meaningful moments.
              Hamilton, Ontario.
            </p>

            {/* Social */}
            <div className="flex gap-5 mt-8">
              {["Instagram", "Pinterest", "Facebook"].map((social) => (
                <a
                  key={social}
                  href="#"
                  className="text-xs tracking-[0.2em] uppercase font-sans font-light text-white/40 hover:text-white transition-colors duration-300"
                >
                  {social}
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title} className="md:col-span-2">
              <h4 className="text-[10px] tracking-[0.4em] uppercase text-white/30 font-sans mb-6">
                {title}
              </h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="font-sans font-light text-sm text-white/50 hover:text-white transition-colors duration-300"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Newsletter */}
          <div className="md:col-span-2">
            <h4 className="text-[10px] tracking-[0.4em] uppercase text-white/30 font-sans mb-6">
              Newsletter
            </h4>
            <p className="font-sans font-light text-xs text-white/40 mb-4 leading-relaxed">
              Seasonal inspiration delivered to your inbox.
            </p>
            <div className="flex">
              <input
                type="email"
                placeholder="Email"
                className="flex-1 bg-transparent border-b border-white/20 py-2 text-white/80 font-sans font-light text-sm focus:outline-none focus:border-white/50 transition-colors placeholder:text-white/20"
              />
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs font-sans font-light text-white/30">
            &copy; {new Date().getFullYear()} Juniper Floral Studio. All rights
            reserved.
          </p>
          <div className="flex gap-6">
            {["Privacy Policy", "Terms of Service"].map((link) => (
              <a
                key={link}
                href="#"
                className="text-xs font-sans font-light text-white/30 hover:text-white/60 transition-colors duration-300"
              >
                {link}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
