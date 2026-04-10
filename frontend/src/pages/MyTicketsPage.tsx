import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Ticket, Calendar, MapPin, QrCode, Download,
  CheckCircle2, Clock, XCircle, ChevronRight, Shield, X
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";


interface MyTicket {
  id: string;
  ticket_code: string;
  buyer_name: string;
  status: "pending" | "paid" | "used" | "cancelled" | "refunded";
  quantity: number;
  total_amount: number;
  event_title: string;
  event_venue: string;
  event_date: string;
  tier_name: string;
  tier_color: string;
  qr_code_url: string | null;
  created_at: string;
  paid_at: string | null;
}

const statusConfig = {
  paid:      { label: "Confirmed",  icon: <CheckCircle2 className="w-3.5 h-3.5" />, cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  used:      { label: "Used",       icon: <CheckCircle2 className="w-3.5 h-3.5" />, cls: "bg-muted text-muted-foreground border-border" },
  pending:   { label: "Pending",    icon: <Clock        className="w-3.5 h-3.5" />, cls: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" },
  cancelled: { label: "Cancelled",  icon: <XCircle      className="w-3.5 h-3.5" />, cls: "bg-destructive/10 text-destructive border-destructive/30" },
  refunded:  { label: "Refunded",   icon: <XCircle      className="w-3.5 h-3.5" />, cls: "bg-muted text-muted-foreground border-border" },
};

function QrModal({ ticket, onClose }: { ticket: MyTicket; onClose: () => void }) {
  const handleDownload = async () => {
    if (!ticket.qr_code_url) return;
    try {
      const res  = await fetch(ticket.qr_code_url);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `ticket-${ticket.ticket_code}.png`; a.click();
      URL.revokeObjectURL(url);
    } catch { window.open(ticket.qr_code_url, "_blank"); }
  };

  const modal = (
    <motion.div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 9999, backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        style={{ zIndex: 10000, width: "100%", maxWidth: "400px", position: "relative" }}
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Ticket card */}
        <div style={{ background: "hsl(var(--card))", borderRadius: "20px", overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.4)" }}>

          {/* Header band */}
          <div style={{
            background: "linear-gradient(135deg, #01003c, #020057)",
            padding: "24px 24px 20px",
            textAlign: "center",
            position: "relative",
          }}>
            <button onClick={onClose} style={{
              position: "absolute", top: 14, right: 14,
              background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "8px",
              color: "white", cursor: "pointer", padding: "6px", display: "flex",
            }}>
              <X size={16} />
            </button>

            {/* Brand badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              background: "#01003c", borderRadius: "20px",
              padding: "4px 12px", marginBottom: "12px",
            }}>
              <Shield size={12} color="white" />
              <span style={{ color: "white", fontSize: "11px", fontWeight: 700, letterSpacing: "1px" }}>CELERVOTE VERIFIED</span>
            </div>

            <h2 style={{ color: "white", fontSize: "18px", fontWeight: 800, margin: "0 0 6px", lineHeight: 1.2 }}>
              {ticket.event_title}
            </h2>
            <div style={{ display: "flex", justifyContent: "center", gap: "16px", flexWrap: "wrap" }}>
              <span style={{ color: "#94a3b8", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
                <Calendar size={12} />
                {new Date(ticket.event_date).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              <span style={{ color: "#94a3b8", fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
                <MapPin size={12} />{ticket.event_venue}
              </span>
            </div>
          </div>

          {/* Tear line */}
          <div style={{ display: "flex", alignItems: "center", background: "hsl(var(--muted))" }}>
            <div style={{ width: "20px", height: "20px", background: "hsl(var(--background))", borderRadius: "50%", flexShrink: 0 }} />
            <div style={{ flex: 1, borderTop: "2px dashed hsl(var(--border))", margin: "0 4px" }} />
            <div style={{ width: "20px", height: "20px", background: "hsl(var(--background))", borderRadius: "50%", flexShrink: 0 }} />
          </div>

          {/* Body */}
          <div style={{ padding: "20px 24px 24px" }}>
            {/* QR Code */}
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              {ticket.qr_code_url ? (
                <div style={{ display: "inline-block", padding: "12px", background: "white", borderRadius: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
                  <img src={ticket.qr_code_url} alt="QR Code" style={{ width: "160px", height: "160px", display: "block" }} />
                </div>
              ) : (
                <div style={{ width: "160px", height: "160px", background: "hsl(var(--muted))", borderRadius: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <QrCode size={48} style={{ color: "hsl(var(--muted-foreground))", opacity: 0.3 }} />
                </div>
              )}
              <p style={{ color: "hsl(var(--muted-foreground))", fontSize: "10px", marginTop: "8px", letterSpacing: "2px", textTransform: "uppercase" }}>
                Scan at entrance
              </p>
            </div>

            {/* Ticket code */}
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <p style={{ color: "hsl(var(--muted-foreground))", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "4px" }}>Ticket Code</p>
              <p style={{ fontFamily: "monospace", fontSize: "24px", fontWeight: 900, letterSpacing: "4px", color: "hsl(var(--foreground))", margin: 0 }}>
                {ticket.ticket_code}
              </p>
            </div>

            {/* Info grid */}
            <div style={{ background: "hsl(var(--muted) / 0.5)", borderRadius: "12px", padding: "14px 16px", marginBottom: "20px" }}>
              {[
                { label: "Tier",     value: ticket.tier_name,       color: ticket.tier_color },
                { label: "Quantity", value: `${ticket.quantity} ticket${ticket.quantity > 1 ? "s" : ""}` },
                { label: "Paid",     value: `GHS ${Number(ticket.total_amount).toLocaleString()}`, bold: true },
              ].map((row, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 0",
                  borderBottom: i < 2 ? "1px solid hsl(var(--border))" : "none",
                }}>
                  <span style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))" }}>{row.label}</span>
                  <span style={{ fontSize: "13px", fontWeight: row.bold ? 800 : 700, color: row.color || "hsl(var(--foreground))" }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: "10px" }}>
              {ticket.qr_code_url && (
                <button onClick={handleDownload} style={{
                  flex: 1, height: "42px", borderRadius: "10px",
                  border: "1px solid hsl(var(--border))", background: "transparent",
                  color: "hsl(var(--foreground))", fontSize: "13px", fontWeight: 600,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                }}>
                  <Download size={15} /> Save QR
                </button>
              )}
              <button onClick={onClose} style={{
                flex: 1, height: "42px", borderRadius: "10px",
                border: "none", background: "#01003c",
                color: "white", fontSize: "13px", fontWeight: 700,
                cursor: "pointer",
              }}>
                Close
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );

  return createPortal(modal, document.body);
}

export default function MyTicketsPage() {
  const [tickets, setTickets]         = useState<MyTicket[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeTicket, setActiveTicket] = useState<MyTicket | null>(null);
  const [filter, setFilter]           = useState<"all" | "paid" | "used">("all");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    fetch(`${API}/tickets/my-tickets/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { setTickets(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = tickets.filter(t => filter === "all" || t.status === filter);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-28 pb-16">
        <div className="container mx-auto px-4 max-w-3xl">

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h1 className="text-3xl font-display font-bold mb-2">My Tickets</h1>
            <p className="text-muted-foreground">Your purchased tickets and QR codes.</p>
          </motion.div>

          {/* Filter tabs */}
          <div className="flex gap-2 mb-6">
            {(["all", "paid", "used"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={[
                  "px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors",
                  filter === f ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                ].join(" ")}>
                {f === "all" ? "All" : f === "paid" ? "Confirmed" : "Used"}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-2xl" />)}
            </div>
          ) : filtered.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-card border border-border/30 rounded-2xl text-center py-16">
              <Ticket className="w-14 h-14 text-muted-foreground/20 mx-auto mb-4" />
              <h3 className="font-display font-bold text-lg mb-2">No tickets yet</h3>
              <p className="text-muted-foreground text-sm mb-6">
                {filter === "all" ? "You haven't purchased any tickets." : `No ${filter} tickets.`}
              </p>
              <Link to="/tickets"><Button className="cta-button">Browse Events</Button></Link>
            </motion.div>
          ) : (
            <motion.div className="space-y-4" initial="hidden" animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.08 } } }}>
              {filtered.map(ticket => {
                const sc = statusConfig[ticket.status] || statusConfig.pending;
                return (
                  <motion.div key={ticket.id}
                    variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
                    className="bg-card border border-border/30 rounded-2xl overflow-hidden">
                    {/* Tier color bar */}
                    <div className="h-1" style={{ backgroundColor: ticket.tier_color }} />

                    <div className="p-5 flex items-start gap-4">
                      {/* QR thumb */}
                      <button onClick={() => setActiveTicket(ticket)}
                        className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border border-border hover:border-secondary transition-colors relative group cursor-pointer">
                        {ticket.qr_code_url ? (
                          <>
                            <img src={ticket.qr_code_url} alt="QR" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-secondary/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <QrCode className="w-6 h-6 text-white" />
                            </div>
                          </>
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center">
                            <QrCode className="w-6 h-6 text-muted-foreground/40" />
                          </div>
                        )}
                      </button>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="font-display font-bold text-base leading-tight truncate pr-2">{ticket.event_title}</h3>
                          <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${sc.cls}`}>
                            {sc.icon} {sc.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mb-2">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(ticket.event_date).toLocaleDateString("en-GH", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{ticket.event_venue}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full border"
                              style={{ color: ticket.tier_color, borderColor: ticket.tier_color + "40", backgroundColor: ticket.tier_color + "15" }}>
                              {ticket.tier_name}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">{ticket.ticket_code}</span>
                          </div>
                          <span className="text-sm font-bold text-secondary">GHS {Number(ticket.total_amount).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {ticket.status === "paid" && (
                      <button onClick={() => setActiveTicket(ticket)}
                        className="w-full border-t border-border py-2.5 text-xs font-semibold text-secondary hover:bg-secondary/5 transition-colors flex items-center justify-center gap-1.5">
                        <QrCode className="w-3.5 h-3.5" /> View QR Code
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {activeTicket && <QrModal ticket={activeTicket} onClose={() => setActiveTicket(null)} />}
      </AnimatePresence>

      <Footer />
    </div>
  );
}
