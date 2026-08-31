import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, X, CheckCircle2, XCircle, Edit2, Hash, Tag, Phone,
  User, MessageSquare, ImageIcon, ChevronRight, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";

export type NominationCategory = { id: string; name: string };
export type Nomination = {
  id: string;
  event_title?: string;
  event_slug?: string;
  category: NominationCategory;
  full_name: string;
  stage_name: string;
  phone: string;
  photo: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  rejection_reason?: string;
  candidate_code?: string;
  created_at: string;
};

const statusColor: Record<string, string> = {
  pending:  "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  approved: "bg-green-500/10 text-green-500 border-green-500/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

interface Props {
  nominations: Nomination[];
  loading: boolean;
  categories: NominationCategory[];
  statusFilter: string;
  onStatusFilterChange: (s: string) => void;
  onEdit: (id: string, data: Record<string, any>) => Promise<void>;
  onAction: (id: string, action: "approve" | "reject", rejectionReason?: string) => Promise<void>;
  emptyLabel?: string;
}

export function NominationReviewList({
  nominations, loading, categories, statusFilter, onStatusFilterChange,
  onEdit, onAction, emptyLabel = "No nominations yet.",
}: Props) {
  const { toast } = useToast();
  const { ask: confirm, dialog: confirmDialog } = useConfirm();
  const [selected, setSelected] = useState<Nomination | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: "", stage_name: "", phone: "", reason: "", category_id: "" });
  const [saving, setSaving] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [actioning, setActioning] = useState(false);

  const openReview = (nom: Nomination) => {
    setSelected(nom);
    setEditing(false);
    setShowRejectBox(false);
    setRejectReason("");
    setForm({
      full_name: nom.full_name, stage_name: nom.stage_name, phone: nom.phone,
      reason: nom.reason || "", category_id: nom.category.id,
    });
  };

  const saveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await onEdit(selected.id, form);
      toast({ title: "Nomination updated ✅" });
      setEditing(false);
      setSelected(prev => prev ? {
        ...prev, full_name: form.full_name, stage_name: form.stage_name,
        phone: form.phone, reason: form.reason,
        category: categories.find(c => c.id === form.category_id) || prev.category,
      } : prev);
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const approve = async () => {
    if (!selected) return;
    const ok = await confirm(
      `Approve ${selected.stage_name}?`,
      "This creates them as an official contestant with a unique 4-character code and notifies them by SMS.",
      "Approve"
    );
    if (!ok) return;
    setActioning(true);
    try {
      await onAction(selected.id, "approve");
      toast({ title: "Nomination approved ✅", description: "Contestant created and SMS sent." });
      setSelected(null);
    } catch (e: any) {
      toast({ title: "Approval failed", description: e.message, variant: "destructive" });
    } finally { setActioning(false); }
  };

  const reject = async () => {
    if (!selected) return;
    setActioning(true);
    try {
      await onAction(selected.id, "reject", rejectReason);
      toast({ title: "Nomination rejected" });
      setSelected(null);
    } catch (e: any) {
      toast({ title: "Rejection failed", description: e.message, variant: "destructive" });
    } finally { setActioning(false); }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {["pending", "approved", "rejected", ""].map(s => (
          <button key={s || "all"} onClick={() => onStatusFilterChange(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${
              statusFilter === s ? "bg-secondary text-secondary-foreground border-secondary" : "border-border text-muted-foreground hover:border-secondary/40"
            }`}>
            {s || "All"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : nominations.length === 0 ? (
        <div className="glass-card p-12 text-center text-muted-foreground">
          <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-30" /><p>{emptyLabel}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {nominations.map(nom => (
            <button key={nom.id} onClick={() => openReview(nom)}
              className="w-full glass-card p-4 flex items-center gap-3 hover:border-secondary/40 transition-all text-left group">
              {nom.photo
                ? <img src={nom.photo} className="w-11 h-11 rounded-xl object-cover flex-shrink-0 ring-2 ring-border/30" />
                : <div className="w-11 h-11 rounded-xl bg-secondary/10 flex items-center justify-center text-sm font-bold text-secondary flex-shrink-0">{nom.stage_name[0]}</div>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium truncate">{nom.stage_name}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border capitalize ${statusColor[nom.status]}`}>{nom.status}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{nom.category.name} {nom.event_title ? `· ${nom.event_title}` : ""}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-secondary flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {confirmDialog}

      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selected.stage_name}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border capitalize ${statusColor[selected.status]}`}>{selected.status}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {selected.photo && (
                  <div className="flex justify-center">
                    <img src={selected.photo} className="w-24 h-24 rounded-2xl object-cover ring-2 ring-border/30" />
                  </div>
                )}

                {!editing ? (
                  <div className="space-y-2 text-sm">
                    <Row icon={User} label="Full Name" value={selected.full_name} />
                    <Row icon={Sparkles} label="Stage Name" value={selected.stage_name} />
                    <Row icon={Phone} label="Phone" value={selected.phone} />
                    <Row icon={Tag} label="Category" value={selected.category.name} />
                    <Row icon={MessageSquare} label="Reason" value={selected.reason || "-"} />
                    {selected.candidate_code && <Row icon={Hash} label="Contestant Code" value={selected.candidate_code} />}
                    {selected.rejection_reason && <Row icon={XCircle} label="Rejection Reason" value={selected.rejection_reason} />}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div><label className="text-xs font-medium mb-1 block">Full Name</label>
                      <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} /></div>
                    <div><label className="text-xs font-medium mb-1 block">Stage Name</label>
                      <Input value={form.stage_name} onChange={e => setForm(f => ({ ...f, stage_name: e.target.value }))} /></div>
                    <div><label className="text-xs font-medium mb-1 block">Phone</label>
                      <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">Category</label>
                      <div className="flex flex-wrap gap-2">
                        {categories.map(cat => (
                          <button key={cat.id} onClick={() => setForm(f => ({ ...f, category_id: cat.id }))}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                              form.category_id === cat.id ? "bg-secondary/10 border-secondary/40 text-secondary" : "border-border text-muted-foreground hover:border-secondary/30"
                            }`}>{cat.name}</button>
                        ))}
                      </div>
                    </div>
                    <div><label className="text-xs font-medium mb-1 block">Reason</label>
                      <Textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={3} /></div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setEditing(false)}>Cancel</Button>
                      <Button className="flex-1" onClick={saveEdit} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
                      </Button>
                    </div>
                  </div>
                )}

                {selected.status === "pending" && !editing && (
                  <div className="space-y-2 pt-2 border-t border-border/50">
                    {!showRejectBox ? (
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1 gap-1.5" onClick={() => setEditing(true)}>
                          <Edit2 className="w-3.5 h-3.5" /> Edit
                        </Button>
                        <Button variant="outline" className="flex-1 gap-1.5 text-destructive hover:bg-destructive/10" onClick={() => setShowRejectBox(true)}>
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </Button>
                        <Button className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700 text-white" onClick={approve} disabled={actioning}>
                          {actioning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCircle2 className="w-3.5 h-3.5" /> Approve</>}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Textarea placeholder="Reason for rejection (optional)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2} />
                        <div className="flex gap-2">
                          <Button variant="outline" className="flex-1" onClick={() => setShowRejectBox(false)}>Cancel</Button>
                          <Button className="flex-1 bg-destructive hover:bg-destructive/90 text-white" onClick={reject} disabled={actioning}>
                            {actioning ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Reject"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5 border-b border-border/40 last:border-0">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="font-medium break-words">{value}</p>
      </div>
    </div>
  );
}
