import { useState, useEffect } from "react";
import { Shield, ShieldOff, ShieldCheck, AlertTriangle, RefreshCw, Loader2, ChevronRight, ArrowLeft, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminEvents } from "../../hooks/useApi";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";
const getToken = () => localStorage.getItem("access_token");

const eventTypeIcon: Record<string, string> = {
  election: "🗳️", contest: "🏆", survey: "📊", live_show: "📺",
};

const eventStatusColor: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  ended:  "bg-muted text-muted-foreground",
  draft:  "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  paused: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

const fraudTypeLabel: Record<string, string> = {
  duplicate_ip:     "Duplicate IP",
  duplicate_device: "Duplicate Device",
  rapid_voting:     "Rapid Voting",
  payment_anomaly:  "Payment Anomaly",
  geo_anomaly:      "Geographic Anomaly",
  vote_spike:       "Vote Spike",
  manual:           "Manually Flagged",
};

const fraudTypeColor: Record<string, string> = {
  duplicate_ip:     "bg-orange-500/10 text-orange-400 border-orange-500/20",
  duplicate_device: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  rapid_voting:     "bg-red-500/10 text-red-400 border-red-500/20",
  payment_anomaly:  "bg-purple-500/10 text-purple-400 border-purple-500/20",
  geo_anomaly:      "bg-blue-500/10 text-blue-400 border-blue-500/20",
  vote_spike:       "bg-pink-500/10 text-pink-400 border-pink-500/20",
  manual:           "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const resolutionColor: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  cleared: "bg-green-500/10 text-green-400 border-green-500/20",
  blocked: "bg-red-500/10 text-red-400 border-red-500/20",
};

const AdminFraudPage = () => {
  const { events, loading: eventsLoading } = useAdminEvents();
  const { toast } = useToast();

  const [selectedSlug, setSelectedSlug] = useState("");
  const [flags, setFlags]               = useState<any[]>([]);
  const [loading, setLoading]           = useState(false);
  const [resolving, setResolving]       = useState<string | null>(null);
  const [filter, setFilter]             = useState<"all" | "pending" | "cleared" | "blocked">("pending");

  const loadFlags = (slug: string) => {
    if (!slug) return;
    setLoading(true);
    fetch(`${API}/voting/admin/${slug}/fraud/`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(data => setFlags(data.results || data || []))
      .catch(() => toast({ title: "Failed to load fraud flags", variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (selectedSlug) loadFlags(selectedSlug);
  }, [selectedSlug]);

  const handleResolve = async (flagId: string, resolution: "cleared" | "blocked") => {
    setResolving(flagId);
    try {
      const res = await fetch(`${API}/voting/admin/fraud/${flagId}/resolve/`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ resolution }),
      });
      if (!res.ok) throw new Error("Failed");
      setFlags(prev => prev.map(f => f.id === flagId ? { ...f, resolution } : f));
      toast({ title: resolution === "cleared" ? "Flag cleared ✅" : "Session blocked 🚫" });
    } catch {
      toast({ title: "Failed to resolve flag", variant: "destructive" });
    } finally {
      setResolving(null);
    }
  };

  const selectedEvent = events.find((e: any) => e.slug === selectedSlug);
  const filtered      = flags.filter(f => filter === "all" ? true : f.resolution === filter);
  const pendingCount  = flags.filter(f => f.resolution === "pending").length;
  const clearedCount  = flags.filter(f => f.resolution === "cleared").length;
  const blockedCount  = flags.filter(f => f.resolution === "blocked").length;

  const EventPicker = () => (
    <div>
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">Select an event to view fraud flags</p>
      </div>
      {eventsLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : events.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted-foreground">
          <Shield className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>No events yet.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {events.map((event: any) => (
            <button key={event.id} onClick={() => setSelectedSlug(event.slug)}
              className="glass-card p-4 flex items-center gap-4 hover:border-secondary/40 transition-all text-left group">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                {event.banner_image ? (
                  <img src={event.banner_image} alt={event.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl">
                    {eventTypeIcon[event.event_type] || "🗳️"}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-medium truncate">{event.title}</span>
                  <Badge className={`text-xs ${eventStatusColor[event.status] || "bg-muted"}`}>{event.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {eventTypeIcon[event.event_type]} {event.event_type} · {event.total_votes || 0} votes
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-secondary transition-colors flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const FlagList = () => (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => { setSelectedSlug(""); setFlags([]); }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{selectedEvent?.title}</p>
          <p className="text-xs text-muted-foreground">{flags.length} flags · {pendingCount} pending</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadFlags(selectedSlug)} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { icon: AlertTriangle, label: "Pending", value: pendingCount, color: "text-yellow-400", key: "pending" },
          { icon: ShieldCheck,   label: "Cleared", value: clearedCount, color: "text-green-400",  key: "cleared" },
          { icon: ShieldOff,     label: "Blocked", value: blockedCount, color: "text-red-400",    key: "blocked" },
        ].map(s => (
          <button key={s.key} onClick={() => setFilter(s.key as any)}
            className={`glass-card p-3 flex items-center gap-2 transition-all ${filter === s.key ? "border-secondary/40" : ""}`}>
            <s.icon className={`w-4 h-4 ${s.color} flex-shrink-0`} />
            <div className="text-left">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="font-bold text-sm">{s.value}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        {(["all", "pending", "cleared", "blocked"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${
              filter === f
                ? "bg-secondary text-secondary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}>
            {f === "all" ? `All (${flags.length})` : f}
          </button>
        ))}
      </div>

      <div className="glass-card p-5">
        {loading ? (
          <div className="flex justify-center h-40 items-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ShieldCheck className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>No {filter === "all" ? "" : filter} flags found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((flag: any) => (
              <div key={flag.id} className="flex flex-col gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-xs ${fraudTypeColor[flag.fraud_type] || "bg-muted"}`}>
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      {fraudTypeLabel[flag.fraud_type] || flag.fraud_type}
                    </Badge>
                    <Badge className={`text-xs ${resolutionColor[flag.resolution]}`}>
                      {flag.resolution}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                    {new Date(flag.created_at).toLocaleDateString()}
                  </span>
                </div>

                <p className="text-sm text-muted-foreground">{flag.description}</p>

                {flag.ip_address && (
                  <p className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded w-fit">
                    IP: {flag.ip_address}
                  </p>
                )}

                {flag.resolution === "pending" && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline"
                      className="text-green-400 border-green-500/30 hover:bg-green-500/10 text-xs h-8"
                      disabled={resolving === flag.id}
                      onClick={() => handleResolve(flag.id, "cleared")}>
                      {resolving === flag.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ShieldCheck className="w-3 h-3 mr-1" />}
                      Clear Flag
                    </Button>
                    <Button size="sm" variant="outline"
                      className="text-red-400 border-red-500/30 hover:bg-red-500/10 text-xs h-8"
                      disabled={resolving === flag.id}
                      onClick={() => handleResolve(flag.id, "blocked")}>
                      {resolving === flag.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ShieldOff className="w-3 h-3 mr-1" />}
                      Block Session
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Flag className="w-5 h-5 text-red-400" /> Fraud Flags
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">Review and resolve suspicious voting activity</p>
      </div>
      {!selectedSlug ? <EventPicker /> : <FlagList />}
    </div>
  );
};

export default AdminFraudPage;
