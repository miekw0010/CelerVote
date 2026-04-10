import { motion } from "framer-motion";
import {
  Vote, Palette, Ticket, BarChart3,
  MessageCircle, Mail, CheckCircle2,
  Shield, Zap, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

const NAVY   = "#002856";
const ORANGE = "#e87200";
const WHATSAPP = "+233592377833";
const EMAIL    = "celervote@gmail.com";

const whatsappUrl = (msg: string) =>
  `https://wa.me/${WHATSAPP.replace("+", "")}?text=${encodeURIComponent(msg)}`;
const emailUrl = (subject: string) =>
  `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`;

const M = "'Montserrat', sans-serif";

const services = [
  {
    icon: Vote,
    title: "Host an Election or Voting Event",
    desc: "Want to run a student election, awards show, or community poll? We set up everything for you — categories, candidates, voting pages, real-time results, and security. You just share the link.",
    color: "from-secondary to-accent",
    bg: "bg-secondary/5 border-secondary/20",
    perks: ["Custom branded voting page", "Real-time live results dashboard", "Fraud detection & vote security", "Free & paid voting support", "Results export (PDF & CSV)"],
    waMsg: "Hi! I'd like to host a voting/election event on CelerVote. Can you help me set it up?",
    emailSub: "Enquiry: Host a Voting Event on CelerVote",
  },
  {
    icon: Palette,
    title: "Graphic Design — Posters & Flyers",
    desc: "Need eye-catching visuals for your event? We design professional posters, flyers, social media graphics, and banners that get attention and drive engagement.",
    color: "from-pink-500 to-purple-500",
    bg: "bg-pink-500/5 border-pink-500/20",
    perks: ["Event posters & flyers", "Social media graphics", "Voting ballot designs", "Award certificate templates", "Fast turnaround"],
    waMsg: "Hi! I need graphic design services (posters/flyers) for my event. Can you help?",
    emailSub: "Enquiry: Graphic Design Services",
  },
  {
    icon: Ticket,
    title: "Event Ticketing Setup",
    desc: "Sell tickets to your event with ease. We set up your ticketing page with multiple tiers, QR code delivery, mobile money & card payments, and door check-in scanning.",
    color: "from-yellow-500 to-orange-500",
    bg: "bg-yellow-500/5 border-yellow-500/20",
    perks: ["Multiple ticket tiers", "Instant QR code delivery", "Mobile Money & Card payments", "Door check-in scanner", "Sales dashboard & reports"],
    waMsg: "Hi! I'd like to set up ticketing for my event on CelerVote. Can you help?",
    emailSub: "Enquiry: Event Ticketing Setup",
  },
  {
    icon: BarChart3,
    title: "Results & Analytics Reports",
    desc: "Get a detailed breakdown of your voting or event data. We generate professional reports with charts, vote distributions, turnout stats, and winner announcements.",
    color: "from-blue-500 to-cyan-500",
    bg: "bg-blue-500/5 border-blue-500/20",
    perks: ["Detailed vote breakdown charts", "Turnout & participation stats", "Winner announcement graphics", "PDF & CSV export", "Shareable results page"],
    waMsg: "Hi! I'd like a results & analytics report for my event. Can you help?",
    emailSub: "Enquiry: Results & Analytics Report",
  },
];

const fadeUp = {
  hidden:  { opacity: 0, y: 40 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.6, ease: "easeOut" as const } }),
};

