import { useState, useEffect } from "react";
import confetti from "canvas-confetti";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, MapPin, Ticket, CheckCircle2, Download, PartyPopper,
  ChevronLeft, Minus, Plus, ShieldCheck, Zap, Star, Crown
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";

const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";

declare global { interface Window { PaystackPop: any } }

interface TicketTier {
  id: string; name: string; description: string; price: number;
  quantity: number; tickets_remaining: number; is_sold_out: boolean;
  color: string; perks: string[]; order: number;
}
interface TicketEvent {
  id: string; title: string; slug: string; description: string;
  venue: string; event_date: string; banner: string | null;
  tiers: TicketTier[]; organizer_name: string;
}

function getTierIcon(name: string) {
  const k = name.toLowerCase();
  if (k.includes("vvip")) return <Star className="w-4 h-4" />;
  if (k.includes("vip")) return <Crown className="w-4 h-4" />;
  return <Ticket className="w-4 h-4" />;
}

function normalizePhone(raw: string): string {
  // Strip spaces, dashes, parentheses
  let cleaned = raw.replace(/[\s\-\(\)]/g, "");
  // Remove leading +
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  // Fix: +233 followed by local 0XXXXXXXXX e.g. +2330241234567 -> 233241234567
  if (cleaned.startsWith("2330") && cleaned.length === 13) cleaned = "233" + cleaned.slice(4);
  // Local Ghanaian format 0XXXXXXXXX -> 233XXXXXXXXX
  if (cleaned.startsWith("0") && cleaned.length === 10) cleaned = "233" + cleaned.slice(1);
  // Already in 233XXXXXXXXX
  if (cleaned.startsWith("233") && cleaned.length === 12) return "+" + cleaned;
  // Return with + prefix for anything else valid
  if (cleaned.length >= 7 && /^\d+$/.test(cleaned)) return "+" + cleaned;
  return raw; // Return original if can't normalize (let validation catch it)
}

