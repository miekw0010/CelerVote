import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  BarChart3, Users, Vote, Calendar, Plus, FileText,
  CreditCard, Trash2, Eye, Loader2, RefreshCw, Play, Pause,
  StopCircle, TrendingUp, ChevronRight, ArrowLeft, Trophy, Flag, Activity,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAnalytics, useAdminEvents } from "../hooks/useApi";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";

const getToken = () => localStorage.getItem("access_token");

const statusColor: Record<string, string> = {
  active:    "bg-green-500/20 text-green-400",
  draft:     "bg-muted text-muted-foreground",
  scheduled: "bg-blue-500/20 text-blue-400",
  paused:    "bg-yellow-500/20 text-yellow-400",
  ended:     "bg-red-500/20 text-red-400",
};

const eventTypeIcon: Record<string, string> = {
  election: "🗳️", contest: "🏆", survey: "📊", live_show: "📺",
};

const COLORS = ["#01003c", "#6366f1", "#f59e0b", "#ec4899", "#10b981", "#3b82f6", "#8b5cf6", "#f97316"];

const AdminDashboard = () => {
  const { dashboard, loading: dashLoading }    = useAnalytics();
  const { events, loading: eventsLoading,
          changeStatus, deleteEvent, refetch } = useAdminEvents();
  const { toast }                              = useToast();
  const navigate                               = useNavigate();

  const [selectedSlug, setSelectedSlug]         = useState("");
  const [eventAnalytics, setEventAnalytics]     = useState<any>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  useEffect(() => {
    if (!selectedSlug) return;
    setLoadingAnalytics(true);
    setEventAnalytics(null);
    fetch(`${API}/analytics/${selectedSlug}/`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    })
      .then(r => r.json())
      .then(setEventAnalytics)
      .catch(() => toast({ title: "Failed to load analytics", variant: "destructive" }))
      .finally(() => setLoadingAnalytics(false));
  }, [selectedSlug]);

  const votesOverTime = (eventAnalytics?.votes_over_time || []).map((v: any) => ({
    hour:  new Date(v.hour).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    votes: v.count,
  }));

  const statusData = ["active", "draft", "scheduled", "paused", "ended"].map(s => ({
    name:  s,
    count: events.filter((e: any) => e.status === s).length,
  })).filter(d => d.count > 0);

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* ── Stats Row ── */}
      {dashLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Vote,       label: "Total Votes",   value: dashboard?.total_votes?.toLocaleString() || "0",         color: "text-secondary" },
            { icon: Calendar,   label: "Active Events", value: dashboard?.active_events?.toString() || "0",             color: "text-green-400" },
            { icon: BarChart3,  label: "Total Events",  value: dashboard?.total_events?.toString() || "0",              color: "text-blue-400" },
            { icon: CreditCard, label: "Revenue",       value: `GHS ${dashboard?.total_revenue?.toFixed(2) || "0.00"}`, color: "text-yellow-400" },
          ].map((stat, i) => (
            <motion.div key={stat.label} className="glass-card p-4"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center mb-3">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <p className="text-2xl font-display font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Event Analytics ── */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          {selectedSlug && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setSelectedSlug(""); setEventAnalytics(null); }}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <h2 className="font-display font-semibold flex items-center gap-2 flex-1">
            <TrendingUp className="w-4 h-4 text-secondary" />
            {selectedSlug ? (events.find((e: any) => e.slug === selectedSlug)?.title || "Analytics") : "Event Analytics"}
          </h2>
        </div>

        {/* Event Picker */}
        {!selectedSlug && (
          eventsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No events yet.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {events.map((event: any) => (
                <button key={event.id} onClick={() => setSelectedSlug(event.slug)}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-secondary/40 hover:bg-muted/30 transition-all text-left group">
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                    {event.banner_image
                      ? <img src={event.banner_image} alt={event.title} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-xl">{eventTypeIcon[event.event_type] || "🗳️"}</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium truncate">{event.title}</span>
                      <Badge className={`text-xs flex-shrink-0 ${statusColor[event.status] || "bg-muted"}`}>{event.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{event.total_votes || 0} votes · {event.category_count || 0} categories</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-secondary flex-shrink-0" />
                </button>
              ))}
            </div>
          )
        )}

        {/* Analytics Content */}
        {selectedSlug && (
          loadingAnalytics ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !eventAnalytics ? null : (
            <div className="space-y-6">

              {/* Summary pills */}
              <div className="flex flex-wrap gap-2">
                {[
                  { label: `${eventAnalytics.summary.total_votes} total votes`,    color: "bg-secondary/10 text-secondary" },
                  { label: `${eventAnalytics.summary.total_voters} unique voters`, color: "bg-purple-500/10 text-purple-400" },
                  ...(eventAnalytics.summary.flagged_sessions > 0 ? [{ label: `${eventAnalytics.summary.flagged_sessions} flagged`, color: "bg-red-500/10 text-red-400" }] : []),
                  ...(eventAnalytics.summary.revenue > 0 ? [{ label: `${eventAnalytics.summary.currency} ${eventAnalytics.summary.revenue.toFixed(2)} revenue`, color: "bg-yellow-500/10 text-yellow-400" }] : []),
                ].map(p => (
                  <span key={p.label} className={`px-3 py-1.5 rounded-full text-xs font-medium ${p.color}`}>{p.label}</span>
                ))}
              </div>

              {/* ── Per Category Breakdown ── */}
              {(eventAnalytics.categories || []).length > 0 && (
                <div className="space-y-6">
                  {eventAnalytics.categories.map((cat: any, ci: number) => {
                    const totalCatVotes = cat.candidates.reduce((s: number, c: any) => s + (c.vote_count || 0), 0);
                    const sorted = [...cat.candidates].sort((a: any, b: any) => b.vote_count - a.vote_count);
                    const chartData = sorted.map((c: any, i: number) => ({
                      name:  c.name.split(" ")[0],
                      votes: c.vote_count || 0,
                      color: COLORS[i % COLORS.length],
                    }));
                    const leader = sorted[0];
                    const isTied = sorted.filter((c: any) => c.vote_count === leader?.vote_count && leader?.vote_count > 0).length > 1;

                    return (
                      <div key={cat.id || ci} className="rounded-xl border border-border overflow-hidden">
                        {/* Category Header */}
                        <div className="flex items-center justify-between p-4 bg-muted/20 border-b border-border flex-wrap gap-2">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary font-bold text-sm flex-shrink-0">
                              {ci + 1}
                            </div>
                            <div>
                              <p className="font-semibold">{cat.name}</p>
                              <p className="text-xs text-muted-foreground">{cat.candidates.length} candidates · {totalCatVotes} votes</p>
                            </div>
                          </div>
                          {totalCatVotes > 0 && (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/10 border border-secondary/20">
                              <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                              <span className="text-xs font-medium text-secondary">
                                {isTied ? "Tied" : leader?.name}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Category Charts */}
                        <div className="p-4">
                          {totalCatVotes === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">No votes yet</div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Bar Chart */}
                              <div>
                                <p className="text-xs text-muted-foreground mb-2">Vote Distribution</p>
                                <ResponsiveContainer width="100%" height={180}>
                                  <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                                    <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
                                    <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                                      labelStyle={{ color: "#f9fafb" }} itemStyle={{ color: "#a5b4fc" }} />
                                    <Bar dataKey="votes" radius={[4, 4, 0, 0]}>
                                      {chartData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Bar>
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>

                              {/* Leaderboard */}
                              <div>
                                <p className="text-xs text-muted-foreground mb-2">Leaderboard</p>
                                <div className="space-y-2">
                                  {sorted.map((c: any, i: number) => {
                                    const pct = totalCatVotes > 0 ? Math.round((c.vote_count / totalCatVotes) * 100) : 0;
                                    const isLeader = c.vote_count > 0 && c.vote_count === sorted[0].vote_count;
                                    return (
                                      <div key={c.id || i} className="flex items-center gap-2">
                                        <div className="w-5 flex-shrink-0 flex items-center justify-center">
                                          {isLeader
                                            ? <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                                            : <span className="text-xs text-muted-foreground">{i + 1}</span>
                                          }
                                        </div>
                                        {c.photo
                                          ? <img src={c.photo} alt={c.name} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                                          : <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                              style={{ background: COLORS[i % COLORS.length], color: "white" }}>
                                              {c.name[0]}
                                            </div>
                                        }
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center justify-between mb-0.5">
                                            <span className="text-xs font-medium truncate">{c.name}</span>
                                            <span className="text-xs text-muted-foreground ml-1 flex-shrink-0">{pct}%</span>
                                          </div>
                                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div className="h-full rounded-full transition-all"
                                              style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Votes Over Time */}
              {votesOverTime.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-secondary" /> Votes Over Time (last 24h)
                  </p>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={votesOverTime} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                      <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                        labelStyle={{ color: "#f9fafb" }} itemStyle={{ color: "#a5b4fc" }} />
                      <Line type="monotone" dataKey="votes" stroke="#01003c" strokeWidth={2} dot={{ fill: "#01003c", r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Fraud/flags warning */}
              {eventAnalytics.summary.flagged_sessions > 0 && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <Flag className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-400">Fraud Alert</p>
                    <p className="text-xs text-muted-foreground">{eventAnalytics.summary.flagged_sessions} flagged sessions detected. Review in Voters → Voting Activity.</p>
                  </div>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* Events Status Distribution */}
      {statusData.length > 0 && (
        <div className="glass-card p-5">
          <h2 className="font-display font-semibold mb-4">Events by Status</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={statusData} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} width={70} />
              <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                itemStyle={{ color: "#a5b4fc" }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {statusData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent Events */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold">Recent Events</h2>
          <Button variant="outline" size="sm" className="gap-1" onClick={refetch}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
        {eventsLoading ? (
          <div className="flex items-center justify-center h-24"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No events yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground min-w-[140px]">Event</th>
                  <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground min-w-[80px]">Status</th>
                  <th className="text-right py-3 px-2 text-xs font-medium text-muted-foreground min-w-[60px]">Votes</th>
                  <th className="text-right py-3 px-2 text-xs font-medium text-muted-foreground min-w-[120px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 5).map((event: any) => (
                  <tr key={event.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{eventTypeIcon[event.event_type] || "🗳️"}</span>
                        <div>
                          <p className="text-sm font-medium">{event.title}</p>
                          <p className="text-xs text-muted-foreground">{event.category_count || 0} categories</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <Badge className={`text-xs ${statusColor[event.status] || "bg-muted"}`}>{event.status}</Badge>
                    </td>
                    <td className="py-3 px-2 text-sm text-right font-medium">{event.total_votes?.toLocaleString() || 0}</td>
                    <td className="py-3 px-2">
                      <div className="flex justify-end gap-1">
                        <Link to={`/events/${event.slug}`}>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Eye className="w-3.5 h-3.5" /></Button>
                        </Link>
                        {event.status !== "active" && event.status !== "ended" && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-500"
                            onClick={() => changeStatus(event.slug, "active")}><Play className="w-3.5 h-3.5" /></Button>
                        )}
                        {event.status === "active" && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-yellow-500"
                            onClick={() => changeStatus(event.slug, "paused")}><Pause className="w-3.5 h-3.5" /></Button>
                        )}
                        {(event.status === "active" || event.status === "paused") && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500"
                            onClick={() => changeStatus(event.slug, "ended")}><StopCircle className="w-3.5 h-3.5" /></Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"
                          onClick={() => deleteEvent(event.slug)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { icon: Plus,     title: "Create Event",   desc: "Set up a new voting event", action: () => navigate("/admin/events") },
          { icon: Users,    title: "Add Candidates", desc: "Upload candidate profiles",  action: () => navigate("/admin/candidates") },
          { icon: FileText, title: "View Voters",    desc: "See who has voted",          action: () => navigate("/admin/voters") },
        ].map((item) => (
          <div key={item.title} onClick={item.action} className="glass-card-hover p-5 cursor-pointer">
            <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center mb-3">
              <item.icon className="w-5 h-5 text-secondary" />
            </div>
            <h3 className="font-display font-semibold text-sm mb-1">{item.title}</h3>
            <p className="text-xs text-muted-foreground">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;