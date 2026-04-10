import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Ticket, Plus, Pencil, Trash2, Eye,
  Calendar, MapPin, Users, DollarSign,
  ToggleLeft, ToggleRight, ChevronDown, ChevronUp,
  Save, X, Printer, CheckSquare, Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";

const BASE   = "/tickets";
const COLORS = ["#01003c", "#8b5cf6", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899", "#10b981"];

function slugify(text: string) {
  return text.toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
}

interface TicketTier {
  id: string;
  name: string;
  description: string;
  price: number;
  quantity: number;
  tickets_sold: number;
  tickets_remaining: number;
  is_sold_out: boolean;
  color: string;
  perks: string[];
  order: number;
  is_active: boolean;
}

interface TicketEvent {
  id: string;
  title: string;
  slug: string;
  description: string;
  venue: string;
  event_date: string;
  banner: string | null;
  is_active: boolean;
  is_published: boolean;
  tiers: TicketTier[];
  total_tickets_sold: number;
  total_revenue: number;
  organizer_name: string;
  created_at: string;
}

interface SoldTicket {
  id: string;
  ticket_code: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
  tier_name: string;
  tier_color: string;
  status: string;
  quantity: number;
  total_amount: number;
  qr_code_url: string | null;
}

// ── Create/Edit Event Modal ───────────────────────────────────────────────────
function EventModal({ event, onClose, onSaved }: {
  event: TicketEvent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast }  = useToast();
  const isEdit     = !!event;
  const [saving, setSaving]               = useState(false);
  const [bannerFile, setBannerFile]       = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(event?.banner || null);

  const [form, setForm] = useState({
    title:        event?.title        || "",
    slug:         event?.slug         || "",
    description:  event?.description  || "",
    venue:        event?.venue        || "",
    event_date:   event?.event_date   ? event.event_date.slice(0, 16) : "",
    is_active:    event?.is_active    ?? true,
    is_published: event?.is_published ?? false,
  });

  const [tiers, setTiers] = useState<Partial<TicketTier>[]>(
    event?.tiers?.map(t => ({ ...t })) || []
  );

  const setField     = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));
  const addTier      = () => setTiers(t => [...t, {
    name: "", description: "", price: 0, quantity: 100,
    color: COLORS[t.length % COLORS.length], perks: [], order: t.length, is_active: true,
  }]);
  const removeTier   = (i: number) => setTiers(t => t.filter((_, idx) => idx !== i));
  const setTierField = (i: number, k: string, v: any) =>
    setTiers(t => t.map((tier, idx) => idx === i ? { ...tier, [k]: v } : tier));

  const handleSave = async () => {
    if (!form.title.trim() || !form.venue.trim() || !form.event_date) {
      toast({ title: "Missing fields", description: "Title, venue and date are required." });
      return;
    }
    setSaving(true);
    try {
      const endpoint = isEdit
        ? `${BASE}/admin/events/${event!.slug}/`
        : `${BASE}/admin/events/`;
      const method = isEdit ? "PATCH" : "POST";

      let data: any;

      if (bannerFile) {
        const token     = localStorage.getItem("access_token");
        const formData  = new FormData();
        const bodyObj   = { ...form, slug: form.slug || slugify(form.title) } as any;
        
        Object.entries(bodyObj).forEach(([k, v]) => formData.append(k, String(v)));
        formData.append("banner", bannerFile);
        const APIURL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";
        const res    = await fetch(`${APIURL}${endpoint}`, {
          method,
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) { const err = await res.json(); throw new Error(JSON.stringify(err)); }
        data = await res.json();
      } else {
        const bodyObj: any = { ...form, slug: form.slug || slugify(form.title) };
        data = await apiFetch(endpoint, { method, body: JSON.stringify(bodyObj) });
      }

      // Always sync tiers individually after saving event
      for (const tier of tiers) {
        if ((tier as TicketTier).id) {
          await apiFetch(`${BASE}/admin/events/${data.slug}/tiers/${(tier as TicketTier).id}/`, {
            method: "PATCH",
            body: JSON.stringify(tier),
          });
        } else {
          await apiFetch(`${BASE}/admin/events/${data.slug}/tiers/`, {
            method: "POST",
            body: JSON.stringify({ ...tier, order: tiers.indexOf(tier) }),
          });
        }
      }

      toast({ title: isEdit ? "Event updated!" : "Event created!", description: data.title });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Could not save event." });
    } finally {
      setSaving(false);
    }
  };

  const modal = (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "2rem 1rem" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{ position: "relative", zIndex: 10000, width: "100%", maxWidth: "672px", margin: "0 auto" }}
        onMouseDown={e => e.stopPropagation()}
        className="vibrant-card"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display font-bold text-xl">{isEdit ? "Edit Event" : "Create Ticket Event"}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">

          {/* Banner Upload */}
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">Event Banner</Label>
            <div
              onClick={() => document.getElementById("ticket-banner-input")?.click()}
              className="relative w-full h-40 rounded-xl border-2 border-dashed border-border hover:border-secondary transition-colors cursor-pointer flex items-center justify-center overflow-hidden bg-muted/30"
            >
              {bannerPreview ? (
                <>
                  <img src={bannerPreview} className="w-full h-full object-cover" alt="Banner preview" />
                  <button
                    onClick={e => { e.stopPropagation(); setBannerPreview(null); setBannerFile(null); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <div className="text-center">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mx-auto mb-2">
                    <Plus className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">Click to upload banner</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">JPG, PNG — max 10MB</p>
                </div>
              )}
            </div>
            <input
              id="ticket-banner-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 10 * 1024 * 1024) { toast({ title: "File too large", description: "Max 10MB." }); return; }
                setBannerFile(file);
                setBannerPreview(URL.createObjectURL(file));
              }}
            />
          </div>

          {/* Title + Slug */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold mb-1.5 block">Event Title *</Label>
              <Input
                value={form.title}
                onChange={e => { setField("title", e.target.value); setField("slug", slugify(e.target.value)); }}
                placeholder="e.g. Annual Gala Night 2026"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold mb-1.5 block">Slug</Label>
              <Input value={form.slug} onChange={e => setField("slug", e.target.value)} placeholder="auto-generated" />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">Description</Label>
            <textarea
              value={form.description}
              onChange={e => setField("description", e.target.value)}
              rows={3}
              placeholder="Describe the event..."
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          {/* Venue + Date */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-semibold mb-1.5 block">Venue *</Label>
              <Input value={form.venue} onChange={e => setField("venue", e.target.value)} placeholder="e.g. AICC, Accra" />
            </div>
            <div>
              <Label className="text-xs font-semibold mb-1.5 block">Event Date & Time *</Label>
              <Input type="datetime-local" value={form.event_date} onChange={e => setField("event_date", e.target.value)} />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button type="button" onClick={() => setField("is_active", !form.is_active)} className="text-secondary">
                {form.is_active ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
              </button>
              <span className="text-sm font-medium">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button type="button" onClick={() => setField("is_published", !form.is_published)} className="text-secondary">
                {form.is_published ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8 text-muted-foreground" />}
              </button>
              <span className="text-sm font-medium">Published</span>
            </label>
          </div>

          {/* Tiers */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-bold">Ticket Tiers</Label>
              <Button onClick={addTier} variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <Plus className="w-3.5 h-3.5" /> Add Tier
              </Button>
            </div>

            {tiers.length === 0 && (
              <div className="rounded-xl border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Add at least one ticket tier (e.g. Regular, VIP)
              </div>
            )}

            <div className="space-y-3">
              {tiers.map((tier, i) => (
                <div key={i} className="rounded-xl border border-border p-4 relative bg-muted/20">
                  <button onClick={() => removeTier(i)}
                    className="absolute top-3 right-3 p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                  <div className="grid sm:grid-cols-3 gap-3 mb-3">
                    <div>
                      <Label className="text-xs mb-1 block">Tier Name *</Label>
                      <Input value={tier.name} onChange={e => setTierField(i, "name", e.target.value)} placeholder="VIP" className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Price (GHS) *</Label>
                      <Input type="number" value={tier.price} onChange={e => setTierField(i, "price", parseFloat(e.target.value) || 0)} placeholder="0.00" className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Quantity *</Label>
                      <Input type="number" value={tier.quantity} onChange={e => setTierField(i, "quantity", parseInt(e.target.value) || 0)} placeholder="100" className="h-8 text-sm" />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3 mb-3">
                    <div>
                      <Label className="text-xs mb-1 block">Description</Label>
                      <Input value={tier.description} onChange={e => setTierField(i, "description", e.target.value)} placeholder="Short description" className="h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Perks (comma-separated)</Label>
                      <Input
                        value={Array.isArray(tier.perks) ? tier.perks.join(", ") : ""}
                        onChange={e => setTierField(i, "perks", e.target.value.split(",").map((p: string) => p.trim()).filter(Boolean))}
                        placeholder="Free drinks, Priority entry"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Color:</Label>
                    {COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setTierField(i, "color", c)}
                        className="w-5 h-5 rounded-full transition-all"
                        style={{
                          backgroundColor: c,
                          outline: tier.color === c ? "2px solid white" : "none",
                          outlineOffset: "2px",
                          boxShadow: tier.color === c ? `0 0 0 3px ${c}` : "none",
                        }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        <div className="flex gap-3 mt-6 pt-4 border-t border-border">
          <Button onClick={onClose} variant="outline" className="flex-1 h-10">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 h-10 cta-button gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? "Save Changes" : "Create Event"}
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ── Tickets List Modal ────────────────────────────────────────────────────────
function TicketsListModal({ event, onClose }: { event: TicketEvent; onClose: () => void }) {
  const [tickets, setTickets] = useState<SoldTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<"all" | "paid" | "used" | "pending">("all");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiFetch(`${BASE}/admin/tickets/?event=${event.slug}`)
      .then(d => { setTickets(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered  = tickets.filter(t => filter === "all" || t.status === filter);
  const paid      = tickets.filter(t => t.status === "paid").length;
  const used      = tickets.filter(t => t.status === "used").length;
  const confirmed = tickets.filter(t => t.status === "paid" || t.status === "used");
  const revenue   = confirmed.reduce((s, t) => s + Number(t.total_amount), 0);

  const toggleCheck = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const printAttendeeList = () => {
    const rows = filtered.map((t, i) => {
      const isChecked   = checked.has(t.id);
      const statusColor = t.status === "paid" ? "#01003c" : t.status === "used" ? "#94a3b8" : "#ef4444";
      return [
        "<tr style='border-bottom:1px solid #e2e8f0;'>",
        "<td style='padding:10px 12px;text-align:center;color:#94a3b8;font-size:12px;'>" + (i + 1) + "</td>",
        "<td style='padding:10px 12px;'>",
          "<div style='width:20px;height:20px;border:2px solid " + (isChecked ? "#01003c" : "#cbd5e1") + ";border-radius:4px;background:" + (isChecked ? "#01003c" : "transparent") + ";display:inline-flex;align-items:center;justify-content:center;'>",
            isChecked ? "<span style='color:#fff;font-size:14px;'>&#10003;</span>" : "",
          "</div>",
        "</td>",
        "<td style='padding:10px 12px;font-weight:600;font-size:13px;'>" + t.buyer_name + "</td>",
        "<td style='padding:10px 12px;font-size:12px;color:#64748b;'>" + t.buyer_email + "</td>",
        "<td style='padding:10px 12px;font-size:12px;color:#64748b;'>" + (t.buyer_phone || "—") + "</td>",
        "<td style='padding:10px 12px;'>",
          "<span style='background:" + t.tier_color + "20;color:" + t.tier_color + ";border:1px solid " + t.tier_color + "50;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;'>" + t.tier_name + "</span>",
        "</td>",
        "<td style='padding:10px 12px;text-align:center;font-size:12px;'>" + t.quantity + "</td>",
        "<td style='padding:10px 12px;font-family:monospace;font-size:12px;letter-spacing:1px;'>" + t.ticket_code + "</td>",
        "<td style='padding:10px 12px;'><span style='color:" + statusColor + ";font-size:11px;font-weight:700;'>" + t.status.toUpperCase() + "</span></td>",
        "</tr>",
      ].join("");
    }).join("");

    const eventDate = new Date(event.event_date).toLocaleDateString("en-GH", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

    const html = [
      "<!DOCTYPE html><html><head><title>Attendee List — " + event.title + "</title>",
      "<style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:'Segoe UI',sans-serif; color:#0f172a; padding:32px; } h1 { font-size:22px; font-weight:800; margin-bottom:4px; } .meta { color:#64748b; font-size:13px; margin-bottom:24px; } .stats { display:flex; gap:16px; margin-bottom:24px; } .stat { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:12px 20px; } .stat-label { font-size:11px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px; } .stat-value { font-size:18px; font-weight:800; color:#0f172a; } table { width:100%; border-collapse:collapse; } thead td { background:#f8fafc; padding:10px 12px; font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#94a3b8; font-weight:700; border-bottom:1px solid #e2e8f0; } .brand { color:#01003c; font-weight:800; font-size:13px; margin-bottom:20px; letter-spacing:1px; } @media print { body { padding:16px; } }</style>",
      "</head><body>",
      "<div class='brand'>&#10022; CELERVOTE — ADMIN</div>",
      "<h1>" + event.title + "</h1>",
      "<div class='meta'>&#128205; " + event.venue + " &nbsp;&nbsp; &#128197; " + eventDate + "</div>",
      "<div class='stats'>",
        "<div class='stat'><div class='stat-label'>Total</div><div class='stat-value'>" + confirmed.length + "</div></div>",
        "<div class='stat'><div class='stat-label'>Confirmed</div><div class='stat-value' style='color:#01003c'>" + paid + "</div></div>",
        "<div class='stat'><div class='stat-label'>Used</div><div class='stat-value' style='color:#94a3b8'>" + used + "</div></div>",
        "<div class='stat'><div class='stat-label'>Revenue</div><div class='stat-value' style='color:#01003c'>GHS " + revenue.toLocaleString() + "</div></div>",
      "</div>",
      "<table><thead><tr><td>#</td><td>&#10003;</td><td>Name</td><td>Email</td><td>Phone</td><td>Tier</td><td>Qty</td><td>Code</td><td>Status</td></tr></thead>",
      "<tbody>" + rows + "</tbody></table>",
      "<script>window.onload=function(){ setTimeout(function(){ window.print(); },400); }</scr" + "ipt>",
      "</body></html>",
    ].join("");

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  const statusColors: Record<string, string> = {
    paid: "text-secondary", used: "text-muted-foreground", pending: "text-yellow-500",
  };

  const modal = (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "2rem 1rem" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{ position: "relative", zIndex: 10000, width: "100%", maxWidth: "860px", margin: "0 auto" }}
        onMouseDown={e => e.stopPropagation()}
        className="vibrant-card"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-display font-bold text-lg">{event.title}</h2>
            <p className="text-sm text-muted-foreground">
              {event.venue} · {new Date(event.event_date).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={printAttendeeList} size="sm" className="flex items-center gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90">
              <Printer className="w-4 h-4" /> Print / Export
            </Button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: "Total",   value: confirmed.length,                  color: "text-foreground" },
            { label: "Paid",    value: paid,                              color: "text-secondary" },
            { label: "Used",    value: used,                              color: "text-muted-foreground" },
            { label: "Revenue", value: "GHS " + revenue.toLocaleString(), color: "text-secondary" },
          ].map(s => (
            <div key={s.label} className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
              <p className={"font-bold text-base " + s.color}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-4">
          {(["all", "paid", "used", "pending"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={"px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors " +
                (filter === f ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80")}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === "all" ? ` (${tickets.length})` : ` (${tickets.filter(t => t.status === f).length})`}
            </button>
          ))}
          {checked.size > 0 && (
            <span className="ml-auto text-xs text-muted-foreground self-center">{checked.size} checked in</span>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-xl" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No tickets found.</div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="grid grid-cols-[24px_1fr_1fr_80px_72px_80px] gap-3 px-4 py-2 bg-muted/50 border-b border-border">
              <div />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Buyer</p>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</p>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tier</p>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Qty</p>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</p>
            </div>
            <div className="divide-y divide-border max-h-[50vh] overflow-y-auto">
              {filtered.map(t => (
                <div key={t.id} onClick={() => toggleCheck(t.id)}
                  className={"grid grid-cols-[24px_1fr_1fr_80px_72px_80px] gap-3 px-4 py-3 cursor-pointer transition-colors " +
                    (checked.has(t.id) ? "bg-secondary/5" : "hover:bg-muted/30")}>
                  <div className="flex items-center justify-center">
                    {checked.has(t.id)
                      ? <CheckSquare className="w-4 h-4 text-secondary" />
                      : <Square className="w-4 h-4 text-muted-foreground/40" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{t.buyer_name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{t.ticket_code}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground truncate">{t.buyer_email}</p>
                    {t.buyer_phone && <p className="text-xs text-muted-foreground">{t.buyer_phone}</p>}
                  </div>
                  <div className="flex items-center">
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full border truncate"
                      style={{ color: t.tier_color, borderColor: t.tier_color + "40", backgroundColor: t.tier_color + "15" }}>
                      {t.tier_name}
                    </span>
                  </div>
                  <div className="flex items-center justify-center">
                    <span className="text-sm font-bold">{t.quantity}</span>
                  </div>
                  <div className="flex items-center">
                    <span className={"text-xs font-bold " + (statusColors[t.status] || "text-foreground")}>
                      {t.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-3 text-center">
          Click any row to mark as checked in · Use Print / Export to get a printable attendee list
        </p>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminTicketsPage() {
  const { toast }                       = useToast();
  const [events, setEvents]             = useState<TicketEvent[]>([]);
  const [loading, setLoading]           = useState(true);
  const [modal, setModal]               = useState<"create" | "edit" | "tickets" | null>(null);
  const [selected, setSelected]         = useState<TicketEvent | null>(null);
  const [expanded, setExpanded]         = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    apiFetch(`${BASE}/admin/events/`)
      .then(d => { setEvents(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => { setEvents([]); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const togglePublish = async (event: TicketEvent) => {
    try {
      await apiFetch(`${BASE}/admin/events/${event.slug}/`, {
        method: "PATCH",
        body: JSON.stringify({ is_published: !event.is_published }),
      });
      toast({ title: event.is_published ? "Event unpublished" : "Event published!" });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message });
    }
  };

  const deleteEvent = async (event: TicketEvent) => {
    if (!confirm(`Delete "${event.title}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`${BASE}/admin/events/${event.slug}/`, { method: "DELETE" });
      toast({ title: "Event deleted." });
      load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message });
    }
  };

  const totalRevenue = events.reduce((s, e) => {
    return s + (e.tiers || []).reduce((ts, tier) => ts + (tier.tickets_sold * Number(tier.price)), 0);
  }, 0);
  const totalSold = events.reduce((s, e) => s + (Number(e.total_tickets_sold) || 0), 0);

  return (
    <>
      {(modal === "create" || modal === "edit") && (
        <EventModal
          event={modal === "edit" ? selected : null}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
      {modal === "tickets" && selected && (
        <TicketsListModal event={selected} onClose={() => setModal(null)} />
      )}

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display font-bold text-2xl">Ticket Events</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Manage events, tiers, and sold tickets</p>
          </div>
          <Button onClick={() => setModal("create")} className="cta-button gap-2">
            <Plus className="w-4 h-4" /> Create Event
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Events",  value: events.length,                             icon: <Ticket     className="w-5 h-5" />, color: "text-secondary" },
            { label: "Tickets Sold",  value: totalSold,                                 icon: <Users      className="w-5 h-5" />, color: "text-blue-500" },
            { label: "Total Revenue", value: `GHS ${totalRevenue.toLocaleString()}`,    icon: <DollarSign className="w-5 h-5" />, color: "text-green-500" },
            { label: "Published",     value: events.filter(e => e.is_published).length, icon: <Eye        className="w-5 h-5" />, color: "text-purple-500" },
          ].map((s, i) => (
            <div key={i} className="vibrant-card p-4">
              <div className={`mb-2 ${s.color}`}>{s.icon}</div>
              <div className="font-display font-bold text-xl">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="vibrant-card h-20 animate-pulse" />)}
          </div>
        ) : events.length === 0 ? (
          <div className="vibrant-card text-center py-16">
            <Ticket className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="font-semibold mb-1">No ticket events yet</p>
            <p className="text-sm text-muted-foreground mb-4">Create your first event to start selling tickets.</p>
            <Button onClick={() => setModal("create")} className="cta-button gap-2">
              <Plus className="w-4 h-4" /> Create Event
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map(event => (
              <div key={event.id} className="vibrant-card overflow-hidden p-0">
                <div className="p-4 flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-muted">
                    {event.banner
                      ? <img src={event.banner} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Ticket className="w-6 h-6 text-muted-foreground/30" /></div>}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-display font-bold text-base">{event.title}</h3>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${event.is_published ? "bg-secondary/10 text-secondary" : "bg-muted text-muted-foreground"}`}>
                            {event.is_published ? "Published" : "Draft"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(event.event_date).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{event.venue}</span>
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{event.total_tickets_sold} sold</span>
                          <span className="flex items-center gap-1 text-green-600 font-semibold">
                            <DollarSign className="w-3 h-3" />
                            GHS {(event.tiers || []).reduce((s, t) => s + t.tickets_sold * Number(t.price), 0).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => { setSelected(event); setModal("tickets"); }}
                          title="View tickets" className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setSelected(event); setModal("edit"); }}
                          title="Edit" className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => togglePublish(event)}
                          title={event.is_published ? "Unpublish" : "Publish"}
                          className="p-2 rounded-lg hover:bg-muted transition-colors text-secondary">
                          {event.is_published ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                        </button>
                        <button onClick={() => deleteEvent(event)}
                          title="Delete" className="p-2 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => setExpanded(expanded === event.id ? null : event.id)}
                          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                          {expanded === event.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {expanded === event.id && (
                  <div className="border-t border-border bg-muted/30 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Ticket Tiers</p>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {event.tiers.map(tier => (
                        <div key={tier.id} className="rounded-xl border border-border bg-background p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-sm" style={{ color: tier.color }}>{tier.name}</span>
                            <span className="text-xs text-muted-foreground">GHS {Number(tier.price).toLocaleString()}</span>
                          </div>
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <div className="flex justify-between">
                              <span>Sold</span>
                              <span className="font-semibold text-foreground">{tier.tickets_sold} / {tier.quantity}</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-1.5">
                              <div className="h-1.5 rounded-full"
                                style={{ width: `${Math.min(100, (tier.tickets_sold / tier.quantity) * 100)}%`, backgroundColor: tier.color }} />
                            </div>
                            <div className="flex justify-between pt-0.5">
                              <span>Remaining</span>
                              <span className={`font-semibold ${tier.is_sold_out ? "text-destructive" : "text-secondary"}`}>
                                {tier.is_sold_out ? "SOLD OUT" : tier.tickets_remaining}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