export default function ServicesPage() {
  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: M }}>
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative pt-32 pb-16 overflow-hidden" style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #003d7a 60%, #005ab5 100%)` }}>
        <div className="container mx-auto px-4 relative z-10 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <h1 style={{ fontFamily: M, fontWeight: 900, fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', color: 'white', lineHeight: 1.1, marginBottom: '0.5rem' }}>
              What We Can Do
            </h1>
            <h1 style={{ fontFamily: M, fontWeight: 900, fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', color: ORANGE, lineHeight: 1.1, marginBottom: '1.5rem', fontStyle: 'italic' }}>
              For You
            </h1>
            <p style={{ fontFamily: M, fontWeight: 400, color: 'rgba(255,255,255,0.75)', fontSize: '1rem', maxWidth: '540px', margin: '0 auto 2.5rem', lineHeight: 1.8 }}>
              From hosting your election to designing your event visuals — we've got you covered. Reach out and let's make your event a success.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href={whatsappUrl("Hi! I'd like to learn more about your services.")} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="bg-green-500 hover:bg-green-600 text-white gap-2 h-14 px-8 rounded-full text-lg" style={{ fontFamily: M }}>
                  <MessageCircle className="w-5 h-5" /> Chat on WhatsApp
                </Button>
              </a>
              <a href={emailUrl("General Enquiry — CelerVote Services")} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="gap-2 h-14 px-8 rounded-full text-lg bg-white/20 backdrop-blur-sm border border-white/40 text-white hover:bg-white/30" style={{ fontFamily: M }}>
                  <Mail className="w-5 h-5" /> Send an Email
                </Button>
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Services ── */}
      <section className="py-16 pb-24">
        <div className="container mx-auto px-4">
          <div className="space-y-10">
            {services.map((service, i) => (
              <motion.div key={service.title} custom={i} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={fadeUp}>
                <div className={`relative rounded-3xl border p-8 md:p-10 ${service.bg} overflow-hidden`}>
                  <div className="grid md:grid-cols-2 gap-8 items-center relative z-10">
                    {/* Left — info */}
                    <div>
                      <div className="flex items-center gap-4 mb-5">
                        <div
  className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0"
  style={{ backgroundColor: NAVY }}
>
  <service.icon className="w-7 h-7 text-white" />
</div>
                      </div>
                      <h2 className="font-display font-bold text-2xl md:text-3xl mb-3" style={{ fontFamily: M }}>{service.title}</h2>
                      <p className="text-muted-foreground leading-relaxed mb-6" style={{ fontFamily: M }}>{service.desc}</p>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <a href={whatsappUrl(service.waMsg)} target="_blank" rel="noopener noreferrer">
                          <Button className="bg-green-500 hover:bg-green-600 text-white gap-2 rounded-full px-6" style={{ fontFamily: M }}>
                            <MessageCircle className="w-4 h-4" /> WhatsApp Us
                          </Button>
                        </a>
                        <a href={emailUrl(service.emailSub)} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" className="gap-2 rounded-full px-6" style={{ fontFamily: M }}>
                            <Mail className="w-4 h-4" /> Email Us
                          </Button>
                        </a>
                      </div>
                    </div>

                    {/* Right — perks */}
                    <div className="glass-card p-6">
                      <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4" style={{ fontFamily: M, letterSpacing: '0.08em' }}>
                        What's included
                      </p>
                      <ul className="space-y-3">
                        {service.perks.map((perk) => (
                          <li key={perk} className="flex items-center gap-3 text-sm">
                            <div className="w-5 h-5 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0">
                              <CheckCircle2 className="w-3.5 h-3.5 text-secondary" />
                            </div>
                            <span style={{ fontFamily: M }}>{perk}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Us ── */}
      <section className="py-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-muted/30 to-background" />
        <div className="container mx-auto px-4 relative z-10">
          <motion.div className="text-center mb-12" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <h2 className="font-hero text-3xl md:text-4xl mb-3" style={{ fontFamily: M, fontWeight: 900 }}>Why Work With Us?</h2>
            <p className="text-muted-foreground max-w-md mx-auto" style={{ fontFamily: M }}>We're not just a platform — we're a team that cares about your event's success.</p>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Shield,         title: "Trusted & Secure",  desc: "Military-grade encryption on all voting and payment data.",       color: "text-secondary" },
              { icon: Zap,            title: "Fast Turnaround",   desc: "We move quickly so your event setup is ready when you need it.",  color: "text-yellow-400" },
              { icon: Star,           title: "Quality Service",   desc: "Professional results delivered with attention to every detail.",   color: "text-pink-400" },
              { icon: MessageCircle,  title: "Always Available",  desc: "Reach us on WhatsApp any time — we respond fast.",               color: "text-green-400" },
            ].map((item, i) => (
              <motion.div key={item.title} className="vibrant-card text-center" custom={i} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
                <item.icon className={`w-8 h-8 ${item.color} mx-auto mb-3`} />
                <h3 className="font-display font-bold text-base mb-2" style={{ fontFamily: M }}>{item.title}</h3>
                <p className="text-sm text-muted-foreground" style={{ fontFamily: M }}>{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 relative overflow-hidden" style={{background: `linear-gradient(135deg, ${NAVY} 0%, #003d7a 60%, #005ab5 100%)` }}>
        <div className="container mx-auto px-4 relative z-10 text-center">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}>
            <h2 style={{ fontFamily: M, fontWeight: 900, fontSize: 'clamp(1.8rem, 5vw, 3rem)', color: 'white', marginBottom: '1rem' }}>
              Ready to Get Started?<br />
              <span style={{ color: ORANGE, fontStyle: 'italic' }}>Let's Talk.</span>
            </h2>
            <p style={{ fontFamily: M, color: 'rgba(255,255,255,0.65)', marginBottom: '2rem', maxWidth: '400px', margin: '0 auto 2rem' }}>
              Drop us a message on WhatsApp or send an email and we'll get back to you right away.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href={whatsappUrl("Hi! I'd like to discuss a service with you.")} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="bg-green-500 hover:bg-green-600 text-white gap-2 h-14 px-8 rounded-full text-lg" style={{ fontFamily: M }}>
                  <MessageCircle className="w-5 h-5" /> +233 59 237 7833
                </Button>
              </a>
              <a href={emailUrl("Service Enquiry — CelerVote")} target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="gap-2 h-14 px-8 rounded-full text-lg bg-white/20 backdrop-blur-sm border border-white/40 text-white hover:bg-white/30" style={{ fontFamily: M }}>
                  <Mail className="w-5 h-5" /> celervote@gmail.com
                </Button>
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
