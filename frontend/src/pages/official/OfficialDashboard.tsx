import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, LogOut, Loader2, CheckCircle2, XCircle, Search,
  Users, Ticket, BarChart2, DollarSign, Clock, AlertCircle,
  Upload, Plus, Download, RefreshCw, Trophy, TrendingUp,
  Wallet, ArrowDownToLine, CheckCheck, X, UserPlus,
  ChevronRight, ScanLine, PieChart, ArrowUpFromLine,
  Layers, Printer, Camera, CameraOff, BarChart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { officialsApi } from "@/lib/api";
import {
  BarChart as RBarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart as RPieChart, Pie, Cell, Legend,
} from "recharts";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number | string, currency = "GHS") =>
  `${currency} ${Number(n || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const StatCard = ({ icon: Icon, label, value, sub, color = "secondary" }: any) => (
  <div className="bg-card border border-border/40 rounded-2xl p-5">
    <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center bg-${color}/10 border border-${color}/20`}>
      <Icon className={`w-5 h-5 text-${color}`} />
    </div>
    <p className="text-2xl font-display font-black">{value}</p>
    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    {sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{sub}</p>}
  </div>
);

// ── QR Scanner ────────────────────────────────────────────────────────────────
function QRScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef    = useRef<number>(0);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
        setScanning(true);
        tick();
      } catch {
        setError("Camera access denied. Please allow camera permission.");
      }
    })();
    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const tick = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return; }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    try {
      // Use BarcodeDetector if available (Chrome 83+)
      if ("BarcodeDetector" in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        detector.detect(canvas).then((barcodes: any[]) => {
          if (barcodes.length > 0) {
            const raw = barcodes[0].rawValue || "";
            // Extract ticket code — could be a full URL or raw code
            const match = raw.match(/([A-Z]{3}-[A-Z0-9]{8,})/i) || raw.match(/([A-Z0-9]{6,})/i);
            const code = match ? match[1].toUpperCase() : raw.toUpperCase();
            onScan(code);
            return;
          }
          rafRef.current = requestAnimationFrame(tick);
        }).catch(() => { rafRef.current = requestAnimationFrame(tick); });
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    } catch { rafRef.current = requestAnimationFrame(tick); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold flex items-center gap-2"><Camera className="w-4 h-4" /> Scan QR Code</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        {error ? (
          <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-6 text-center">
            <CameraOff className="w-10 h-10 text-destructive mx-auto mb-3" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : (
          <div className="relative rounded-2xl overflow-hidden bg-black">
            <video ref={videoRef} className="w-full rounded-2xl" muted playsInline />
            <canvas ref={canvasRef} className="hidden" />
            {scanning && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-2 border-secondary rounded-xl relative">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-secondary rounded-tl" />
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-secondary rounded-tr" />
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-secondary rounded-bl" />
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-secondary rounded-br" />
                  <motion.div className="absolute inset-x-0 h-0.5 bg-secondary/70"
                    animate={{ top: ["10%", "90%", "10%"] }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} />
                </div>
              </div>
            )}
          </div>
        )}
        <p className="text-white/40 text-xs text-center mt-4">Point camera at the ticket QR code</p>
      </div>
    </motion.div>
  );
}