function loadPaystack(): Promise<void> {
  return new Promise((resolve) => {
    if (window.PaystackPop) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://js.paystack.co/v1/inline.js";
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

export default function TicketEventDetailPage() {
  const { slug }  = useParams<{ slug: string }>();
  const navigate  = useNavigate();
  const { toast } = useToast();
  const [event, setEvent]               = useState<TicketEvent | null>(null);
  const [loading, setLoading]           = useState(true);
  const [selectedTier, setSelectedTier] = useState<TicketTier | null>(null);
  const [quantity, setQuantity]         = useState(1);
  const [buyerName, setBuyerName]       = useState("");
  const [buyerEmail, setBuyerEmail]     = useState("");
  const [buyerPhone, setBuyerPhone]     = useState("");
  const [step, setStep]                 = useState<"select" | "checkout" | "processing" | "success">("select");
  const [errors, setErrors]             = useState<Record<string, string>>({});
  const [confirmedTickets, setConfirmedTickets] = useState<any[]>([]);

  const STORAGE_KEY = `celervote_tickets_${slug}`;

  // Restore confirmed tickets from localStorage on mount (survives refresh/navigation)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`celervote_tickets_${slug}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConfirmedTickets(parsed);
          setStep("success");
        }
      }
    } catch {}
  }, [slug]);

  // Persist confirmed tickets whenever they change
  useEffect(() => {
    if (confirmedTickets.length > 0) {
      try { localStorage.setItem(`celervote_tickets_${slug}`, JSON.stringify(confirmedTickets)); } catch {}
    }
  }, [confirmedTickets]);

  const dismissConfirmedTickets = () => {
    try { localStorage.removeItem(`celervote_tickets_${slug}`); } catch {}
    setConfirmedTickets([]);
    setStep("select");
    setSelectedTier(null);
    setQuantity(1);
    setBuyerName("");
    setBuyerEmail("");
    setBuyerPhone("");
  };

  useEffect(() => {
    fetch(`${API}/tickets/${slug}/`)
      .then(r => r.json())
      .then(d => { setEvent(d); setLoading(false); })
      .catch(() => { setLoading(false); navigate("/tickets"); });
  }, [slug]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!buyerName.trim() || buyerName.trim().length < 2) e.name = "Enter your full name.";
    if (buyerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(buyerEmail)) e.email = "Enter a valid email.";
    const normalizedForValidation = normalizePhone(buyerPhone.trim());
    if (!buyerPhone.trim()) e.phone = "Phone number is required for ticket confirmation.";
    else if (!/^\+[0-9]{9,15}$/.test(normalizedForValidation)) e.phone = "Enter a valid phone number (e.g. 0241234567 or +233241234567).";
    else setBuyerPhone(normalizedForValidation); // commit normalization on validate
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Build one ticket block (reused for single + multi print)
  const buildTicketBlock = (ticket: any, idx: number, total: number): string => {
    const qrUrl      = ticket.qr_code || ticket.qr_code_url || "";
    const tierColor  = ticket.tier_color || selectedTier?.color || "#01003c";
    const tierName   = ticket.tier_name  || selectedTier?.name  || "";
    const checkinCode = ticket.ticket_code || "";
    const eventDate  = new Date(event!.event_date).toLocaleDateString("en-GH", {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    }).toUpperCase();
    const eventTime  = new Date(event!.event_date).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" });
    const qrHtml     = qrUrl
      ? `<img src="${qrUrl}" alt="QR" style="width:200px;height:200px;display:block;" />`
      : `<div style="width:200px;height:200px;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:11px;color:#94a3b8;text-align:center;border:2px dashed #e2e8f0;border-radius:8px;">QR sent to email</div>`;
    const pageBreak  = idx < total - 1 ? "page-break-after:always;" : "";
    return `
      <div class="wrap" style="${pageBreak}">
        <div class="top-banner">
          <h2>${total > 1 ? `Ticket ${idx + 1} of ${total}` : "This Is Your Ticket"}</h2>
          <p>Show at the venue entrance &nbsp;·&nbsp; CelerVote</p>
        </div>
        <div class="ticket">
          <div class="brand-bar">
            <div class="brand"><div class="brand-dot"></div><span class="brand-name">CelerVote</span></div>
            <div class="checkin-box">
              <div class="checkin-label">Checkin Code</div>
              <div class="checkin-code">${checkinCode.slice(-8)}</div>
            </div>
          </div>
          <div class="qr-section">
            <div class="qr-inner">${qrHtml}</div>
            <div class="scan-label">Scan to verify at entrance</div>
          </div>
          <div class="event-section">
            <div class="field-label">Show Name</div>
            <div class="show-name">${event!.title}</div>
            <div class="field-label">Date and Time</div>
            <div class="datetime">${eventDate} &nbsp; ${eventTime}</div>
          </div>
          <div class="tear-wrap">
            <div class="punch-left"></div><div class="tear-line"></div><div class="punch-right"></div>
          </div>
          <div class="bottom">
            <div class="bottom-row">
              <div>
                <div class="field-label">Customer Name</div>
                <div class="field-value">${ticket.buyer_name}</div>
              </div>
              <div style="text-align:right">
                <div class="field-label">Ticket Price</div>
                <div class="price-value" style="color:${tierColor}">GHS ${Number(ticket.total_amount).toLocaleString()}</div>
              </div>
            </div>
            <div style="display:flex;align-items:flex-end;justify-content:space-between;padding-top:12px;border-top:1px solid #f0f0f0;">
              <div>
                <div class="field-label">Tier</div>
                <span class="tier-pill" style="background:${tierColor}20;color:${tierColor};border:1px solid ${tierColor}50">${tierName}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="footer"><span>celervote.com &nbsp;·&nbsp; Secure Electronic Ticketing</span></div>
      </div>`;
  };

  const openPrintWindow = (tickets: any[]) => {
    if (!event || tickets.length === 0) return;
    const blocks = tickets.map((t, i) => buildTicketBlock(t, i, tickets.length)).join("\n");
    const html = `<!DOCTYPE html><html><head><title>Tickets — ${event.title}</title>
<meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',Arial,sans-serif; background:#1a1a1a; padding:24px; display:flex; flex-direction:column; align-items:center; gap:32px; }
  .wrap { width:420px; }
  .top-banner { background:#000; color:#fff; text-align:center; padding:14px 20px 12px; border-radius:12px 12px 0 0; }
  .top-banner h2 { font-size:15px; font-weight:900; letter-spacing:2px; text-transform:uppercase; margin-bottom:4px; }
  .top-banner p { font-size:11px; color:#888; }
  .ticket { background:#fff; }
  .brand-bar { display:flex; align-items:center; justify-content:space-between; padding:14px 20px; border-bottom:1px solid #f0f0f0; }
  .brand { display:flex; align-items:center; gap:8px; }
  .brand-dot { width:10px; height:10px; background:#C9A84C; border-radius:50%; }
  .brand-name { font-size:15px; font-weight:800; color:#0f172a; }
  .checkin-box { text-align:right; }
  .checkin-label { font-size:8px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:2px; margin-bottom:2px; }
  .checkin-code { font-size:13px; font-weight:900; color:#0f172a; letter-spacing:2px; font-family:'Courier New',monospace; }
  .qr-section { padding:20px; text-align:center; border-bottom:1px solid #f0f0f0; }
  .qr-inner { display:inline-block; padding:12px; border:1px solid #e8e8e8; border-radius:8px; background:#fff; }
  .scan-label { font-size:8px; font-weight:700; color:#aaa; letter-spacing:3px; text-transform:uppercase; margin-top:10px; }
  .event-section { padding:16px 20px; border-bottom:1px solid #f0f0f0; }
  .field-label { font-size:9px; font-weight:700; color:#aaa; text-transform:uppercase; letter-spacing:1.5px; margin-bottom:4px; }
  .show-name { font-size:16px; font-weight:900; color:#0f172a; text-transform:uppercase; margin-bottom:12px; }
  .datetime { font-size:12px; font-weight:700; color:#0f172a; text-transform:uppercase; }
  .tear-wrap { position:relative; height:24px; background:#fff; display:flex; align-items:center; overflow:visible; }
  .punch-left { position:absolute; left:-18px; width:32px; height:32px; background:#1a1a1a; border-radius:50%; }
  .punch-right { position:absolute; right:-18px; width:32px; height:32px; background:#1a1a1a; border-radius:50%; }
  .tear-line { flex:1; border-top:2px dashed #d0d0d0; margin:0 20px; }
  .bottom { padding:14px 20px 18px; }
  .bottom-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }
  .field-value { font-size:14px; font-weight:800; color:#0f172a; text-transform:uppercase; }
  .price-value { font-size:16px; font-weight:900; }
  .tier-pill { display:inline-block; padding:4px 12px; border-radius:20px; font-size:10px; font-weight:800; letter-spacing:1px; text-transform:uppercase; }
  .footer { background:#f8f9fa; text-align:center; padding:10px; border-radius:0 0 12px 12px; }
  .footer span { font-size:10px; font-weight:600; color:#94a3b8; letter-spacing:1.5px; text-transform:uppercase; }
  @media print {
    body { background:#fff; padding:0; gap:0; }
    .wrap { width:100%; max-width:420px; margin:0 auto; }
    .punch-left,.punch-right { background:#fff; border:2px solid #ddd; }
    .top-banner { background:#000 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  }
</style></head><body>
${blocks}
<script>window.onload=function(){ setTimeout(function(){ window.print(); }, 600); }<\/script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  const printTicket      = (ticket: any) => openPrintWindow([ticket]);
  const printAllTickets  = ()            => openPrintWindow(confirmedTickets);

  const handleProceed = () => {
    if (!selectedTier) return;
    setStep("checkout");
  };

  const verifyAndComplete = async (reference: string, silent = false) => {
    try {
      const vRes = await fetch(`${API}/tickets/purchase/verify/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      const vData = await vRes.json();
      if (!vRes.ok) throw new Error(vData.error || "Verification failed.");
      if (vData.status === "success" || vData.status === "already_paid") {
        const allTickets = vData.tickets || (vData.ticket ? [vData.ticket] : []);
        setConfirmedTickets(allTickets);
        setStep("success");
        // 🎉 Confetti burst
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ["#01003c", "#C9A84C", "#ffffff", "#ffd700"] });
        setTimeout(() => confetti({ particleCount: 50, spread: 90, origin: { y: 0.5, x: 0.2 }, colors: ["#01003c", "#C9A84C"] }), 250);
        setTimeout(() => confetti({ particleCount: 50, spread: 90, origin: { y: 0.5, x: 0.8 }, colors: ["#01003c", "#C9A84C"] }), 500);
      } else {
        if (!silent) {
          toast({ title: "Verification Failed", description: vData.message || "Could not confirm payment.", variant: "destructive" });
        }
        setStep("checkout");
      }
    } catch {
      if (!silent) {
        toast({ title: "Check My Tickets", description: "Payment may have gone through — check your tickets.", variant: "destructive" });
      }
      setStep("checkout");
    }
  };

    const handlePaystack = async () => {
    if (!selectedTier || !validate()) return;
    if (salesClosed) {
      toast({ title: "Sales closed", description: "Ticket sales have ended for this event.", variant: "destructive" });
      return;
    }
    setStep("processing");

    try {
      await loadPaystack();

      // Step 1: initiate on backend
      const token = localStorage.getItem("access_token") || "";
      const initRes = await fetch(`${API}/tickets/purchase/initiate/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          tier_id: selectedTier.id, quantity,
          buyer_name: buyerName, buyer_email: buyerEmail, buyer_phone: buyerPhone,
        }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || initData.detail || "Payment init failed.");

      const ref = initData.reference;
      let pollInterval: ReturnType<typeof setInterval> | null = null;
      let verified = false;

      const stopPolling = () => {
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
      };

      // Step 2: open Paystack
      const handler = window.PaystackPop.setup({
        key:      PAYSTACK_KEY,
        email:    buyerEmail || (buyerPhone.replace(/^\+/, "").replace(/\s/g, "") + "@celervote.com"),
        amount:   Math.round(selectedTier.price * quantity * 100),
        currency: "GHS",
        ref,
        metadata: { ticket_id: initData.ticket_id, buyer_name: buyerName },

        onSuccess: async (response: any) => {
          verified = true;
          stopPolling();
          await verifyAndComplete(response.reference);
        },

      });

      (window as any).__paystackRef = ref;
      handler.openIframe();

      // Poll every 5 seconds, max 12 times (1 minute total)
      let pollCount = 0;
      pollInterval = setInterval(async () => {
        if (verified) { stopPolling(); return; }
        pollCount++;
        if (pollCount > 12) {
          stopPolling();
          if (!verified) setStep("checkout");
          return;
        }
        try {
          const checkRes = await fetch(`${API}/tickets/purchase/verify/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference: ref }),
          });
          const check = await checkRes.json();
          if (check.status === "success" || check.status === "already_paid") {
            verified = true;
            stopPolling();
            const allTickets = check.tickets || (check.ticket ? [check.ticket] : []);
            if (allTickets.length) setConfirmedTickets(allTickets);
            setStep("success");
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ["#01003c", "#C9A84C", "#ffffff", "#ffd700"] });
            setTimeout(() => confetti({ particleCount: 50, spread: 90, origin: { y: 0.5, x: 0.2 }, colors: ["#01003c", "#C9A84C"] }), 250);
            setTimeout(() => confetti({ particleCount: 50, spread: 90, origin: { y: 0.5, x: 0.8 }, colors: ["#01003c", "#C9A84C"] }), 500);
          }
        } catch { /* keep polling */ }
      }, 5000);

    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Something went wrong.", variant: "destructive" });
      setStep("checkout");
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!event) return null;

  const total = selectedTier ? selectedTier.price * quantity : 0;
  const eventHasPassed = new Date(event.event_date) < new Date();
  const salesClosed    = eventHasPassed;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="relative h-64 md:h-80 mt-16 overflow-hidden">
        {event.banner
          ? <img src={event.banner} alt={event.title} className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-gradient-to-br from-primary via-primary/80 to-secondary/40" />}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <button onClick={() => navigate("/tickets")}
          className="absolute top-6 left-6 flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium bg-black/30 backdrop-blur-sm px-3 py-2 rounded-full transition-colors">
          <ChevronLeft className="w-4 h-4" /> All Events
        </button>
      </div>

      <div className="container mx-auto px-4 -mt-16 relative z-10 pb-24">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-[1fr_380px] gap-8 items-start">

          {/* Left */}
          <div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-2xl md:text-4xl font-display font-bold mb-4">{event.title}</h1>
              <div className="flex flex-wrap gap-4 mb-6">
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Calendar className="w-4 h-4 text-secondary" />
                  {new Date(event.event_date).toLocaleDateString("en-GH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  {" · "}
                  {new Date(event.event_date).toLocaleTimeString("en-GH", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <MapPin className="w-4 h-4 text-secondary" />{event.venue}
                </span>
              </div>
              {event.description && <p className="text-muted-foreground leading-relaxed mb-8">{event.description}</p>}

              <h2 className="font-display font-bold text-xl mb-4">Choose Your Ticket</h2>

              {/* Event ended banner */}
              {salesClosed && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30 mb-4">
                  <span className="text-2xl">🚫</span>
                  <div>
                    <p className="font-semibold text-destructive text-sm">Ticket Sales Have Ended</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      This event took place on {new Date(event.event_date).toLocaleDateString("en-GH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}. Ticket purchases are no longer available.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {event.tiers.map(tier => (
                  <motion.button key={tier.id}
                    onClick={() => { if (!tier.is_sold_out && !salesClosed) { setSelectedTier(tier); setQuantity(1); } }}
                    whileHover={!tier.is_sold_out && !salesClosed ? { scale: 1.01 } : {}}
                    whileTap={!tier.is_sold_out && !salesClosed ? { scale: 0.99 } : {}}
                    className={[
                      "w-full text-left rounded-2xl border-2 p-5 transition-all duration-200 bg-card",
                      tier.is_sold_out || salesClosed ? "opacity-50 cursor-not-allowed border-border"
                        : selectedTier?.id === tier.id ? "border-secondary bg-secondary/10"
                        : "border-border hover:border-secondary/50",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center mt-0.5 flex-shrink-0"
                          style={{ backgroundColor: tier.color + "20", color: tier.color }}>
                          {getTierIcon(tier.name)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-display font-bold text-base">{tier.name}</span>
                            {tier.is_sold_out && <span className="text-xs bg-destructive/10 text-destructive font-semibold px-2 py-0.5 rounded-full">Sold Out</span>}
                            {!tier.is_sold_out && tier.tickets_remaining <= 10 && (
                              <span className="text-xs bg-yellow-500/10 text-yellow-600 font-semibold px-2 py-0.5 rounded-full">
                                Only {tier.tickets_remaining} left!
                              </span>
                            )}
                          </div>
                          {tier.description && <p className="text-sm text-muted-foreground mb-2">{tier.description}</p>}
                          {tier.perks.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {tier.perks.map((perk, i) => (
                                <span key={i} className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                  <CheckCircle2 className="w-3 h-3 text-secondary" /> {perk}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-display font-bold text-xl" style={{ color: tier.color }}>
                          GHS {Number(tier.price).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">{tier.tickets_remaining} left</div>
                      </div>
                    </div>
                    {selectedTier?.id === tier.id && (
                      <div className="mt-3 pt-3 border-t border-secondary/20 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-secondary" />
                        <span className="text-secondary text-sm font-medium">Selected</span>
                      </div>
                    )}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Right */}
          <div className="lg:sticky lg:top-24">
            <AnimatePresence mode="wait">
              {step === "select" && (
                <motion.div key="select" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  className="bg-card border border-border/30 rounded-2xl p-6">
                  <h3 className="font-display font-bold text-lg mb-4">Order Summary</h3>
                  {selectedTier ? (
                    <>
                      <div className="rounded-xl bg-muted/50 p-4 mb-4">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">Tier</span>
                          <span className="font-semibold" style={{ color: selectedTier.color }}>{selectedTier.name}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Price each</span>
                          <span>GHS {Number(selectedTier.price).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm mt-3 pt-3 border-t border-border">
                          <span className="text-muted-foreground">Quantity</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setQuantity(q => Math.max(1, q - 1))}
                              className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors">
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-8 text-center font-bold">{quantity}</span>
                            <button onClick={() => setQuantity(q => Math.min(Math.min(selectedTier.tickets_remaining, 10), q + 1))}
                              className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors">
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <div className="flex justify-between font-bold text-base mt-3 pt-3 border-t border-border">
                          <span>Total</span>
                          <span className="text-secondary">GHS {total.toLocaleString()}</span>
                        </div>
                      </div>
                      <Button onClick={handleProceed} className="w-full cta-button h-11 font-semibold">
                        Get Tickets →
                      </Button>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <Ticket className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm">Select a ticket tier to continue</p>
                    </div>
                  )}
                  <div className="mt-4 flex items-center gap-2 justify-center text-xs text-muted-foreground">
                    <ShieldCheck className="w-3.5 h-3.5 text-secondary" />
                    Secured by Paystack · Instant QR delivery
                  </div>
                </motion.div>
              )}

              {step === "checkout" && (
                <motion.div key="checkout" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  className="bg-card border border-border/30 rounded-2xl p-6">
                  <button onClick={() => setStep("select")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  <h3 className="font-display font-bold text-lg mb-4">Your Details</h3>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs font-semibold mb-1.5 block">Full Name *</Label>
                      <Input value={buyerName} onChange={e => setBuyerName(e.target.value)}
                        placeholder="John Doe" className={errors.name ? "border-destructive" : ""} />
                      {errors.name && <p className="text-destructive text-xs mt-1">{errors.name}</p>}
                    </div>
                    <div>
                      <Label className="text-xs font-semibold mb-1.5 block">Phone Number *</Label>
                      <Input
                        value={buyerPhone}
                        onChange={e => setBuyerPhone(e.target.value)}
                        onBlur={e => setBuyerPhone(normalizePhone(e.target.value))}
                        placeholder="0241234567 or +233241234567"
                        className={errors.phone ? "border-destructive" : ""} />
                      <p className="text-xs text-muted-foreground mt-1">Auto-formatted to international format on submit</p>
                      {errors.phone && <p className="text-destructive text-xs mt-1">{errors.phone}</p>}
                    </div>
                    <div>
                      <Label className="text-xs font-semibold mb-1.5 block">Email Address <span className="text-muted-foreground font-normal">(optional)</span></Label>
                      <Input value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)}
                        placeholder="you@example.com" className={errors.email ? "border-destructive" : ""} />
                      {errors.email && <p className="text-destructive text-xs mt-1">{errors.email}</p>}
                    </div>
                    
                  </div>
                  <div className="mt-4 rounded-xl bg-muted/50 p-3 text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="text-muted-foreground">{selectedTier?.name} × {quantity}</span>
                      <span className="font-semibold text-secondary">GHS {total.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
                      <Zap className="w-3 h-3 text-secondary" />
                      Ticket code sent to your phone via SMS after payment
                    </div>
                  </div>
                  {salesClosed ? (
                    <div className="w-full h-12 mt-4 rounded-xl bg-destructive/10 border border-destructive/30 flex items-center justify-center gap-2 text-destructive text-sm font-semibold">
                      🚫 Ticket sales have ended for this event
                    </div>
                  ) : (
                    <Button onClick={handlePaystack} className="w-full cta-button h-12 font-bold mt-4 text-base">
                      Pay GHS {total.toLocaleString()} →
                    </Button>
                  )}
                  <div className="mt-3 flex items-center gap-2 justify-center text-xs text-muted-foreground">
                    <ShieldCheck className="w-3.5 h-3.5 text-secondary" />
                    Secured by Paystack
                  </div>
                </motion.div>
              )}

              {step === "processing" && (
                <motion.div key="processing" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="bg-card border border-border/30 rounded-2xl p-6 text-center space-y-5 py-10">
                  <div className="w-12 h-12 border-2 border-secondary border-t-transparent rounded-full animate-spin mx-auto" />
                  <div>
                    <p className="font-semibold mb-1">Complete Payment in Popup</p>
                    <p className="text-sm text-muted-foreground">A Paystack window has opened. Pay there and come back.</p>
                  </div>
                  <Button
                    onClick={async () => {
                      const ref = (window as any).__paystackRef;
                      if (!ref) return;
                      await verifyAndComplete(ref, false);
                    }}
                    className="w-full cta-button font-semibold"
                  >
                    ✓ I've completed payment
                  </Button>
                  <button onClick={() => setStep("checkout")} className="text-xs text-muted-foreground hover:text-foreground underline transition">
                    Cancel and go back
                  </button>
                </motion.div>
              )}
              {step === "success" && confirmedTickets.length > 0 && (
                <motion.div key="success"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                  className="bg-card border border-border/30 rounded-2xl overflow-hidden"
                >
                  {/* Congrats header */}
                  <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-center">
                    <div className="w-14 h-14 rounded-full bg-secondary/20 flex items-center justify-center mx-auto mb-3">
                      <PartyPopper className="w-7 h-7 text-secondary" />
                    </div>
                    <h3 className="text-white font-display font-bold text-xl mb-1">You're In! 🎉</h3>
                    <p className="text-slate-400 text-sm">
                      {confirmedTickets.length > 1
                        ? `${confirmedTickets.length} tickets confirmed. QR codes sent to your email.`
                        : "Your ticket is confirmed. Check your email for the QR code."}
                    </p>
                  </div>

                  {/* Tear line */}
                  <div className="flex items-center px-4 bg-muted/30">
                    <div className="w-5 h-5 rounded-full bg-background -ml-6 flex-shrink-0" />
                    <div className="flex-1 border-t-2 border-dashed border-border mx-2" />
                    <div className="w-5 h-5 rounded-full bg-background -mr-6 flex-shrink-0" />
                  </div>

                  <div className="p-6 space-y-4">
                    {/* Summary row */}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Event</span>
                      <span className="font-semibold text-right max-w-[60%]">{event.title}</span>
                    </div>
                    <div className="flex justify-between text-sm pb-3 border-b border-border">
                      <span className="text-muted-foreground">Total Paid</span>
                      <span className="font-bold text-secondary text-base">
                        GHS {confirmedTickets.reduce((sum, t) => sum + Number(t.total_amount), 0).toLocaleString()}
                      </span>
                    </div>

                    {/* Individual ticket cards */}
                    <div className="space-y-3">
                      {confirmedTickets.map((ticket, idx) => (
                        <div key={ticket.id} className="rounded-xl border border-border/60 overflow-hidden">
                          {/* Card header */}
                          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b border-border/40">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                              Ticket {idx + 1} / {confirmedTickets.length}
                            </span>
                            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                              style={{
                                color: ticket.tier_color || selectedTier?.color || "#01003c",
                                backgroundColor: (ticket.tier_color || selectedTier?.color || "#01003c") + "20",
                                border: `1px solid ${(ticket.tier_color || selectedTier?.color || "#01003c")}40`
                              }}>
                              {ticket.tier_name || selectedTier?.name}
                            </span>
                          </div>
                          {/* Card body */}
                          <div className="p-4 flex gap-4 items-start">
                            {ticket.qr_code_url && (
                              <div className="bg-white p-1.5 rounded-lg border border-border/40 flex-shrink-0">
                                <img src={ticket.qr_code_url} alt="QR" className="w-16 h-16" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-muted-foreground mb-1">Ticket Code</p>
                              <p className="font-mono font-black text-base tracking-[0.15em] text-foreground truncate">
                                {ticket.ticket_code}
                              </p>
                              <p className="text-xs text-muted-foreground mt-2">
                                {ticket.buyer_name}
                              </p>
                            </div>
                          </div>
                          {/* Save button */}
                          <button
                            onClick={() => printTicket(ticket)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold border-t border-border/40 hover:bg-secondary/5 text-secondary transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Save / Print This Ticket
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div className="space-y-2 pt-1">
                      <button
                        onClick={() => {
                          if (confirmedTickets.length === 1) {
                            printTicket(confirmedTickets[0]);
                          } else {
                            printAllTickets();
                          }
                        }}
                        className="w-full h-11 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white transition-all active:scale-95"
                        style={{ background: "linear-gradient(135deg, #01003c, #01003c)" }}
                      >
                        <Download className="w-4 h-4" />
                        {confirmedTickets.length > 1
                          ? `Download All ${confirmedTickets.length} Tickets`
                          : "Save / Print Ticket"}
                      </button>
                      <button
                        onClick={dismissConfirmedTickets}
                        className="w-full h-10 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border"
                      >
                        ✓ Done — Dismiss Ticket
                      </button>
                      <button
                        onClick={() => navigate("/tickets")}
                        className="w-full h-10 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        Browse More Events →
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>
      <Footer />
    </div>
  );
}
