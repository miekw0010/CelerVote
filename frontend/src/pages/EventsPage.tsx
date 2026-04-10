import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Calendar, Users, ArrowRight, Loader2,
  Zap, Trophy, BarChart2, Radio, Clock, Flame, Vote,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useEvents } from "../hooks/useApi";

const EVENT_TYPES = ["All", "election", "contest", "survey", "live_show"];

const typeIcon: Record<string, any> = {
  election:  Vote,
  contest:   Zap,
  survey:    BarChart2,
  live_show: Radio,
};

const typeLabel: Record<string, string> = {
  election:  "Election",
  contest:   "Contest",
  survey:    "Survey",
  live_show: "Live Show",
};

const typeEmoji: Record<string, string> = {
  election:  "🗳️",
  contest:   "🏆",
  survey:    "📊",
  live_show: "📺",
};

const SORT_OPTIONS = [
  { value: "newest",    label: "Newest" },
  { value: "popular",   label: "Most Votes" },
  { value: "ending",    label: "Ending Soon" },
];

const EventsPage = () => {
  const [search, setSearch]       = useState("");
  const [activeType, setActiveType] = useState("All");
  const [sort, setSort]           = useState("newest");
  const { events, loading, error } = useEvents();

  const filtered = events
    .filter((e: any) => {
      const matchSearch = e.title.toLowerCase().includes(search.toLowerCase());
      const matchType   = activeType === "All" || e.event_type === activeType;
      return matchSearch && matchType;
    })
    .sort((a: any, b: any) => {
      if (sort === "popular") return (b.total_votes || 0) - (a.total_votes || 0);
      if (sort === "ending")  return new Date(a.end_time).getTime() - new Date(b.end_time).getTime();
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

  const liveCount = events.filter((e: any) => e.status === "active").length;

  const getTimeLeft = (endTime: string) => {
    if (!endTime) return null;
    const diff = new Date(endTime).getTime() - Date.now();
    if (diff <= 0) return "Ended";
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(hours / 24);
    if (days > 0) return `${days}d left`;
    if (hours > 0) return `${hours}h left`;
    return "Ending soon";
  };

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="container mx-auto px-4 max-w-6xl">

          {/* ── Header ── */}
          <motion.div className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>

            <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: 'clamp(2.5rem, 6vw, 4rem)', color: '#002856', marginBottom: '0.75rem' }}>
              Browse <span style={{ color: '#e87200' }}>Events</span>
            </h1>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 400, color: '#666', maxWidth: '480px', margin: '0 auto', fontSize: '1rem', lineHeight: 1.6 }}>
              Discover elections, contests, and polls. Cast your vote securely in seconds.
            </p>
          </motion.div>

          {/* ── Search + Filters ── */}
          <motion.div className="space-y-3 mb-10"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>

            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search events by name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-11 h-12 text-base rounded-xl border-border/60 focus:border-secondary/60 bg-transparent"
              />
            </div>

            {/* Type filters + Sort */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {EVENT_TYPES.map(type => (
                  <button key={type} onClick={() => setActiveType(type)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all capitalize ${
                      activeType === type
                        ? "text-white shadow-lg"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40"
                    }`}
                    style={activeType === type ? { background: '#002856' } : undefined}>
                    {type === "All" ? "All Events" : `${typeEmoji[type]} ${typeLabel[type]}`}
                  </button>
                ))}
              </div>
              <select value={sort} onChange={e => setSort(e.target.value)}
                className="h-9 px-3 rounded-lg border border-border/60 bg-muted/30 text-xs text-muted-foreground focus:outline-none focus:border-secondary/60 cursor-pointer flex-shrink-0">
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </motion.div>

          {/* ── States ── */}
          {loading && (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-secondary" />
              <p className="text-sm text-muted-foreground">Loading events...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-16">
              <p className="text-muted-foreground">Failed to load events. Please try again.</p>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <motion.div className="text-center py-24" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="w-20 h-20 rounded-3xl bg-muted/50 flex items-center justify-center mx-auto mb-5">
                <Calendar className="w-10 h-10 text-muted-foreground/40" />
              </div>
              <p className="text-lg font-semibold mb-2">No events found</p>
              <p className="text-sm text-muted-foreground">Try a different search or filter</p>
            </motion.div>
          )}

          {/* ── Event Grid ── */}
          {!loading && !error && filtered.length > 0 && (
            <AnimatePresence mode="popLayout">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {filtered.map((event: any, i: number) => {
                  const TypeIcon  = typeIcon[event.event_type] || Calendar;
                  const isLive    = event.status === "active";
                  const isEnded   = event.status === "ended";
                  const isPaused  = event.status === "paused";
                  const timeLeft  = getTimeLeft(event.end_time);
                  const link      = isEnded ? `/results/${event.slug}` : `/events/${event.slug}`;

                  return (
                    <motion.div key={event.id}
                      initial={{ opacity: 0, y: 24 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: i * 0.05 }}
                      layout
                    >
                      <Link to={link} className="block group h-full">
                        <div className={`h-full rounded-2xl border overflow-hidden transition-all duration-300 hover:shadow-xl flex flex-col ${
                          isLive
                            ? "border-secondary/40 hover:border-secondary/70 hover:shadow-secondary/10"
                            : isEnded
                              ? "border-border/30 opacity-80 hover:opacity-100 hover:border-border/60"
                              : "border-border/50 hover:border-secondary/40 hover:shadow-secondary/5"
                        }`}>

                          {/* Banner */}
                          <div className="relative h-44 overflow-hidden bg-gradient-to-br from-muted to-muted/50 flex-shrink-0">
                            {event.banner_image ? (
                              <img src={event.banner_image} alt={event.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary/5 to-primary/5">
                                <span className="text-6xl opacity-20">{typeEmoji[event.event_type] || "🗳️"}</span>
                              </div>
                            )}

                            {/* Dark overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

                            {/* Live pulse ring */}
                            {isLive && (
                              <div className="absolute top-3 left-3 flex items-center gap-2">
                                <span className="relative flex h-2.5 w-2.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                                </span>
                                <span className="text-xs font-bold text-white bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full">
                                  LIVE
                                </span>
                              </div>
                            )}

                            {isPaused && (
                              <div className="absolute top-3 left-3">
                                <span className="text-xs font-semibold text-yellow-300 bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full">
                                  ⏸ Paused
                                </span>
                              </div>
                            )}

                            {isEnded && (
                              <div className="absolute top-3 left-3">
                                <span className="text-xs font-semibold text-white/60 bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-full">
                                  🏁 Ended
                                </span>
                              </div>
                            )}

                            {/* Price badge */}
                            <div className="absolute top-3 right-3">
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm ${
                                event.is_paid
                                  ? "bg-black/60 text-white border border-white/20"
                                  : "bg-black/60 text-white border border-white/20"
                              }`}>
                                {event.is_paid ? `${event.currency} ${event.price_per_vote}/vote` : "Free"}
                              </span>
                            </div>

                            {/* Bottom stats row */}
                            <div className="absolute bottom-0 left-0 right-0 px-4 py-3 flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-white/80 text-xs">
                                <Users className="w-3.5 h-3.5" />
                                <span className="font-medium">{event.total_votes?.toLocaleString() || 0} votes</span>
                              </div>
                              {timeLeft && isLive && (
                                <div className="flex items-center gap-1 text-xs text-orange-300">
                                  <Clock className="w-3 h-3" />
                                  <span>{timeLeft}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Content */}
                          <div className="p-4 flex flex-col flex-1 bg-card">

                            {/* Type + date row */}
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5">
                                <TypeIcon className="w-3.5 h-3.5 text-secondary" />
                                <span className="text-xs text-muted-foreground font-medium capitalize">
                                  {typeLabel[event.event_type] || event.event_type}
                                </span>
                              </div>
                              {event.end_time && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {new Date(event.end_time).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                </span>
                              )}
                            </div>

                            {/* Title */}
                            <h3 className="font-display font-bold text-sm leading-snug mb-3 line-clamp-2 flex-1 transition-colors">
                              {event.title}
                            </h3>

                            {/* CTA row */}
                            <div className={`flex items-center justify-between pt-3 border-t ${
                              isEnded ? "border-border/20" : "border-border/40"
                            }`}>
                              <span className={`text-xs font-semibold flex items-center gap-1.5 ${
                                isLive   ? "text-secondary" :
                                isEnded  ? "text-muted-foreground" :
                                isPaused ? "text-yellow-500" :
                                "text-primary"
                              }`}>
                                {isLive   && <><Flame className="w-3.5 h-3.5" /> Vote Now</>}
                                {isEnded  && <>🏁 See Results</>}
                                {isPaused && <>⏸ Paused</>}
                                {!isLive && !isEnded && !isPaused && <>View Details</>}
                              </span>
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all group-hover:scale-110 ${
                                isLive  ? "bg-secondary/10 text-secondary" :
                                isEnded ? "bg-muted text-muted-foreground" :
                                "bg-primary/10 text-primary"
                              }`}>
                                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </AnimatePresence>
          )}

          {/* Results count */}
          {!loading && filtered.length > 0 && (
            <p className="text-center text-xs text-muted-foreground mt-8">
              Showing {filtered.length} event{filtered.length !== 1 ? "s" : ""}
              {activeType !== "All" ? ` · ${typeLabel[activeType]}` : ""}
              {search ? ` · "${search}"` : ""}
            </p>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default EventsPage;
