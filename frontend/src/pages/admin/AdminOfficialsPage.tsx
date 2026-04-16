import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Plus, Trash2, Search, Loader2, CheckCircle2, XCircle,
  DollarSign, ArrowDownToLine, Clock, ChevronDown, AlertCircle,
  RefreshCw, Shield, Wallet, TrendingUp, Edit2, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { officialsApi, apiFetch } from "@/lib/api";

const fmt = (n: any, cur = "GHS") =>
  `${cur} ${Number(n || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdminOfficialsPage() {
  const { toast }                         = useToast();
  const [tab, setTab]                     = useState<"officials" | "withdrawals">("officials");
  const [officials, setOfficials]         = useState<any[]>([]);
  const [withdrawals, setWithdrawals]     = useState<any[]>([]);
  const [loading, setLoading]             = useState(false);
  const [wdLoading, setWdLoading]         = useState(false);
  const [showForm, setShowForm]           = useState(false);
  const [editTarget, setEditTarget]       = useState<any>(null);
  const [withdrawFilter, setWithdrawFilter] = useState("");
  const [events, setEvents]               = useState<any[]>([]);
  const [ticketEvents, setTicketEvents]   = useState<any[]>([]);

  const emptyForm = { name: "", phone: "", event_kind: "election", event: "", ticket_event: "", revenue_percentage: "0" };
  const [form, setForm]   = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (tab === "withdrawals") loadWithdrawals();
  }, [tab, withdrawFilter]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ofData, evData, teData] = await Promise.all([
        officialsApi.adminList(),
        apiFetch("/events/admin/"),
        apiFetch("/tickets/admin/events/"),
      ]);
      setOfficials(Array.isArray(ofData) ? ofData : []);
      setEvents(evData?.results || evData || []);
      setTicketEvents(Array.isArray(teData) ? teData : (teData?.results || []));
    } catch { toast({ title: "Failed to load data", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const loadWithdrawals = async () => {
    setWdLoading(true);
    try {
      const params: any = {};
      if (withdrawFilter) params.status = withdrawFilter;
      const data = await officialsApi.adminWithdrawals(params);
      setWithdrawals(Array.isArray(data) ? data : []);
    } catch { toast({ title: "Failed to load withdrawals", variant: "destructive" }); }
    finally { setWdLoading(false); }
  };

  const handleSave = async () => {
    if (!form.name || !form.phone) { toast({ title: "Name and phone are required.", variant: "destructive" }); return; }
    if (form.event_kind === "election"  && !form.event)        { toast({ title: "Select an election event.", variant: "destructive" }); return; }
    if (form.event_kind === "ticketing" && !form.ticket_event) { toast({ title: "Select a ticketing event.", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload: any = {
        name:               form.name,
        phone:              form.phone,
        event_kind:         form.event_kind,
        revenue_percentage: parseFloat(form.revenue_percentage) || 0,
      };
      if (form.event_kind === "election")  payload.event        = form.event;
      if (form.event_kind === "ticketing") payload.ticket_event = form.ticket_event;

      if (editTarget) {
        await officialsApi.adminUpdate(editTarget.id, payload);
        toast({ title: "Official updated ✅" });
      } else {
        await officialsApi.adminCreate(payload);
        toast({ title: "Official created ✅" });
      }
      setForm(emptyForm); setShowForm(false); setEditTarget(null);
      loadAll();
    } catch (e: any) { toast({ title: "Save failed", description: e?.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleEdit = (o: any) => {
    setForm({
      name:               o.name,
      phone:              o.phone,
      event_kind:         o.event_kind,
      event:              o.event || "",
      ticket_event:       o.ticket_event || "",
      revenue_percentage: String(o.revenue_percentage || 0),
    });
    setEditTarget(o);
    setShowForm(true);
  };

  const handleDelete = async (o: any) => {
    if (!confirm(`Delete official "${o.name}"? This cannot be undone.`)) return;
    try {
      await officialsApi.adminDelete(o.id);
      toast({ title: "Official removed" });
      loadAll();
    } catch (e: any) { toast({ title: "Delete failed", description: e?.message, variant: "destructive" }); }
  };

  const handleReviewWithdrawal = async (id: string, action: "approve" | "decline", admin_note = "") => {
    try {
      await officialsApi.adminReviewWithdrawal(id, action, admin_note);
      toast({ title: action === "approve" ? "Withdrawal approved ✅" : "Withdrawal declined" });
      loadWithdrawals();
    } catch (e: any) { toast({ title: "Action failed", description: e?.message, variant: "destructive" }); }
  };

  const pendingWithdrawals = withdrawals.filter(w => w.status === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">Officials</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage event officials and their withdrawal requests</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setEditTarget(null); setShowForm(true); }}
          className="gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90">
          <Plus className="w-4 h-4" /> Add Official
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
        {[{ key: "officials",   label: "Officials",    icon: Users  },
          { key: "withdrawals", label: `Withdrawals${pendingWithdrawals > 0 ? ` (${pendingWithdrawals})` : ""}`, icon: Wallet }]
        .map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key as any)}
            className={`flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              tab === key ? "bg-card text-foreground shadow-sm border border-border/40" : "text-muted-foreground hover:text-foreground"
            }`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Add/Edit form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden">
            <div className="bg-card border border-secondary/30 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-semibold flex items-center gap-2">
                  <Shield className="w-4 h-4 text-secondary" />
                  {editTarget ? "Edit Official" : "New Official"}
                </h3>
                <button onClick={() => { setShowForm(false); setEditTarget(null); setForm(emptyForm); }}
                  className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input placeholder="Full name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-10" />
                <Input placeholder="Phone *" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="h-10" />

                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1.5 block">Event type</label>
                  <div className="flex gap-3">
                    {[{ v: "election", l: "🗳️ Election/Voting" }, { v: "ticketing", l: "🎟️ Ticketing" }].map(({ v, l }) => (
                      <label key={v} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="event_kind" value={v} checked={form.event_kind === v}
                          onChange={() => setForm(f => ({ ...f, event_kind: v, event: "", ticket_event: "" }))} />
                        <span className="text-sm">{l}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {form.event_kind === "election" && (
                  <div className="sm:col-span-2">
                    <label className="text-xs text-muted-foreground mb-1.5 block">Select election event *</label>
                    <select value={form.event} onChange={e => setForm(f => ({ ...f, event: e.target.value }))}
                      className="w-full h-10 px-3 text-sm rounded-md border border-input bg-background text-foreground">
                      <option value="">— Select event —</option>
                      {events.map((e: any) => <option key={e.id} value={e.id}>{e.title}</option>)}
                    </select>
                  </div>
                )}

                {form.event_kind === "ticketing" && (
                  <div className="sm:col-span-2">
                    <label className="text-xs text-muted-foreground mb-1.5 block">Select ticket event *</label>
                    <select value={form.ticket_event} onChange={e => setForm(f => ({ ...f, ticket_event: e.target.value }))}
                      className="w-full h-10 px-3 text-sm rounded-md border border-input bg-background text-foreground">
                      <option value="">— Select event —</option>
                      {ticketEvents.map((e: any) => <option key={e.id} value={e.id}>{e.title}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Revenue percentage (%)</label>
                  <Input type="number" min={0} max={100} step={0.5} placeholder="0"
                    value={form.revenue_percentage}
                    onChange={e => setForm(f => ({ ...f, revenue_percentage: e.target.value }))}
                    className="h-10" />
                  <p className="text-xs text-muted-foreground mt-1">Set 0 if no revenue share applies</p>
                </div>
              </div>

              <div className="flex gap-3 mt-5">
                <Button onClick={handleSave} disabled={saving}
                  className="bg-secondary text-secondary-foreground hover:bg-secondary/90 gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {editTarget ? "Save Changes" : "Create Official"}
                </Button>
                <Button variant="outline" onClick={() => { setShowForm(false); setEditTarget(null); setForm(emptyForm); }}>Cancel</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Officials list */}
      {tab === "officials" && (
        loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>
        ) : officials.length === 0 ? (
          <div className="bg-card border border-border/40 rounded-2xl p-16 text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="font-medium mb-1">No officials yet</p>
            <p className="text-sm">Add an official using the button above.</p>
          </div>
        ) : (
          <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
            <div className="divide-y divide-border/20">
              {officials.map((o: any) => (
                <div key={o.id} className="flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-secondary/10 border border-secondary/20 flex items-center justify-center text-sm font-bold text-secondary flex-shrink-0">
                      {o.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{o.name}</p>
                      <p className="text-xs text-muted-foreground">{o.phone}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-xs">{o.event_title}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden sm:block text-right">
                      <p className="text-xs text-muted-foreground">{o.event_kind === "ticketing" ? "🎟️ Ticketing" : "🗳️ Election"}</p>
                      {o.revenue_percentage > 0 && (
                        <p className="text-xs font-medium text-secondary">{o.revenue_percentage}% · Balance: {fmt(o.current_balance)}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(o)} className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(o)} className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* Withdrawals */}
      {tab === "withdrawals" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select value={withdrawFilter} onChange={e => setWithdrawFilter(e.target.value)}
              className="h-9 px-3 text-sm rounded-md border border-input bg-background text-foreground">
              <option value="">All requests</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="declined">Declined</option>
            </select>
            <Button size="sm" variant="outline" onClick={loadWithdrawals} className="h-9 gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>

          {wdLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>
          ) : withdrawals.length === 0 ? (
            <div className="bg-card border border-border/40 rounded-2xl p-16 text-center text-muted-foreground">
              <Wallet className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="font-medium">No withdrawal requests</p>
            </div>
          ) : (
            <div className="space-y-3">
              {withdrawals.map((w: any) => (
                <WithdrawalCard key={w.id} w={w} onReview={handleReviewWithdrawal} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Withdrawal card ───────────────────────────────────────────────────────────
function WithdrawalCard({ w, onReview }: { w: any; onReview: (id: string, action: "approve" | "decline", note?: string) => void }) {
  const [adminNote, setAdminNote] = useState("");
  const [expanded, setExpanded]   = useState(w.status === "pending");

  return (
    <div className={`bg-card border rounded-2xl overflow-hidden ${
      w.status === "pending" ? "border-yellow-500/30" : "border-border/40"
    }`}>
      <div className="flex items-center justify-between px-5 py-4 cursor-pointer" onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center gap-4">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
            w.status === "approved" ? "bg-green-500/10" : w.status === "declined" ? "bg-red-500/10" : "bg-yellow-500/10"
          }`}>
            {w.status === "approved" ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
             w.status === "declined" ? <XCircle className="w-4 h-4 text-red-400" /> :
             <Clock className="w-4 h-4 text-yellow-400" />}
          </div>
          <div>
            <p className="font-semibold text-sm">{w.official_name} — {fmt(w.amount)}</p>
            <p className="text-xs text-muted-foreground">{w.event_title} · {new Date(w.created_at).toLocaleDateString()}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
            w.status === "approved" ? "bg-green-500/10 text-green-400 border-green-500/20" :
            w.status === "declined" ? "bg-red-500/10 text-red-400 border-red-500/20" :
            "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
          }`}>{w.status}</span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden">
            <div className="px-5 pb-5 pt-0 border-t border-border/20 space-y-4">
              <div className="grid grid-cols-2 gap-3 pt-4">
                <div>
                  <p className="text-xs text-muted-foreground">Official</p>
                  <p className="text-sm font-medium">{w.official_name}</p>
                  <p className="text-xs text-muted-foreground">{w.official_phone}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Amount requested</p>
                  <p className="text-sm font-bold text-secondary">{fmt(w.amount)}</p>
                </div>
                {w.official_balance != null && (
                  <div>
                    <p className="text-xs text-muted-foreground">Available balance</p>
                    <p className={`text-sm font-semibold ${parseFloat(w.official_balance) >= parseFloat(w.amount) ? "text-green-400" : "text-red-400"}`}>
                      {fmt(w.official_balance)}
                      {parseFloat(w.official_balance) < parseFloat(w.amount) && (
                        <span className="text-xs font-normal text-red-400 ml-1">(insufficient)</span>
                      )}
                    </p>
                  </div>
                )}
                {/* Payment details */}
                {w.payment_method && (
                  <div className="col-span-2 bg-muted/30 rounded-xl p-3 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payment Details</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Method</span>
                      <span className="font-medium">{
                        w.payment_method === 'mtn_momo' ? 'MTN Mobile Money' :
                        w.payment_method === 'telecel' ? 'Telecel Cash' :
                        w.payment_method === 'at_money' ? 'AirtelTigo Money' :
                        w.payment_method === 'bank' ? 'Bank Transfer' : w.payment_method
                      }</span>
                    </div>
                    {w.payment_account_name && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Account name</span>
                        <span className="font-medium">{w.payment_account_name}</span>
                      </div>
                    )}
                    {w.payment_account_number && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Account number</span>
                        <span className="font-mono font-semibold text-secondary">{w.payment_account_number}</span>
                      </div>
                    )}
                  </div>
                )}
                {w.note && <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Official's note</p>
                  <p className="text-sm italic">{w.note}</p>
                </div>}
                {w.admin_note && <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Admin note</p>
                  <p className="text-sm">{w.admin_note}</p>
                </div>}
                {w.reviewed_by_name && <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Reviewed by {w.reviewed_by_name} · {w.reviewed_at ? new Date(w.reviewed_at).toLocaleString() : ""}</p>
                </div>}
              </div>

              {w.status === "pending" && (
                <div className="space-y-3">
                  <Input placeholder="Admin note (optional)" value={adminNote} onChange={e => setAdminNote(e.target.value)} className="h-9 text-sm" />
                  <div className="flex gap-3">
                    <Button onClick={() => onReview(w.id, "approve", adminNote)}
                      className="flex-1 bg-green-500 hover:bg-green-600 text-white gap-2 h-10">
                      <CheckCircle2 className="w-4 h-4" /> Approve
                    </Button>
                    <Button variant="outline" onClick={() => onReview(w.id, "decline", adminNote)}
                      className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 gap-2 h-10">
                      <XCircle className="w-4 h-4" /> Decline
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
