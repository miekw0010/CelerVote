import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Calendar, MapPin, Ticket, ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";


interface TicketTier {
  id: string;
  name: string;
  price: number;
  quantity: number;
  tickets_remaining: number;
  is_sold_out: boolean;
  color: string;
  perks: string[];
}

interface TicketEvent {
  id: string;
  title: string;
  slug: string;
  description: string;
  venue: string;
  event_date: string;
  banner: string | null;
  tiers: TicketTier[];
  total_tickets_sold: number;
}

const fadeUp = {
  hidden:  { opacity: 0, y: 30 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5 } }),
};

export default function TicketsPage() {
  const [events, setEvents]   = useState<TicketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");

  useEffect(() => {
    fetch(`${API}/tickets/`)
      .then(r => r.json())
      .then(data => { setEvents(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = events.filter(e =>
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.venue.toLowerCase().includes(search.toLowerCase())
  );

  const getMinPrice = (tiers: TicketTier[]) => {
    if (!tiers.length) return null;
    const active = tiers.filter(t => !t.is_sold_out);
    if (!active.length) return null;
    return Math.min(...active.map(t => t.price));
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("en-GH", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  };

  const formatTime = (d: string) => {
    return new Date(d).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-16 overflow-hidden">
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #002856 0%, #003d7a 50%, #005ab5 100%)" }} />
        <div className="blob w-[400px] h-[400px] bg-secondary -top-20 -right-20 opacity-10" />
        <div className="container mx-auto px-4 relative z-10 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>

            <h1 className="text-3xl md:text-6xl font-display font-bold text-primary-foreground mb-4">
              Get Your <span className="gradient-text-warm">Tickets</span>
            </h1>
            <p className="text-primary-foreground/70 text-lg max-w-xl mx-auto mb-8">
              Browse upcoming events and secure your spot. Instant QR code delivery.
            </p>
            {/* Search */}
            <div className="max-w-md mx-auto relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search events or venues..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-11 h-12 rounded-full bg-background/90 border-border/50 backdrop-blur-sm"
              />
            </div>
          </motion.div>
        </div>

      </section>

      {/* Events Grid */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="vibrant-card animate-pulse">
                  <div className="h-48 bg-muted rounded-xl mb-4" />
                  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-24">
              <Ticket className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-xl font-display font-bold mb-2">No events found</h3>
              <p className="text-muted-foreground">
                {search ? "Try a different search term." : "No ticket events available yet. Check back soon!"}
              </p>
            </div>
          ) : (
            <motion.div
              className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
              initial="hidden" animate="visible"
            >
              {filtered.map((event, i) => {
                const minPrice   = getMinPrice(event.tiers);
                const allSoldOut = event.tiers.every(t => t.is_sold_out);
                return (
                  <motion.div key={event.id} custom={i} variants={fadeUp}>
                    <Link to={`/tickets/${event.slug}`} className="block group">
                      <div className="vibrant-card overflow-hidden p-0 h-full flex flex-col">
                        {/* Banner */}
                        <div className="relative h-48 bg-gradient-to-br from-primary/20 to-secondary/20 overflow-hidden">
                          {event.banner ? (
                            <img src={event.banner} alt={event.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Ticket className="w-16 h-16 text-secondary/30" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                          {allSoldOut && (
                            <div className="absolute top-3 right-3 bg-destructive text-white text-xs font-bold px-3 py-1 rounded-full">
                              SOLD OUT
                            </div>
                          )}
                          {minPrice !== null && !allSoldOut && (
                            <div className="absolute top-3 right-3 bg-secondary text-secondary-foreground text-xs font-bold px-3 py-1 rounded-full">
                              From GHS {minPrice}
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-5 flex flex-col flex-1">
                          <h3 className="font-display font-bold text-lg mb-2 group-hover:text-secondary transition-colors line-clamp-2">
                            {event.title}
                          </h3>
                          <div className="space-y-1.5 mb-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="w-3.5 h-3.5 flex-shrink-0 text-secondary" />
                              {formatDate(event.event_date)} · {formatTime(event.event_date)}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-secondary" />
                              {event.venue}
                            </div>
                          </div>

                          {/* Tier pills */}
                          <div className="flex flex-wrap gap-1.5 mb-4 max-h-12 overflow-hidden">
                            {event.tiers.map(tier => (
                              <span key={tier.id}
                                className="text-xs font-medium px-2 py-0.5 rounded-full border"
                                style={{ color: tier.color, borderColor: tier.color + '40', backgroundColor: tier.color + '15' }}
                              >
                                {tier.name}
                              </span>
                            ))}
                          </div>

                          <div className="mt-auto flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">{event.total_tickets_sold} sold</span>
                            <div className="flex items-center gap-1 text-secondary text-sm font-semibold">
                              Get Tickets <ChevronRight className="w-4 h-4" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