// ── Ticket print function ─────────────────────────────────────────────────────
function printTicketList(tickets: any[], eventTitle: string, filterLabel = "All") {
  const rows = tickets.map((t) => {
    const statusColor = t.status === "paid" ? "#01003c" : t.status === "used" ? "#16a34a" : t.status === "pending" ? "#ca8a04" : "#dc2626";
    const tierName = t.tier_name || t.tier?.name || "—";
    return [
      `<tr style='border-bottom:1px solid #e2e8f0;'>`,
      `<td style='padding:8px 10px;font-weight:600;font-size:12px;'>${t.buyer_name}</td>`,
      `<td style='padding:8px 10px;font-size:11px;color:#64748b;'>${t.buyer_email || "—"}</td>`,
      `<td style='padding:8px 10px;font-size:11px;color:#64748b;'>${t.buyer_phone || "—"}</td>`,
      `<td style='padding:8px 10px;font-size:11px;font-weight:600;'>${tierName}</td>`,
      `<td style='padding:8px 10px;text-align:center;font-size:11px;'>${t.quantity}</td>`,
      `<td style='padding:8px 10px;font-family:monospace;font-size:11px;letter-spacing:1px;'>${t.ticket_code}</td>`,
      `<td style='padding:8px 10px;'><span style='color:${statusColor};font-size:10px;font-weight:700;text-transform:uppercase;'>${t.status === "used" ? "CHECKED IN" : t.status}</span></td>`,
      `</tr>`,
    ].join("");
  }).join("");

  const checkin = tickets.filter(t => t.status === "used").length;

  const html = [
    `<!DOCTYPE html><html><head><title>Ticket List — ${eventTitle}</title>`,
    `<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',sans-serif;color:#0f172a;padding:28px;}`,
    `h1{font-size:20px;font-weight:800;margin-bottom:2px;}.meta{color:#64748b;font-size:12px;margin-bottom:20px;}`,
    `.stats{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;}`,
    `.stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 16px;}`,
    `.stat-label{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;}`,
    `.stat-value{font-size:16px;font-weight:800;}`,
    `table{width:100%;border-collapse:collapse;}thead td{background:#f8fafc;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:700;border-bottom:1px solid #e2e8f0;}`,
    `.brand{color:#01003c;font-weight:800;font-size:12px;margin-bottom:16px;letter-spacing:1px;}`,
    `@media print{body{padding:12px;} .no-print{display:none;}}</style></head><body>`,
    `<div class='brand'>★ CELERVOTE — OFFICIAL PORTAL</div>`,
    `<h1>${eventTitle}</h1><div class='meta'>Printed ${new Date().toLocaleString("en-GH")} · Filter: ${filterLabel}</div>`,
    `<div class='stats'>`,
    `<div class='stat'><div class='stat-label'>Total in list</div><div class='stat-value'>${tickets.length}</div></div>`,
    `<div class='stat'><div class='stat-label'>Checked In</div><div class='stat-value' style='color:#16a34a;'>${checkin}</div></div>`,
    `</div>`,
    `<table><thead><tr><td>Name</td><td>Email</td><td>Phone</td><td>Tier</td><td>Qty</td><td>Code</td><td>Status</td></tr></thead>`,
    `<tbody>${rows}</tbody></table>`,
    `<script>window.onload=function(){setTimeout(function(){window.print();},400);}<\/script>`,
    `</body></html>`,
  ].join("");

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

// ── Ticket Dashboard ──────────────────────────────────────────────────────────
function TicketDashboard({ profile, stats, ticketRevStats, onWithdrawRequest, dashData }: {
  profile: any; stats: any; ticketRevStats: any; onWithdrawRequest: () => void; dashData: any;
}) {
  const { toast }                             = useToast();
  const [activeTab, setActiveTab]             = useState<"checkin" | "earnings">("checkin");
  const [ticketCode, setTicketCode]           = useState("");
  const [scanning, setScanning]               = useState(false);
  const [lastResult, setLastResult]           = useState<any>(null);
  const [tickets, setTickets]                 = useState<any[]>([]);
  const [ticketsLoading, setTicketsLoading]   = useState(false);
  const [search, setSearch]                   = useState("");
  const [statusFilter, setStatusFilter]       = useState("");
  const [liveStats, setLiveStats]             = useState(stats);
  const [showQRScanner, setShowQRScanner]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef  = useRef<any>(null);

  const hasPay = ticketRevStats && parseFloat(ticketRevStats.my_percentage) > 0;

  const loadTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const params: any = {};
      if (search)       params.search = search;
      if (statusFilter) params.status = statusFilter;
      const data = await officialsApi.getTickets(params);
      setTickets(data.tickets || []);
      if (data.stats) setLiveStats(data.stats);
    } catch { toast({ title: "Failed to load tickets", variant: "destructive" }); }
    finally { setTicketsLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => {
    loadTickets();
    pollRef.current = setInterval(() => {
      officialsApi.getTickets({}).then(d => {
        if (d.stats) setLiveStats(d.stats);
        if (!search && !statusFilter) setTickets(d.tickets || []);
      }).catch(() => {});
    }, 10000);
    return () => clearInterval(pollRef.current);
  }, [search, statusFilter]);

  useEffect(() => { setLiveStats(stats); }, [stats]);

  const handleCheckIn = async (code?: string) => {
    const c = (code || ticketCode).trim().toUpperCase();
    if (!c) return;
    setScanning(true); setLastResult(null);
    try {
      const data = await officialsApi.checkIn(c);
      setLastResult({ success: true, ...data });
      if (data.success) {
        toast({ title: `✅ ${data.ticket?.buyer_name} checked in!` });
        loadTickets();
      }
    } catch (e: any) {
      setLastResult({ success: false, error: e?.message || "Check-in failed." });
      toast({ title: "Check-in failed", description: e?.message, variant: "destructive" });
    } finally {
      setScanning(false);
      setTicketCode("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleQRScan = (code: string) => {
    setShowQRScanner(false);
    handleCheckIn(code);
  };

  const statusBadge = (s: string) => {
    const map: any = {
      paid:      "bg-blue-500/10 text-blue-400 border-blue-500/20",
      used:      "bg-green-500/10 text-green-400 border-green-500/20",
      pending:   "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
      cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
    };
    return map[s] || "bg-muted text-muted-foreground";
  };

  const paidTickets    = tickets.filter(t => t.status === "paid");
  const pendingTickets = tickets.filter(t => t.status === "pending");
  const otherTickets   = tickets.filter(t => t.status !== "paid" && t.status !== "pending");

  const TicketRow = ({ t }: { t: any }) => (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
      <div>
        <p className="text-sm font-semibold">{t.buyer_name}</p>
        <p className="text-xs text-muted-foreground font-mono">{t.ticket_code} · {t.tier_name || t.tier?.name}</p>
        <p className="text-xs text-muted-foreground">{t.buyer_email}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium">×{t.quantity}</span>
        <span className={`text-xs px-2 py-1 rounded-full border font-medium ${statusBadge(t.status)}`}>
          {t.status === "used" ? "Checked in" : t.status}
        </span>
      </div>
    </div>
  );

  const tabs = [
    { key: "checkin",  label: "Check-in",  icon: ScanLine },
    ...(hasPay ? [{ key: "earnings", label: "Earnings", icon: Wallet }] : []),
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Ticket}     label="Total tickets"  value={liveStats?.total      || 0} color="secondary" />
        <StatCard icon={CheckCheck} label="Checked in"     value={liveStats?.checked_in || 0} color="green-500" />
        <StatCard icon={DollarSign} label="Paid"           value={liveStats?.paid       || 0} color="blue-400" />
        <StatCard icon={Clock}      label="Pending"        value={liveStats?.pending    || 0} color="yellow-500" />
      </div>

      {/* Tab bar */}
      {tabs.length > 1 && (
        <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setActiveTab(key as any)}
              className={`flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                activeTab === key ? "bg-card text-foreground shadow-sm border border-border/40" : "text-muted-foreground hover:text-foreground"
              }`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">

        {/* Check-in tab */}
        {activeTab === "checkin" && (
          <motion.div key="checkin" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            {/* Scanner */}
            <div className="bg-card border border-border/40 rounded-2xl p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <ScanLine className="w-4 h-4 text-secondary" /> Check In a Ticket
              </h3>
              <div className="flex gap-2 mb-4">
                <Input ref={inputRef} placeholder="Enter or scan ticket code (e.g. ABC-XY123456)"
                  value={ticketCode} onChange={e => setTicketCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === "Enter" && handleCheckIn()} className="h-11 font-mono" autoFocus />
                <Button onClick={() => setShowQRScanner(true)} variant="outline" className="h-11 px-3 flex-shrink-0 gap-1.5">
                  <Camera className="w-4 h-4" />
                  <span className="hidden sm:inline">Scan QR</span>
                </Button>
                <Button onClick={() => handleCheckIn()} disabled={scanning || !ticketCode.trim()}
                  className="h-11 px-5 bg-secondary text-secondary-foreground hover:bg-secondary/90 flex-shrink-0 gap-2">
                  {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                  Check In
                </Button>
              </div>
              <AnimatePresence>
                {lastResult && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className={`rounded-xl p-4 border flex items-start gap-3 ${lastResult.success ? "bg-green-500/5 border-green-500/20" : "bg-destructive/5 border-destructive/20"}`}>
                    {lastResult.success
                      ? <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                      : <XCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />}
                    <div>
                      <p className={`text-sm font-semibold ${lastResult.success ? "text-green-400" : "text-destructive"}`}>
                        {lastResult.success ? lastResult.message : lastResult.error}
                      </p>
                      {lastResult.ticket && (
                        <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                          <p>{lastResult.ticket.buyer_name} · {lastResult.ticket.tier_name}</p>
                          <p>{lastResult.ticket.buyer_email} · {lastResult.ticket.buyer_phone}</p>
                          <p>Qty: {lastResult.ticket.quantity}</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Ticket list */}
            <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-border/30 flex flex-wrap gap-3 items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2"><Ticket className="w-4 h-4 text-secondary" /> Ticket List</h3>
                <div className="flex gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="h-9 pl-8 w-40 text-sm" />
                  </div>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="h-9 px-3 text-sm rounded-md border border-input bg-background text-foreground">
                    <option value="">All</option>
                    <option value="paid">Paid</option>
                    <option value="used">Checked in</option>
                    <option value="pending">Pending</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <Button size="sm" variant="outline" onClick={() => printTicketList(tickets, profile.event_title, statusFilter || "All")} className="h-9 gap-1.5">
                    <Printer className="w-3.5 h-3.5" /><span className="hidden sm:inline">Print</span>
                  </Button>
                  <Button size="sm" variant="outline" onClick={loadTickets} className="h-9">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {ticketsLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">No tickets found.</div>
              ) : statusFilter ? (
                <div className="divide-y divide-border/20">{tickets.map((t: any) => <TicketRow key={t.id} t={t} />)}</div>
              ) : (
                <div className="divide-y divide-border/30">
                  {paidTickets.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-blue-500/5 border-b border-blue-500/10">
                        <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide flex items-center gap-1.5">
                          <DollarSign className="w-3 h-3" /> Paid ({paidTickets.length})
                        </p>
                      </div>
                      <div className="divide-y divide-border/20">{paidTickets.map((t: any) => <TicketRow key={t.id} t={t} />)}</div>
                    </div>
                  )}
                  {pendingTickets.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-yellow-500/5 border-b border-yellow-500/10">
                        <p className="text-xs font-semibold text-yellow-500 uppercase tracking-wide flex items-center gap-1.5">
                          <Clock className="w-3 h-3" /> Pending ({pendingTickets.length})
                        </p>
                      </div>
                      <div className="divide-y divide-border/20">{pendingTickets.map((t: any) => <TicketRow key={t.id} t={t} />)}</div>
                    </div>
                  )}
                  {otherTickets.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-muted/30 border-b border-border/20">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Other</p>
                      </div>
                      <div className="divide-y divide-border/20">{otherTickets.map((t: any) => <TicketRow key={t.id} t={t} />)}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Earnings tab */}
        {activeTab === "earnings" && hasPay && (
          <motion.div key="earnings" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
            {/* 3 stat cards — earned, withdrawn, available balance */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard icon={TrendingUp}      label="Total earned"       value={fmt(ticketRevStats.my_earned)}   color="green-500" />
              <StatCard icon={ArrowDownToLine} label="Withdrawn"          value={fmt(ticketRevStats.my_withdrawn)} color="blue-400" />
              <StatCard icon={Wallet}          label="Available balance"  value={fmt(ticketRevStats.my_balance)}  color="secondary" />
            </div>

            {/* Revenue share info */}
            <div className="bg-card border border-secondary/20 rounded-2xl p-5">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <BarChart className="w-4 h-4 text-secondary" /> Your Revenue Share
              </h3>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-secondary/10 border-2 border-secondary/30 flex items-center justify-center">
                  <span className="text-lg font-black text-secondary">{ticketRevStats.my_percentage}%</span>
                </div>
                <div>
                  <p className="font-semibold text-sm">You earn {ticketRevStats.my_percentage}% of ticket sales</p>
                  <p className="text-xs text-muted-foreground">Calculated from confirmed (paid + checked in) tickets</p>
                </div>
              </div>
              {/* Bar visualisation */}
              {parseFloat(ticketRevStats.my_earned) > 0 && (
                <div className="space-y-2">
                  {[
                    { label: "Withdrawn", value: parseFloat(ticketRevStats.my_withdrawn), total: parseFloat(ticketRevStats.my_earned), color: "bg-blue-400" },
                    { label: "Available", value: parseFloat(ticketRevStats.my_balance),   total: parseFloat(ticketRevStats.my_earned), color: "bg-secondary" },
                  ].map(({ label, value, total, color }) => {
                    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                    return (
                      <div key={label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-medium">{fmt(value)} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <motion.div className={`h-full rounded-full ${color}`}
                            initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Request withdrawal */}
            <div className="flex justify-end">
              <Button onClick={onWithdrawRequest}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/90 gap-2">
                <ArrowUpFromLine className="w-4 h-4" /> Request Withdrawal
              </Button>
            </div>

            {/* Withdrawal history */}
            {dashData?.withdrawals?.length > 0 && (
              <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border/30">
                  <h3 className="font-semibold text-sm">Withdrawal History</h3>
                </div>
                <div className="divide-y divide-border/20">
                  {dashData.withdrawals.map((w: any) => (
                    <div key={w.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-semibold">{fmt(w.amount)}</p>
                        <p className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleDateString()}</p>
                        {w.note && <p className="text-xs text-muted-foreground italic">{w.note}</p>}
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                        w.status === "approved" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                        w.status === "declined" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                        "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                      }`}>{w.status === "pending" ? "⏳ Pending" : w.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>

      {/* QR Scanner overlay */}
      <AnimatePresence>
        {showQRScanner && <QRScanner onScan={handleQRScan} onClose={() => setShowQRScanner(false)} />}
      </AnimatePresence>
    </div>
  );
}

// ── Org Results Tabs ──────────────────────────────────────────────────────────
// ── CHART COLOURS ────────────────────────────────────────────────────────────
const CHART_COLORS = ["#6366f1","#C9A84C","#22c55e","#f59e0b","#ec4899","#14b8a6","#8b5cf6","#ef4444","#3b82f6","#f97316"];

// ── Single category results card with bar + pie charts ────────────────────────
function CategoryResultCard({ cat, accentIdx = 0 }: { cat: any; accentIdx?: number }) {
  const candidates = [...(cat.candidates || [])].sort((a: any, b: any) => b.vote_count - a.vote_count);
  const total = candidates.reduce((s: number, c: any) => s + c.vote_count, 0);
  const [chartType, setChartType] = useState<"bar" | "pie">("pie");

  const barData = candidates.map((c: any) => ({
    name: c.name.length > 14 ? c.name.slice(0, 13) + "…" : c.name,
    fullName: c.name,
    votes: c.vote_count,
    pct:   total > 0 ? Math.round((c.vote_count / total) * 100) : 0,
  }));

  const pieData = candidates.map((c: any, i: number) => ({
    name: c.name,
    value: c.vote_count,
    color: CHART_COLORS[i % CHART_COLORS.length],
  })).filter(d => d.value > 0);

  return (
    <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border/30 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-sm">{cat.category_name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{total.toLocaleString()} votes · {candidates.length} candidates</p>
        </div>
        <div className="flex gap-1 p-0.5 bg-muted rounded-lg">
          <button onClick={() => setChartType("bar")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${chartType === "bar" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
            Bar
          </button>
          <button onClick={() => setChartType("pie")}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${chartType === "pie" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
            Pie
          </button>
        </div>
      </div>
      <div className="p-4">
        {/* Winner highlight */}
        {candidates[0] && total > 0 && (
          <div className="flex items-center gap-3 mb-4 px-3 py-2.5 rounded-xl bg-secondary/8 border border-secondary/20">
            <span className="text-lg">🏆</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-secondary truncate">{candidates[0].name}</p>
              <p className="text-xs text-muted-foreground">{candidates[0].vote_count.toLocaleString()} votes · {total > 0 ? Math.round((candidates[0].vote_count / total) * 100) : 0}%</p>
            </div>
          </div>
        )}

        {/* Chart */}
        {total > 0 && (
          <div className="mb-4">
            {chartType === "bar" ? (
              <ResponsiveContainer width="100%" height={160}>
                <RBarChart data={barData} margin={{ top: 4, right: 8, bottom: 24, left: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ fill: "rgba(99,102,241,0.06)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-card border border-border/40 rounded-xl px-3 py-2 text-xs shadow-lg">
                          <p className="font-semibold mb-0.5">{d.fullName}</p>
                          <p className="text-muted-foreground">{d.votes.toLocaleString()} votes · {d.pct}%</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="votes" radius={[6, 6, 0, 0]}>
                    {barData.map((_: any, i: number) => (
                      <Cell key={i} fill={i === 0 ? CHART_COLORS[accentIdx % CHART_COLORS.length] : "rgba(99,102,241,0.3)"} />
                    ))}
                  </Bar>
                </RBarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <RPieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                    {pieData.map((entry: any, i: number) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const d = payload[0].payload;
                      const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
                      return (
                        <div className="bg-card border border-border/40 rounded-xl px-3 py-2 text-xs shadow-lg">
                          <p className="font-semibold mb-0.5">{d.name}</p>
                          <p className="text-muted-foreground">{d.value.toLocaleString()} votes · {pct}%</p>
                        </div>
                      );
                    }}
                  />
                  <Legend iconType="circle" iconSize={8} formatter={(v: string) => <span style={{ fontSize: 11 }}>{v}</span>} />
                </RPieChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {/* Progress bars list */}
        <div className="space-y-2">
          {candidates.map((c: any, i: number) => {
            const pct = total > 0 ? Math.round((c.vote_count / total) * 100) : 0;
            return (
              <div key={c.id} className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-black text-white"
                  style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className={`font-medium truncate ${i === 0 && total > 0 ? "text-secondary" : "text-foreground"}`}>{c.name}</span>
                    <span className="text-muted-foreground ml-2 flex-shrink-0">{c.vote_count.toLocaleString()} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div className="h-full rounded-full"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                      initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, delay: i * 0.05 }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Full results section — standard or org ────────────────────────────────────
function ResultsView({ results, isOrg }: { results: any[]; isOrg: boolean }) {
  if (results.length === 0) return <div className="text-center py-16 text-muted-foreground">No results yet.</div>;

  // Split into global categories and group categories using is_global from backend
  const globalCats = results.filter((cat: any) => cat.is_global !== false);
  const groupCats  = results.filter((cat: any) => cat.is_global === false);
  const hasGroupCats = isOrg && groupCats.length > 0;

  // Collect unique groups from group categories
  const groupMap: Record<string, string> = {};
  groupCats.forEach((cat: any) => {
    (cat.group_ids || []).forEach((gid: string, idx: number) => {
      groupMap[gid] = (cat.group_names || [])[idx] || gid;
    });
  });
  const groups = Object.entries(groupMap).map(([id, name]) => ({ id, name }));

  // Overall analytics
  const totalVotes = results.reduce((s: number, cat: any) =>
    s + (cat.candidates || []).reduce((ss: number, c: any) => ss + c.vote_count, 0), 0);
  const leaders = results.map((cat: any) => {
    const sorted = [...(cat.candidates || [])].sort((a: any, b: any) => b.vote_count - a.vote_count);
    return sorted[0]?.vote_count > 0 ? { cat: cat.category_name, name: sorted[0].name, votes: sorted[0].vote_count } : null;
  }).filter(Boolean);

  // Pie chart data for overall vote distribution across categories
  const distData = results.map((cat: any, i: number) => ({
    name: cat.category_name,
    value: (cat.candidates || []).reduce((s: number, c: any) => s + c.vote_count, 0),
    color: CHART_COLORS[i % CHART_COLORS.length],
  })).filter(d => d.value > 0);

  const [groupTab, setGroupTab] = useState<string>(groups[0]?.id || "");

  return (
    <div className="space-y-5">
      {/* ── Analytics overview card ── */}
      <div className="bg-card border border-secondary/20 rounded-2xl p-5">
        <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
          <PieChart className="w-4 h-4 text-secondary" /> Overview Analytics
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          <div className="bg-muted/40 rounded-xl p-3">
            <p className="text-2xl font-black">{totalVotes.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total votes cast</p>
          </div>
          <div className="bg-muted/40 rounded-xl p-3">
            <p className="text-2xl font-black">{results.length}</p>
            <p className="text-xs text-muted-foreground">Categories</p>
          </div>
          {hasGroupCats && (
            <div className="bg-muted/40 rounded-xl p-3">
              <p className="text-2xl font-black">{groups.length}</p>
              <p className="text-xs text-muted-foreground">Groups</p>
            </div>
          )}
        </div>
        {/* Vote distribution pie */}
        {distData.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2">Vote distribution by category</p>
            <ResponsiveContainer width="100%" height={180}>
              <RPieChart>
                <Pie data={distData} cx="50%" cy="50%" outerRadius={70} paddingAngle={2} dataKey="value">
                  {distData.map((d: any, i: number) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return <div className="bg-card border border-border/40 rounded-xl px-3 py-2 text-xs shadow-lg"><p className="font-semibold">{d.name}</p><p className="text-muted-foreground">{d.value.toLocaleString()} votes</p></div>;
                }} />
                <Legend iconType="circle" iconSize={7} formatter={(v: string) => <span style={{ fontSize: 10 }}>{v}</span>} />
              </RPieChart>
            </ResponsiveContainer>
          </div>
        )}

      </div>

      {/* ── General / Global categories ── */}
      {globalCats.length > 0 && (
        <div className="space-y-4">
          {hasGroupCats && (
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border/40" />
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-2 flex items-center gap-1.5">
                <Layers className="w-3 h-3" /> General Categories
              </span>
              <div className="h-px flex-1 bg-border/40" />
            </div>
          )}
          {globalCats.map((cat: any, i: number) => (
            <CategoryResultCard key={cat.category_id} cat={cat} accentIdx={i} />
          ))}
        </div>
      )}

      {/* ── Group categories ── */}
      {hasGroupCats && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border/40" />
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-2 flex items-center gap-1.5">
              <Users className="w-3 h-3" /> Group Categories
            </span>
            <div className="h-px flex-1 bg-border/40" />
          </div>

          {/* Group tab selector */}
          {groups.length > 1 && (
            <div className="flex gap-1 p-1 bg-muted rounded-xl overflow-x-auto">
              {groups.map((g) => (
                <button key={g.id} onClick={() => setGroupTab(g.id)}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all whitespace-nowrap min-w-fit ${
                    groupTab === g.id ? "bg-card text-foreground shadow-sm border border-border/40" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  {g.name}
                </button>
              ))}
            </div>
          )}

          {/* Show group categories filtered by selected group */}
          {groupCats
            .filter((cat: any) => groups.length <= 1 || (cat.group_ids || []).includes(groupTab))
            .map((cat: any, i: number) => (
              <CategoryResultCard key={`${cat.category_id}-${groupTab}`} cat={cat} accentIdx={globalCats.length + i} />
            ))
          }
        </div>
      )}
    </div>
  );
}

// ── Election Dashboard ────────────────────────────────────────────────────────
function ElectionDashboard({ profile, dashData }: { profile: any; dashData: any }) {
  const { toast }                     = useToast();
  const [activeTab, setActiveTab]     = useState<"overview" | "voters" | "results" | "withdraw">("overview");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawNote, setWithdrawNote]     = useState("");
  const [withdrawing, setWithdrawing]       = useState(false);
  const [withdrawals, setWithdrawals]       = useState<any[]>(dashData?.withdrawals || []);
  const [voters, setVoters]           = useState<any[]>([]);
  const [votersLoading, setVotersLoading] = useState(false);
  const [voterSearch, setVoterSearch] = useState("");
  const [voterStatus, setVoterStatus] = useState("");
  const [groups, setGroups]           = useState<any[]>([]);
  const [showAddVoter, setShowAddVoter] = useState(false);
  const [newVoter, setNewVoter]       = useState({ voter_id: "", name: "", phone: "", email: "", group_id: "" });
  const [addingVoter, setAddingVoter] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null)

  const rev     = dashData?.revenue_stats;
  const roll    = dashData?.voter_roll_stats;
  const results = dashData?.results || [];
  const isPaid  = !!rev;
  const isOrg   = !!roll;

  useEffect(() => { if (activeTab === "voters" && isOrg) loadVoters(); }, [activeTab, voterSearch, voterStatus]);
  useEffect(() => { setWithdrawals(dashData?.withdrawals || []); }, [dashData]);

  const loadVoters = async () => {
    setVotersLoading(true);
    try {
      const params: any = {};
      if (voterSearch) params.search = voterSearch;
      if (voterStatus) params.status = voterStatus;
      const data = await officialsApi.getVoterRoll(params);
      setVoters(data.voters || []);
      setGroups(data.groups || []);
    } catch { toast({ title: "Failed to load voter roll", variant: "destructive" }); }
    finally { setVotersLoading(false); }
  };

  const handleAddVoter = async () => {
    if (!newVoter.voter_id) { toast({ title: "Voter ID is required", variant: "destructive" }); return; }
    setAddingVoter(true);
    try {
      await officialsApi.addVoter(newVoter);
      toast({ title: "Voter added successfully ✅" });
      setShowAddVoter(false);
      setNewVoter({ voter_id: "", name: "", phone: "", email: "", group_id: "" });
      loadVoters();
    } catch (e: any) { toast({ title: "Failed to add voter", description: e?.message, variant: "destructive" }); }
    finally { setAddingVoter(false); }
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      await officialsApi.uploadVoterCSV(file, false);
      toast({ title: "CSV uploaded ✅" });
      loadVoters();
    } catch (e: any) { toast({ title: "CSV upload failed", description: e?.message, variant: "destructive" }); }
    e.target.value = "";
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    if (amount > (rev?.my_balance || 0)) { toast({ title: "Amount exceeds your balance", variant: "destructive" }); return; }
    setWithdrawing(true);
    try {
      const wr = await officialsApi.requestWithdrawal(amount, withdrawNote);
      toast({ title: "Withdrawal request submitted ✅", description: "Admin will review shortly." });
      setWithdrawAmount(""); setWithdrawNote("");
      setWithdrawals(prev => [wr, ...prev]);
    } catch (e: any) { toast({ title: "Request failed", description: e?.message, variant: "destructive" }); }
    finally { setWithdrawing(false); }
  };

  const tabs = [
    { key: "overview", label: "Overview",   icon: BarChart2 },
    ...(isOrg  ? [{ key: "voters",   label: "Voter Roll", icon: Users   }] : []),
    { key: "results",  label: "Results",    icon: Trophy    },
    ...(isPaid ? [{ key: "withdraw", label: "Earnings",   icon: Wallet  }] : []),
  ];

  // ── Results rendering — delegate to ResultsView ──────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex gap-1 p-1 bg-muted rounded-xl overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key as any)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap min-w-fit ${
              activeTab === key ? "bg-card text-foreground shadow-sm border border-border/40" : "text-muted-foreground hover:text-foreground"
            }`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">

        {activeTab === "overview" && (
          <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {isPaid && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <StatCard icon={BarChart2}  label="Total votes"  value={(rev.total_votes || 0).toLocaleString()} />
                <StatCard icon={Wallet}     label="My share"     value={`${rev.my_percentage}%`} color="blue-400" />
                <StatCard icon={DollarSign} label="My earnings"  value={fmt(rev.my_earned)} color="secondary" sub={`Balance: ${fmt(rev.my_balance)}`} />
              </div>
            )}
            {isOrg && (
              <div className="grid grid-cols-3 gap-4 mb-6">
                <StatCard icon={Users}      label="Total voters"  value={roll.total}     color="secondary" />
                <StatCard icon={CheckCheck} label="Has voted"     value={roll.voted}     color="green-500" />
                <StatCard icon={Clock}      label="Not yet voted" value={roll.not_voted} color="yellow-500" />
              </div>
            )}
            <div className="bg-card border border-border/40 rounded-2xl p-5">
              <h3 className="font-semibold mb-1 text-sm">{profile.event_title}</h3>
              <p className="text-xs text-muted-foreground">
                {isPaid ? "Paid election" : isOrg ? "Organisational election" : "Election"} · Official since {new Date(profile.created_at).toLocaleDateString()}
              </p>
            </div>
          </motion.div>
        )}

        {activeTab === "voters" && isOrg && (
          <motion.div key="voters" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <div className="flex gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input placeholder="Search voters..." value={voterSearch} onChange={e => setVoterSearch(e.target.value)} className="h-9 pl-8 w-48 text-sm" />
                </div>
                <select value={voterStatus} onChange={e => setVoterStatus(e.target.value)}
                  className="h-9 px-3 text-sm rounded-md border border-input bg-background text-foreground">
                  <option value="">All</option>
                  <option value="unused">Not voted</option>
                  <option value="used">Voted</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowAddVoter(v => !v)} className="gap-1.5 h-9"><UserPlus className="w-3.5 h-3.5" /> Add</Button>
                <Button size="sm" variant="outline" onClick={() => csvRef.current?.click()} className="gap-1.5 h-9"><Upload className="w-3.5 h-3.5" /> CSV</Button>
                <input ref={csvRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
              </div>
            </div>
            <AnimatePresence>
              {showAddVoter && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="bg-card border border-secondary/30 rounded-2xl p-5 space-y-3">
                    <h4 className="font-semibold text-sm flex items-center gap-2"><UserPlus className="w-4 h-4 text-secondary" /> Add Voter Manually</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input placeholder="Voter ID *" value={newVoter.voter_id} onChange={e => setNewVoter(v => ({ ...v, voter_id: e.target.value }))} className="h-10" />
                      <Input placeholder="Full name" value={newVoter.name} onChange={e => setNewVoter(v => ({ ...v, name: e.target.value }))} className="h-10" />
                      <Input placeholder="Phone" value={newVoter.phone} onChange={e => setNewVoter(v => ({ ...v, phone: e.target.value }))} className="h-10" />
                      <Input placeholder="Email" value={newVoter.email} onChange={e => setNewVoter(v => ({ ...v, email: e.target.value }))} className="h-10" />
                      {groups.length > 0 && (
                        <select value={newVoter.group_id} onChange={e => setNewVoter(v => ({ ...v, group_id: e.target.value }))}
                          className="h-10 px-3 text-sm rounded-md border border-input bg-background text-foreground col-span-full">
                          <option value="">No group</option>
                          {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleAddVoter} disabled={addingVoter} className="bg-secondary text-secondary-foreground gap-1.5">
                        {addingVoter ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowAddVoter(false)}>Cancel</Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
              {votersLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>
              ) : voters.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">No voters found.</div>
              ) : (
                <div className="divide-y divide-border/20">
                  {voters.map((v: any) => (
                    <div key={v.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div>
                        <p className="text-sm font-semibold">{v.name || v.voter_id}</p>
                        <p className="text-xs text-muted-foreground font-mono">{v.voter_id}</p>
                        {v.group__name && <p className="text-xs text-muted-foreground">{v.group__name}</p>}
                      </div>
                      <div className="flex items-center gap-3">
                        {v.phone && <p className="text-xs text-muted-foreground hidden sm:block">{v.phone}</p>}
                        <span className={`text-xs px-2 py-1 rounded-full border font-medium ${
                          v.status === "used" ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                        }`}>{v.status === "used" ? "Voted" : "Not voted"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === "results" && (
          <motion.div key="results" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <ResultsView results={results} isOrg={isOrg} />
          </motion.div>
        )}

        {activeTab === "withdraw" && isPaid && (
          <motion.div key="withdraw" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              <StatCard icon={TrendingUp}      label="Total earned"      value={fmt(rev.my_earned)}    color="green-500" />
              <StatCard icon={ArrowDownToLine} label="Withdrawn"         value={fmt(rev.my_withdrawn)} color="blue-400" />
              <StatCard icon={Wallet}          label="Available balance" value={fmt(rev.my_balance)}   color="secondary" />
            </div>
            <div className="bg-card border border-secondary/30 rounded-2xl p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2"><ArrowDownToLine className="w-4 h-4 text-secondary" /> Request Withdrawal</h3>
              <div className="space-y-3">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">GHS</span>
                  <Input type="number" placeholder="0.00" min={1} max={rev.my_balance}
                    value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} className="h-11 pl-14 text-base" />
                </div>
                <Input placeholder="Note (optional)" value={withdrawNote} onChange={e => setWithdrawNote(e.target.value)} className="h-10" />
                <Button onClick={handleWithdraw} disabled={withdrawing || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                  className="w-full h-11 bg-secondary text-secondary-foreground hover:bg-secondary/90 gap-2">
                  {withdrawing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />} Submit Request
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Available: <span className="font-semibold text-secondary">{fmt(rev.my_balance)}</span>
                </p>
              </div>
            </div>
            {withdrawals.length > 0 && (
              <div className="bg-card border border-border/40 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border/30"><h3 className="font-semibold text-sm">Withdrawal History</h3></div>
                <div className="divide-y divide-border/20">
                  {withdrawals.map((w: any) => (
                    <div key={w.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-semibold">{fmt(w.amount)}</p>
                        <p className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleDateString()}</p>
                        {w.note && <p className="text-xs text-muted-foreground italic">{w.note}</p>}
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                        w.status === "approved" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                        w.status === "declined" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                        "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                      }`}>{w.status === "pending" ? "⏳ Pending" : w.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

// ── Ticket Withdrawal Modal ───────────────────────────────────────────────────
function TicketWithdrawModal({ onClose, balance }: { onClose: () => void; balance: number }) {
  const { toast }           = useToast();
  const [amount, setAmount] = useState("");
  const [note, setNote]     = useState("");
  const [loading, setLoading] = useState(false);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  useEffect(() => {
    officialsApi.getWithdrawals?.().then((d: any) => setWithdrawals(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setHistLoading(false));
  }, []);

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    if (amt > balance) { toast({ title: "Amount exceeds your available balance", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const wr = await officialsApi.requestWithdrawal(amt, note);
      toast({ title: "Withdrawal request submitted ✅" });
      setWithdrawals(prev => [wr, ...prev]);
      setAmount(""); setNote("");
    } catch (e: any) { toast({ title: "Request failed", description: e?.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        className="bg-card border border-border/40 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="h-1" style={{ background: "linear-gradient(90deg, #01003c, #6366f1, #C9A84C)" }} />
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold flex items-center gap-2"><ArrowUpFromLine className="w-4 h-4 text-secondary" /> Request Withdrawal</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Available balance: <span className="font-semibold text-secondary">{fmt(balance)}</span></p>
          <div className="space-y-3 mb-5">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">GHS</span>
              <Input type="number" placeholder="0.00" min={1} max={balance} value={amount} onChange={e => setAmount(e.target.value)} className="h-11 pl-14 text-base" />
            </div>
            <Input placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} className="h-10" />
            <Button onClick={handleSubmit} disabled={loading || !amount}
              className="w-full h-11 bg-secondary text-secondary-foreground hover:bg-secondary/90 gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownToLine className="w-4 h-4" />} Submit Request
            </Button>
          </div>
          {histLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-secondary" /></div>
          ) : withdrawals.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">History</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {withdrawals.map((w: any) => (
                  <div key={w.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-semibold">{fmt(w.amount)}</p>
                      <p className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleDateString()}{w.note ? ` · ${w.note}` : ""}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                      w.status === "approved" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                      w.status === "declined" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                      "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                    }`}>{w.status === "pending" ? "⏳ Pending" : w.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function OfficialDashboard() {
  const navigate   = useNavigate();
  const { toast }  = useToast();
  const [profile, setProfile]   = useState<any>(null);
  const [dashData, setDashData] = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("official_profile");
    if (stored) setProfile(JSON.parse(stored));
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const data = await officialsApi.getDashboard();
      setProfile(data);
      setDashData(data);
    } catch {
      toast({ title: "Session expired. Please log in again.", variant: "destructive" });
      handleLogout();
    } finally { setLoading(false); }
  };

  const handleLogout = () => {
    ["official_access_token","official_refresh_token","official_profile","access_token","refresh_token"]
      .forEach(k => localStorage.removeItem(k));
    navigate("/official/login");
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-secondary mx-auto" />
        <p className="text-sm text-muted-foreground">Loading dashboard...</p>
      </div>
    </div>
  );

  if (!profile) { navigate("/official/login"); return null; }

  const isTicketing = profile.event_kind === "ticketing";
  const isElection  = profile.event_kind === "election";
  const ticketRevStats = dashData?.ticket_revenue_stats;

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border/40">
        <div className="container mx-auto px-4 max-w-4xl h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-black"
              style={{ background: "linear-gradient(135deg, #01003c, #020057)" }}>CV</div>
            <div>
              <p className="font-bold text-sm leading-none">Official Portal</p>
              <p className="text-xs text-muted-foreground leading-none mt-0.5">{profile.event_title}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-secondary/10 border border-secondary/20 flex items-center justify-center text-xs font-bold text-secondary">
                {profile.name?.[0]?.toUpperCase()}
              </div>
              <span className="text-sm font-medium">{profile.name}</span>
            </div>
            <Button size="sm" variant="outline" onClick={handleLogout} className="gap-1.5 h-8">
              <LogOut className="w-3.5 h-3.5" /> Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-4xl py-8">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5 mb-8 flex items-center justify-between flex-wrap gap-4"
          style={{ background: "linear-gradient(135deg, #01003c 0%, #020057 50%, #0a0070 100%)" }}>
          <div>
            <p className="text-white/60 text-xs mb-0.5">Official dashboard</p>
            <h1 className="text-white font-display font-black text-xl">{profile.event_title}</h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/80 font-medium">
                {isTicketing ? "🎟️ Ticketing" : "🗳️ Election"}
              </span>
              {profile.revenue_percentage > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/80 font-medium">
                  {profile.revenue_percentage}% revenue share
                </span>
              )}
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={loadDashboard} className="text-white/60 hover:text-white hover:bg-white/10 gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </motion.div>

        {isTicketing && dashData && (
          <TicketDashboard
            profile={profile}
            stats={dashData.ticket_stats}
            ticketRevStats={ticketRevStats}
            onWithdrawRequest={() => setShowWithdrawModal(true)}
            dashData={dashData}
          />
        )}
        {isElection && dashData && (
          <ElectionDashboard profile={profile} dashData={dashData} />
        )}
      </div>

      <AnimatePresence>
        {showWithdrawModal && (
          <TicketWithdrawModal
            balance={ticketRevStats?.my_balance || 0}
            onClose={() => setShowWithdrawModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
