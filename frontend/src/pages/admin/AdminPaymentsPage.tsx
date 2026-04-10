import { useState, useEffect } from "react";
import {
  CreditCard, Loader2, TrendingUp, ArrowLeft, ChevronRight,
  AlertTriangle, CheckCircle2, Search, RefreshCw, X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminEvents } from "../../hooks/useApi";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "../../lib/api";

const statusColor: Record<string, string> = {
  success:  "bg-green-500/20 text-green-400",
  pending:  "bg-yellow-500/20 text-yellow-400",
  failed:   "bg-red-500/20 text-red-400",
  refunded: "bg-blue-500/20 text-blue-400",
};

const eventStatusColor: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  ended:  "bg-muted text-muted-foreground",
  draft:  "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  paused: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

// ── Recovery Modal ────────────────────────────────────────────────────────────
const RecoveryModal = ({ info, event, onClose, onSuccess }: any) => {
  const { toast } = useToast();
  const [categoryId,  setCategoryId]  = useState(info.saved_category_id  || "");
  const [candidateId, setCandidateId] = useState(info.saved_candidate_id || "");
  const [loading,     setLoading]     = useState(false);

  const categories  = event?.categories || [];
  const candidates  = categories.find((c: any) => c.id === categoryId)?.candidates || [];

  const handleRecover = async () => {
    if (!categoryId || !candidateId) {
      toast({ title: "Select category and candidate", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/voting/recover-vote/", {
        method: "POST",
        body: JSON.stringify({
          reference:    info.reference,
          event_slug:   event.slug,
          category_id:  categoryId,
          candidate_id: candidateId,
        }),
      });
      toast({ title: res.status === "already_cast" ? "Already recovered" : "Votes recovered! ✅", description: res.message });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Recovery failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-card w-full max-w-md p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display font-bold text-lg">Recover Votes</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Manually cast votes for a verified payment</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Payment info */}
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Reference</span>
            <span className="font-mono text-xs">{info.reference}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Voter</span>
            <span>{info.voter_email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Amount paid</span>
            <span className="text-green-400 font-semibold">{info.currency} {info.amount_paid?.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Votes to cast</span>
            <span className="font-bold text-secondary">{info.quantity || "auto"}</span>
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Category</label>
          <select
            value={categoryId}
            onChange={e => { setCategoryId(e.target.value); setCandidateId(""); }}
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
          >
            <option value="">Select category...</option>
            {categories.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Candidate */}
        <div>
          <label className="text-xs text-muted-foreground mb-1.5 block">Candidate they voted for</label>
          <select
            value={candidateId}
            onChange={e => setCandidateId(e.target.value)}
            disabled={!categoryId}
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-secondary disabled:opacity-50"
          >
            <option value="">Select candidate...</option>
            {candidates.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <Button
          onClick={handleRecover}
          disabled={loading || !categoryId || !candidateId}
          className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90"
        >
          {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Recovering...</> : "Cast Missing Votes"}
        </Button>
      </div>
    </div>
  );
};

// ── Check Reference Panel ─────────────────────────────────────────────────────
const CheckReference = ({ event }: { event: any }) => {
  const { toast }                       = useToast();
  const [ref,       setRef]             = useState("");
  const [result,    setResult]          = useState<any>(null);
  const [loading,   setLoading]         = useState(false);
  const [showModal, setShowModal]       = useState(false);

  const handleCheck = async () => {
    if (!ref.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await apiFetch(`/voting/check-reference/?reference=${encodeURIComponent(ref.trim())}`);
      setResult(res);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card p-5 space-y-4">
      <div>
        <h3 className="font-semibold mb-1 flex items-center gap-2">
          <Search className="w-4 h-4 text-secondary" /> Check Payment Reference
        </h3>
        <p className="text-xs text-muted-foreground">Paste a Paystack reference to see if payment went through and votes were cast.</p>
      </div>

      <div className="flex gap-2">
        <input
          value={ref}
          onChange={e => setRef(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleCheck()}
          placeholder="e.g. ps_ref_abc123..."
          className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
        />
        <Button onClick={handleCheck} disabled={loading || !ref.trim()} size="sm" className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Check"}
        </Button>
      </div>

      {result && (
        <div className={`rounded-xl border p-4 space-y-2 text-sm ${
          result.needs_recovery
            ? "bg-red-500/10 border-red-500/20"
            : result.paystack_status === "success"
              ? "bg-green-500/10 border-green-500/20"
              : "bg-muted border-border"
        }`}>
          <div className="flex items-center justify-between">
            <span className="font-semibold">
              {result.needs_recovery
                ? "⚠️ Payment succeeded but votes NOT cast"
                : result.paystack_status === "success" && result.votes_cast > 0
                  ? "✅ Payment verified & votes cast"
                  : "❌ Payment not successful"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
            <span className="text-muted-foreground">Paystack status</span>
            <span className="font-medium capitalize">{result.paystack_status || "—"}</span>
            <span className="text-muted-foreground">Amount paid</span>
            <span className="font-medium">{result.currency} {result.amount_paid?.toFixed(2)}</span>
            <span className="text-muted-foreground">Voter email</span>
            <span className="font-medium">{result.voter_email || "—"}</span>
            <span className="text-muted-foreground">Votes cast</span>
            <span className={`font-bold ${result.votes_cast > 0 ? "text-green-400" : "text-red-400"}`}>
              {result.votes_cast}
            </span>
            <span className="text-muted-foreground">Paid at</span>
            <span>{result.paid_at ? new Date(result.paid_at).toLocaleString() : "—"}</span>
          </div>

          {result.needs_recovery && (
            <Button
              onClick={() => setShowModal(true)}
              size="sm"
              className="w-full mt-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-2" /> Recover Missing Votes
            </Button>
          )}
        </div>
      )}

      {showModal && result && (
        <RecoveryModal
          info={{ ...result, reference: ref }}
          event={event}
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); setResult(null); setRef(""); }}
        />
      )}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const AdminPaymentsPage = () => {
  const { events, loading: eventsLoading } = useAdminEvents();
  const { toast }                          = useToast();
  const [selectedSlug, setSelectedSlug]    = useState("");
  const [payments,     setPayments]        = useState<any[]>([]);
  const [stats,        setStats]           = useState<any>(null);
  const [loading,      setLoading]         = useState(false);
  const [tab,          setTab]             = useState<"transactions" | "recover">("transactions");
  const [fullEvent,    setFullEvent]        = useState<any>(null);
  const [eventLoading, setEventLoading]    = useState(false);

  const selectedEvent = events.find((e: any) => e.slug === selectedSlug);
  const paidEvents    = events.filter((e: any) => e.is_paid);

  useEffect(() => {
    if (!selectedSlug) return;

    // Fetch payments
    setLoading(true);
    apiFetch(`/payments/admin/${selectedSlug}/`)
      .then(data => { setPayments(data.payments || []); setStats(data.stats || {}); })
      .catch(err => toast({ title: "Error", description: err.message, variant: "destructive" }))
      .finally(() => setLoading(false));

    // Fetch full event with categories for recovery tool
    setEventLoading(true);
    apiFetch(`/events/${selectedSlug}/`, {}, false)
      .then(data => setFullEvent(data))
      .catch(console.error)
      .finally(() => setEventLoading(false));

  }, [selectedSlug]);

  // ── View: Event List ────────────────────────────────────────────────────────
  if (!selectedSlug) return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold">Payments</h1>
        <p className="text-sm text-muted-foreground">Select a paid event to view transactions</p>
      </div>

      {eventsLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : paidEvents.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted-foreground">
          <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="mb-2">No paid events yet.</p>
          <p className="text-xs">Create a pay-per-vote event to start tracking payments.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {paidEvents.map((event: any) => (
            <button key={event.id} onClick={() => setSelectedSlug(event.slug)}
              className="glass-card p-4 flex items-center gap-4 hover:border-secondary/40 transition-all text-left group">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                {event.banner_image ? (
                  <img src={event.banner_image} alt={event.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-muted-foreground opacity-40" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-medium truncate">{event.title}</span>
                  <Badge className={`text-xs ${eventStatusColor[event.status] || "bg-muted"}`}>{event.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {event.currency} {event.price_per_vote}/vote · {event.total_votes || 0} votes
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-secondary">
                  {event.currency} {((event.total_votes || 0) * parseFloat(event.price_per_vote || 0)).toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">est. revenue</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-secondary transition-colors flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // ── View: Event Detail ──────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => { setSelectedSlug(""); setPayments([]); setStats(null); setTab("transactions"); setFullEvent(null); }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-display font-bold truncate">{selectedEvent?.title}</h1>
          <p className="text-xs text-muted-foreground">{selectedEvent?.currency} {selectedEvent?.price_per_vote}/vote</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { icon: TrendingUp,    label: "Total Revenue",  value: `${selectedEvent?.currency} ${parseFloat(stats.total_revenue || 0).toFixed(2)}` },
            { icon: CreditCard,    label: "Transactions",   value: stats.total_transactions || 0 },
            { icon: CheckCircle2,  label: "Successful",     value: payments.filter((p: any) => p.status === "success").length },
            { icon: AlertTriangle, label: "Needs Attention", value: payments.filter((p: any) => p.status !== "success").length },
          ].map(stat => (
            <div key={stat.label} className="glass-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className="w-4 h-4 text-secondary" />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <p className="text-xl font-display font-bold">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl mb-5 w-fit">
        {(["transactions", "recover"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
              tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t === "recover" ? "⚠️ Recover Votes" : "Transactions"}
          </button>
        ))}
      </div>

      {/* Transactions Tab */}
      {tab === "transactions" && (
        <div className="glass-card p-5">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>No payments yet for this event.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground min-w-[100px]">Reference</th>
                    <th className="text-left py-3 px-2 text-xs font-medium text-muted-foreground min-w-[120px] hidden sm:table-cell">Email</th>
                    <th className="text-right py-3 px-2 text-xs font-medium text-muted-foreground min-w-[80px]">Amount</th>
                    <th className="text-right py-3 px-2 text-xs font-medium text-muted-foreground min-w-[60px]">Votes</th>
                    <th className="text-right py-3 px-2 text-xs font-medium text-muted-foreground min-w-[80px]">Status</th>
                    <th className="text-right py-3 px-2 text-xs font-medium text-muted-foreground min-w-[80px] hidden sm:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p: any) => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-2 text-xs font-mono text-muted-foreground">{p.reference}</td>
                      <td className="py-3 px-2 text-sm hidden sm:table-cell">{p.email}</td>
                      <td className="py-3 px-2 text-sm text-right font-medium">{selectedEvent?.currency} {p.amount}</td>
                      <td className="py-3 px-2 text-sm text-right">{p.votes_bought}</td>
                      <td className="py-3 px-2 text-right">
                        <Badge className={`text-xs ${statusColor[p.status] || "bg-muted"}`}>{p.status}</Badge>
                      </td>
                      <td className="py-3 px-2 text-xs text-muted-foreground text-right hidden sm:table-cell">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Recover Tab */}
      {tab === "recover" && (
        <div className="space-y-4">
          <div className="glass-card p-4 border-yellow-500/20 bg-yellow-500/5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-yellow-400 mb-1">Vote Recovery Tool</p>
              <p className="text-muted-foreground text-xs">
                If a voter's payment went through on Paystack but their votes weren't counted,
                paste their Paystack reference below. The system will verify the payment and let you cast the missing votes.
              </p>
            </div>
          </div>
          {eventLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <CheckReference event={fullEvent} />
          )}
        </div>
      )}
    </div>
  );
};

export default AdminPaymentsPage;