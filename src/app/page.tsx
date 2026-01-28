import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import Collections from "@/components/Collections";
import Philosophy from "@/components/Philosophy";
import Weddings from "@/components/Weddings";
import Testimonials from "@/components/Testimonials";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Marquee />
        <Collections />
        <Philosophy />
        <Weddings />
        <Testimonials />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
