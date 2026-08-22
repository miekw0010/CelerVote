import { useState, useEffect } from "react";
import { Sparkles, ChevronRight, ArrowLeft, Loader2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminEvents } from "../../hooks/useApi";
import { nominationsApi, eventsApi } from "../../lib/api";
import { useToast } from "@/hooks/use-toast";
import { NominationReviewList, Nomination } from "@/components/NominationReviewList";

const statusColor: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  ended:  "bg-muted text-muted-foreground",
  draft:  "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  paused: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

const AdminNominationsPage = () => {
  const { events, loading: eventsLoading, refetch: refetchEvents } = useAdminEvents();
  const { toast } = useToast();

  const [selectedSlug, setSelectedSlug] = useState("");
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [toggling, setToggling] = useState(false);

  const selectedEvent = events.find((e: any) => e.slug === selectedSlug);
  const nominationsOpen = selectedEvent?.nominations_open ?? true;

  const handleToggleNominations = async () => {
    if (!selectedEvent) return;
    setToggling(true);
    try {
      await nominationsApi.adminToggle(selectedSlug, !nominationsOpen);
      toast({ title: !nominationsOpen ? "Nominations reopened ✅" : "Nominations closed" });
      refetchEvents();
    } catch (e: any) { toast({ title: "Failed to update", description: e?.message, variant: "destructive" }); }
    finally { setToggling(false); }
  };

  const loadNominations = async (slug: string, status: string) => {
    setLoading(true);
    try {
      const data = await nominationsApi.adminList(slug, status);
      setNominations(data);
    } catch {
      toast({ title: "Error loading nominations", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const loadCategories = async (slug: string) => {
    try {
      const data = await eventsApi.getCategories(slug);
      const cats = data.results || data;
      setCategories(cats.map((c: any) => ({ id: c.id, name: c.name })));
    } catch { setCategories([]); }
  };

  useEffect(() => {
    if (!selectedSlug) return;
    loadNominations(selectedSlug, statusFilter);
    loadCategories(selectedSlug);
  }, [selectedSlug]);

  useEffect(() => {
    if (!selectedSlug) return;
    loadNominations(selectedSlug, statusFilter);
  }, [statusFilter]);

  const handleEdit = async (id: string, data: Record<string, any>) => {
    await nominationsApi.adminUpdate(selectedSlug, id, {
      full_name: data.full_name, stage_name: data.stage_name, phone: data.phone,
      reason: data.reason, category_id: data.category_id,
    });
    loadNominations(selectedSlug, statusFilter);
  };

  const handleAction = async (id: string, action: "approve" | "reject", rejectionReason?: string) => {
    await nominationsApi.adminAction(selectedSlug, id, action, rejectionReason);
    loadNominations(selectedSlug, statusFilter);
  };

  if (!selectedSlug) return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold">Nominations</h1>
        <p className="text-sm text-muted-foreground">Select an event to review self nominations</p>
      </div>
      {eventsLoading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
       : events.length === 0 ? <div className="glass-card p-12 text-center text-muted-foreground"><Calendar className="w-12 h-12 mx-auto mb-4 opacity-30" /><p>No events yet.</p></div>
       : <div className="grid gap-3">
           {events.map((event: any) => (
             <button key={event.id} onClick={() => setSelectedSlug(event.slug)}
               className="glass-card p-4 flex items-center gap-4 hover:border-secondary/40 transition-all text-left group">
               <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center text-2xl">
                 {event.banner_image ? <img src={event.banner_image} alt={event.title} className="w-full h-full object-cover" /> : "🏆"}
               </div>
               <div className="flex-1 min-w-0">
                 <div className="flex items-center gap-2 mb-1 flex-wrap">
                   <span className="font-medium truncate">{event.title}</span>
                   <Badge className={`text-xs ${statusColor[event.status] || "bg-muted"}`}>{event.status}</Badge>
                   {!event.nominations_open && <Badge className="text-xs bg-muted text-muted-foreground">Nominations Closed</Badge>}
                 </div>
                 <p className="text-xs text-muted-foreground">Tap to review nominations</p>
               </div>
               <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-secondary flex-shrink-0" />
             </button>
           ))}
         </div>
      }
    </div>
  );

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => setSelectedSlug("")}>
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-display font-bold truncate">{selectedEvent?.title}</h1>
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Sparkles className="w-3 h-3" /> Nominations</p>
        </div>
        <Button size="sm" variant={nominationsOpen ? "outline" : "default"} onClick={handleToggleNominations} disabled={toggling}
          className={nominationsOpen ? "text-destructive hover:bg-destructive/10 flex-shrink-0" : "bg-green-600 hover:bg-green-700 text-white flex-shrink-0"}>
          {toggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : nominationsOpen ? "Close Nominations" : "Reopen Nominations"}
        </Button>
      </div>

      <NominationReviewList
        nominations={nominations}
        loading={loading}
        categories={categories}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onEdit={handleEdit}
        onAction={handleAction}
        emptyLabel="No nominations in this status yet."
      />
    </div>
  );
};

export default AdminNominationsPage;
