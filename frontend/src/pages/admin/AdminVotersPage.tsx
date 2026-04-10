import { useState, useEffect } from "react";
import { Users, Search, Loader2, AlertTriangle, CheckCircle, XCircle, Eye, ShieldOff, Shield, RefreshCw, Phone, Mail, ChevronRight, ArrowLeft, Activity, UserCheck, Flag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAdminEvents } from "../../hooks/useApi";
import { votingApi } from "../../lib/api";
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

const AdminVotersPage = () => {
  const { events, loading: eventsLoading } = useAdminEvents();
  const { toast } = useToast();

  const [tab, setTab]                           = useState<"registered" | "activity">("registered");
  const [selectedSlug, setSelectedSlug]         = useState("");
  const [activityVoters, setActivityVoters]     = useState<any[]>([]);
  const [registeredVoters, setRegisteredVoters] = useState<any[]>([]);
  const [loading, setLoading]                   = useState(false);
  const [search, setSearch]                     = useState("");
  const [selectedVoter, setSelectedVoter]       = useState<any>(null);
  const [detailOpen, setDetailOpen]             = useState(false);
  const [loadingDetail, setLoadingDetail]       = useState(false);

  useEffect(() => {
    if (!selectedSlug) return;
    setLoading(true);
    votingApi.getVoterActivity(selectedSlug)
      .then(data => setActivityVoters(data.results || data))
      .catch(err => toast({ title: "Error", description: err.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [selectedSlug]);

  useEffect(() => {
    if (tab !== "registered") return;
    loadRegisteredVoters();
  }, [tab]);

  const loadRegisteredVoters = (q = "") => {
    setLoading(true);
    fetch(`${API}/auth/voters/?search=${q}`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json())
      .then(data => setRegisteredVoters(data.results || []))
      .catch(() => toast({ title: "Failed to load voters", variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  const handleViewVoter = async (voterId: string) => {
    setDetailOpen(true);
    setLoadingDetail(true);
    try {
      const res  = await fetch(`${API}/auth/voters/${voterId}/`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      setSelectedVoter(data);
    } catch { toast({ title: "Failed to load voter details", variant: "destructive" }); }
    finally { setLoadingDetail(false); }
  };

  const handleToggleActive = async (voterId: string, current: boolean) => {
    try {
      await fetch(`${API}/auth/voters/${voterId}/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !current }),
      });
      toast({ title: current ? "Voter suspended" : "Voter activated ✅" });
      setRegisteredVoters(prev => prev.map(v => v.id === voterId ? { ...v, is_active: !current } : v));
      if (selectedVoter?.id === voterId) setSelectedVoter((v: any) => ({ ...v, is_active: !current }));
    } catch { toast({ title: "Failed to update voter", variant: "destructive" }); }
  };

  const filteredActivity = activityVoters.filter((v: any) =>
    (v.voter_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (v.voter_email || "").toLowerCase().includes(search.toLowerCase())
  );

  const flaggedCount = activityVoters.filter((v: any) => v.is_flagged).length;

  // ── Activity Tab: Event Picker ────────────────────────────────
  const ActivityEventPicker = () => (
    <div>
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">Select an event to view who voted</p>
      </div>
      {eventsLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : events.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted-foreground">
          <Activity className="w-12 h-12 mx-auto mb-4 opacity-30" />
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

  // ── Activity Tab: Voter List ──────────────────────────────────
  const ActivityVoterList = () => {
    const selectedEvent = events.find((e: any) => e.slug === selectedSlug);
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => { setSelectedSlug(""); setActivityVoters([]); }}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{selectedEvent?.title}</p>
            <p className="text-xs text-muted-foreground">{activityVoters.length} voters · {flaggedCount} flagged</p>
          </div>
        </div>

        {/* Summary pills */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { icon: UserCheck, label: "Voted",   value: activityVoters.length,  color: "text-secondary" },
            { icon: Flag,      label: "Flagged", value: flaggedCount,            color: "text-red-400" },
            { icon: Users,     label: "Total",   value: selectedEvent?.total_votes || 0, color: "text-muted-foreground" },
          ].map(s => (
            <div key={s.label} className="glass-card p-3 flex items-center gap-2">
              <s.icon className={`w-4 h-4 ${s.color} flex-shrink-0`} />
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="font-bold text-sm">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search voters..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          {loading ? (
            <div className="flex justify-center h-40 items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filteredActivity.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>No voting activity yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredActivity.map((v: any) => (
                <div key={v.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <div className="w-9 h-9 rounded-full bg-secondary/10 flex items-center justify-center text-sm font-bold text-secondary flex-shrink-0">
                    {(v.voter_name || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{v.voter_name || "Anonymous"}</p>
                    <p className="text-xs text-muted-foreground truncate">{v.voter_email || v.voter_phone || "—"}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-medium">{v.votes_cast} votes</p>
                    <p className="text-xs text-muted-foreground">
                      {parseFloat(v.total_paid) > 0 ? `GHS ${v.total_paid}` : "Free"}
                    </p>
                  </div>
                  {v.is_flagged ? (
                    <Badge className="bg-red-500/20 text-red-400 text-xs gap-1 flex-shrink-0">
                      <AlertTriangle className="w-3 h-3" /> Flagged
                    </Badge>
                  ) : (
                    <Badge className="bg-green-500/20 text-green-400 text-xs flex-shrink-0">Valid</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold">Voters</h1>
        <p className="text-sm text-muted-foreground">Manage registered voters and voting activity</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-border">
        {[
          { id: "registered", label: "Registered Voters", shortLabel: "Voters",   icon: Users },
          { id: "activity",   label: "Voting Activity",   shortLabel: "Activity", icon: Activity },
        ].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id as any); setSelectedSlug(""); }}
            className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id ? "border-secondary text-secondary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            <t.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{(t as any).shortLabel}</span>
          </button>
        ))}
      </div>

      {/* Registered Voters Tab */}
      {tab === "registered" && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by name, email or phone..."
                className="pl-9" value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && loadRegisteredVoters(search)} />
            </div>
            <Button variant="outline" size="sm" onClick={() => loadRegisteredVoters(search)} className="gap-1">
              <Search className="w-3.5 h-3.5" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setSearch(""); loadRegisteredVoters(); }} className="gap-1">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center h-40 items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : registeredVoters.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>No registered voters yet.</p>
              <p className="text-xs mt-1 opacity-60">Voters register when they verify their OTP.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground min-w-[120px]">Voter</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground min-w-[140px] hidden sm:table-cell">Contact</th>
                    <th className="text-center py-3 px-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Verified</th>
                    <th className="text-center py-3 px-2 text-xs font-medium text-muted-foreground min-w-[80px]">Status</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground hidden md:table-cell">Joined</th>
                    <th className="text-right py-3 px-2 text-xs font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {registeredVoters.map((v: any) => (
                    <tr key={v.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center text-xs font-bold text-secondary flex-shrink-0">
                            {(v.name || "?")[0].toUpperCase()}
                          </div>
                          <span className="text-sm font-medium">{v.name || "—"}</span>
                        </div>
                      </td>
                      <td className="py-3 px-2 hidden sm:table-cell">
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {v.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3" />{v.email}</div>}
                          {v.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{v.phone}</div>}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center hidden sm:table-cell">
                        {v.is_verified
                          ? <CheckCircle className="w-4 h-4 text-green-400 mx-auto" />
                          : <XCircle className="w-4 h-4 text-muted-foreground mx-auto" />}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <Badge className={v.is_active ? "bg-green-500/20 text-green-400 text-xs" : "bg-red-500/20 text-red-400 text-xs"}>
                          {v.is_active ? "Active" : "Suspended"}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-xs text-muted-foreground hidden md:table-cell">
                        {new Date(v.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="View Details"
                            onClick={() => handleViewVoter(v.id)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm"
                            className={`h-7 w-7 p-0 ${v.is_active ? "text-red-400" : "text-green-400"}`}
                            onClick={() => handleToggleActive(v.id, v.is_active)}>
                            {v.is_active ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Voting Activity Tab */}
      {tab === "activity" && (
        selectedSlug ? <ActivityVoterList /> : <ActivityEventPicker />
      )}

      {/* Voter Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Voter Details</DialogTitle></DialogHeader>
          {loadingDetail ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : selectedVoter ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center text-lg font-bold text-secondary">
                  {(selectedVoter.name || "?")[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-medium">{selectedVoter.name || "—"}</p>
                  <p className="text-xs text-muted-foreground">{selectedVoter.email}</p>
                  {selectedVoter.phone && <p className="text-xs text-muted-foreground">{selectedVoter.phone}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/30 text-center">
                  <p className="text-lg font-bold">{selectedVoter.vote_history?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Events Voted In</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 text-center">
                  <Badge className={selectedVoter.is_active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}>
                    {selectedVoter.is_active ? "Active" : "Suspended"}
                  </Badge>
                  <p className="text-xs text-muted-foreground mt-1">Account Status</p>
                </div>
              </div>
              {selectedVoter.vote_history?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Voting History</p>
                  <div className="space-y-2">
                    {selectedVoter.vote_history.map((h: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                        <div>
                          <p className="text-sm font-medium">{h.event_title}</p>
                          <p className="text-xs text-muted-foreground">{new Date(h.voted_at).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm">{h.votes_cast} votes</p>
                          {h.is_flagged && <Badge className="bg-red-500/20 text-red-400 text-xs">Flagged</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Button className="w-full" variant={selectedVoter.is_active ? "destructive" : "default"}
                onClick={() => handleToggleActive(selectedVoter.id, selectedVoter.is_active)}>
                {selectedVoter.is_active
                  ? <><ShieldOff className="w-4 h-4 mr-2" /> Suspend Voter</>
                  : <><Shield className="w-4 h-4 mr-2" /> Activate Voter</>}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminVotersPage;