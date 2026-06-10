import Preloader from "@/components/Preloader";
import SmoothScroll from "@/components/SmoothScroll";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import Collections from "@/components/Collections";
import Philosophy from "@/components/Philosophy";
import Gallery from "@/components/Gallery";
import Process from "@/components/Process";
import Weddings from "@/components/Weddings";
import Testimonials from "@/components/Testimonials";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <SmoothScroll>
      <Preloader />
      <Header />
      <main>
        <Hero />
        <Marquee />
        <Collections />
        <Philosophy />
        <Gallery />
        <Process />
        <Weddings />
        <Testimonials />
        <Contact />
      </main>
      <Footer />
    </SmoothScroll>
  );
}
