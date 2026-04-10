import { useAuth } from "../context/AuthContext";
import { motion, useScroll, useTransform, useReducedMotion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Vote, Shield, BarChart3, School, Zap,
  CheckCircle2, Lock, Smartphone,
  Eye, Fingerprint, Scale, BadgeCheck, FileCheck2, Ticket, Calendar, MapPin, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import heroBallot from "@/assets/hero-ballot.jpg";
import carousel2 from "@/assets/carousel-2.jpg";
import carousel3 from "@/assets/carousel-3.jpg";
import carousel4 from "@/assets/carousel-4.jpg";
import { useRef, useState, useEffect, useCallback } from "react";

const API    = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";
const NAVY   = "#002856";
const ORANGE = "#e87200";

const features = [
  { icon: Vote,        title: "Secure Ballot Casting",  desc: "Cast your vote with confidence using our encrypted digital ballot system" },
  { icon: Shield,      title: "Tamper-Proof Results",   desc: "Every vote is verified and protected against fraud or manipulation" },
  { icon: BarChart3,   title: "Live Vote Counting",     desc: "Watch election results update in real-time as votes are tallied" },
  { icon: Fingerprint, title: "Voter Authentication",   desc: "Multi-factor verification ensures one person, one vote integrity" },
  { icon: School,      title: "Vote From Anywhere",     desc: "Participate in elections from any location, on any device" },
  { icon: Smartphone,  title: "SMS & USSD Voting",      desc: "Inclusive voting access from any phone — smart or feature" },
];

const steps = [
  { icon: FileCheck2, title: "Register to Vote",  desc: "Create your voter profile and verify your identity securely" },
  { icon: Eye,        title: "Review Candidates", desc: "Explore candidate profiles, manifestos, and track records" },
  { icon: Vote,       title: "Cast Your Ballot",  desc: "Vote securely with encrypted end-to-end digital ballots" },
  { icon: BarChart3,  title: "See Results Live",  desc: "Watch real-time results as every vote gets counted transparently" },
];

const stats = [
  { value: "12K+",  label: "Votes Cast",     icon: Vote },
  { value: "70+",   label: "Elections Run",  icon: Scale },
  { value: "99.9%", label: "Uptime",         icon: Zap },
  { value: "20+",   label: "Organizations",  icon: School },
];

const principles = [
  { icon: Scale,      title: "FAIR & TRANSPARENT", desc: "Every election follows strict democratic principles with full audit trails" },
  { icon: Lock,       title: "PRIVACY FIRST",      desc: "Your vote is your voice — anonymous, encrypted, and protected" },
  { icon: BadgeCheck, title: "VERIFIED RESULTS",   desc: "Independent verification ensures election outcomes you can trust" },
];

const carouselSlides = [
  { src: heroBallot },
  { src: carousel2 },
  { src: carousel3 },
  { src: carousel4 },
];

// ── Tickets Section ───────────────────────────────────────────────────────────
const TicketsSection = () => {
  const [ticketEvents, setTicketEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/tickets/`)
      .then(r => r.json())
      .then(data => { setTicketEvents((data || []).slice(0, 4)); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const getMinPrice = (tiers: any[]) => {
    if (!tiers?.length) return null;
    const active = tiers.filter(t => !t.is_sold_out);
    if (!active.length) return "Sold Out";
    return `GHS ${Math.min(...active.map((t: any) => t.price))}`;
  };

  const formatDate = (d: string) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <section className="py-20" style={{ background: '#f2f2f2' }}>
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-16 items-start">

          {/* Left — text */}
          <motion.div initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
            <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 'clamp(2rem, 5vw, 3.5rem)', lineHeight: 1.05, color: '#111', marginBottom: '0.2em' }}>
              Live Events
            </h2>
            <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)', lineHeight: 1.05, color: ORANGE, marginBottom: '1.2rem' }}>
              Be There
            </h2>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 400, color: '#444', lineHeight: 1.8, marginBottom: '1.8rem', fontSize: '1rem' }}>
              From sold-out concerts to exclusive award nights — secure your spot before it's gone.
              Instant coded tickets delivered to your inbox, accepted at the gate in seconds.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', marginBottom: '2rem' }}>
              {["Instant digital tickets with unique code", "Secure payment via Mobile Money & Card", "Entry verification at the door"].map((perk) => (
                <div key={perk} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <CheckCircle2 style={{ width: 20, height: 20, color: ORANGE, flexShrink: 0 }} />
                  <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600, color: '#222', fontSize: '0.9rem' }}>{perk}</span>
                </div>
              ))}
            </div>
            <Link to="/tickets">
              <button style={{
                background: ORANGE, color: 'white', border: 'none', cursor: 'pointer',
                padding: '1rem 2rem', fontFamily: "'Montserrat', sans-serif",
                fontWeight: 900, fontSize: '1rem', letterSpacing: '0.06em',
                textTransform: 'uppercase', borderRadius: '4px', transition: 'all 0.2s',
              }}
                onMouseEnter={e => { (e.target as HTMLElement).style.background = '#d06800'; }}
                onMouseLeave={e => { (e.target as HTMLElement).style.background = ORANGE; }}
              >
                GET YOUR TICKETS
              </button>
            </Link>
          </motion.div>

          {/* Right — ticket event cards */}
          <motion.div className="grid grid-cols-2 gap-4" initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
            {loading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="rounded-xl overflow-hidden animate-pulse border border-border/30">
                  <div className="h-32 bg-muted" />
                  <div className="p-3 space-y-2"><div className="h-3 bg-muted rounded w-3/4" /><div className="h-2 bg-muted rounded w-1/2" /></div>
                </div>
              ))
            ) : ticketEvents.length === 0 ? (
              <div className="col-span-2 text-center py-12 text-muted-foreground">
                <Ticket className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm" style={{ fontFamily: "'Montserrat', sans-serif" }}>No ticket events yet.</p>
                <Link to="/tickets" className="text-sm font-bold mt-2 inline-block" style={{ color: ORANGE }}>Browse all events →</Link>
              </div>
            ) : (
              ticketEvents.map((ev: any) => {
                const minPrice = getMinPrice(ev.tiers);
                const allSoldOut = ev.tiers?.every((t: any) => t.is_sold_out);
                return (
                  <motion.div key={ev.id} whileHover={{ y: -4 }} transition={{ duration: 0.2 }}>
                    <Link to={`/tickets/${ev.slug}`} className="block group">
                      <div className="rounded-xl overflow-hidden border border-border/30 hover:shadow-lg transition-all duration-300 bg-white">
                        <div className="relative h-32 overflow-hidden bg-muted">
                          {ev.banner ? (
                            <img src={ev.banner} alt={ev.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${NAVY}15, ${ORANGE}15)` }}>
                              <Ticket className="w-10 h-10 opacity-20" style={{ color: NAVY }} />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                          <div className="absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-bold text-white" style={{ background: allSoldOut ? '#dc2626' : NAVY }}>
                            {allSoldOut ? "Sold Out" : minPrice}
                          </div>
                        </div>
                        <div className="p-3">
                          <h4 className="font-bold text-sm mb-1 truncate" style={{ color: NAVY, fontFamily: "'Montserrat', sans-serif" }}>{ev.title}</h4>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" style={{ color: ORANGE }} />{formatDate(ev.event_date)}
                          </div>
                          {ev.venue && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                              <MapPin className="w-3 h-3" style={{ color: ORANGE }} /><span className="truncate">{ev.venue}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const Index = () => {
  const { isAuthenticated, isAdmin } = useAuth();
  const shouldReduceMotion = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY       = useTransform(scrollYProgress, [0, 1], [0, shouldReduceMotion ? 0 : 100]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  const [currentSlide, setCurrentSlide] = useState(0);
  const nextSlide = useCallback(() => setCurrentSlide(p => (p + 1) % carouselSlides.length), []);
  useEffect(() => { const t = setInterval(nextSlide, 5000); return () => clearInterval(t); }, [nextSlide]);

  return (
    <div className="min-h-screen bg-white overflow-hidden">
      <Navbar />

     {/* ═══ HERO ═══ */}
<section ref={heroRef} className="relative h-screen min-h-[600px] flex items-center overflow-hidden">

  <AnimatePresence mode="wait">
    <motion.div
      key={currentSlide}
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.2, ease: "easeInOut" }}
      style={{ position: 'absolute', inset: 0, zIndex: 0 }}
    >
      <img
        src={carouselSlides[currentSlide].src}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          filter: 'brightness(0.7) blur(1px)'
        }}
      />
    </motion.div>
  </AnimatePresence>

  {/* Overlay */}
  <div
    style={{
      position: 'absolute',
      inset: 0,
      zIndex: 1,
      background: `rgba(0,40,86,0.55)`
    }}
  />

  <motion.div
    className="container mx-auto px-4 relative text-center"
    style={{ zIndex: 2, y: heroY, opacity: heroOpacity, paddingTop: '2rem' }}
  >
    <motion.h1
      initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1 }}
      style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', lineHeight: 1.05, color: 'white', marginBottom: '0.2em' }}
    >
      Your Vote
    </motion.h1>

    <motion.h1
      initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2 }}
      style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', lineHeight: 1.05, color: 'white', marginBottom: '0.8rem' }}
    >
      Matters
    </motion.h1>

    <motion.p
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.35 }}
      style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 400, color: 'rgba(255,255,255,0.9)', fontSize: 'clamp(0.85rem, 1.8vw, 1rem)', lineHeight: 1.6, maxWidth: '560px', margin: '0 auto 1.8rem' }}
    >
      The trusted platform for secure, transparent, and accessible digital voting and ticketing.<br />
      From corporate elections and student councils to award events, every vote counts
    </motion.p>

    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.45 }}
      style={{ display: 'flex', gap: '0.8rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1rem' }}
    >
      <Link to="/events">
        <motion.button
          whileHover={{ scale: 1.06, y: -3, boxShadow: "0 12px 30px rgba(232,114,0,0.45)" }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300 }}
          style={{ background: ORANGE, color: 'white', border: 'none', padding: '0.75rem 2rem', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '0.95rem', borderRadius: '6px', cursor: 'pointer', boxShadow: '0 8px 20px rgba(232,114,0,0.25)' }}
        >
          Vote Now
        </motion.button>
      </Link>

      <Link to="/tickets">
        <motion.button
          whileHover={{ scale: 1.06, y: -3, boxShadow: "0 12px 30px rgba(232,114,0,0.45)" }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300 }}
          style={{ background: ORANGE, color: 'white', border: 'none', padding: '0.75rem 2rem', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '0.95rem', borderRadius: '6px', cursor: 'pointer', boxShadow: '0 8px 20px rgba(232,114,0,0.25)' }}
        >
          Get Tickets
        </motion.button>
      </Link>
    </motion.div>

    <motion.p
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
      style={{ color: 'rgba(255,255,255,0.85)', fontFamily: "'Montserrat', sans-serif", fontWeight: 600, fontSize: '0.95rem', marginTop: '2.2rem', letterSpacing: '0.03em' }}
    >
      Vote with confidence
    </motion.p>

    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
      style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '2rem' }}
    >
      {carouselSlides.map((_, i) => (
        <button
          key={i}
          onClick={() => setCurrentSlide(i)}
          style={{ height: '4px', width: i === currentSlide ? '32px' : '8px', borderRadius: '2px', background: i === currentSlide ? ORANGE : 'rgba(255,255,255,0.4)', border: 'none', cursor: 'pointer', transition: 'all 0.4s' }}
        />
      ))}
    </motion.div>
  </motion.div>
