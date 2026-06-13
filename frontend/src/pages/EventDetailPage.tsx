import { PaymentModal } from "../components/PaymentModal";
import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Users, Clock, Shield, CheckCircle2, Share2,
  Loader2, Trophy, ChevronRight, Lock, Calendar,
  BarChart2, Zap, Radio, Minus, Plus, AlertCircle,
  Vote, ListChecks, ClipboardList, RotateCcw, Search, X,
} from "lucide-react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useEvent, useCastVote } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import { castBulkVote } from "../lib/api";
import { useToast } from "@/hooks/use-toast";
import confetti from "canvas-confetti";

const NAVY   = "#002856";
const ORANGE = "#e87200";

const typeIcon: Record<string, any> = {
  election: Trophy, contest: Zap, survey: BarChart2, live_show: Radio,
};
const typeEmoji: Record<string, string> = {
  election: "🗳️", contest: "🏆", survey: "📊", live_show: "📺",
};

// ── helpers ───────────────────────────────────────────────────────────────────
const fireConfetti = () => {
  confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 }, colors: [NAVY, ORANGE, "#fff", "#ffd700"] });
  setTimeout(() => confetti({ particleCount: 40, spread: 80, origin: { y: 0.6, x: 0.3 }, colors: [NAVY, ORANGE] }), 200);
  setTimeout(() => confetti({ particleCount: 40, spread: 80, origin: { y: 0.6, x: 0.7 }, colors: [NAVY, ORANGE] }), 400);
};

