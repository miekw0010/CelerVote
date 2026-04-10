import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Upload, Plus, Trash2, Send, Search, RefreshCw,
  Loader2, CheckCircle2, XCircle, Shield, Download, ChevronDown,
  UserPlus, FileText, Phone, Hash, Tag, Filter, Eye, EyeOff
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmDialog";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";

const token = () => localStorage.getItem("access_token");

// ── Types ─────────────────────────────────────────────────────────────────────
interface VoterGroup { id: string; name: string; description: string; voter_count: number; }
interface Voter {
  id: string; voter_id: string; name: string; phone: string; email: string;
  voting_code: string; status: "unused" | "used"; sms_sent: boolean;
  group: { id: string; name: string } | null; used_at: string | null; created_at: string;
}
interface RollStats { total: number; used: number; unused: number; voters: Voter[]; }
interface Event { slug: string; title: string; voting_mode: string; }

// ── Group Manager ─────────────────────────────────────────────────────────────
const GroupManager = ({ slug, groups, onRefresh }: { slug: string; groups: VoterGroup[]; onRefresh: () => void }) => {
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const createGroup = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/events/admin/${slug}/groups/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create group");
      toast({ title: `Group "${newName}" created ✅` });
      setNewName("");
      onRefresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const deleteGroup = async (g: VoterGroup) => {
    const ok = await confirm(
      `Delete group "${g.name}"?`,
      "Voters in this group will become ungrouped. Their codes will still work.",
      "Delete Group"
    );
    if (!ok) return;
    try {
      await fetch(`${API}/events/admin/${slug}/groups/${g.id}/`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token()}` },
      });
      toast({ title: `Group "${g.name}" deleted` });
      onRefresh();
    } catch {
      toast({ title: "Error deleting group", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Group name (e.g. Level 100, Finance Dept)"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && createGroup()}
          className="flex-1"
        />
        <Button onClick={createGroup} disabled={loading || !newName.trim()} size="sm" className="bg-secondary text-secondary-foreground">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>
      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">No groups yet. Add groups if voters belong to sub-groups (optional).</p>
      ) : (
        <div className="space-y-2">
          {groups.map(g => (
            <div key={g.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-muted/30">
              <div>
                <p className="text-sm font-medium">{g.name}</p>
                <p className="text-xs text-muted-foreground">{g.voter_count} voter{g.voter_count !== 1 ? "s" : ""}</p>
              </div>
              <button onClick={() => deleteGroup(g)} className="text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Manual Add Voter ──────────────────────────────────────────────────────────
const AddVoterForm = ({ slug, groups, onAdded }: { slug: string; groups: VoterGroup[]; onAdded: () => void }) => {
  const [form, setForm] = useState({ voter_id: "", name: "", phone: "", email: "", group_id: "" });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const submit = async () => {
    if (!form.voter_id.trim()) {
      toast({ title: "Voter ID is required", variant: "destructive" }); return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/events/admin/${slug}/voter-roll/add/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add voter");
      toast({
        title: `Voter added! Code: ${data.voting_code}`,
        description: data.sms_sent ? `SMS sent to ${form.phone}` : form.phone ? "SMS delivery pending" : "No phone — code shown in voter list",
      });
      setForm({ voter_id: "", name: "", phone: "", email: "", group_id: "" });
      onAdded();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium mb-1 block">Voter / Student ID *</label>
          <Input placeholder="e.g. STU2024001" value={form.voter_id}
            onChange={e => setForm(p => ({ ...p, voter_id: e.target.value.toUpperCase() }))} />
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block">Full Name</label>
          <Input placeholder="e.g. Kwame Mensah" value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium mb-1 block">Phone Number</label>
          <Input placeholder="+233..." value={form.phone}
            onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
          <p className="text-xs text-muted-foreground mt-0.5">Code sent via SMS if provided</p>
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block">Email</label>
          <Input placeholder="voter@email.com" value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
        </div>
      </div>
      {groups.length > 0 && (
        <div>
          <label className="text-xs font-medium mb-1 block">Group (optional)</label>
          <select value={form.group_id} onChange={e => setForm(p => ({ ...p, group_id: e.target.value }))}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">— No group / General —</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}
      <Button onClick={submit} disabled={loading} className="w-full bg-secondary text-secondary-foreground">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
        Add Voter & Generate Code
      </Button>
    </div>
  );
};

// ── CSV Upload ────────────────────────────────────────────────────────────────
const CSVUpload = ({ slug, onUploaded }: { slug: string; onUploaded: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<any>(null);
  const [sendSms, setSendSms] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const upload = async (file: File) => {
    setLoading(true); setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("send_sms", sendSms ? "true" : "false");
    try {
      const res = await fetch(`${API}/events/admin/${slug}/voter-roll/upload/`, {
        method: "POST", headers: { Authorization: `Bearer ${token()}` }, body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setResult(data);
      toast({ title: "Upload complete ✅", description: data.message });
      onUploaded();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-muted/30 border border-border text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">CSV Format</p>
        <p>Required column: <code className="text-secondary">id</code> / <code className="text-secondary">voter_id</code> / <code className="text-secondary">student_id</code> / <code className="text-secondary">index_number</code></p>
        <p>Optional columns: <code>name</code>, <code>phone</code>, <code>email</code>, <code>group</code> / <code>department</code> / <code>level</code></p>
        <p className="text-green-400">Groups are auto-created from the group column values.</p>
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" id="send_sms_csv" checked={sendSms} onChange={e => setSendSms(e.target.checked)} />
        <label htmlFor="send_sms_csv" className="text-sm">Send voting codes via SMS to all voters with phone numbers</label>
      </div>

      <div
        className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-secondary/50 transition-colors"
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
      >
        {loading
          ? <><Loader2 className="w-8 h-8 animate-spin text-secondary mx-auto mb-2" /><p className="text-sm">Uploading & generating codes...</p></>
          : <><Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-sm font-medium">Drop CSV here or click to browse</p><p className="text-xs text-muted-foreground mt-1">Max 5MB</p></>
        }
      </div>
      <input ref={fileRef} type="file" accept=".csv" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />

      {result && (
        <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5 text-sm space-y-1">
          <p className="font-medium text-green-400">✅ {result.message}</p>
          {result.errors?.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-destructive font-medium">Errors:</p>
              {result.errors.map((e: string, i: number) => <p key={i} className="text-xs text-muted-foreground">{e}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Voter Table ───────────────────────────────────────────────────────────────
const VoterTable = ({ voters, slug, groups, onRefresh }: { voters: Voter[]; slug: string; groups: VoterGroup[]; onRefresh: () => void }) => {
  const [search, setSearch]       = useState("");
  const [groupFilter, setGroup]   = useState("");
  const [statusFilter, setStatus] = useState("");
  const [showCodes, setShowCodes] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const { toast } = useToast();
  const { ask: confirm, dialog: confirmDialog } = useConfirm();

  const filtered = voters.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = !q || v.voter_id.toLowerCase().includes(q) || v.name.toLowerCase().includes(q) || v.phone.includes(q);
    const matchGroup  = !groupFilter || v.group?.id === groupFilter;
    const matchStatus = !statusFilter || v.status === statusFilter;
    return matchSearch && matchGroup && matchStatus;
  });

  const resendSms = async (voter: Voter) => {
    setResending(voter.id);
    try {
      const res = await fetch(`${API}/events/admin/${slug}/voter-roll/${voter.id}/resend/`, {
        method: "POST", headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `SMS resent to ${voter.phone} ✅` });
      onRefresh();
    } catch (e: any) {
      toast({ title: "SMS failed", description: e.message, variant: "destructive" });
    } finally { setResending(null); }
  };

  const deleteVoter = async (voter: Voter) => {
    const ok = await confirm(
      `Remove voter "${voter.voter_id}"?`,
      voter.name ? `${voter.name} will be removed from this voter roll. Their code will no longer work.` : "This voter will be removed from the roll. Their code will no longer work.",
      "Remove Voter"
    );
    if (!ok) return;
    try {
      const res = await fetch(`${API}/events/admin/${slug}/voter-roll/${voter.id}/resend/`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `Voter ${voter.voter_id} removed ✅` });
      onRefresh();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  const downloadCSV = () => {
    const rows = [["voter_id","name","phone","email","group","voting_code","status"]];
    filtered.forEach(v => rows.push([v.voter_id, v.name, v.phone, v.email, v.group?.name || "", v.voting_code, v.status]));
    const csv  = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = `voter-roll-${slug}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Search by ID, name, phone..." className="pl-8 h-9 text-sm"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {groups.length > 0 && (
          <select value={groupFilter} onChange={e => setGroup(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">All groups</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.voter_count})</option>)}
          </select>
        )}
        <select value={statusFilter} onChange={e => setStatus(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">All status</option>
          <option value="unused">Unused</option>
          <option value="used">Used</option>
        </select>
        <Button variant="outline" size="sm" onClick={() => setShowCodes(p => !p)}>
          {showCodes ? <EyeOff className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
          {showCodes ? "Hide" : "Show"} Codes
        </Button>
        <Button variant="outline" size="sm" onClick={downloadCSV}>
          <Download className="w-3.5 h-3.5 mr-1" /> Export
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} of {voters.length} voters</p>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">ID</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Name</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Phone</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Group</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Code</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Status</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">No voters found</td></tr>
            ) : filtered.map(v => (
              <tr key={v.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="px-3 py-2 font-mono text-xs">{v.voter_id}</td>
                <td className="px-3 py-2 text-xs">{v.name || <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-xs">{v.phone || <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2">
                  {v.group
                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/10 text-secondary border border-secondary/20">{v.group.name}</span>
                    : <span className="text-xs text-muted-foreground">General</span>
                  }
                </td>
                <td className="px-3 py-2 font-mono text-xs font-bold tracking-widest">
                  {showCodes ? v.voting_code : "••••••"}
                </td>
                <td className="px-3 py-2">
                  {v.status === "used"
                    ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="w-3 h-3" /> Used</span>
                    : <span className="flex items-center gap-1 text-xs text-yellow-400"><XCircle className="w-3 h-3" /> Unused</span>
                  }
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {v.phone && v.status === "unused" && (
                      <button
                        onClick={() => resendSms(v)}
                        disabled={resending === v.id}
                        className="flex items-center gap-1 text-xs text-secondary hover:underline disabled:opacity-50"
                      >
                        {resending === v.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        Resend
                      </button>
                    )}
                    {v.status === "unused" && (
                      <button
                        onClick={() => deleteVoter(v)}
                        className="flex items-center gap-1 text-xs text-destructive hover:underline"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirmDialog}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const AdminVoterRollPage = () => {
  const { ask: confirmMain, dialog: confirmMainDialog } = useConfirm();
  const [events, setEvents]     = useState<Event[]>([]);
  const [selectedSlug, setSlug] = useState("");
  const [groups, setGroups]     = useState<VoterGroup[]>([]);
  const [roll, setRoll]         = useState<RollStats | null>(null);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState<"voters" | "groups" | "add" | "upload">("voters");
  const { toast }               = useToast();

  // Load organizational events
  useEffect(() => {
    fetch(`${API}/events/admin/`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json())
      .then(data => {
        const orgEvents = (data.results || data).filter((e: any) => e.voting_mode === "organizational");
        setEvents(orgEvents);
        if (orgEvents.length > 0) setSlug(orgEvents[0].slug);
      })
      .catch(() => {});
  }, []);

  const loadGroups = async (slug: string) => {
    const res  = await fetch(`${API}/events/admin/${slug}/groups/`, { headers: { Authorization: `Bearer ${token()}` } });
    const data = await res.json();
    setGroups(Array.isArray(data) ? data : []);
  };

  const loadRoll = async (slug: string) => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/events/admin/${slug}/voter-roll/`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      setRoll(data);
    } catch { toast({ title: "Failed to load voter roll", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!selectedSlug) return;
    loadGroups(selectedSlug);
    loadRoll(selectedSlug);
  }, [selectedSlug]);

  const refresh = () => { if (selectedSlug) { loadGroups(selectedSlug); loadRoll(selectedSlug); } };

  const clearRoll = async () => {
    const ok = await confirmMain(
      "Clear Entire Voter Roll?",
      "All voter records and voting codes for this election will be permanently deleted. This cannot be undone.",
      "Clear All"
    );
    if (!ok) return;
    await fetch(`${API}/events/admin/${selectedSlug}/voter-roll/`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token()}` },
    });
    toast({ title: "Voter roll cleared" });
    refresh();
  };

  const selectedEvent = events.find(e => e.slug === selectedSlug);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="w-6 h-6 text-secondary" /> Voter Roll</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage voters for organizational elections</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Event selector */}
      {events.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Shield className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-medium mb-1">No organizational elections found</p>
          <p className="text-sm text-muted-foreground">Create an event and set its voting mode to "Organizational" to manage voter rolls here.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {events.map(e => (
              <button key={e.slug} onClick={() => setSlug(e.slug)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  selectedSlug === e.slug
                    ? "bg-secondary text-secondary-foreground border-secondary"
                    : "border-border bg-card hover:border-secondary/40"
                }`}>
                {e.title}
              </button>
            ))}
          </div>

          {selectedEvent && (
            <>
              {/* Stats */}
              {roll && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Total Voters", value: roll.total, color: "text-foreground" },
                    { label: "Codes Used", value: roll.used, color: "text-green-400" },
                    { label: "Codes Unused", value: roll.unused, color: "text-yellow-400" },
                  ].map(s => (
                    <div key={s.label} className="glass-card p-4 text-center">
                      <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Tabs */}
              <div className="glass-card overflow-hidden">
                <div className="flex border-b border-border">
                  {([
                    { id: "voters", label: "Voter List", icon: Users },
                    { id: "add",    label: "Add Voter",  icon: UserPlus },
                    { id: "upload", label: "CSV Upload", icon: Upload },
                    { id: "groups", label: "Groups",     icon: Tag },
                  ] as const).map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                      className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                        tab === t.id
                          ? "border-secondary text-secondary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}>
                      <t.icon className="w-3.5 h-3.5" />{t.label}
                    </button>
                  ))}
                </div>

                <div className="p-5">
                  <AnimatePresence mode="wait">
                    <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      {tab === "voters" && (
                        <>
                          {loading
                            ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>
                            : roll
                              ? <VoterTable voters={roll.voters} slug={selectedSlug} groups={groups} onRefresh={refresh} />
                              : <p className="text-center text-muted-foreground py-8">No data</p>
                          }
                          {roll && roll.total > 0 && (
                            <div className="mt-4 pt-4 border-t border-border">
                              <button onClick={clearRoll} className="text-xs text-destructive hover:underline flex items-center gap-1">
                                <Trash2 className="w-3 h-3" /> Clear entire voter roll
                              </button>
                            </div>
                          )}
                        </>
                      )}
                      {tab === "add"    && <AddVoterForm slug={selectedSlug} groups={groups} onAdded={refresh} />}
                      {tab === "upload" && <CSVUpload slug={selectedSlug} onUploaded={refresh} />}
                      {tab === "groups" && <GroupManager slug={selectedSlug} groups={groups} onRefresh={refresh} />}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default AdminVoterRollPage;
