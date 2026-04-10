import { exportResultsPDF } from "../../lib/exportPdf";
import { useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  Calendar, Plus, Play, Pause, StopCircle, Trash2, Eye,
  FileText, RefreshCw, Search, Loader2, ImageIcon, X, Pencil
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAdminEvents } from "../../hooks/useApi";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmDialog";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";

// ── Image compression helper ──────────────────────────────────────────────────
async function compressImage(file: File, maxWidth = 1280, maxHeight = 720, quality = 0.85): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
      }, "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

const statusColor: Record<string, string> = {
  active:    "bg-green-500/20 text-green-400",
  draft:     "bg-muted text-muted-foreground",
  scheduled: "bg-blue-500/20 text-blue-400",
  paused:    "bg-yellow-500/20 text-yellow-400",
  ended:     "bg-red-500/20 text-red-400",
};

// ── Create Event Modal ────────────────────────────────────────────────────────
const CreateEventModal = ({ onCreated }: { onCreated: () => void }) => {
  const [open, setOpen]               = useState(false);
  const [step, setStep]               = useState(1);
  const [loading, setLoading]         = useState(false);
  const [preview, setPreview]         = useState<string | null>(null);
  const [bannerFile, setBannerFile]   = useState<File | null>(null);
  const [createdSlug, setCreatedSlug] = useState("");
  const [createdGroups, setCreatedGroups] = useState<{id: string; name: string}[]>([]);
  const [newGroupName, setNewGroupName]   = useState("");
  const [categories, setCategories]   = useState<{ name: string; candidates: string[]; is_global: boolean; group_ids: string[] }[]>([
    { name: "", candidates: [""], is_global: true, group_ids: [] }
  ]);
  const fileRef    = useRef<HTMLInputElement>(null);
  const { toast }  = useToast();

  const [form, setForm] = useState({
    title: "", slug: "", description: "",
    event_type: "election", voting_type: "single_choice",
    voting_mode: "open",
    is_paid: false, price_per_vote: "0", currency: "GHS",
    start_time: "", end_time: "",
  });

  const isOrg    = form.voting_mode === "organizational";
  const isSurvey = form.event_type === "survey";
  const totalSteps = isOrg ? 3 : 2;
  const stepLabels = isOrg
    ? ["Event Details", "Groups", isSurvey ? "Questions" : "Categories"]
    : ["Event Details", isSurvey ? "Questions" : "Categories"];

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => {
      const updated = { ...prev, [name]: type === "checkbox" ? checked : value };
      if (name === "event_type" && value === "survey") { updated.is_paid = false; updated.price_per_vote = "0"; }
      if (name === "title" && !prev.slug) {
        updated.slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      }
      return updated;
    });
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    compressImage(file).then(compressed => { setBannerFile(compressed); setPreview(URL.createObjectURL(compressed)); });
  };

  const resetAll = () => {
    setForm({ title: "", slug: "", description: "", event_type: "election", voting_type: "single_choice", voting_mode: "open", is_paid: false, price_per_vote: "0", currency: "GHS", start_time: "", end_time: "" });
    setBannerFile(null); setPreview(null); setStep(1); setCreatedSlug(""); setCreatedGroups([]); setNewGroupName("");
    setCategories([{ name: "", candidates: [""], is_global: true, group_ids: [] }]);
    if (fileRef.current) fileRef.current.value = "";
  };

  // Step 1: Create event
  const handleCreateEvent = async () => {
    if (!form.title || !form.slug) { toast({ title: "Title and slug are required.", variant: "destructive" }); return; }
    try {
      setLoading(true);
      const token = localStorage.getItem("access_token");
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== "" && value !== null && value !== undefined)
          formData.append(key, typeof value === "boolean" ? (value ? "true" : "false") : String(value));
      });
      if (bannerFile) formData.append("banner_image", bannerFile);
      const res = await fetch(`${API}/events/admin/`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
      if (!res.ok) { const err = await res.json(); throw new Error(JSON.stringify(err)); }
      const data = await res.json();
      setCreatedSlug(data.slug);
      toast({ title: "Event created! ✅" });
      setStep(isOrg ? 2 : 2); // go to groups if org, else categories
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  // Step 2 (org): Add a group
  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      setLoading(true);
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API}/events/admin/${createdSlug}/groups/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setCreatedGroups(prev => [...prev, { id: data.id, name: data.name }]);
      setNewGroupName("");
      toast({ title: `Group "${data.name}" added ✅` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const removeGroup = (id: string) => setCreatedGroups(prev => prev.filter(g => g.id !== id));

  // Step 3: Save categories with group assignments
  const handleSaveCategories = async () => {
    const validCats = categories.filter(c => c.name.trim());
    if (validCats.length === 0) { toast({ title: "Add at least one category", variant: "destructive" }); return; }
    try {
      setLoading(true);
      const token = localStorage.getItem("access_token");
      for (const cat of validCats) {
        const catRes = await fetch(`${API}/events/${createdSlug}/categories/`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: cat.name,
            voting_type: form.voting_type,
            is_global: cat.is_global,
            groups: cat.is_global ? [] : cat.group_ids,
          }),
        });
        if (!catRes.ok) continue;
        const catData = await catRes.json();

        // Backend may return array (one per group) or single object
        const createdCats = Array.isArray(catData) ? catData : [catData];
        const validCandidates = cat.candidates.filter(c => c.trim());

        // Add candidates to EACH created category (each group gets same candidate names)
        for (const createdCat of createdCats) {
          for (const candidateName of validCandidates) {
            await fetch(`${API}/events/${createdSlug}/categories/${createdCat.id}/candidates/`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ name: candidateName }),
            });
          }
        }
      }
      toast({ title: "All done! 🎉", description: "Event saved successfully." });
      setOpen(false); resetAll(); onCreated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const addCategory    = () => setCategories(prev => [...prev, { name: "", candidates: [""], is_global: true, group_ids: [] }]);
  const removeCategory = (ci: number) => setCategories(prev => prev.filter((_, i) => i !== ci));
  const updateCategoryName = (ci: number, name: string) => setCategories(prev => prev.map((c, i) => i === ci ? { ...c, name } : c));
  const toggleCategoryGlobal = (ci: number, val: boolean) => setCategories(prev => prev.map((c, i) => i === ci ? { ...c, is_global: val, group_ids: val ? [] : c.group_ids } : c));
  const toggleCategoryGroup  = (ci: number, gid: string) => setCategories(prev => prev.map((c, i) => {
    if (i !== ci) return c;
    const has = c.group_ids.includes(gid);
    return { ...c, group_ids: has ? c.group_ids.filter(g => g !== gid) : [...c.group_ids, gid] };
  }));
  const addCandidate    = (ci: number) => setCategories(prev => prev.map((c, i) => i === ci ? { ...c, candidates: [...c.candidates, ""] } : c));
  const removeCandidate = (ci: number, ki: number) => setCategories(prev => prev.map((c, i) => i === ci ? { ...c, candidates: c.candidates.filter((_, j) => j !== ki) } : c));
  const updateCandidate = (ci: number, ki: number, val: string) => setCategories(prev => prev.map((c, i) => i === ci ? { ...c, candidates: c.candidates.map((k, j) => j === ki ? val : k) } : c));

  const candidateLabel = isSurvey ? "Option" : "Candidate";
  const catStep        = isOrg ? 3 : 2;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetAll(); }}>
      <DialogTrigger asChild>
        <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/90 gap-2">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New Event</span><span className="sm:hidden">New</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "Create New Event" : step === 2 && isOrg ? "Add Groups (Optional)" : `Add ${isSurvey ? "Questions" : "Categories"}`}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex items-center gap-1 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                step > i + 1 ? "bg-green-500 text-white" : step === i + 1 ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"
              }`}>{step > i + 1 ? "✓" : i + 1}</div>
              <span className={`text-xs hidden sm:inline ${step === i + 1 ? "text-foreground font-medium" : "text-muted-foreground"}`}>{label}</span>
              {i < stepLabels.length - 1 && <div className="flex-1 h-px bg-border mx-1" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Event Details ── */}
        {step === 1 && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Event Title *</label>
              <Input name="title" placeholder="e.g. SRC Presidential Election" value={form.title} onChange={handleChange} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Slug *</label>
              <Input name="slug" placeholder="src-presidential-election" value={form.slug} onChange={handleChange} />
              <p className="text-xs text-muted-foreground mt-1">URL: /events/{form.slug || "your-slug"}</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <textarea name="description" value={form.description} onChange={handleChange}
                className="w-full min-h-[70px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                placeholder="Describe your event..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Event Type</label>
                <select name="event_type" value={form.event_type} onChange={handleChange}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="election">🗳️ Election</option>
                  <option value="contest">🏆 Contest</option>
                  <option value="survey">📊 Survey</option>
                  <option value="live_show">📺 Live Show</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Voting Type</label>
                <select name="voting_type" value={form.voting_type} onChange={handleChange}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="single_choice">Single Choice</option>
                  <option value="multiple_choice">Multiple Choice</option>
                  {!isSurvey && <option value="ranked_choice">Ranked Choice</option>}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Access Mode</label>
              <select name="voting_mode" value={form.voting_mode} onChange={handleChange}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="open">🌍 Open — Anyone can vote</option>
                <option value="organizational">🔐 Organizational — Voting code required</option>
              </select>
              {isOrg && <p className="text-xs text-secondary mt-1">⚡ You'll set up groups and categories in the next steps.</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Start Time</label>
                <Input name="start_time" type="datetime-local" value={form.start_time} onChange={handleChange} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">End Time</label>
                <Input name="end_time" type="datetime-local" value={form.end_time} onChange={handleChange} />
              </div>
            </div>
            {!isSurvey && (
              <div className="p-3 rounded-lg border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <input type="checkbox" name="is_paid" id="is_paid" checked={form.is_paid} onChange={handleChange} />
                  <label htmlFor="is_paid" className="text-sm font-medium">Enable Pay-per-vote</label>
                </div>
                {form.is_paid && (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Price per Vote</label>
                      <Input name="price_per_vote" type="number" value={form.price_per_vote} onChange={handleChange} />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Currency</label>
                      <select name="currency" value={form.currency} onChange={handleChange}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                        <option value="GHS">GHS</option>
                        <option value="USD">USD</option>
                        <option value="NGN">NGN</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">Banner Image</label>
              <div className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-secondary/50 transition-colors"
                onClick={() => fileRef.current?.click()}>
                {preview
                  ? <img src={preview} className="w-full h-24 object-cover rounded-md" />
                  : <p className="text-sm text-muted-foreground">Click to upload banner (max 10MB)</p>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleBannerChange} />
            </div>
            <Button className="w-full" onClick={handleCreateEvent} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isOrg ? "Next: Add Groups →" : `Next: Add ${isSurvey ? "Questions" : "Categories"} →`}
            </Button>
          </div>
        )}

        {/* ── Step 2 (Org only): Groups ── */}
        {step === 2 && isOrg && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add sub-groups in your organization (e.g. Level 100, Finance Dept). Voters in a group will only see categories assigned to their group.
              <strong className="text-foreground"> Skip if everyone votes on the same categories.</strong>
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Group name (e.g. Level 100)"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddGroup()}
              />
              <Button onClick={handleAddGroup} disabled={loading || !newGroupName.trim()} size="sm" className="bg-secondary text-secondary-foreground px-4">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </Button>
            </div>
            {createdGroups.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground">
                No groups added yet. Add groups above, or skip to let all voters see all categories.
              </div>
            ) : (
              <div className="space-y-2">
                {createdGroups.map(g => (
                  <div key={g.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-secondary/30 bg-secondary/5">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-secondary" />{g.name}
                    </span>
                    <button onClick={() => removeGroup(g.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>← Back</Button>
              <Button className="flex-1 bg-secondary text-secondary-foreground" onClick={() => setStep(3)}>
                Next: Add Categories →
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2/3: Categories ── */}
        {step === catStep && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isSurvey ? "Add your survey questions and answer options."
                        : createdGroups.length > 0
                          ? "Add categories and assign each to a group or make it global (visible to all voters)."
                          : "Add categories (e.g. President, VP) and candidates for each."}
            </p>
            {categories.map((cat, ci) => (
              <div key={ci} className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center gap-2 p-3 bg-muted/30 border-b border-border">
                  <div className="w-6 h-6 rounded-full bg-secondary/20 flex items-center justify-center text-xs font-bold text-secondary flex-shrink-0">{ci + 1}</div>
                  <Input
                    placeholder={isSurvey ? `Question ${ci + 1}` : `Category name (e.g. President)`}
                    value={cat.name} onChange={e => updateCategoryName(ci, e.target.value)}
                    className="flex-1 h-8 text-sm border-0 bg-transparent focus-visible:ring-0 px-1"
                  />
                  {categories.length > 1 && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10 flex-shrink-0"
                      onClick={() => removeCategory(ci)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  )}
                </div>

                {/* Group assignment (org elections with groups only) */}
                {isOrg && createdGroups.length > 0 && (
                  <div className="px-3 pt-2 pb-1 bg-muted/10 border-b border-border/50">
                    <div className="flex items-center gap-4 flex-wrap">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="radio" checked={cat.is_global} onChange={() => toggleCategoryGlobal(ci, true)} />
                        <span className="font-medium">🌍 Global</span>
                        <span className="text-muted-foreground">(all voters)</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="radio" checked={!cat.is_global} onChange={() => toggleCategoryGlobal(ci, false)} />
                        <span className="font-medium">👥 Group-specific</span>
                      </label>
                    </div>
                    {!cat.is_global && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {createdGroups.map(g => (
                          <label key={g.id} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border cursor-pointer transition-all ${
                            cat.group_ids.includes(g.id)
                              ? "bg-secondary/10 border-secondary/40 text-secondary"
                              : "border-border text-muted-foreground hover:border-secondary/30"
                          }`}>
                            <input type="checkbox" className="hidden"
                              checked={cat.group_ids.includes(g.id)}
                              onChange={() => toggleCategoryGroup(ci, g.id)} />
                            {g.name}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="p-3 space-y-2">
                  {cat.candidates.map((candidate, ki) => (
                    <div key={ki} className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full border-2 border-border flex items-center justify-center text-xs text-muted-foreground flex-shrink-0">
                        {isSurvey ? String.fromCharCode(65 + ki) : ki + 1}
                      </div>
                      <Input
                        placeholder={isSurvey ? `Option ${String.fromCharCode(65 + ki)}` : `${candidateLabel} ${ki + 1} name`}
                        value={candidate} onChange={e => updateCandidate(ci, ki, e.target.value)}
                        className="flex-1 h-8 text-sm"
                      />
                      {cat.candidates.length > 1 && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive flex-shrink-0"
                          onClick={() => removeCandidate(ci, ki)}><X className="w-3.5 h-3.5" /></Button>
                      )}
                    </div>
                  ))}
                  <button className="flex items-center gap-1.5 text-xs text-secondary hover:text-secondary/80 transition-colors mt-1 pl-7"
                    onClick={() => addCandidate(ci)}>
                    <Plus className="w-3 h-3" /> Add {candidateLabel}
                  </button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full gap-1" onClick={addCategory}>
              <Plus className="w-3.5 h-3.5" /> Add {isSurvey ? "Question" : "Category"}
            </Button>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(isOrg ? 2 : 1)}>← Back</Button>
              <Button className="flex-1" onClick={handleSaveCategories} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Finish & Save 🎉"}
              </Button>
            </div>
            <button className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => { setOpen(false); resetAll(); onCreated(); }}>
              Skip for now (add categories later)
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ── Edit Event Modal ──────────────────────────────────────────────────────────
const EditEventModal = ({ event, onUpdated }: { event: any; onUpdated: () => void }) => {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [preview, setPreview]       = useState<string | null>(event.banner_image || null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const buildForm = () => ({
    title:             event.title || "",
    description:       event.description || "",
    event_type:        event.event_type || "election",
    voting_type:       event.voting_type || "single_choice",
    is_paid:           event.is_paid || false,
    price_per_vote:    event.price_per_vote || "0",
    currency:          event.currency || "GHS",
    start_time:        event.start_time ? event.start_time.slice(0, 16) : "",
    end_time:          event.end_time   ? event.end_time.slice(0, 16)   : "",
    voting_mode:       event.voting_mode || "open",
    show_live_results: event.show_live_results ?? true,
    results_published: event.results_published ?? false,
    hide_vote_counts:  event.hide_vote_counts  ?? false,
  });

  const [form, setForm] = useState(buildForm);

  const handleOpenChange = (o: boolean) => {
    if (o) { setForm(buildForm()); setPreview(event.banner_image || null); setBannerFile(null); }
    setOpen(o);
  };

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => {
      const updated = { ...prev, [name]: type === "checkbox" ? checked : value };
      if (name === "event_type" && value === "survey") { updated.is_paid = false; updated.price_per_vote = "0"; }
      return updated;
    });
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast({ title: "File too large", description: "Max 20MB.", variant: "destructive" }); return; }
    compressImage(file).then(compressed => {
      setBannerFile(compressed);
      setPreview(URL.createObjectURL(compressed));
    });
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("access_token");
      let res: Response;
      if (bannerFile) {
        const formData = new FormData();
        Object.entries(form).forEach(([key, value]) => {
          if (value !== "" && value !== null && value !== undefined)
            formData.append(key, typeof value === "boolean" ? String(value) : String(value));
        });
        formData.append("banner_image", bannerFile);
        res = await fetch(`${API}/events/admin/${event.slug}/`, {
          method: "PATCH", headers: { Authorization: `Bearer ${token}` }, body: formData,
        });
      } else {
        const payload: any = { ...form };
        if (!payload.start_time) delete payload.start_time;
        if (!payload.end_time)   delete payload.end_time;
        res = await fetch(`${API}/events/admin/${event.slug}/`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) { const err = await res.json(); throw new Error(JSON.stringify(err)); }
      toast({ title: "Event updated! ✅" });
      setOpen(false); onUpdated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const isSurvey = form.event_type === "survey";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Edit Event">
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Event</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <label className="text-sm font-medium mb-1 block">Banner Image</label>
            <div onClick={() => fileRef.current?.click()}
              className="relative w-full h-36 rounded-lg border-2 border-dashed border-border hover:border-secondary transition-colors cursor-pointer flex items-center justify-center overflow-hidden bg-muted/30">
              {preview ? (
                <>
                  <img src={preview} className="w-full h-full object-cover" />
                  <button onClick={e => { e.stopPropagation(); setPreview(null); setBannerFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white">
                    <X className="w-3 h-3" />
                  </button>
                </>
              ) : (
                <div className="text-center">
                  <ImageIcon className="w-8 h-8 mx-auto mb-1 text-muted-foreground opacity-50" />
                  <p className="text-xs text-muted-foreground">Click to change banner</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleBannerChange} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Title *</label>
            <Input name="title" value={form.title} onChange={handleChange} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Description</label>
            <textarea name="description" value={form.description} onChange={handleChange}
              className="w-full min-h-[70px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Event Type</label>
              <select name="event_type" value={form.event_type} onChange={handleChange}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="election">🗳️ Election</option>
                <option value="contest">🏆 Contest</option>
                <option value="survey">📊 Survey</option>
                <option value="live_show">📺 Live Show</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Voting Type</label>
              <select name="voting_type" value={form.voting_type} onChange={handleChange}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option value="single_choice">Single Choice</option>
                <option value="multiple_choice">Multiple Choice</option>
                {!isSurvey && <option value="ranked_choice">Ranked Choice</option>}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Access Mode</label>
            <select name="voting_mode" value={form.voting_mode} onChange={handleChange}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="open">🌍 Open — Anyone can vote</option>
              <option value="organizational">🔐 Organizational — Voting code required</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Start Time</label>
              <Input name="start_time" type="datetime-local" value={form.start_time} onChange={handleChange} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">End Time</label>
              <Input name="end_time" type="datetime-local" value={form.end_time} onChange={handleChange} />
            </div>
          </div>
          {!isSurvey && (
            <div className="p-3 rounded-lg border border-border">
              <div className="flex items-center gap-2 mb-2">
                <input type="checkbox" name="is_paid" id="edit_is_paid" checked={form.is_paid} onChange={handleChange} />
                <label htmlFor="edit_is_paid" className="text-sm font-medium">Enable Pay-per-vote</label>
              </div>
              {form.is_paid && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Price per Vote</label>
                    <Input name="price_per_vote" type="number" value={form.price_per_vote} onChange={handleChange} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Currency</label>
                    <select name="currency" value={form.currency} onChange={handleChange}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="GHS">GHS</option>
                      <option value="USD">USD</option>
                      <option value="NGN">NGN</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="space-y-2 p-3 rounded-lg border border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Visibility Settings</p>
            {[
              { name: "show_live_results", id: "show_live_results", label: "Show live results to voters during voting" },
              { name: "results_published", id: "results_published", label: "Publish results (visible on results page)" },
              { name: "hide_vote_counts",  id: "hide_vote_counts",  label: "Hide vote counts from voters while voting" },
            ].map(opt => (
              <div key={opt.id} className="flex items-center gap-2">
                <input type="checkbox" name={opt.name} id={opt.id} checked={(form as any)[opt.name]} onChange={handleChange} />
                <label htmlFor={opt.id} className="text-sm">{opt.label}</label>
              </div>
            ))}
          </div>
          <Button className="w-full" onClick={handleSubmit} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const AdminEventsPage = () => {
  const { events, loading, changeStatus, deleteEvent, refetch } = useAdminEvents();
  const { toast }   = useToast();
  const [search, setSearch] = useState("");

  const filtered = events.filter((e: any) =>
    e.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleExport = async (event: any) => {
    try {
      const token = localStorage.getItem("access_token") || "";
      const res   = await fetch(`${API}/events/admin/${event.slug}/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      exportResultsPDF(data);
      toast({ title: "PDF downloaded! ✅" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const handleResetVotes = async (slug: string, title: string) => {
    const ok = await confirm(
      `Reset all votes for "${title}"?`,
      "Every vote cast will be permanently deleted and all counts reset to zero. This cannot be undone.",
      "Reset Votes",
      "danger"
    );
    if (!ok) return;
    try {
      const token = localStorage.getItem("access_token");
      const res   = await fetch(`${API}/voting/admin/${slug}/reset/`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      toast({ title: "Votes reset! ✅", description: data.message });
      refetch();
    } catch {
      toast({ title: "Error resetting votes", variant: "destructive" });
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold">Events</h1>
          <p className="text-sm text-muted-foreground">Manage all your voting events</p>
        </div>
        <CreateEventModal onCreated={refetch} />
      </div>

      <div className="glass-card p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search events..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={refetch} className="gap-1 flex-shrink-0">
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>No events found. Create your first event!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((event: any, i: number) => (
              <motion.div key={event.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                    {event.banner_image || event.thumbnail ? (
                      <img src={event.banner_image || event.thumbnail} alt={event.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Calendar className="w-4 h-4 text-muted-foreground opacity-40" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-medium text-sm truncate">{event.title}</h3>
                      <Badge className={`text-xs flex-shrink-0 ${statusColor[event.status] || "bg-muted"}`}>
                        {event.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{event.event_type}</span>
                      <span>·</span>
                      <span>{event.total_votes?.toLocaleString() || 0} votes</span>
                      {event.is_paid && (
                        <span className="text-yellow-400">{event.currency} {event.price_per_vote}/vote</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                  <Link to={`/events/${event.slug}`}>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="View">
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                  <EditEventModal event={event} onUpdated={refetch} />
                  {event.status !== "active" && event.status !== "ended" && (
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-green-500" title="Activate"
                      onClick={() => changeStatus(event.slug, "active")}>
                      <Play className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {event.status === "active" && (
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-yellow-500" title="Pause"
                      onClick={() => changeStatus(event.slug, "paused")}>
                      <Pause className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {(event.status === "active" || event.status === "paused") && (
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500" title="End Event"
                      onClick={() => changeStatus(event.slug, "ended")}>
                      <StopCircle className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Export PDF"
                    onClick={() => handleExport(event)}>
                    <FileText className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-orange-500" title="Reset Votes"
                    onClick={() => handleResetVotes(event.slug, event.title)}>
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" title="Delete"
                    onClick={() => deleteEvent(event.slug)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminEventsPage;