// ── Org Done countdown card ───────────────────────────────────────────────────
function OrgDoneCard({ voterRollName, eventTitle, onReset }: {
  voterRollName: string; eventTitle: string; onReset: () => void;
}) {
  const [n, setN] = useState(5);
  useEffect(() => {
    const t = setInterval(() => setN(p => { if (p <= 1) { clearInterval(t); onReset(); return 0; } return p - 1; }), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <motion.div className="glass-card p-10 text-center border-green-500/30 bg-green-500/5"
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
      <div className="w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center mx-auto mb-5">
        <CheckCircle2 className="w-10 h-10 text-green-400" />
      </div>
      <h3 className="font-display font-bold text-2xl mb-2">Voting Complete! 🎉</h3>
      <p className="text-muted-foreground text-sm mb-1 max-w-sm mx-auto">
        <strong>{voterRollName}</strong>'s votes recorded for <strong>{eventTitle}</strong>.
      </p>
      <p className="text-muted-foreground text-xs mb-6 max-w-sm mx-auto">Code is now marked as used.</p>
      <div className="flex items-center justify-center mb-5">
        <div className="relative w-16 h-16">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/30" />
            <motion.circle cx="32" cy="32" r="28" fill="none" stroke={ORANGE} strokeWidth="4"
              strokeDasharray={`${2 * Math.PI * 28}`} initial={{ strokeDashoffset: 0 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 28 }} transition={{ duration: 5, ease: "linear" }} strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-black" style={{ color: ORANGE }}>{n}</span>
          </div>
        </div>
      </div>
      <Button onClick={onReset} style={{ background: NAVY }} className="text-white hover:opacity-90 gap-2">
        <RotateCcw className="w-4 h-4" /> Next Voter
      </Button>
    </motion.div>
  );
}

// ── Category Card ─────────────────────────────────────────────────────────────
function CategoryCard({ category, index, onSelect, voted, event }: {
  category: any; index: number; onSelect: (c: any) => void; voted: boolean; event: any;
}) {
  const count      = category.candidates?.length || 0;
  const totalVotes = category.candidates?.reduce((s: number, c: any) => s + (c.vote_count || 0), 0) || 0;
  const showVotes  = (!event.hide_vote_counts && event.show_live_results) || event.status === "ended";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07 }}
      onClick={() => onSelect(category)}
      className="group relative rounded-2xl border overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
      style={{ borderColor: voted ? "#16a34a40" : "#00285620", background: voted ? "#16a34a08" : "#fff" }}
    >
      {/* Top banner — use event banner image if available, else gradient */}
      <div className="relative h-32 overflow-hidden">
        {event.banner_image
          ? <img src={event.banner_image} alt={event.title} className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${NAVY}18 0%, ${ORANGE}12 100%)` }}>
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-10" style={{ background: ORANGE }} />
              <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full opacity-10" style={{ background: NAVY }} />
            </div>
        }
        {/* Dark overlay so badges are readable over the image */}
        <div className="absolute inset-0 bg-black/30" />

        {/* Contestant badge */}
        <div className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full text-xs font-bold text-white"
          style={{ background: ORANGE }}>
          {count} Contestant{count !== 1 ? "s" : ""}
        </div>
        {voted && (
          <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1"
            style={{ background: "#16a34a90", border: "1px solid #16a34a40", color: "#fff" }}>
            <CheckCircle2 className="w-3 h-3" /> Voted
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-5">
        <h3 className="font-bold text-base mb-1 leading-tight group-hover:text-[#002856] transition-colors">{category.name}</h3>
        {category.description && (
          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{category.description}</p>
        )}
        <div className="flex items-center justify-end">
          <span className="flex items-center gap-1 text-xs font-bold group-hover:gap-2 transition-all"
            style={{ color: ORANGE }}>
            {showVotes ? `${totalVotes.toLocaleString()} votes` : "Vote Now"} <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>

      {/* Bottom accent bar */}
      <div className="h-1 w-full transition-all duration-300 group-hover:h-1.5"
        style={{ background: voted ? "#16a34a" : `linear-gradient(90deg, ${NAVY}, ${ORANGE})` }} />
    </motion.div>
  );
}

// ── Candidate Card — cinematic large photo ────────────────────────────────────
function CandidateCard({ candidate, event, isSelected, hasVoted, isWinner, isTied, isProcessing, onSelect, totalVotes }: {
  candidate: any; event: any; isSelected: boolean; hasVoted: boolean; isWinner: boolean;
  isTied: boolean; isProcessing: boolean; onSelect: () => void; totalVotes: number;
}) {
  const isActive = event.status === "active";
  const isEnded  = event.status === "ended";
  const canVote  = isActive && (!hasVoted || event.is_paid) && !isProcessing;
  const pct      = totalVotes > 0 ? Math.round((candidate.vote_count / totalVotes) * 100) : 0;
  const showVotes = (!event.hide_vote_counts && event.show_live_results) || isEnded;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
      whileTap={canVote ? { scale: 0.98 } : {}}
      onClick={() => canVote && onSelect()}
      className="relative rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        cursor: canVote ? "pointer" : "default",
        border: isWinner
          ? "2px solid #f59e0b60"
          : isSelected && !hasVoted
            ? `2px solid ${ORANGE}`
            : hasVoted && isSelected
              ? "2px solid #16a34a60"
              : canVote
                ? "2px solid #00285618"
                : "2px solid #00000010",
        boxShadow: isSelected && !hasVoted ? `0 8px 32px ${ORANGE}30` : isWinner ? "0 8px 32px #f59e0b25" : "none",
        background: "#fff",
      }}
    >
      {/* Winner crown */}
      {isWinner && (
        <div className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full flex items-center justify-center shadow-lg"
          style={{ background: "#f59e0b" }}>
          <Trophy className="w-4 h-4 text-white" />
        </div>
      )}

      {/* ── LARGE PHOTO (4:3 ratio) ── */}
      <div className="relative w-full" style={{ paddingBottom: "80%" }}>
        {candidate.photo ? (
          <img src={candidate.photo} alt={candidate.name}
            className="absolute inset-0 w-full h-full object-cover object-top" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-6xl font-black"
            style={{
              background: isWinner
                ? "linear-gradient(135deg,#f59e0b20,#f59e0b05)"
                : isSelected
                  ? `linear-gradient(135deg,${ORANGE}20,${ORANGE}05)`
                  : `linear-gradient(135deg,${NAVY}12,${NAVY}03)`,
              color: isWinner ? "#f59e0b" : isSelected ? ORANGE : NAVY,
            }}>
            {candidate.name[0]}
          </div>
        )}

        {/* gradient overlay */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />

        {/* Candidate code — top left */}
        {candidate.code && (
          <div className="absolute top-2 left-2 sm:top-3 sm:left-3 z-10 px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-md sm:rounded-lg text-white text-xs font-black tracking-wider"
            style={{ background: `${ORANGE}e0`, backdropFilter: "blur(8px)", fontSize: "10px" }}>
            #{candidate.code}
          </div>
        )}

        {/* Vote count — top right (only if not winner spot) */}
        {showVotes && !isWinner && (
          <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-10 px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-md sm:rounded-lg text-white font-bold"
            style={{ background: `${NAVY}cc`, backdropFilter: "blur(8px)", fontSize: "10px" }}>
            {(candidate.vote_count || 0).toLocaleString()}v
          </div>
        )}

        {/* Name on photo (bottom) */}
        <div className="absolute bottom-0 inset-x-0 z-10 px-2.5 sm:px-4 pb-2 sm:pb-3">
          <p className="text-white font-black text-xs sm:text-sm leading-tight drop-shadow-lg line-clamp-2">{candidate.name}</p>
          {showVotes && (
            <p className="text-white/70 text-xs mt-0.5">{pct}%</p>
          )}
        </div>

        {/* Selected overlay — subtle tint only, no blocking elements over vote count */}
        {isSelected && !hasVoted && (
          <div className="absolute inset-0 pointer-events-none z-10"
            style={{ background: `${ORANGE}20`, boxShadow: `inset 0 0 0 2px ${ORANGE}` }} />
        )}
      </div>

      {/* ── Card body ── */}
      <div className="p-2.5 sm:p-4">
        {candidate.description ? (
          <p className="text-xs text-muted-foreground mb-2 sm:mb-3 line-clamp-2 leading-relaxed">{candidate.description}</p>
        ) : (
          <p className="text-xs text-muted-foreground/40 mb-2 sm:mb-3 italic hidden sm:block">No bio available</p>
        )}

        {/* Progress bar */}
        {showVotes && (
          <div className="mb-3">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <motion.div className="h-full rounded-full"
                style={{ background: isWinner ? "#f59e0b" : `linear-gradient(90deg,${NAVY},${ORANGE})` }}
                initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: "easeOut" }} />
            </div>
          </div>
        )}

        {/* Selection indicator — shown inline when candidate is selected */}
        {canVote && isSelected && (
          <div className="w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
            style={{ background: `${ORANGE}15`, color: ORANGE, border: `1.5px solid ${ORANGE}40` }}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Selected
          </div>
        )}

        {hasVoted && isSelected && (
          <div className="flex items-center justify-center gap-1.5 py-2 text-sm font-bold text-green-600">
            <CheckCircle2 className="w-4 h-4" /> Vote Recorded
          </div>
        )}

        {isEnded && isWinner && !isTied && (
          <div className="flex items-center justify-center gap-1.5 py-2 text-sm font-bold text-yellow-500">
            <Trophy className="w-4 h-4" /> Winner 🏆
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
const EventDetailPage = () => {
  const { slug }                           = useParams<{ slug: string }>();
  const { event, loading, error, refetch } = useEvent(slug || "");
  const { castVote, loading: voteLoading } = useCastVote();
  const { isAuthenticated, user }          = useAuth();
  const { toast }                          = useToast();
  const navigate                           = useNavigate();

  // Non-org state — always start at the category grid when arriving at the event page
  const [selectedCategory, setSelectedCategory] = useState<any | null>(null);
  const selectCategory = (cat: any | null) => {
    setSelectedCategory(cat);
    // Push/pop history so the browser back button returns to the category grid, not /events
    if (cat) {
      window.history.pushState({ category: cat.id }, "");
    }
  };

  // Handle browser back button — return to category grid instead of navigating away
  useEffect(() => {
    const onPop = () => { setSelectedCategory(null); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Clear any stale category from a previous visit on mount
  useEffect(() => {
    try { sessionStorage.removeItem(`cat_${slug}`); } catch {}
  }, [slug]);
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, string>>({});
  const [votedCategories, setVotedCategories]        = useState<string[]>([]);
  const [voteQuantity, setVoteQuantity]              = useState<Record<string, number>>({});
  const [paymentStep, setPaymentStep]                = useState<Record<string, 'select' | 'verifying' | 'done'>>({});
  const [paymentModal, setPaymentModal]              = useState<{ open: boolean; categoryId: string }>({ open: false, categoryId: "" });
  const [guestPhone, setGuestPhone]                  = useState("");
  const [processingCats, setProcessingCats]          = useState<Set<string>>(new Set());
  const [catSearch, setCatSearch]                    = useState("");
  // String state for qty input so user can clear and type freely
  const [qtyInputs, setQtyInputs]                    = useState<Record<string, string>>({});

  // Org state
  const [voterRollToken, setVoterRollToken]  = useState<string | null>(null);
  const codeRefs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null));
  const [voterBallot, setVoterBallot]        = useState<any[] | null>(null);
  const [voterRollId, setVoterRollId]        = useState("");
  const [voterRollName, setVoterRollName]    = useState("");
  const [voterRollError, setVoterRollError]  = useState("");
  const [voterRollLoading, setVoterRollLoading] = useState(false);
  const [orgStep, setOrgStep]                = useState<'selecting' | 'review' | 'done'>('selecting');
  const [orgSubmitting, setOrgSubmitting]    = useState(false);
  const [orgSection, setOrgSection]          = useState<'global' | 'group'>('global');
  const ballotTopRef = useRef<HTMLDivElement>(null);
  const scrollToBallotTop = useCallback(() => {
    setTimeout(() => ballotTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  const isOrg      = event?.voting_mode === 'organizational';
  const rollVerified = isOrg && !!voterRollToken;

  const resetForNextVoter = useCallback(() => {
    setVoterRollToken(null); setVoterRollName(""); setVoterRollId(""); setVoterRollError("");
    setVoterBallot(null); setSelectedCandidates({}); setVotedCategories([]); setOrgStep('selecting'); setOrgSection('global');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    localStorage.removeItem("access_token"); localStorage.removeItem("refresh_token");
  }, []);

  const handleVerifyVoterId = async () => {
    if (voterRollId.length < 6) return;
    setVoterRollLoading(true); setVoterRollError("");
    try {
      const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";
      const res  = await fetch(`${API}/events/${slug}/verify-code/`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: voterRollId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setVoterRollError(data.error || "Verification failed."); return; }
      setVoterRollToken(data.tokens.access); setVoterRollName(data.voter_name);
      if (data.ballot) setVoterBallot(data.ballot);
      localStorage.setItem("access_token", data.tokens.access);
      localStorage.setItem("refresh_token", data.tokens.refresh);
      setOrgStep('selecting'); setOrgSection('global'); setSelectedCandidates({});
      toast({ title: `Welcome, ${data.voter_name}! 🗳️`, description: "Code verified. Select your candidates." });
    } catch { setVoterRollError("Network error. Try again."); }
    finally { setVoterRollLoading(false); }
  };

  const lockCat   = (id: string) => setProcessingCats(p => new Set(p).add(id));
  const unlockCat = (id: string) => setProcessingCats(p => { const s = new Set(p); s.delete(id); return s; });

  const handleOrgBulkSubmit = async () => {
    const ballot = voterBallot || event?.categories || [];
    const votes  = ballot.map((c: any) => ({ category_id: c.id, candidate_id: selectedCandidates[c.id] })).filter((v: any) => !!v.candidate_id);
    if (!votes.length) { toast({ title: "No selections", variant: "destructive" }); return; }
    setOrgSubmitting(true);
    try {
      await castBulkVote(slug!, votes); fireConfetti(); setOrgStep('done'); window.scrollTo({ top: 0, behavior: 'smooth' }); refetch();
    } catch (e: any) { toast({ title: "Submission failed", description: e?.message, variant: "destructive" }); }
    finally { setOrgSubmitting(false); }
  };

  const getQty = (id: string) => voteQuantity[id] || 1;
  const setQty = (id: string, d: number) => setVoteQuantity(p => ({ ...p, [id]: Math.max(1, (p[id] || 1) + d) }));

  const handleSelectCandidate = (catId: string, candId: string) => {
    if (votedCategories.includes(catId) && !event?.is_paid) return;
    setSelectedCandidates(p => ({
      ...p,
      // Toggle: clicking the already-selected candidate deselects it
      [catId]: p[catId] === candId ? '' : candId,
    }));
  };

  const handleVote = async (catId: string) => {
    const candId = selectedCandidates[catId];
    if (event.is_paid) {
      if (!candId) { toast({ title: "Select a candidate first", variant: "destructive" }); return; }
      if (processingCats.has(catId)) { toast({ title: "Please wait", variant: "destructive" }); return; }
      setPaymentModal({ open: true, categoryId: catId }); return;
    }
    if (!isOrg && !isAuthenticated) { toast({ title: "Login required", variant: "destructive" }); navigate("/auth"); return; }
    if (!candId || votedCategories.includes(catId)) return;
    try {
      await castVote({ event_slug: slug!, category_id: catId, candidate_ids: [candId] });
      setVotedCategories(p => [...p, catId]); fireConfetti(); refetch();
      toast({ title: "Vote cast! 🎉", description: "Your vote has been recorded." });
      setTimeout(() => { selectCategory(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }, 1600);
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg.includes('already')) toast({ title: "Already voted", variant: "destructive" });
      else toast({ title: "Vote failed", description: msg, variant: "destructive" });
    }
  };

  const handlePaymentSuccess = async (reference: string, catId: string) => {
    lockCat(catId); setPaymentStep(p => ({ ...p, [catId]: 'verifying' }));
    const qty = getQty(catId);
    const MAX = 4;
    const attempt = async (n: number): Promise<void> => {
      try {
        await castVote({ event_slug: slug!, category_id: catId, candidate_ids: [selectedCandidates[catId]], payment_ref: reference, quantity: qty });
        setVotedCategories(p => [...p, catId]); setPaymentStep(p => ({ ...p, [catId]: 'done' })); fireConfetti(); refetch();
        toast({ title: "Votes cast! 🎉", description: `${qty} vote(s) recorded.` });
        setTimeout(() => { setPaymentStep(p => ({ ...p, [catId]: 'select' })); setSelectedCandidates(p => ({ ...p, [catId]: '' })); setVoteQuantity(p => ({ ...p, [catId]: 1 })); unlockCat(catId); }, 1500);
      } catch (e: any) {
        const msg = e?.message || '';
        if (msg.includes('already been used')) {
          setVotedCategories(p => [...p, catId]); setPaymentStep(p => ({ ...p, [catId]: 'done' })); fireConfetti(); refetch();
          toast({ title: "Votes cast! 🎉" });
          setTimeout(() => { setPaymentStep(p => ({ ...p, [catId]: 'select' })); setSelectedCandidates(p => ({ ...p, [catId]: '' })); setVoteQuantity(p => ({ ...p, [catId]: 1 })); unlockCat(catId); }, 1500);
          return;
        }
        if (n < MAX) { toast({ title: `Retrying (${n}/${MAX})` }); await new Promise(r => setTimeout(r, n * 1500)); return attempt(n + 1); }
        const failed = JSON.parse(localStorage.getItem('failed_votes') || '[]');
        failed.push({ reference, event_slug: slug, category_id: catId, candidate_id: selectedCandidates[catId], quantity: qty, timestamp: new Date().toISOString() });
        localStorage.setItem('failed_votes', JSON.stringify(failed));
        setPaymentStep(p => ({ ...p, [catId]: 'select' })); unlockCat(catId);
        toast({ title: "Keep your ref!", description: `Ref: ${reference}`, variant: "destructive", duration: 15000 });
      }
    };
    await attempt(1);
  };

  const handleShare = () => { navigator.clipboard.writeText(window.location.href); toast({ title: "Link copied! 🔗" }); };
  const getTimeLeft = (t: string) => {
    if (!t) return null;
    const d = new Date(t).getTime() - Date.now();
    if (d <= 0) return null;
    const h = Math.floor(d / 3600000), days = Math.floor(h / 24);
    if (days > 0) return `${days}d ${h % 24}h left`;
    if (h > 0) return `${h}h left`;
    return "Ending soon";
  };

  // ── Loading / Error ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: ORANGE }} />
        <p className="text-sm text-muted-foreground">Loading event…</p>
      </div>
    </div>
  );
  if (error || !event) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="glass-card p-10 text-center">
        <p className="text-muted-foreground mb-4">{error || "Event not found."}</p>
        <Link to="/events"><Button variant="outline">Back to Events</Button></Link>
      </div>
    </div>
  );

  const isActive   = event.status === "active";
  const isEnded    = event.status === "ended";
  const isPaused   = event.status === "paused";
  const timeLeft   = getTimeLeft(event.end_time);
  const TypeIcon   = typeIcon[event.event_type] || Trophy;
  const allCats    = event.categories || [];
  const filteredCats = allCats.filter((c: any) => c.name.toLowerCase().includes(catSearch.toLowerCase()));
  const activeCat  = selectedCategory ? allCats.find((c: any) => c.id === selectedCategory.id) : null;
  const sortedCands = activeCat ? [...(activeCat.candidates || [])].sort((a: any, b: any) => b.vote_count - a.vote_count) : [];
  const totalCatVotes = sortedCands.reduce((s: number, c: any) => s + (c.vote_count || 0), 0);
  const winner     = isEnded && sortedCands[0];
  const isTied     = isEnded && sortedCands.length > 1 && sortedCands[0]?.vote_count === sortedCands[1]?.vote_count && sortedCands[0]?.vote_count > 0;
  const catVoted   = activeCat ? votedCategories.includes(activeCat.id) : false;
  const catSel     = activeCat ? selectedCandidates[activeCat.id] : null;
  const catProc    = activeCat ? processingCats.has(activeCat.id) : false;

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Montserrat',sans-serif" }}>
      <Navbar />

      {/* ══ ORG: Code entry screen ══════════════════════════════════════════ */}
      {isOrg && !rollVerified && isActive && (
        <div className="min-h-screen flex items-center justify-center px-4" style={{ paddingTop: 80 }}>
          <div className="w-full max-w-lg">
            <motion.div className="text-center mb-10" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
              {event.banner_image
                ? <img src={event.banner_image} alt={event.title} className="w-20 h-20 rounded-2xl object-cover mx-auto mb-5 shadow-lg" />
                : <div className="w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center text-4xl shadow-lg" style={{ background: `linear-gradient(135deg,${NAVY},${NAVY}cc)` }}>🗳️</div>
              }
              <h1 className="text-3xl font-display font-black mb-2">{event.title}</h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: `${NAVY}12`, border: `1px solid ${NAVY}25`, color: NAVY }}>
                <Shield className="w-3 h-3" /> Organizational Election
              </span>
              <p className="text-muted-foreground text-sm mt-4 max-w-sm mx-auto">Enter the 6-character voting code you received to access your ballot.</p>
            </motion.div>

            <motion.div className="bg-card border border-border/40 rounded-3xl shadow-xl overflow-hidden"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg,${NAVY},${ORANGE})` }} />
              <div className="p-8">
                <p className="text-center text-xs font-bold text-muted-foreground mb-6 uppercase tracking-widest">Your Voting Code</p>
                <div className="flex justify-center gap-2 sm:gap-3 mb-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <input key={i} ref={codeRefs[i]} type="text" inputMode="text" maxLength={1}
                      value={voterRollId[i] || ""} autoFocus={i === 0} autoComplete="off" autoCapitalize="characters" spellCheck={false}
                      onChange={e => {
                        const ch = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                        if (!ch) return;
                        const arr = voterRollId.split(''); arr[i] = ch[ch.length - 1];
                        const next = arr.join('').slice(0, 6); setVoterRollId(next); setVoterRollError('');
                        if (i < 5) setTimeout(() => codeRefs[i + 1].current?.focus(), 0);
                        if (i === 5) setTimeout(() => handleVerifyVoterId(), 100);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Backspace') { e.preventDefault(); const arr = voterRollId.split(''); if (arr[i]) arr[i] = ''; else if (i > 0) { arr[i - 1] = ''; codeRefs[i - 1].current?.focus(); } setVoterRollId(arr.join('').slice(0, 6)); setVoterRollError(''); }
                        if (e.key === 'ArrowLeft' && i > 0) codeRefs[i - 1].current?.focus();
                        if (e.key === 'ArrowRight' && i < 5) codeRefs[i + 1].current?.focus();
                        if (e.key === 'Enter' && voterRollId.length === 6) handleVerifyVoterId();
                      }}
                      onFocus={e => e.target.select()}
                      onPaste={e => {
                        e.preventDefault();
                        const p = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                        setVoterRollId(p); setVoterRollError('');
                        setTimeout(() => codeRefs[Math.min(p.length, 5)].current?.focus(), 0);
                        if (p.length === 6) setTimeout(() => handleVerifyVoterId(), 150);
                      }}
                      className="w-11 h-14 sm:w-12 sm:h-16 rounded-xl text-center font-mono font-black text-2xl focus:outline-none border-2 bg-muted/30 transition-all"
                      style={{
                        borderColor: voterRollError ? "#ef4444" : voterRollId[i] ? ORANGE : "#d1d5db",
                        color: voterRollId[i] ? NAVY : "#9ca3af",
                        background: voterRollId[i] ? `${ORANGE}10` : undefined,
                      }}
                    />
                  ))}
                </div>
                {voterRollError && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl mb-5"
                    style={{ background: "#ef444415", border: "1px solid #ef444430" }}>
                    <span className="text-red-500 text-lg">⚠️</span>
                    <p className="text-red-500 text-sm font-medium">{voterRollError}</p>
                  </motion.div>
                )}
                <button onClick={handleVerifyVoterId} disabled={voterRollLoading || voterRollId.length < 6}
                  className="w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2 text-white transition-all disabled:opacity-40"
                  style={{ background: NAVY }}>
                  {voterRollLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> Verifying…</> : <><Shield className="w-5 h-5" /> Access My Ballot</>}
                </button>
                <p className="text-center text-xs text-muted-foreground mt-4">🔒 Each code is single-use</p>
              </div>
            </motion.div>
          </div>
        </div>
      )}

      {/* Verified banner */}
      {isOrg && rollVerified && (
        <div className="fixed top-16 inset-x-0 z-40 flex justify-center px-4 pt-2 pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold backdrop-blur-sm"
            style={{ background: "#16a34a15", border: "1px solid #16a34a30", color: "#16a34a" }}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Verified as {voterRollName}
          </div>
        </div>
      )}

      {isOrg && !rollVerified && isActive ? null : (<>

        {/* ══ BANNER HERO ═══════════════════════════════════════════════════ */}
        <div className="relative h-52 md:h-80 overflow-hidden">
          {event.banner_image
            ? <img src={event.banner_image} alt={event.title} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center"
                style={{ background: `linear-gradient(135deg,${NAVY} 0%,${NAVY}cc 100%)` }}>
                <span className="text-9xl opacity-10">{typeEmoji[event.event_type] || "🗳️"}</span>
              </div>
          }

          {isActive && (
            <div className="absolute top-5 left-5 flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-sm"
              style={{ background: "#dc262640", border: "1px solid #dc262650" }}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400" />
              </span>
              <span className="text-xs font-bold text-white px-1 py-0.5 rounded" style={{ background: "#dc2626" }}>LIVE NOW</span>
            </div>
          )}
          {timeLeft && isActive && (
            <div className="absolute top-5 right-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-sm text-orange-300 text-xs font-medium"
              style={{ background: "#00000040", border: "1px solid #ffffff15" }}>
              <Clock className="w-3.5 h-3.5" /> {timeLeft}
            </div>
          )}
        </div>

        <div className="container mx-auto px-4 max-w-6xl -mt-8 relative z-10 pb-24">

          {/* Back nav */}
          {selectedCategory && !isOrg ? (
            <button onClick={() => { selectCategory(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors group">
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Categories
            </button>
          ) : (
            <Link to="/events" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors group">
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Events
            </Link>
          )}

          {/* ── Event header ── */}
          <motion.div className="mb-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                isActive ? "bg-green-50 text-green-700 border-green-200" :
                isPaused ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                isEnded  ? "bg-gray-100 text-gray-500 border-gray-200" :
                "bg-blue-50 text-blue-700 border-blue-200"
              }`}>
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                {isActive ? "Live Now" : isPaused ? "Paused" : isEnded ? "Ended" : "Upcoming"}
              </span>
              <Badge variant="outline" className="capitalize gap-1">
                <TypeIcon className="w-3 h-3" /> {event.event_type?.replace("_", " ")}
              </Badge>
              {event.is_paid
                ? <Badge variant="outline" className="font-bold" style={{ color: "#dc2626", borderColor: "#dc262630" }}>
                    {event.currency} {event.price_per_vote}/vote
                  </Badge>
                : <Badge variant="outline" className="text-green-600 border-green-200">Free</Badge>
              }
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold mb-3">{event.title}</h1>
            {event.description && <p className="text-muted-foreground max-w-2xl mb-4 leading-relaxed">{event.description}</p>}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {(event.show_live_results || isEnded) && (
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" style={{ color: ORANGE }} />
                  <strong className="text-foreground">{(event.total_votes || 0).toLocaleString()}</strong> votes cast
                </span>
              )}
              {event.end_time && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" style={{ color: ORANGE }} />
                  Ends {new Date(event.end_time).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                </span>
              )}
              <span className="flex items-center gap-1.5"><Lock className="w-4 h-4" style={{ color: ORANGE }} /> Encrypted</span>
              <button onClick={handleShare} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                <Share2 className="w-4 h-4" /> Share
              </button>
            </div>
          </motion.div>

          {/* Status banners */}
          {isEnded && (
            <motion.div className="glass-card p-5 mb-8 flex items-center justify-between flex-wrap gap-3"
              style={{ borderColor: "#f59e0b30", background: "#f59e0b08" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center gap-3">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <div>
                  <p className="font-semibold">This event has ended</p>
                  <p className="text-sm text-muted-foreground">Final results are available</p>
                </div>
              </div>
              <Link to={`/results/${slug}`}>
                <Button size="sm" style={{ background: "#f59e0b20", color: "#b45309", borderColor: "#f59e0b40" }} variant="outline" className="gap-1.5">
                  View Results <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </motion.div>
          )}
          {isPaused && (
            <div className="glass-card p-4 mb-8 flex items-center gap-3"
              style={{ borderColor: "#f59e0b30", background: "#f59e0b08" }}>
              <span className="text-xl">⏸</span>
              <p className="text-sm font-medium text-yellow-600">Voting is temporarily paused.</p>
            </div>
          )}

          <div ref={ballotTopRef} />

          {/* ══ ORG BALLOT FLOW ══════════════════════════════════════════════ */}
          {isOrg && rollVerified && isActive && orgStep !== 'done' && (() => {
            const ballot     = (voterBallot || event.categories || []) as any[];
            const globalCats = ballot.filter((c: any) => c.is_global !== false);
            const groupCats  = ballot.filter((c: any) => c.is_global === false);
            const hasGroup   = groupCats.length > 0;
            const current    = (orgSection === 'global' || !hasGroup) ? globalCats : groupCats;
            const allGlobal  = globalCats.every((c: any) => !!selectedCandidates[c.id]);
            const totalSel   = ballot.filter((c: any) => !!selectedCandidates[c.id]).length;

            const OC = ({ cat, cand }: { cat: any; cand: any }) => {
              const chosen = selectedCandidates[cat.id] === cand.id;
              return (
                <motion.div whileTap={{ scale: 0.98 }} onClick={() => setSelectedCandidates(p => ({ ...p, [cat.id]: cand.id }))}
                  className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all"
                  style={{ borderColor: chosen ? ORANGE + "60" : "#e5e7eb", background: chosen ? ORANGE + "08" : "transparent" }}>
                  {cand.photo
                    ? <img src={cand.photo} alt={cand.name} className="w-11 h-11 rounded-full object-cover flex-shrink-0"
                        style={{ border: `2px solid ${chosen ? ORANGE + "50" : "#e5e7eb"}` }} />
                    : <div className="w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm"
                        style={{ background: chosen ? ORANGE + "15" : "#f3f4f6", color: chosen ? ORANGE : "#6b7280", border: `2px solid ${chosen ? ORANGE + "30" : "#e5e7eb"}` }}>
                        {cand.name[0]}
                      </div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: chosen ? NAVY : undefined }}>{cand.name}</p>
                    {cand.description && <p className="text-xs text-muted-foreground truncate">{cand.description}</p>}
                  </div>
                  <div className="w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all"
                    style={{ background: chosen ? ORANGE : "transparent", borderColor: chosen ? ORANGE : "#d1d5db" }}>
                    {chosen && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </motion.div>
              );
            };

            return (
              <AnimatePresence mode="wait">
                {orgStep === 'selecting' && (
                  <motion.div key="sel" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    {hasGroup && (
                      <div className="flex gap-2 mb-6 p-1 bg-muted rounded-xl">
                        {[{ k: 'global', l: 'General Ballot', n: globalCats.length }, { k: 'group', l: 'Group Ballot', n: groupCats.length }].map(({ k, l, n }) => (
                          <button key={k} onClick={() => setOrgSection(k as any)}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all"
                            style={{ background: orgSection === k ? "#fff" : "transparent", color: orgSection === k ? NAVY : "#6b7280", boxShadow: orgSection === k ? "0 1px 4px #0002" : "none" }}>
                            {l} <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: orgSection === k ? ORANGE + "15" : "#f3f4f6", color: orgSection === k ? ORANGE : "#9ca3af" }}>{n}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-5">
                      <p className="text-sm text-muted-foreground">{totalSel} of {ballot.length} selected</p>
                      <div className="flex gap-1">{ballot.map((c: any) => <div key={c.id} className="h-1.5 w-6 rounded-full transition-all" style={{ background: selectedCandidates[c.id] ? ORANGE : "#e5e7eb" }} />)}</div>
                    </div>
                    <div className="space-y-5">
                      {current.map((cat: any) => {
                        const sel = !!selectedCandidates[cat.id];
                        return (
                          <motion.div key={cat.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
                            <div className="p-4 border-b border-border/30 flex items-center justify-between" style={{ background: sel ? ORANGE + "06" : undefined }}>
                              <div>
                                <h3 className="font-semibold text-sm">{cat.name}</h3>
                                {cat.description && <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>}
                              </div>
                              {sel
                                ? <span className="flex items-center gap-1 text-xs font-medium" style={{ color: ORANGE }}><CheckCircle2 className="w-3.5 h-3.5" /> Selected</span>
                                : <span className="text-xs text-muted-foreground">{cat.candidates?.length || 0} candidates</span>
                              }
                            </div>
                            <div className="p-3 space-y-2">{(cat.candidates || []).map((c: any) => <OC key={c.id} cat={cat} cand={c} />)}</div>
                          </motion.div>
                        );
                      })}
                    </div>
                    <div className="mt-8 flex gap-3">
                      {hasGroup && orgSection === 'global'
                        ? <Button onClick={() => { setOrgSection('group'); scrollToBallotTop(); }} disabled={!allGlobal}
                            className="flex-1 h-12 gap-2 text-white" style={{ background: NAVY }}>
                            Next: Group Ballot <ChevronRight className="w-4 h-4" />
                          </Button>
                        : <Button onClick={() => { setOrgStep('review'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={totalSel === 0}
                            className="flex-1 h-12 gap-2 text-white" style={{ background: NAVY }}>
                            <ClipboardList className="w-4 h-4" /> Review Ballot
                          </Button>
                      }
                      {hasGroup && orgSection === 'group' && (
                        <Button variant="outline" onClick={() => setOrgSection('global')} className="h-12 gap-2"><ArrowLeft className="w-4 h-4" /> Back</Button>
                      )}
                    </div>
                  </motion.div>
                )}
                {orgStep === 'review' && (
                  <motion.div key="rev" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                    <div className="glass-card overflow-hidden mb-6">
                      <div className="p-5 border-b border-border/30" style={{ background: NAVY + "06" }}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: NAVY + "12", border: `1px solid ${NAVY}20` }}>
                            <ClipboardList className="w-5 h-5" style={{ color: NAVY }} />
                          </div>
                          <div>
                            <h3 className="font-display font-bold text-lg">Review Your Ballot</h3>
                            <p className="text-xs text-muted-foreground">Confirm — this cannot be undone</p>
                          </div>
                        </div>
                      </div>
                      <div className="divide-y divide-border/20">
                        {ballot.map((cat: any) => {
                          const c = cat.candidates?.find((x: any) => x.id === selectedCandidates[cat.id]);
                          return (
                            <div key={cat.id} className="flex items-center justify-between px-5 py-4">
                              <div>
                                <p className="text-xs text-muted-foreground">{cat.name}</p>
                                {c ? (
                                  <div className="flex items-center gap-2 mt-1">
                                    {c.photo && <img src={c.photo} alt={c.name} className="w-6 h-6 rounded-full object-cover" style={{ border: `1px solid ${ORANGE}40` }} />}
                                    <p className="font-semibold text-sm" style={{ color: NAVY }}>{c.name}</p>
                                  </div>
                                ) : <p className="text-xs text-muted-foreground italic mt-1">No selection — skipped</p>}
                              </div>
                              {c ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: ORANGE }} /> : <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={() => { setOrgStep('selecting'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex-1 h-12 gap-2">
                        <RotateCcw className="w-4 h-4" /> Edit
                      </Button>
                      <Button onClick={handleOrgBulkSubmit} disabled={orgSubmitting || totalSel === 0}
                        className="flex-1 h-12 gap-2 text-white" style={{ background: NAVY }}>
                        {orgSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <><Vote className="w-4 h-4" /> Confirm & Cast</>}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            );
          })()}

          {isOrg && rollVerified && orgStep === 'done' && (
            <OrgDoneCard voterRollName={voterRollName} eventTitle={event.title} onReset={resetForNextVoter} />
          )}

          {/* ══ NON-ORG: CATEGORY-FIRST FLOW ════════════════════════════════ */}
          {!isOrg && (() => {

            // ── VIEW A: Category Grid ────────────────────────────────────────
            if (!selectedCategory) {
              return (
                <AnimatePresence mode="wait">
                  <motion.div key="cats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

                    {/* Header row */}
                    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
                      <div>
                        <h2 className="text-2xl font-display font-black mb-1">
                          Available Categories <span style={{ color: ORANGE }}>.</span>
                        </h2>
                        <p className="text-muted-foreground text-sm max-w-lg">
                          Browse through our categories and vote for your favourite contestants. Your vote matters in determining the winners.
                        </p>
                      </div>
                      {allCats.length > 4 && (
                        <div className="relative w-full sm:w-64 flex-shrink-0">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input type="text" placeholder="Search categories…" value={catSearch} onChange={e => setCatSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none transition-colors bg-white"
                            style={{ borderColor: catSearch ? ORANGE + "60" : "#e5e7eb" }} />
                        </div>
                      )}
                    </div>

                    {filteredCats.length === 0 ? (
                      <div className="glass-card p-16 text-center text-muted-foreground">
                        <p className="font-medium">No categories found</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                        {filteredCats.map((cat: any, i: number) => (
                          <CategoryCard key={cat.id} category={cat} index={i}
                            onSelect={selectCategory} voted={votedCategories.includes(cat.id)} event={event} />
                        ))}
                      </div>
                    )}

                    {/* Progress bar */}
                    {votedCategories.length > 0 && allCats.length > 1 && (
                      <motion.div className="glass-card p-4 mt-8 flex items-center gap-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-1.5">
                            <span className="text-muted-foreground">Voting progress</span>
                            <span className="font-bold" style={{ color: ORANGE }}>{votedCategories.length}/{allCats.length}</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg,${NAVY},${ORANGE})` }}
                              initial={{ width: 0 }} animate={{ width: `${(votedCategories.length / allCats.length) * 100}%` }} transition={{ duration: 0.5 }} />
                          </div>
                        </div>
                        {votedCategories.length >= allCats.length && !event.is_paid && <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0" />}
                      </motion.div>
                    )}

                    {/* All voted */}
                    {votedCategories.length >= allCats.length && allCats.length > 0 && !event.is_paid && (
                      <motion.div className="glass-card p-8 mt-6 text-center" style={{ borderColor: "#16a34a30", background: "#16a34a05" }}
                        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                        <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-3" />
                        <h3 className="font-display font-bold text-xl mb-2">All Votes Cast! 🎉</h3>
                        <p className="text-muted-foreground text-sm mb-5">You've voted in all {allCats.length} categories.</p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                          {event.results_published && (
                            <Link to={`/results/${slug}`}>
                              <Button className="gap-2 text-white" style={{ background: NAVY }}>View Results <ChevronRight className="w-4 h-4" /></Button>
                            </Link>
                          )}
                          <Link to="/"><Button variant="outline">Back to Homepage</Button></Link>
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                </AnimatePresence>
              );
            }

            // ── VIEW B: Candidate Cards ──────────────────────────────────────
            return (
              <AnimatePresence mode="wait">
                <motion.div key={`cands-${activeCat?.id}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>

                  {/* Category header */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
                      <h2 className="text-2xl font-display font-black">{activeCat?.name}</h2>
                      {catVoted && !event.is_paid && (
                        <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full text-green-600"
                          style={{ background: "#16a34a15", border: "1px solid #16a34a25" }}>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Voted
                        </span>
                      )}
                    </div>
                    {activeCat?.description && <p className="text-sm text-muted-foreground mb-2">{activeCat.description}</p>}
                    <p className="text-xs text-muted-foreground">
                      {sortedCands.length} contestant{sortedCands.length !== 1 ? "s" : ""}
                      {((!event.hide_vote_counts && event.show_live_results) || isEnded) && ` · ${totalCatVotes.toLocaleString()} total votes`}
                    </p>
                  </div>

                  {sortedCands.length === 0 ? (
                    <div className="glass-card p-16 text-center text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
                      <p className="font-medium mb-1">No contestants yet</p>
                      <p className="text-sm">Check back soon.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mb-8">
                      {sortedCands.map((cand: any) => (
                        <CandidateCard key={cand.id} candidate={cand} event={event}
                          isSelected={catSel === cand.id} hasVoted={catVoted}
                          isWinner={!!(isEnded && !isTied && (winner as any)?.id === cand.id)}
                          isTied={isTied} isProcessing={catProc} totalVotes={totalCatVotes}
                          onSelect={() => handleSelectCandidate(activeCat.id, cand.id)} />
                      ))}
                    </div>
                  )}

                  {/* Sticky footer — paid */}
                  {event.is_paid && catSel && isActive && !catProc && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                      className="sticky bottom-4 sm:bottom-6 glass-card shadow-2xl overflow-hidden"
                      style={{ borderColor: ORANGE + "40", boxShadow: `0 8px 32px ${ORANGE}20` }}>
                      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg,${NAVY},${ORANGE})` }} />
                      <div className="p-3 sm:p-4">
                        {/* Candidate name + X deselect */}
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ background: ORANGE }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-muted-foreground leading-none mb-0.5">Voting for</p>
                            <p className="font-bold text-sm sm:text-base truncate" style={{ color: NAVY }}>
                              {activeCat?.candidates?.find((c: any) => c.id === catSel)?.name}
                            </p>
                          </div>
                          <button
                            onClick={() => handleSelectCandidate(activeCat.id, catSel!)}
                            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-110 active:scale-95"
                            style={{ background: "#fee2e2", color: "#ef4444", border: "1.5px solid #fca5a5" }}
                            title="Deselect candidate">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {/* Controls: qty + pay button */}
                        <div className="flex items-center gap-2 sm:gap-3">
                          <button onClick={() => {
                              setQty(activeCat.id, -1);
                              setQtyInputs(p => ({ ...p, [activeCat.id]: String(Math.max(1, getQty(activeCat.id) - 1)) }));
                            }}
                            className="w-8 h-8 rounded-lg border flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-all flex-shrink-0"
                            style={{ borderColor: "#e5e7eb" }}>
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <div className="flex flex-col items-center">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={qtyInputs[activeCat.id] ?? String(getQty(activeCat.id))}
                              onChange={e => {
                                const raw = e.target.value.replace(/[^0-9]/g, "");
                                setQtyInputs(p => ({ ...p, [activeCat.id]: raw }));
                                const v = parseInt(raw);
                                if (!isNaN(v) && v >= 1) {
                                  setVoteQuantity(p => ({ ...p, [activeCat.id]: v }));
                                }
                              }}
                              onBlur={e => {
                                // On blur: clamp and sync display value
                                const v = Math.max(1, parseInt(e.target.value) || 1);
                                setVoteQuantity(p => ({ ...p, [activeCat.id]: v }));
                                setQtyInputs(p => ({ ...p, [activeCat.id]: String(v) }));
                              }}
                              className="w-14 h-9 text-center font-black text-base border-2 rounded-lg focus:outline-none transition-colors"
                              style={{ borderColor: ORANGE, color: NAVY }}
                            />
                            <p className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap">
                              {event.currency} {(parseFloat(event.price_per_vote) * getQty(activeCat.id)).toFixed(2)}
                            </p>
                          </div>
                          <button onClick={() => {
                              setQty(activeCat.id, 1);
                              setQtyInputs(p => ({ ...p, [activeCat.id]: String(getQty(activeCat.id) + 1) }));
                            }}
                            className="w-8 h-8 rounded-lg border flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-all flex-shrink-0"
                            style={{ borderColor: "#e5e7eb" }}>
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <Button onClick={() => handleVote(activeCat.id)} disabled={paymentStep[activeCat.id] === 'verifying'}
                            className="text-white gap-1.5 whitespace-nowrap text-sm h-10 px-3 sm:px-4 flex-shrink-0 ml-auto" style={{ background: ORANGE }}>
                            {paymentStep[activeCat.id] === 'verifying'
                              ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                              : <><Vote className="w-4 h-4" /><span className="hidden sm:inline"> Pay & Vote · </span>{event.currency} {(parseFloat(event.price_per_vote) * getQty(activeCat.id)).toFixed(2)}</>
                            }
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Sticky footer — free */}
                  {!event.is_paid && catSel && isActive && !catVoted && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      className="sticky bottom-4 sm:bottom-6 glass-card shadow-xl overflow-hidden"
                      style={{ borderColor: NAVY + "30", boxShadow: `0 8px 32px ${NAVY}15` }}>
                      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg,${NAVY},${ORANGE})` }} />
                      <div className="p-3 sm:p-4 flex items-center gap-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ background: NAVY }} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-muted-foreground leading-none mb-0.5">Ready to vote for</p>
                            <p className="font-bold text-sm truncate" style={{ color: NAVY }}>
                              {activeCat?.candidates?.find((c: any) => c.id === catSel)?.name}
                            </p>
                          </div>
                          {/* X to deselect */}
                          <button
                            onClick={() => handleSelectCandidate(activeCat.id, catSel!)}
                            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-110 active:scale-95"
                            style={{ background: "#fee2e2", color: "#ef4444", border: "1.5px solid #fca5a5" }}
                            title="Deselect candidate">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <Button onClick={() => handleVote(activeCat.id)} disabled={voteLoading}
                          className="text-white gap-1.5 flex-shrink-0 h-10 px-4 text-sm" style={{ background: NAVY }}>
                          {voteLoading
                            ? <><Loader2 className="w-4 h-4 animate-spin" /><span className="hidden sm:inline"> Casting…</span></>
                            : <><Vote className="w-4 h-4" /><span className="hidden sm:inline"> Submit Vote</span><span className="sm:hidden">Vote</span></>
                          }
                        </Button>
                      </div>
                    </motion.div>
                  )}

                </motion.div>
              </AnimatePresence>
            );
          })()}

        </div>
        <Footer />

        {event?.is_paid && (
          <PaymentModal
            open={paymentModal.open}
            onClose={() => setPaymentModal({ open: false, categoryId: "" })}
            onSuccess={(ref) => { const id = paymentModal.categoryId; setPaymentModal({ open: false, categoryId: "" }); handlePaymentSuccess(ref, id); }}
            eventTitle={event.title} eventSlug={slug!} categoryId={paymentModal.categoryId}
            candidateName={event.categories?.flatMap((c: any) => c.candidates || []).find((c: any) => c.id === selectedCandidates[paymentModal.categoryId])?.name || ""}
            candidateId={selectedCandidates[paymentModal.categoryId] || ""}
            quantity={getQty(paymentModal.categoryId)} pricePerVote={parseFloat(event.price_per_vote)}
            currency={event.currency} guestPhone={guestPhone} onGuestPhoneChange={setGuestPhone}
            email={(() => {
              if (isAuthenticated) {
                const e = (user as any)?.email || "";
                if (e.endsWith("@phone.evoting.local") || e.endsWith("@ussd.evoting.local")) {
                  const ph = ((user as any)?.phone || "").replace(/^\+/, "").replace(/\s/g, "");
                  return ph ? ph + "@celervote.com" : "voter@celervote.com";
                }
                return e || "voter@celervote.com";
              }
              if (guestPhone) { const ph = guestPhone.replace(/^\+/, "").replace(/\s/g, ""); return ph ? ph + "@celervote.com" : "voter@celervote.com"; }
              return "";
            })()}
          />
        )}
      </>)}
    </div>
  );
};

export default EventDetailPage;
