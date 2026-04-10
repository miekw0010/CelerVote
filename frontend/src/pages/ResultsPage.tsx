import { useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3, TrendingUp, Trophy, Users, Loader2,
  Wifi, WifiOff, ArrowLeft, Share2, Flag, Search,
} from "lucide-react";import { Link, useParams } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { useLiveResults, useEvents } from "../hooks/useApi";
import { useToast } from "@/hooks/use-toast";

const COLORS = [
  "#6366f1", "#f59e0b", "#ec4899",
  "#10b981", "#3b82f6", "#8b5cf6", "#f97316", "#14b8a6",
];

const statusConfig: Record<string, { label: string; emoji: string; color: string }> = {
  active:    { label: "Live",     emoji: "🔴", color: "bg-red-500/10 text-red-500 border-red-500/20" },
  ended:     { label: "Ended",    emoji: "🏁", color: "bg-muted text-muted-foreground border-border" },
  paused:    { label: "Paused",   emoji: "⏸",  color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  draft:     { label: "Draft",    emoji: "📝", color: "bg-muted text-muted-foreground border-border" },
  scheduled: { label: "Upcoming", emoji: "📅", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
};

// ── Event List (no slug) ──────────────────────────────────────────────────────
const EventResultsList = () => {
  const { events, loading } = useEvents();
  const [search, setSearch] = useState("");

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-secondary" />
    </div>
  );

  const visible = events.filter((e: any) =>
    ["active", "ended", "paused"].includes(e.status) && e.results_published === true
  );

  const filtered = visible.filter((e: any) =>
    e.title.toLowerCase().includes(search.toLowerCase())
  );

  if (visible.length === 0) return (
    <div className="glass-card p-16 text-center text-muted-foreground">
      <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-20" />
      <p className="font-medium mb-1">No results available yet</p>
      <p className="text-sm mb-5">Results appear once an event goes live or ends.</p>
      <Link to="/events">
        <Button variant="outline" size="sm">Browse Events</Button>
      </Link>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search events..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 h-12 rounded-xl border border-border/60 bg-muted/30 text-sm focus:outline-none focus:border-secondary/60 transition-colors"
        />
      </div>

      {filtered.length === 0 && search && (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-sm">No results found for "<strong>{search}</strong>"</p>
        </div>
      )}

      {filtered.map((ev: any, i: number) => {
        const cfg = statusConfig[ev.status] || statusConfig.draft;
        return (
          <motion.div key={ev.id}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}>
            <Link to={`/results/${ev.slug}`}
              className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card hover:border-secondary/40 hover:bg-secondary/5 transition-all group">
              <div className="w-11 h-11 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                {ev.banner_image
                  ? <img src={ev.banner_image} alt={ev.title} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-lg">🗳️</div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate transition-colors text-sm group-hover:text-yellow-500">{ev.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {ev.total_votes?.toLocaleString() || 0} votes
                  &nbsp;·&nbsp;
                  {ev.category_count || 0} categories
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`hidden sm:inline-flex text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.color}`}>
                  {cfg.emoji} {cfg.label}
                </span>
                <span className={`sm:hidden text-sm`}>{cfg.emoji}</span>

              </div>
            </Link>
          </motion.div>
        );
      })}

      {filtered.length > 0 && (
        <p className="text-center text-xs text-muted-foreground pt-2">
          Showing {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          {search ? ` for "${search}"` : ''}
        </p>
      )}
    </div>
  );
};

// ── Main Results Page ─────────────────────────────────────────────────────────
const ResultsPage = () => {
  const { slug }                         = useParams<{ slug: string }>();
  const { results, loading, connected }  = useLiveResults(slug || "");
  const { toast }                        = useToast();

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({ title: "Link copied! 🔗" });
  };

  // ── No slug — show list ──
  if (!slug) return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="container mx-auto px-4 max-w-3xl">
          <motion.div className="mb-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 900, fontSize: "clamp(2rem, 5vw, 3rem)", color: "#002856", marginBottom: "0.5rem" }}>
              Event <span style={{ color: "#e87200" }}>Results</span>
            </h1>
            <p style={{ fontFamily: "'Montserrat', sans-serif", color: "#666", fontSize: "0.95rem" }}>Live and final results for all events.</p>
          </motion.div>
          <EventResultsList />
        </div>
      </div>
      <Footer />
    </div>
  );

  // ── Loading ──
  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-secondary mx-auto" />
        <p className="text-sm text-muted-foreground">Loading results...</p>
      </div>
    </div>
  );

  // ── No results ──
  if (!results) return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="text-3xl font-display font-bold mb-6">Results</h1>
          <EventResultsList />
        </div>
      </div>
      <Footer />
    </div>
  );

  const cfg        = statusConfig[results.status] || statusConfig.draft;
  const isLive     = results.status === "active";
  const isEnded    = results.status === "ended";
  const totalVotes = results.total_votes || 0;

  const renderCategory = (category: any, catIndex: number) => {
    const totalCatVotes = category.candidates?.reduce((sum: number, c: any) => sum + (c.vote_count || 0), 0) || 0;
    const sorted = [...(category.candidates || [])].sort((a: any, b: any) => (b.vote_count || 0) - (a.vote_count || 0));
    const topVotes = sorted[0]?.vote_count || 0;
    const isTied   = topVotes > 0 && sorted.filter((c: any) => c.vote_count === topVotes).length > 1;
    const leaders  = isTied ? sorted.filter((c: any) => c.vote_count === topVotes) : sorted.slice(0, 1);
    const chartData = sorted.map((c: any) => ({ name: c.name.length > 10 ? c.name.split(" ")[0] : c.name, votes: c.vote_count || 0 }));

    return (
      <motion.div key={category.id} className="mb-12" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: catIndex * 0.08 }}>
        <div className="rounded-2xl border border-border overflow-hidden mb-5">
          <div className="flex items-center justify-between gap-4 p-5 bg-muted/20 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center text-secondary font-bold flex-shrink-0">{catIndex + 1}</div>
              <div>
                <h2 className="font-display font-bold text-lg">{category.name}</h2>
                <p className="text-xs text-muted-foreground">{sorted.length} candidates · {totalCatVotes.toLocaleString()} votes</p>
              </div>
            </div>
            {totalCatVotes > 0 && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${isTied ? "bg-muted border-border" : "bg-secondary/10 border-secondary/20"}`}>
                <Trophy className={`w-4 h-4 flex-shrink-0 ${isTied ? "text-muted-foreground" : "text-yellow-400"}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{isTied ? "Tied" : "Leading"}</p>
                  <p className={`text-sm font-bold ${isTied ? "text-foreground" : "text-secondary"}`}>
                    {isTied ? `🤝 ${leaders.map((c: any) => c.name.split(" ")[0]).join(" & ")}` : leaders[0]?.name}
                  </p>
                </div>
              </div>
            )}
            {totalCatVotes === 0 && <span className="text-xs text-muted-foreground px-3 py-1.5 rounded-lg bg-muted border border-border">No votes yet</span>}
          </div>
          {sorted.length > 0 && totalCatVotes > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-border">
              <div className="p-5">
                <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Vote Distribution</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#64748b" }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#f1f5f9" }} itemStyle={{ color: "#e2e8f0" }} />
                    <Bar dataKey="votes" radius={[4, 4, 0, 0]}>{chartData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="p-5">
                <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Vote Share</p>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="votes">
                      {chartData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} itemStyle={{ color: "#e2e8f0" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-2 mt-1">
                  {chartData.map((c: any, i: number) => (
                    <span key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />{c.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="p-5 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-4 uppercase tracking-wide">Leaderboard</p>
            <div className="space-y-3">
              {sorted.map((c: any, i: number) => {
                const pct = totalCatVotes > 0 ? Math.round((c.vote_count / totalCatVotes) * 100) : 0;
                const isLeader = topVotes > 0 && c.vote_count === topVotes;
                const color = COLORS[i % COLORS.length];
                return (
                  <motion.div key={c.id} className="flex items-center gap-3" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                    <div className="w-7 flex-shrink-0 flex items-center justify-center">
                      {isLeader ? <Trophy className="w-4 h-4 text-yellow-400" /> : <span className="text-sm font-bold text-muted-foreground">{i + 1}</span>}
                    </div>
                    {c.photo ? <img src={c.photo} alt={c.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                     : <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white" style={{ background: color }}>{c.name[0]}</div>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-semibold truncate ${isLeader && !isTied ? "text-secondary" : ""}`}>{c.name}</span>
                        <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">{(c.vote_count || 0).toLocaleString()} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, delay: i * 0.05 }} />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  
  // ── Results not published yet ──
  if (!results.results_published) return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="container mx-auto px-4 max-w-3xl">
          <Link to="/results" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors group">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> All Results
          </Link>
          <motion.div className="glass-card p-16 text-center"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <BarChart3 className="w-10 h-10 text-muted-foreground opacity-40" />
            </div>
            <h2 className="text-2xl font-display font-bold mb-3">Results Not Published Yet</h2>
            <p className="text-muted-foreground max-w-sm mx-auto">
              The organiser hasn't published the results for <strong>{results.event_title}</strong> yet. Check back later.
            </p>
          </motion.div>
        </div>
      </div>
      <Footer />
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="container mx-auto px-4 max-w-5xl">

          {/* ── Back ── */}
          <Link to="/results" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors group">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> All Results
          </Link>

          {/* ── Header ── */}
          <motion.div className="mb-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${cfg.color}`}>
                {isLive && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
                {cfg.emoji} {cfg.label}
              </span>
              <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${
                connected
                  ? "bg-green-500/10 text-green-400 border-green-500/20"
                  : "bg-muted text-muted-foreground border-border"
              }`}>
                {connected
                  ? <><Wifi className="w-3 h-3" /> Live updates</>
                  : <><WifiOff className="w-3 h-3" /> Polling</>
                }
              </span>
            </div>

            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-3xl md:text-4xl font-display font-bold mb-2">{results.event_title}</h1>
                <p className="text-muted-foreground text-sm">
                  {isLive ? "Results update in real-time as votes come in" : "Final results"}
                  &nbsp;·&nbsp; {totalVotes.toLocaleString()} total votes
                </p>
              </div>
              <button onClick={handleShare}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-secondary transition-colors px-3 py-2 rounded-lg border border-border/50 hover:border-secondary/40">
                <Share2 className="w-4 h-4" /> Share
              </button>
            </div>
          </motion.div>

          {/* ── Stats Row ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {[
              { icon: Users,      label: "Total Votes",  value: totalVotes.toLocaleString() },
              { icon: TrendingUp, label: "Categories",   value: (results.categories?.length || 0).toString() },
              { icon: Trophy,     label: "Status",       value: `${cfg.emoji} ${cfg.label}` },
              { icon: BarChart3,  label: "Live Updates", value: connected ? "✅ Active" : "⏳ Polling" },
            ].map((stat, i) => (
              <motion.div key={stat.label} className="glass-card p-4 flex items-center gap-3"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
                  <stat.icon className="w-4 h-4 text-secondary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="font-semibold text-sm truncate">{stat.value}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* ── Per Category — grouped for org elections ── */}
          {(() => {
            const cats = results.categories || [];
            const isOrg = results.voting_mode === "organizational";

            if (!isOrg) {
              // Normal: flat list
              return cats.map((category: any, catIndex: number) => renderCategory(category, catIndex));
            }

            // Org: group categories by their group
            const globalCats = cats.filter((c: any) => c.is_global);
            const groupMap: Record<string, { name: string; cats: any[] }> = {};
            cats.filter((c: any) => !c.is_global).forEach((c: any) => {
              (c.groups || []).forEach((g: any) => {
                const gid = g.id || g;
                const gname = g.name || gid;
                if (!groupMap[gid]) groupMap[gid] = { name: gname, cats: [] };
                if (!groupMap[gid].cats.find((x: any) => x.id === c.id)) groupMap[gid].cats.push(c);
              });
            });

            return (
              <>
                {globalCats.length > 0 && (
                  <div className="mb-10">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-sm font-semibold text-blue-400 px-3 py-1 rounded-full border border-blue-500/20 bg-blue-500/10">🌍 General Categories (All Voters)</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    {globalCats.map((cat: any, i: number) => renderCategory(cat, i))}
                  </div>
                )}
                {Object.entries(groupMap).map(([gid, group]) => (
                  <div key={gid} className="mb-10">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-sm font-semibold text-secondary px-3 py-1 rounded-full border border-secondary/20 bg-secondary/10">👥 {group.name}</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    {group.cats.map((cat: any, i: number) => renderCategory(cat, i))}
                  </div>
                ))}
                {globalCats.length === 0 && Object.keys(groupMap).length === 0 && cats.map((cat: any, i: number) => renderCategory(cat, i))}
              </>
            );
          })()}
          
          {/* ── No categories ── */}
          {(!results.categories || results.categories.length === 0) && (
            <div className="glass-card p-16 text-center text-muted-foreground">
              <Flag className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="font-medium mb-1">No results yet</p>
              <p className="text-sm">Results will appear once voting begins.</p>
            </div>
          )}

        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ResultsPage;