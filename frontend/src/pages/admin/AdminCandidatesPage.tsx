import { useState, useEffect, useRef } from "react";
import { Users, Plus, Trash2, Loader2, X, ImageIcon, ChevronRight, ArrowLeft, BarChart3, Calendar, Tag, Globe, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAdminEvents } from "../../hooks/useApi";
import { useConfirm } from "@/components/ConfirmDialog";
import { eventsApi } from "../../lib/api";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";
const getToken = () => localStorage.getItem("access_token");

async function compressImage(file: File, maxSize = 800, quality = 0.85): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const ratio = Math.min(maxSize / width, maxSize / height, 1);
      width = Math.round(width * ratio); height = Math.round(height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
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
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  ended:  "bg-muted text-muted-foreground",
  draft:  "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  paused: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};
const eventTypeIcon: Record<string, string> = {
  election: "🗳️", contest: "🏆", survey: "📊", live_show: "📺",
};

const AdminCandidatesPage = () => {
  const { events, loading: eventsLoading } = useAdminEvents();
  const { toast } = useToast();

  const [selectedSlug, setSelectedSlug]       = useState("");
  const [selectedCatId, setSelectedCatId]     = useState("");
  const [selectedCatName, setSelectedCatName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("__all__");
  const [categories, setCategories]           = useState<any[]>([]);
  const [groups, setGroups]                   = useState<any[]>([]);
  const [candidates, setCandidates]           = useState<any[]>([]);
  const [loadingCats, setLoadingCats]         = useState(false);
  const [loadingCands, setLoadingCands]       = useState(false);
  const [addOpen, setAddOpen]                 = useState(false);
  const [submitting, setSubmitting]           = useState(false);
  const [preview, setPreview]                 = useState<string | null>(null);
  const [photoFile, setPhotoFile]             = useState<File | null>(null);
  const fileRef                               = useRef<HTMLInputElement>(null);
  const [form, setForm]                       = useState({ name: "", description: "", order: "1" });
  const [catModal, setCatModal]               = useState(false);
  const [editingCat, setEditingCat]           = useState<any>(null);
  const [catName, setCatName]                 = useState("");
  const [catOrder, setCatOrder]               = useState(0);
  const [catIsGlobal, setCatIsGlobal]         = useState(true);
  const [catGroupIds, setCatGroupIds]         = useState<string[]>([]);
  const [catLoading, setCatLoading]           = useState(false);
  const [newGroupName, setNewGroupName]       = useState("");
  const [groupLoading, setGroupLoading]       = useState(false);

  const { ask: confirm, dialog: confirmDialog } = useConfirm();
  const selectedEvent  = events.find((e: any) => e.slug === selectedSlug);
  const isOrg          = selectedEvent?.voting_mode === "organizational";
  const isSurvey       = selectedEvent?.event_type === "survey";
  const candidateLabel = isSurvey ? "Option" : "Candidate";

  const loadGroups = async (slug: string) => {
    try {
      const res  = await fetch(`${API}/events/admin/${slug}/groups/`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const data = await res.json();
      setGroups(Array.isArray(data) ? data : []);
    } catch { setGroups([]); }
  };

  const loadCategories = async (slug: string) => {
    setLoadingCats(true);
    try {
      const data = await eventsApi.getCategories(slug);
      setCategories(data.results || data);
    } catch (e: any) { toast({ title: "Error loading categories", variant: "destructive" }); }
    finally { setLoadingCats(false); }
  };

  useEffect(() => {
    if (!selectedSlug) return;
    setCategories([]); setGroups([]); setSelectedCatId(""); setSelectedCatName(""); setSelectedGroupId("__all__"); setCandidates([]);
    loadCategories(selectedSlug);
  }, [selectedSlug]);

  useEffect(() => {
    if (!selectedSlug || !selectedEvent) return;
    if (selectedEvent.voting_mode === "organizational") loadGroups(selectedSlug);
  }, [selectedSlug, selectedEvent]);

  useEffect(() => {
    if (!selectedSlug || !selectedCatId) return;
    setLoadingCands(true);
    eventsApi.getCandidates(selectedSlug, selectedCatId)
      .then(data => setCandidates(data.results || data))
      .catch(() => toast({ title: "Error loading candidates", variant: "destructive" }))
      .finally(() => setLoadingCands(false));
  }, [selectedCatId]);

  const filteredCategories = categories.filter(cat => {
    if (selectedGroupId === "__all__") return true;
    if (selectedGroupId === "__global__") return cat.is_global;
    return !cat.is_global && cat.groups?.some((g: any) => (g.id || g) === selectedGroupId);
  });

  const openCatModal = (cat?: any) => {
    setEditingCat(cat || null);
    setCatName(cat?.name || "");
    setCatOrder(cat?.order ?? filteredCategories.length);

    if (cat) {
      // Editing existing — use its saved values
      setCatIsGlobal(cat?.is_global ?? true);
      setCatGroupIds(cat?.groups?.map((g: any) => g.id || g) || []);
    } else {
      // Creating new — pre-select the active group filter if one is selected
      const hasGroupFilter = selectedGroupId !== "__all__" && selectedGroupId !== "__global__";
      setCatIsGlobal(selectedGroupId === "__global__" || selectedGroupId === "__all__");
      setCatGroupIds(hasGroupFilter ? [selectedGroupId] : []);
    }
    setCatModal(true);
  };

  const submitCat = async () => {
    if (!catName.trim()) { toast({ title: "Name required", variant: "destructive" }); return; }
    setCatLoading(true);
    try {
      const payload = { name: catName.trim(), is_global: catIsGlobal, groups: catIsGlobal ? [] : catGroupIds, order: catOrder };
      if (editingCat) {
        await fetch(`${API}/events/${selectedSlug}/categories/${editingCat.id}/`, {
          method: "PATCH", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast({ title: "Category updated ✅" });
      } else {
        await fetch(`${API}/events/${selectedSlug}/categories/`, {
          method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast({ title: `${isSurvey ? "Question" : "Category"} added ✅` });
      }
      setCatModal(false);
      loadCategories(selectedSlug);
      setSelectedGroupId("__all__"); // reset filter so new categories are visible
    } catch { toast({ title: "Error saving category", variant: "destructive" }); }
    finally { setCatLoading(false); }
  };

  const addGroup = async () => {
    if (!newGroupName.trim()) return;
    setGroupLoading(true);
    try {
      const res  = await fetch(`${API}/events/admin/${selectedSlug}/groups/`, {
        method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `Group "${data.name}" added ✅` });
      setNewGroupName(""); loadGroups(selectedSlug);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setGroupLoading(false); }
  };

  const deleteGroup = async (g: any) => {
    const ok = await confirm(
      `Delete "${g.name}"?`,
      "All categories and candidates belonging to this group will be permanently deleted. This cannot be undone.",
      "Delete Group"
    );
    if (!ok) return;
    try {
      const res  = await fetch(`${API}/events/admin/${selectedSlug}/groups/${g.id}/`, {
        method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json().catch(() => ({}));
      toast({ title: "Group deleted", description: data.message || "" });
      loadGroups(selectedSlug);
      loadCategories(selectedSlug); // refresh categories since some may have been deleted
    } catch {
      toast({ title: "Error deleting group", variant: "destructive" });
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    compressImage(file).then(c => { setPhotoFile(c); setPreview(URL.createObjectURL(c)); });
  };

  const handleAddCandidate = async () => {
    if (!form.name || !selectedCatId) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("name", form.name); fd.append("description", form.description); fd.append("order", form.order);
      if (photoFile && !isSurvey) fd.append("photo", photoFile);
      const res = await fetch(`${API}/events/${selectedSlug}/categories/${selectedCatId}/candidates/`,
        { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
      if (!res.ok) { const err = await res.json(); throw new Error(JSON.stringify(err)); }
      toast({ title: `${candidateLabel} added ✅` });
      setAddOpen(false); resetModal();
      const data = await eventsApi.getCandidates(selectedSlug, selectedCatId);
      const newCands = data.results || data;
      setCandidates(newCands);
      // Update the candidate count in the category list immediately (no refresh needed)
      setCategories(prev => prev.map(c =>
        c.id === selectedCatId ? { ...c, candidates: newCands } : c
      ));
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSubmitting(false); }
  };

  const handleDeleteCandidate = async (id: string) => {
    const ok = await confirm(
      `Delete ${candidateLabel}?`,
      `"${candidates.find((c:any)=>c.id===id)?.name || 'this ' + candidateLabel.toLowerCase()}" will be permanently removed.`,
      "Delete"
    );
    if (!ok) return;
    await fetch(`${API}/events/${selectedSlug}/categories/${selectedCatId}/candidates/${id}/`,
      { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } });
    toast({ title: `${candidateLabel} deleted` });
    setCandidates(prev => {
      const updated = prev.filter((c: any) => c.id !== id);
      // Update the category candidate count immediately
      setCategories(cats => cats.map(c =>
        c.id === selectedCatId ? { ...c, candidates: updated } : c
      ));
      return updated;
    });
  };

  const handleDeleteCategory = async (catId: string, catName: string) => {
    const ok = await confirm(
      `Delete "${catName}"?`,
      "All candidates in this category will be permanently deleted.",
      "Delete Category"
    );
    if (!ok) return;
    await fetch(`${API}/events/${selectedSlug}/categories/${catId}/`, { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } });
    toast({ title: "Category deleted" }); setCategories(prev => prev.filter((c: any) => c.id !== catId));
    if (selectedCatId === catId) { setSelectedCatId(""); setSelectedCatName(""); }
  };

  const resetModal = () => {
    setForm({ name: "", description: "", order: "1" }); setPhotoFile(null); setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Event list ─────────────────────────────────────────────────────────────
  if (!selectedSlug) return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold">Candidates</h1>
        <p className="text-sm text-muted-foreground">Select an event to manage its candidates</p>
      </div>
      {eventsLoading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
       : events.length === 0 ? <div className="glass-card p-12 text-center text-muted-foreground"><Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" /><p>No events yet.</p></div>
       : <div className="grid gap-3">
           {events.map((event: any) => (
             <button key={event.id} onClick={() => setSelectedSlug(event.slug)}
               className="glass-card p-4 flex items-center gap-4 hover:border-secondary/40 transition-all text-left group">
               <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                 {event.banner_image ? <img src={event.banner_image} alt={event.title} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-2xl">{eventTypeIcon[event.event_type] || "🗳️"}</div>}
               </div>
               <div className="flex-1 min-w-0">
                 <div className="flex items-center gap-2 mb-1 flex-wrap">
                   <span className="font-medium truncate">{event.title}</span>
                   <Badge className={`text-xs ${statusColor[event.status] || "bg-muted"}`}>{event.status}</Badge>
                   {event.voting_mode === "organizational" && <Badge className="text-xs bg-secondary/10 text-secondary border-secondary/20">🔐 Org</Badge>}
                 </div>
                 <p className="text-xs text-muted-foreground">{eventTypeIcon[event.event_type]} {event.event_type} · {event.category_count || 0} categories</p>
               </div>
               <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-secondary flex-shrink-0" />
             </button>
           ))}
         </div>
      }
    </div>
  );

  // ── Category list ──────────────────────────────────────────────────────────
  if (!selectedCatId) return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-3 mb-5">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => { setSelectedSlug(""); setGroups([]); }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-display font-bold truncate">{selectedEvent?.title}</h1>
          <p className="text-xs text-muted-foreground">{isOrg ? "🔐 Organizational" : isSurvey ? "Survey" : "Election"}</p>
        </div>
        <Button size="sm" className="gap-1 flex-shrink-0" onClick={() => openCatModal()}>
          <Plus className="w-3.5 h-3.5" /> Add {isSurvey ? "Question" : "Category"}
        </Button>
      </div>

      {/* Group manager for org elections */}
      {isOrg && (
        <div className="glass-card p-4 mb-4">
          <p className="text-sm font-semibold mb-3 flex items-center gap-2"><Tag className="w-4 h-4 text-secondary" /> Groups</p>
          <div className="flex gap-2 mb-3">
            <Input placeholder="New group name..." value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addGroup()} className="h-8 text-sm" />
            <Button size="sm" onClick={addGroup} disabled={groupLoading || !newGroupName.trim()} className="bg-secondary text-secondary-foreground h-8 px-3">
              {groupLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            </Button>
          </div>
          {groups.length === 0 ? <p className="text-xs text-muted-foreground">No groups yet. Add groups to restrict category visibility.</p>
           : <div className="flex flex-wrap gap-2">
               {groups.map(g => (
                 <div key={g.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/10 border border-secondary/20 text-xs">
                   <span className="text-secondary font-medium">{g.name}</span>
                   <span className="text-muted-foreground">({g.voter_count || 0})</span>
                   <button onClick={() => deleteGroup(g)} className="text-muted-foreground hover:text-destructive ml-0.5"><X className="w-3 h-3" /></button>
                 </div>
               ))}
             </div>
          }
        </div>
      )}

      {/* Group filter tabs */}
      {isOrg && groups.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {[{ id: "__all__", label: "All" }, { id: "__global__", label: "🌍 Global" }, ...groups.map(g => ({ id: g.id, label: g.name }))].map(tab => (
            <button key={tab.id} onClick={() => setSelectedGroupId(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                selectedGroupId === tab.id ? "bg-secondary text-secondary-foreground border-secondary" : "border-border text-muted-foreground hover:border-secondary/40"
              }`}>{tab.label}</button>
          ))}
        </div>
      )}

      {loadingCats ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
       : filteredCategories.length === 0
         ? <div className="glass-card p-12 text-center text-muted-foreground">
             <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-30" />
             <p className="mb-4">No {isSurvey ? "questions" : "categories"} yet.</p>
             <Button size="sm" onClick={() => openCatModal()}><Plus className="w-3.5 h-3.5 mr-1" /> Add {isSurvey ? "Question" : "Category"}</Button>
           </div>
         : <div className="grid gap-3">
             {filteredCategories.map((cat: any, i: number) => {
               const catGroups = cat.groups || [];
               return (
                 <div key={cat.id} className="glass-card p-4 flex items-center gap-4 hover:border-secondary/40 transition-all group">
                   <button className="flex items-center gap-4 flex-1 min-w-0 text-left"
                     onClick={() => { setSelectedCatId(cat.id); setSelectedCatName(cat.name); }}>
                     <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary font-bold flex-shrink-0">{i + 1}</div>
                     <div className="flex-1 min-w-0">
                       <div className="flex items-center gap-2 flex-wrap mb-0.5">
                         <p className="font-medium truncate">{cat.name}</p>
                         {isOrg && (cat.is_global
                           ? <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">🌍 Global</span>
                           : catGroups.map((g: any) => (
                               <span key={g.id || g} className="text-xs px-2 py-0.5 rounded-full bg-secondary/10 text-secondary border border-secondary/20">
                                 {g.name || groups.find(gr => gr.id === (g.id || g))?.name || g}
                               </span>
                             ))
                         )}
                       </div>
                       <p className="text-xs text-muted-foreground">{cat.candidates?.length || 0} {isSurvey ? "options" : "candidates"}</p>
                     </div>
                     <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-secondary flex-shrink-0" />
                   </button>
                   <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                     <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                       onClick={e => { e.stopPropagation(); openCatModal(cat); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                     <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                       onClick={e => { e.stopPropagation(); handleDeleteCategory(cat.id, cat.name); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                   </div>
                 </div>
               );
             })}
           </div>
      }

      {confirmDialog}
      {/* Category Modal */}
      <Dialog open={catModal} onOpenChange={o => !o && setCatModal(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingCat ? "Edit" : "Add"} {isSurvey ? "Question" : "Category"}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-sm font-medium mb-1 block">Name *</label>
                <Input placeholder={isSurvey ? "e.g. Who should win?" : "e.g. President"}
                  value={catName} onChange={e => setCatName(e.target.value)} autoFocus />
              </div>
              <div className="w-24">
                <label className="text-sm font-medium mb-1 block">Order</label>
                <Input type="number" min={0} max={99} value={catOrder}
                  onChange={e => setCatOrder(Number(e.target.value))}
                  className="text-center" />
              </div>
            </div>
            {isOrg && groups.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-2 block">Visibility</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border cursor-pointer hover:border-secondary/40">
                    <input type="radio" checked={catIsGlobal} onChange={() => setCatIsGlobal(true)} />
                    <Globe className="w-4 h-4 text-blue-400" />
                    <div><p className="text-sm font-medium">🌍 Global</p><p className="text-xs text-muted-foreground">All voters see this</p></div>
                  </label>
                  <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border cursor-pointer hover:border-secondary/40">
                    <input type="radio" checked={!catIsGlobal} onChange={() => setCatIsGlobal(false)} />
                    <Tag className="w-4 h-4 text-secondary" />
                    <div><p className="text-sm font-medium">👥 Group-specific</p><p className="text-xs text-muted-foreground">Each selected group gets its own independent copy</p></div>
                  </label>
                </div>
                {!catIsGlobal && (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {groups.map(g => (
                        <label key={g.id} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-all ${
                          catGroupIds.includes(g.id) ? "bg-secondary/10 border-secondary/40 text-secondary" : "border-border text-muted-foreground hover:border-secondary/30"
                        }`}>
                          <input type="checkbox" className="hidden" checked={catGroupIds.includes(g.id)}
                            onChange={() => setCatGroupIds(prev => prev.includes(g.id) ? prev.filter(x => x !== g.id) : [...prev, g.id])} />
                          {g.name}
                        </label>
                      ))}
                    </div>
                    {catGroupIds.length > 1 && (
                      <p className="text-xs text-secondary bg-secondary/5 border border-secondary/20 rounded-lg px-3 py-2">
                        ⚡ Will create <strong>{catGroupIds.length} separate categories</strong> — one per group, each with their own candidates and independent results.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setCatModal(false)}>Cancel</Button>
              <Button className="flex-1" onClick={submitCat} disabled={catLoading}>
                {catLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : editingCat ? "Save" : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  // ── Candidates view ────────────────────────────────────────────────────────
  const selectedCat = categories.find(c => c.id === selectedCatId);
  const catGroups   = selectedCat?.groups || [];

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => { setSelectedCatId(""); setSelectedCatName(""); }}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-display font-bold truncate">{selectedCatName}</h1>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-xs text-muted-foreground">{selectedEvent?.title}</p>
            {isOrg && (selectedCat?.is_global
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">🌍 Global</span>
              : catGroups.map((g: any) => (
                  <span key={g.id || g} className="text-xs px-2 py-0.5 rounded-full bg-secondary/10 text-secondary border border-secondary/20">
                    {g.name || groups.find(gr => gr.id === (g.id || g))?.name || g}
                  </span>
                ))
            )}
          </div>
        </div>
        <Button size="sm" className="gap-1 flex-shrink-0" onClick={() => setAddOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Add {candidateLabel}
        </Button>
      </div>

      {loadingCands ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
       : candidates.length === 0
         ? <div className="glass-card p-12 text-center text-muted-foreground"><Users className="w-12 h-12 mx-auto mb-4 opacity-30" /><p>No {isSurvey ? "options" : "candidates"} yet.</p></div>
         : <div className="space-y-2">
             {candidates.map((c: any, i: number) => (
               <div key={c.id} className="glass-card p-4 flex items-center gap-3 group">
                 {isSurvey ? <div className="w-9 h-9 rounded-full bg-secondary/10 flex items-center justify-center text-sm font-bold text-secondary flex-shrink-0">{String.fromCharCode(65 + i)}</div>
                  : c.photo ? <img src={c.photo} alt={c.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-sm font-bold text-secondary flex-shrink-0">{c.name[0]}</div>}
                 <div className="flex-1 min-w-0">
                   <p className="text-sm font-medium truncate">{c.name}</p>
                   {c.description && <p className="text-xs text-muted-foreground truncate">{c.description}</p>}
                 </div>
                 <div className="flex items-center gap-2">
                   <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">{c.vote_count || 0} {isSurvey ? "responses" : "votes"}</span>
                   <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                     onClick={() => handleDeleteCandidate(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                 </div>
               </div>
             ))}
           </div>
      }

      {confirmDialog}
      <Dialog open={addOpen} onOpenChange={o => { setAddOpen(o); if (!o) resetModal(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add {candidateLabel}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            {!isSurvey && (
              <div>
                <label className="text-sm font-medium mb-1 block">Photo</label>
                <div onClick={() => fileRef.current?.click()}
                  className="relative w-full h-32 rounded-lg border-2 border-dashed border-border hover:border-secondary cursor-pointer flex items-center justify-center overflow-hidden bg-muted/30">
                  {preview ? <><img src={preview} className="w-full h-full object-cover" />
                    <button onClick={e => { e.stopPropagation(); setPreview(null); setPhotoFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white"><X className="w-3 h-3" /></button></>
                   : <div className="text-center"><ImageIcon className="w-8 h-8 mx-auto mb-1 text-muted-foreground opacity-50" /><p className="text-xs text-muted-foreground">Click to upload</p></div>}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">{isSurvey ? "Option Text *" : "Full Name *"}</label>
              <Input placeholder={isSurvey ? "e.g. Strongly Agree" : "Candidate full name"}
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{isSurvey ? "Explanation" : "Bio / Description"}</label>
              <Input placeholder={isSurvey ? "Optional" : "Short bio..."} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            {!isSurvey && <div><label className="text-sm font-medium mb-1 block">Display Order</label><Input type="number" value={form.order} onChange={e => setForm(f => ({ ...f, order: e.target.value }))} /></div>}
            <Button className="w-full" onClick={handleAddCandidate} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : `Add ${candidateLabel}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ConfirmDialog is rendered inside the main component via the hook
export default AdminCandidatesPage;
