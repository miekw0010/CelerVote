import { useState } from "react";
import { Bell, Send, Loader2, CheckCircle2, ArrowLeft, ChevronRight, Mail, Users, Trophy, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminEvents } from "../../hooks/useApi";
import { notificationsApi } from "../../lib/api";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";

const eventStatusColor: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  ended:  "bg-muted text-muted-foreground",
  draft:  "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  paused: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

const eventTypeIcon: Record<string, string> = {
  election: "🗳️", contest: "🏆", survey: "📊", live_show: "📺",
};

const AdminNotificationsPage = () => {
  const { events, loading: eventsLoading } = useAdminEvents();
  const { toast }                          = useToast();
  const [selectedSlug, setSelectedSlug]   = useState("");
  const [publishing, setPublishing]       = useState(false);
  const [reminding, setReminding]         = useState(false);
  const [customMsg, setCustomMsg]         = useState("");
  const [sendingCustom, setSendingCustom] = useState(false);
  const [sentActions, setSentActions]     = useState<string[]>([]);

  const selectedEvent = events.find((e: any) => e.slug === selectedSlug);

  const markSent = (action: string) => setSentActions(p => [...p, `${selectedSlug}:${action}`]);
  const wasSent  = (action: string) => sentActions.includes(`${selectedSlug}:${action}`);

  const handlePublish = async () => {
    if (!selectedSlug) return;
    try {
      setPublishing(true);
      await notificationsApi.publishResults(selectedSlug);
      markSent("publish");
      toast({ title: "Results published! 🎉", description: "All voters have been notified by email." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setPublishing(false); }
  };

  const handleRemind = async () => {
    if (!selectedSlug) return;
    try {
      setReminding(true);
      await notificationsApi.sendReminder(selectedSlug);
      markSent("remind");
      toast({ title: "Reminders sent! 📩", description: "All registered voters have been reminded." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setReminding(false); }
  };

  const handleCustomMessage = async () => {
    if (!selectedSlug || !customMsg.trim()) return;
    try {
      setSendingCustom(true);
      await fetch(`${API}/notifications/custom/${selectedSlug}/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: customMsg }),
      });
      setCustomMsg("");
      toast({ title: "Message sent! 📨", description: "Your custom message was sent to all voters." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setSendingCustom(false); }
  };

  // ── View: Event List ──────────────────────────────────────────
  if (!selectedSlug) return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold">Notifications</h1>
        <p className="text-sm text-muted-foreground">Select an event to manage notifications</p>
      </div>

      {eventsLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : events.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted-foreground">
          <Bell className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>No events yet. Create one first!</p>
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
                  {event.results_visible && (
                    <Badge className="text-xs bg-green-500/10 text-green-400">Results Published</Badge>
                  )}
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

  // ── View: Notification Actions ────────────────────────────────
  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => setSelectedSlug("")}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-display font-bold truncate">{selectedEvent?.title}</h1>
          <p className="text-xs text-muted-foreground">Notification Center</p>
        </div>
        <Badge className={`text-xs ${eventStatusColor[selectedEvent?.status] || "bg-muted"}`}>
          {selectedEvent?.status}
        </Badge>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {[
          { icon: Users,  label: "Total Votes",    value: selectedEvent?.total_votes || 0 },
          { icon: Trophy, label: "Results",         value: selectedEvent?.results_visible ? "Published" : "Hidden" },
          { icon: Clock,  label: "Status",          value: selectedEvent?.status || "—" },
        ].map(stat => (
          <div key={stat.label} className="glass-card p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
              <stat.icon className="w-4 h-4 text-secondary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="font-semibold text-sm capitalize">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4">

        {/* Publish Results */}
<div className="glass-card p-5">
  <div className="flex items-start gap-4">
    <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
      <Trophy className="w-5 h-5 text-secondary" />
    </div>
    <div className="flex-1">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-display font-semibold">Publish Results</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selectedEvent?.results_visible
              ? "Results are live. You can re-notify all voters."
              : "Make results public and notify all voters by email."}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {selectedEvent?.results_visible && (
            <Button onClick={handlePublish} disabled={publishing} variant="outline" className="gap-2">
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
              Re-notify Voters
            </Button>
          )}
          <Button onClick={handlePublish}
            disabled={publishing || (selectedEvent?.results_visible && wasSent("publish"))}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/90 gap-2">
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {selectedEvent?.results_visible ? "Published ✅" : "Publish Now"}
          </Button>
        </div>
      </div>
      {selectedEvent?.results_visible && (
        <div className="mt-3 flex items-center gap-2 text-xs text-green-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Results are live and visible to voters
        </div>
      )}
    </div>
  </div>
</div>

        {/* Send Reminder */}
        <div className="glass-card p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5 text-secondary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="font-display font-semibold">Send Voting Reminder</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Remind registered voters to cast their votes before the deadline.
                  </p>
                </div>
                <Button onClick={handleRemind} disabled={reminding || wasSent("remind")}
                  variant="outline" className="gap-2 flex-shrink-0">
                  {reminding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {wasSent("remind") ? "Sent ✅" : "Send Reminder"}
                </Button>
              </div>
              {wasSent("remind") && (
                <div className="mt-3 flex items-center gap-2 text-xs text-green-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Reminders sent successfully this session
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Custom Message */}
        <div className="glass-card p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-secondary" />
            </div>
            <div className="flex-1">
              <h3 className="font-display font-semibold mb-1">Custom Message</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Send a custom announcement to all voters of this event.
              </p>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-secondary mb-2"
                placeholder="Type your message here... (e.g. 'Voting closes in 2 hours!')"
                value={customMsg}
                onChange={e => setCustomMsg(e.target.value)}
              />
              <Button onClick={handleCustomMessage} disabled={sendingCustom || !customMsg.trim()}
                variant="outline" className="gap-2">
                {sendingCustom ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Message
              </Button>
            </div>
          </div>
        </div>

        
      </div>
    </div>
  );
};

export default AdminNotificationsPage;