</section>

      {/* ═══ STATS ═══ */}
      <section style={{ background: 'white', padding: '5rem 0' }}>
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, i) => (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                whileHover={{ y: -8, boxShadow: '0 20px 40px rgba(0,40,86,0.4)', scale: 1.02 }}
                style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #003d7a 100%)`, borderRadius: '8px', padding: '2rem 1.5rem', textAlign: 'center', cursor: 'default', transition: 'all 0.3s' }}>
                <div style={{ width: 48, height: 48, background: ORANGE, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                  <stat.icon style={{ width: 24, height: 24, color: 'white' }} />
                </div>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 'clamp(2rem, 4vw, 3rem)', color: 'white', lineHeight: 1, marginBottom: '0.4rem' }}>
                  {stat.value}
                </div>
                <div style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500, fontSize: '0.8rem', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ TICKETS ═══ */}
      <TicketsSection />

      {/* ═══ PRINCIPLES (Democracy Reimagined) ═══ */}
      <section style={{ background: 'white', padding: '5rem 0' }}>
        <div className="container mx-auto px-4">
          <motion.div className="text-center" style={{ marginBottom: '3rem' }} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.15em', color: ORANGE, textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              OUR PRINCIPLES
            </p>
            <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: '#111', textTransform: 'uppercase', lineHeight: 1.1 }}>
              DEMOCRACY <span style={{ color: ORANGE }}>REIMAGINED</span>
            </h2>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 400, color: '#666', marginTop: '0.75rem', fontSize: '0.95rem' }}>
              Built on the pillars of fairness, transparency, and trust
            </p>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-6">
            {principles.map((item, i) => (
              <motion.div key={item.title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }}
                whileHover={{ y: -6, boxShadow: '0 16px 40px rgba(0,40,86,0.15)' }}
                style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '2.5rem 2rem', textAlign: 'center', background: 'white', transition: 'all 0.3s', cursor: 'default' }}>
                <motion.div whileHover={{ rotate: 8, scale: 1.1 }} transition={{ type: "spring", stiffness: 300 }}
                  style={{ width: 64, height: 64, background: `linear-gradient(135deg, ${NAVY}, #003d7a)`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                  <item.icon style={{ width: 28, height: 28, color: 'white' }} />
                </motion.div>
                <h3 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '1rem', color: NAVY, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                  {item.title}
                </h3>
                <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 400, fontSize: '0.875rem', color: '#555', lineHeight: 1.7 }}>
                  {item.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section style={{ background: '#f2f2f2', padding: '5rem 0' }}>
        <div className="container mx-auto px-4">
          <motion.div className="text-center" style={{ marginBottom: '3rem' }} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.15em', color: ORANGE, textTransform: 'uppercase', marginBottom: '0.75rem' }}>
              FEATURES
            </p>
            <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 'clamp(2rem, 5vw, 3.5rem)', textTransform: 'uppercase', lineHeight: 1.1 }}>
              <span style={{ color: '#111' }}>VOTING MADE </span><span style={{ color: ORANGE }}>POWERFUL</span>
            </h2>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 400, color: '#666', marginTop: '0.75rem', fontSize: '0.95rem' }}>
              Everything you need to run fair, transparent, and accessible elections
            </p>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
                whileHover={{ y: -6, boxShadow: '0 16px 40px rgba(0,40,86,0.12)' }}
                style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '2rem', background: 'white', transition: 'all 0.3s' }}>
                <motion.div whileHover={{ rotate: 8, scale: 1.1 }} transition={{ type: "spring", stiffness: 300 }}
                  style={{ width: 56, height: 56, background: `linear-gradient(135deg, ${NAVY}, #003d7a)`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
                  <f.icon style={{ width: 24, height: 24, color: 'white' }} />
                </motion.div>
                <h3 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '1rem', color: '#111', marginBottom: '0.5rem' }}>
                  {f.title}
                </h3>
                <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 400, fontSize: '0.875rem', color: '#666', lineHeight: 1.7 }}>
                  {f.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section id="how-it-works" style={{ background: 'white', padding: '5rem 0' }}>
        <div className="container mx-auto px-4">
          <motion.div className="text-center" style={{ marginBottom: '3rem' }} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 'clamp(1.8rem, 4vw, 3rem)', textTransform: 'uppercase', lineHeight: 1.1 }}>
              <span style={{ color: '#111' }}>VOTE IN 4 </span><span style={{ color: ORANGE }}>EASY STEPS</span>
            </h2>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 400, color: '#666', marginTop: '0.75rem', fontSize: '0.95rem' }}>
              From registration to results — it's that simple.
            </p>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, i) => (
              <motion.div key={step.title} className="relative text-center" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.12 }}>
                <div style={{ position: 'relative', display: 'inline-flex', marginBottom: '1.25rem' }}>
                  <motion.div whileHover={{ rotate: -8, scale: 1.08 }} transition={{ type: "spring", stiffness: 300 }}
                    style={{ width: 80, height: 80, background: `linear-gradient(135deg, ${NAVY}, #003d7a)`, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(0,40,86,0.25)' }}>
                    <step.icon style={{ width: 36, height: 36, color: 'white' }} />
                  </motion.div>
                  <motion.span initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.1, type: "spring", stiffness: 500 }}
                    style={{ position: 'absolute', top: -8, right: -8, width: 28, height: 28, background: ORANGE, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color: 'white', fontFamily: "'Montserrat', sans-serif" }}>
                    {i + 1}
                  </motion.span>
                </div>
                <h3 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 800, fontSize: '0.95rem', color: NAVY, marginBottom: '0.5rem' }}>
                  {step.title}
                </h3>
                <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 400, fontSize: '0.825rem', color: '#666', lineHeight: 1.7 }}>
                  {step.desc}
                </p>
                {i < 3 && (
                  <div className="hidden lg:block" style={{ position: 'absolute', top: 40, left: 'calc(100% - 16px)', width: 'calc(100% - 48px)' }}>
                    <div style={{ borderTop: `2px dashed rgba(232,114,0,0.4)`, width: '100%' }} />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SECURITY ═══ */}
      <section style={{ padding: '4rem 1.5rem' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            style={{
              /* gradient: deep navy left → lighter blue right */
              background: `linear-gradient(120deg, #002856 0%, #003d7a 55%, #1565c0 100%)`,
              borderRadius: '16px', padding: 'clamp(2rem, 5vw, 4rem)',
              display: 'grid', gridTemplateColumns: '1fr auto',
              gap: '3rem', alignItems: 'center', overflow: 'hidden', position: 'relative'
            }}>

            <div>
              <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.15em', color: ORANGE, textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                Election Security
              </p>
              <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: 'white', textTransform: 'uppercase', lineHeight: 1.1, marginBottom: '1.25rem' }}>
                EVERY VOTE IS PROTECTED
              </h2>
              <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 400, color: 'rgba(255,255,255,0.75)', lineHeight: 1.8, marginBottom: '1.75rem', fontSize: '0.95rem', maxWidth: '520px' }}>
                Our military-grade encryption ensures your ballot remains anonymous and tamper-proof. Trust the process, trust the results.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {["End-to-end ballot encryption", "Real-time fraud detection & prevention", "Multi-factor voter authentication", "Complete audit trail for every election"].map((item) => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <CheckCircle2 style={{ width: 18, height: 18, color: ORANGE, flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500, fontSize: '0.875rem', color: 'rgba(255,255,255,0.85)' }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="hidden md:flex" style={{ alignItems: 'center', justifyContent: 'center' }}>
              <motion.div animate={shouldReduceMotion ? {} : { scale: [1, 1.06, 1] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                style={{ width: 220, height: 220, background: ORANGE, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <motion.div animate={shouldReduceMotion ? {} : { y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
                  <Lock style={{ width: 90, height: 90, color: 'white' }} />
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section style={{
        /* gradient: deep navy left → lighter blue right */
        background: `linear-gradient(120deg, #002856 0%, #003d7a 55%, #1565c0 100%)`,
        padding: '5rem 0'
      }}>
        <div className="container mx-auto px-4 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <h2 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: 'white', textTransform: 'uppercase', lineHeight: 1.1, marginBottom: '1rem' }}>
              MAKE YOUR VOICE<br /><span style={{ color: ORANGE }}>HEARD TODAY</span>
            </h2>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 400, color: 'rgba(255,255,255,0.65)', fontSize: '0.95rem', maxWidth: '480px', margin: '0 auto 2.5rem', lineHeight: 1.7 }}>
              Join thousands of voters using CelerVote — the most secure and transparent digital voting platform.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to={isAuthenticated ? "/events" : "/auth"}>
                <button style={{ background: ORANGE, color: 'white', border: `2px solid ${ORANGE}`, padding: '0.9rem 2.5rem', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '1rem', borderRadius: '4px', cursor: 'pointer', letterSpacing: '0.03em' }}>
                  {isAuthenticated ? "Browse Elections" : "Start Voting"} →
                </button>
              </Link>
              <Link to="/events">
                <button style={{ background: 'transparent', color: 'white', border: '2px solid rgba(255,255,255,0.4)', padding: '0.9rem 2.5rem', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '1rem', borderRadius: '4px', cursor: 'pointer', letterSpacing: '0.03em' }}>
                  View Elections
                </button>
              </Link>
              {isAdmin && (
                <Link to="/admin">
                  <button style={{ background: 'transparent', color: 'white', border: '2px solid rgba(255,255,255,0.4)', padding: '0.9rem 2.5rem', fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: '1rem', borderRadius: '4px', cursor: 'pointer', letterSpacing: '0.03em' }}>
                    Dashboard
                  </button>
                </Link>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
