import { PaymentModal } from "../components/PaymentModal";
import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Users, Clock, Shield, CheckCircle2, Share2,
  Loader2, Trophy, ChevronRight, Lock, Flame, Calendar,
  BarChart2, Zap, Radio, Minus, Plus, ChevronDown, AlertCircle,
  Vote, ListChecks, ClipboardList, RotateCcw
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
import { paymentsApi } from "../lib/api";
import confetti from "canvas-confetti";

const typeIcon: Record<string, any> = {
  election:  Trophy,
  contest:   Zap,
  survey:    BarChart2,
  live_show: Radio,
};

const typeEmoji: Record<string, string> = {
  election: "🗳️", contest: "🏆", survey: "📊", live_show: "📺",
};

// ── Org Done Card — auto-redirects after 5s ──────────────────────────────────
function OrgDoneCard({ voterRollName, eventTitle, onReset }: {
  voterRollName: string; eventTitle: string; onReset: () => void;
}) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(n => {
        if (n <= 1) { clearInterval(t); onReset(); return 0; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <motion.div className="glass-card p-8 text-center border-green-500/30 bg-green-500/5"
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
      <div className="w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center mx-auto mb-5">
        <CheckCircle2 className="w-10 h-10 text-green-400" />
      </div>
      <h3 className="font-display font-bold text-2xl mb-2">Voting Complete! 🎉</h3>
      <p className="text-muted-foreground text-sm mb-2 max-w-sm mx-auto">
        <strong>{voterRollName}</strong>'s votes have been recorded for <strong>{eventTitle}</strong>.
      </p>
      <p className="text-muted-foreground text-xs mb-5 max-w-sm mx-auto">
        Your code is now marked as used. The next voter can enter their code below.
      </p>
      {/* Countdown ring */}
      <div className="flex items-center justify-center mb-6">
        <div className="relative w-16 h-16">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/30" />
            <motion.circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4"
              className="text-secondary"
              strokeDasharray={`${2 * Math.PI * 28}`}
              initial={{ strokeDashoffset: 0 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 28 }}
              transition={{ duration: 5, ease: "linear" }}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-black text-secondary">{countdown}</span>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4">Redirecting in {countdown}s…</p>
      <Button onClick={onReset} className="gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90">
        <RotateCcw className="w-4 h-4" /> Next Voter Now — Enter Code
      </Button>
    </motion.div>
  );
}

const EventDetailPage = () => {
  const { slug }                           = useParams<{ slug: string }>();
  const { event, loading, error, refetch } = useEvent(slug || "");
  const { castVote, loading: voteLoading } = useCastVote();
  const { isAuthenticated, user }          = useAuth();
  const { toast }                          = useToast();
  const navigate                           = useNavigate();

  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, string>>({});
  const [votedCategories, setVotedCategories]        = useState<string[]>([]);
  const [voteQuantity, setVoteQuantity]              = useState<Record<string, number>>({});
  const [paymentStep, setPaymentStep]                = useState<Record<string, 'select' | 'verifying' | 'done'>>({});
  const [paymentModal, setPaymentModal]              = useState<{ open: boolean; categoryId: string }>({ open: false, categoryId: "" });
  const [guestPhone, setGuestPhone]                  = useState("");
  const [voterRollToken, setVoterRollToken]          = useState<string | null>(null);
  const codeRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const [voterBallot, setVoterBallot]                = useState<any[] | null>(null);
  const [voterRollId, setVoterRollId]                = useState("");
  const [voterRollName, setVoterRollName]            = useState("");
  const [voterRollError, setVoterRollError]          = useState("");
  const [voterRollLoading, setVoterRollLoading]      = useState(false);

  // ── Org election ballot flow state ──────────────────────────────────────────
  // 'selecting' → voter picks candidates | 'review' → summary | 'done' → success
  const [orgStep, setOrgStep]               = useState<'selecting' | 'review' | 'done'>('selecting');
  const [orgSubmitting, setOrgSubmitting]   = useState(false);
  const [orgSection, setOrgSection]         = useState<'global' | 'group'>('global');

  const ballotTopRef = useRef<HTMLDivElement>(null);

  const scrollToBallotTop = useCallback(() => {
    setTimeout(() => {
      ballotTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, []);

  // Scroll to top on page load
  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  const isOrganizational = event?.voting_mode === 'organizational';
  const rollVerified     = isOrganizational && !!voterRollToken;

  // Reset everything so next voter can enter their code
  const resetForNextVoter = useCallback(() => {
    setVoterRollToken(null);
    setVoterRollName("");
    setVoterRollId("");
    setVoterRollError("");
    setVoterBallot(null);
    setSelectedCandidates({});
    setVotedCategories([]);
    setOrgStep('selecting');
    setOrgSection('global');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
  }, []);

  const handleVerifyVoterId = async () => {
    if (voterRollId.length < 6) return; // button is disabled — silent guard only
    setVoterRollLoading(true);
    setVoterRollError("");
    try {
      const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";
      const res = await fetch(`${API}/events/${slug}/verify-code/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: voterRollId.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVoterRollError(data.error || "Verification failed.");
        return;
      }
      // Store token + filtered ballot from server (only categories this voter can see)
      setVoterRollToken(data.tokens.access);
      setVoterRollName(data.voter_name);
      if (data.ballot) setVoterBallot(data.ballot);
      localStorage.setItem("access_token", data.tokens.access);
      localStorage.setItem("refresh_token", data.tokens.refresh);
      setOrgStep('selecting');
      setOrgSection('global');
      setSelectedCandidates({});
      toast({ title: `Welcome, ${data.voter_name}! 🗳️`, description: "Your code is verified. Select your candidates below." });
    } catch {
      setVoterRollError("Network error. Please try again.");
    } finally {
      setVoterRollLoading(false);
    }
  };
  const [processingCategories, setProcessingCategories] = useState<Set<string>>(new Set());

  const lockCategory   = (id: string) => setProcessingCategories(prev => new Set(prev).add(id));
  const unlockCategory = (id: string) => setProcessingCategories(prev => { const s = new Set(prev); s.delete(id); return s; });

  const fireConfetti = () => {
    confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 }, colors: ["#01003c", "#C9A84C", "#ffffff", "#ffd700"] });
    setTimeout(() => confetti({ particleCount: 40, spread: 80, origin: { y: 0.6, x: 0.3 }, colors: ["#01003c", "#C9A84C"] }), 200);
    setTimeout(() => confetti({ particleCount: 40, spread: 80, origin: { y: 0.6, x: 0.7 }, colors: ["#01003c", "#C9A84C"] }), 400);
  };

  // ── Org election: confirm and cast all votes at once ─────────────────────
  const handleOrgBulkSubmit = async () => {
    const ballot = (voterBallot || event?.categories || []);
    const votes = ballot
      .map((cat: any) => ({
        category_id:  cat.id,
        candidate_id: selectedCandidates[cat.id],
      }))
      .filter((v: any) => !!v.candidate_id);

    if (votes.length === 0) {
      toast({ title: "No selections made", description: "Please select at least one candidate.", variant: "destructive" });
      return;
    }

    setOrgSubmitting(true);
    try {
      await castBulkVote(slug!, votes);
      fireConfetti();
      setOrgStep('done');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      refetch();
    } catch (err: any) {
      toast({
        title: "Vote submission failed",
        description: err?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setOrgSubmitting(false);
    }
  };

  const getQuantity = (categoryId: string) => voteQuantity[categoryId] || 1;

  const updateQuantity = (categoryId: string, delta: number) => {
    setVoteQuantity(prev => ({
      ...prev,
      [categoryId]: Math.max(1, Math.min(100, (prev[categoryId] || 1) + delta)),
    }));
  };

  const handleSelectCandidate = (categoryId: string, candidateId: string) => {
    if (votedCategories.includes(categoryId) && !event?.is_paid) return;
    setSelectedCandidates(prev => ({ ...prev, [categoryId]: candidateId }));
  };

  const handleVote = async (categoryId: string) => {
    const candidateId = selectedCandidates[categoryId];

    if (event.is_paid) {
      // Paid events: no login required — phone collected inside PaymentModal
      if (!candidateId) {
        toast({ title: "Select a candidate first", variant: "destructive" });
        return;
      }
      if (processingCategories.has(categoryId)) {
        toast({ title: "Please wait", description: "Your previous vote is still processing.", variant: "destructive" });
        return;
      }
      if (!event.is_open) {
        toast({ title: "Voting closed", description: "This event is no longer accepting votes.", variant: "destructive" });
        return;
      }
      setPaymentModal({ open: true, categoryId });
      return;
    }

    // Org elections: voter is authenticated via voting code JWT — skip normal auth check
    // Free events still require normal login
    if (!isOrganizational && !isAuthenticated) {
      toast({ title: "Login required", description: "Please sign in to vote.", variant: "destructive" });
      navigate("/auth");
      return;
    }

    if (!candidateId) {
      if (votedCategories.includes(categoryId)) {
        toast({ title: "Already voted", description: "You have already voted in this category.", variant: "destructive" });
      }
      return;
    }

    if (votedCategories.includes(categoryId)) {
      toast({ title: "Already voted", description: "You have already voted in this category.", variant: "destructive" });
      return;
    }

    try {
      await castVote({
        event_slug:    slug!,
        category_id:   categoryId,
        candidate_ids: [candidateId],
      });
      setVotedCategories(prev => [...prev, categoryId]);
      fireConfetti();
      refetch();
      toast({ title: "Vote cast! 🎉", description: "Your vote has been recorded successfully." });
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('already voted') || msg.includes('already cast')) {
        toast({ title: "Already voted", description: "You have already voted in this category.", variant: "destructive" });
      } else if (!isOrganizational && (msg.includes('login') || msg.includes('authenticated') || msg.includes('sign in'))) {
        toast({ title: "Login required", description: "Please sign in to vote.", variant: "destructive" });
        navigate("/auth");
      } else {
        toast({ title: "Vote failed", description: msg || "Something went wrong. Please try again.", variant: "destructive" });
      }
    }
  };

  const handlePaymentSuccess = async (reference: string, categoryId: string) => {
    lockCategory(categoryId);
    setPaymentStep(prev => ({ ...prev, [categoryId]: 'verifying' }));

    const qty = getQuantity(categoryId);
    const MAX_RETRIES = 4;

    const attemptCastVote = async (attempt: number): Promise<void> => {
      try {
        await castVote({
          event_slug:    slug!,
          category_id:   categoryId,
          candidate_ids: [selectedCandidates[categoryId]],
          payment_ref:   reference,
          quantity:      qty,
        });

        setVotedCategories(prev => [...prev, categoryId]);
        setPaymentStep(prev => ({ ...prev, [categoryId]: 'done' }));
        fireConfetti();
        refetch();
        toast({
          title: "Votes cast! 🎉",
          description: `${qty} vote(s) recorded successfully.`,
        });
        setTimeout(() => {
          setPaymentStep(prev => ({ ...prev, [categoryId]: 'select' }));
          setSelectedCandidates(prev => ({ ...prev, [categoryId]: '' }));
          setVoteQuantity(prev => ({ ...prev, [categoryId]: 1 }));
          unlockCategory(categoryId);
        }, 1500);

      } catch (err: any) {
        const msg = err?.message || '';

        // Already used = votes were actually cast on a previous attempt — treat as success
        if (msg.includes('already been used')) {
          setVotedCategories(prev => [...prev, categoryId]);
          setPaymentStep(prev => ({ ...prev, [categoryId]: 'done' }));
          fireConfetti();
          refetch();
          toast({ title: "Votes cast! 🎉", description: `${qty} vote(s) recorded.` });
          setTimeout(() => {
            setPaymentStep(prev => ({ ...prev, [categoryId]: 'select' }));
            setSelectedCandidates(prev => ({ ...prev, [categoryId]: '' }));
            setVoteQuantity(prev => ({ ...prev, [categoryId]: 1 }));
            unlockCategory(categoryId);
          }, 1500);
          return;
        }

        // Retry on network/server errors
        if (attempt < MAX_RETRIES) {
          const delay = attempt * 1500;
          toast({
            title: `Retrying... (${attempt}/${MAX_RETRIES})`,
            description: "Your payment was received. Attempting to cast your votes...",
          });
          await new Promise(r => setTimeout(r, delay));
          return attemptCastVote(attempt + 1);
        }

        // All retries exhausted — save reference to localStorage so admin can recover
        const failedVotes = JSON.parse(localStorage.getItem('failed_votes') || '[]');
        failedVotes.push({
          reference,
          event_slug:   slug,
          category_id:  categoryId,
          candidate_id: selectedCandidates[categoryId],
          quantity:     qty,
          timestamp:    new Date().toISOString(),
        });
        localStorage.setItem('failed_votes', JSON.stringify(failedVotes));

        setPaymentStep(prev => ({ ...prev, [categoryId]: 'select' }));
        unlockCategory(categoryId);
        toast({
          title: "Vote not recorded — keep your reference!",
          description: `Payment ref: ${reference} — screenshot this and contact support. Your payment is safe.`,
          variant: "destructive",
          duration: 15000,
        });
      }
    };

    await attemptCastVote(1);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({ title: "Link copied! 🔗" });
  };

  const getTimeLeft = (endTime: string) => {
    if (!endTime) return null;
    const diff  = new Date(endTime).getTime() - Date.now();
    if (diff <= 0) return null;
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(hours / 24);
    if (days > 0)  return `${days}d ${hours % 24}h left`;
    if (hours > 0) return `${hours}h left`;
    return "Ending soon";
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-secondary mx-auto" />
        <p className="text-sm text-muted-foreground">Loading event...</p>
      </div>
    </div>
  );

  if (error || !event) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center glass-card p-10">
        <p className="text-muted-foreground mb-4">{error || "Event not found."}</p>
        <Link to="/events"><Button variant="outline">Back to Events</Button></Link>
      </div>
    </div>
  );

  const isEnded  = event.status === "ended";
  const isActive = event.status === "active";
  const isPaused = event.status === "paused";
  const timeLeft = getTimeLeft(event.end_time);
  const TypeIcon = typeIcon[event.event_type] || Trophy;
  const totalVotedCategories = votedCategories.length;
  // For org elections use the filtered ballot length, not all event categories
  const activeBallot    = (isOrganizational && rollVerified && voterBallot) ? voterBallot : (event.categories || []);
  const totalCategories = activeBallot.length;
  const allVoted        = !event.is_paid && totalCategories > 0 && totalVotedCategories >= totalCategories;

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <Navbar />

      {/* ── Org Election Code Entry ── */}
      {isOrganizational && !rollVerified && isActive && (
        <div className="min-h-screen flex items-center justify-center px-4" style={{ paddingTop: '80px' }}>
          <div className="w-full max-w-lg">

            {/* Header */}
            <motion.div className="text-center mb-10" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
              {event.banner_image ? (
                <img src={event.banner_image} alt={event.title}
                  className="w-20 h-20 rounded-2xl object-cover mx-auto mb-5 shadow-lg" />
              ) : (
                <div className="w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center text-4xl shadow-lg"
                  style={{ background: "linear-gradient(135deg, #01003c, #020057)" }}>
                  🗳️
                </div>
              )}
              <h1 className="text-3xl font-display font-black mb-2">{event.title}</h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/10 border border-secondary/20 text-secondary text-xs font-semibold">
                <Shield className="w-3 h-3" /> Organizational Election
              </span>
              <p className="text-muted-foreground text-sm mt-4 max-w-sm mx-auto">
                Enter the 6-character voting code you received via SMS to access your ballot.
              </p>
            </motion.div>

            {/* Code card */}
            <motion.div
              className="bg-card border border-border/40 rounded-3xl shadow-xl overflow-hidden"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            >
              {/* Top band */}
              <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, #01003c, #6366f1, #C9A84C)" }} />

              <div className="p-8">
                <p className="text-center text-sm font-semibold text-muted-foreground mb-6 uppercase tracking-widest">Your Voting Code</p>

                {/* 6 individual inputs — one per character, auto-advance on type */}
                <div className="flex justify-center gap-2 sm:gap-3 mb-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <input
                      key={i}
                      ref={codeRefs[i]}
                      type="text"
                      inputMode="text"
                      maxLength={1}
                      value={voterRollId[i] || ""}
                      autoFocus={i === 0}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      onChange={e => {
                        const ch = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                        if (!ch) return;
                        const arr = voterRollId.split('');
                        arr[i] = ch[ch.length - 1];
                        const next = arr.join('').slice(0, 6);
                        setVoterRollId(next);
                        setVoterRollError('');
                        // advance to next box
                        if (i < 5) setTimeout(() => codeRefs[i + 1].current?.focus(), 0);
                        // auto-submit when last filled
                        if (i === 5) setTimeout(() => handleVerifyVoterId(), 100);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Backspace') {
                          e.preventDefault();
                          const arr = voterRollId.split('');
                          if (arr[i]) {
                            arr[i] = '';
                          } else if (i > 0) {
                            arr[i - 1] = '';
                            codeRefs[i - 1].current?.focus();
                          }
                          setVoterRollId(arr.join('').slice(0, 6));
                          setVoterRollError('');
                        }
                        if (e.key === 'ArrowLeft' && i > 0) codeRefs[i - 1].current?.focus();
                        if (e.key === 'ArrowRight' && i < 5) codeRefs[i + 1].current?.focus();
                        if (e.key === 'Enter' && voterRollId.length === 6) handleVerifyVoterId();
                      }}
                      onFocus={e => e.target.select()}
                      onPaste={e => {
                        e.preventDefault();
                        const pasted = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
                        setVoterRollId(pasted);
                        setVoterRollError('');
                        // focus last filled box
                        const focusIdx = Math.min(pasted.length, 5);
                        setTimeout(() => codeRefs[focusIdx].current?.focus(), 0);
                        if (pasted.length === 6) setTimeout(() => handleVerifyVoterId(), 150);
                      }}
                      className={[
                        "w-11 h-14 sm:w-13 sm:h-16 rounded-xl text-center font-mono font-black text-2xl transition-all duration-150 focus:outline-none border-2 bg-muted/30",
                        voterRollId[i]
                          ? "border-secondary bg-secondary/10 text-foreground"
                          : "border-border text-muted-foreground focus:border-secondary/70 focus:bg-secondary/5",
                        voterRollError ? "border-destructive/50" : ""
                      ].join(" ")}
                    />
                  ))}
                </div>

                {/* Error */}
                {voterRollError && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20 mb-5"
                  >
                    <span className="text-destructive text-lg">⚠️</span>
                    <p className="text-destructive text-sm font-medium">{voterRollError}</p>
                  </motion.div>
                )}

                {/* Submit button */}
                <button
                  onClick={handleVerifyVoterId}
                  disabled={voterRollLoading || voterRollId.length < 6}
                  className="w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2 text-white transition-all disabled:opacity-40 active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, #01003c, #020057)" }}
                >
                  {voterRollLoading
                    ? <><Loader2 className="w-5 h-5 animate-spin" /> Verifying...</>
                    : <><Shield className="w-5 h-5" /> Access My Ballot</>
                  }
                </button>

                <p className="text-center text-xs text-muted-foreground mt-4">
                  🔒 Each code is single-use · Paste your code or type it in
                </p>
              </div>
            </motion.div>

            {/* Footer hint */}
            <motion.p
              className="text-center text-xs text-muted-foreground mt-6"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            >
              Powered by <span className="font-semibold">CelerVote</span> — Secure Electronic Voting
            </motion.p>
          </div>
        </div>
      )}

      {/* Show "verified" banner when roll voter is verified */}
      {isOrganizational && rollVerified && (
        <div className="fixed top-16 inset-x-0 z-40 flex justify-center px-4 pt-2 pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-semibold backdrop-blur-sm">
            <CheckCircle2 className="w-3.5 h-3.5" /> Verified as {voterRollName} — vote below
          </div>
        </div>
      )}

      {/* Hide rest of page until verified for closed roll events */}
      {isOrganizational && !rollVerified && isActive ? null : (<>

      {/* ── Banner Hero ── */}
      <div className="relative h-48 md:h-72 overflow-hidden">
        {event.banner_image ? (
          <img src={event.banner_image} alt={event.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-secondary/10 via-primary/5 to-background flex items-center justify-center">
            <span className="text-8xl opacity-10">{typeEmoji[event.event_type] || "🗳️"}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

        {isActive && (
          <div className="absolute top-6 left-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
            </span>
            <span className="text-xs font-bold text-white" style={{ background: '#dc2626', padding: '2px 8px', borderRadius: '4px', fontFamily: "'Montserrat', sans-serif" }}>LIVE NOW</span>
          </div>
        )}

        {timeLeft && isActive && (
          <div className="absolute top-6 right-6 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 text-orange-300 text-xs font-medium">
            <Clock className="w-3.5 h-3.5" /> {timeLeft}
          </div>
        )}
      </div>

      <div className="container mx-auto px-4 max-w-5xl -mt-8 relative z-10 pb-20">

        <Link to="/events" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" /> Back to Events
        </Link>

        {/* ── Event Header ── */}
        <motion.div className="mb-8" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
              isActive  ? "bg-green-500/10 text-green-400 border-green-500/30" :
              isPaused  ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" :
              isEnded   ? "bg-muted text-muted-foreground border-border" :
              "bg-blue-500/10 text-blue-400 border-blue-500/30"
            }`}>
              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
              {isActive ? "Live Now" : isPaused ? "Paused" : isEnded ? "Ended" : "Upcoming"}
            </span>
            <Badge variant="outline" className="capitalize gap-1">
              <TypeIcon className="w-3 h-3" />
              {event.event_type?.replace("_", " ")}
            </Badge>
            {event.is_paid ? (
              <Badge variant="outline" className="text-yellow-400 border-yellow-400/30">
                <span style={{ color: '#dc2626', fontWeight: 700, fontFamily: "'Montserrat', sans-serif" }}>{event.currency} {event.price_per_vote}/vote</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="text-green-400 border-green-400/30">Free</Badge>
            )}
          </div>

          <h1 className="text-3xl md:text-4xl font-display font-bold mb-3">{event.title}</h1>
          {event.description && (
            <p className="text-muted-foreground max-w-2xl mb-5 leading-relaxed">{event.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {(event.show_live_results || isEnded) && (
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-secondary" />
                <strong className="text-foreground">{event.total_votes?.toLocaleString() || 0}</strong> votes cast
              </span>
            )}
            {event.end_time && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-secondary" />
                Ends {new Date(event.end_time).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-secondary" /> End-to-end encrypted
            </span>
            <button onClick={handleShare} className="flex items-center gap-1.5 hover:text-secondary transition-colors">
              <Share2 className="w-4 h-4" /> Share
            </button>
          </div>
        </motion.div>

        {/* ── Progress bar (free events only) ── */}
        {!event.is_paid && isActive && totalCategories > 1 && totalVotedCategories > 0 && !allVoted && (
          <motion.div className="glass-card p-4 mb-6 flex items-center gap-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">Voting progress</span>
                <span className="font-medium text-secondary">{totalVotedCategories}/{totalCategories} categories</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <motion.div className="h-full bg-secondary rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${(totalVotedCategories / totalCategories) * 100}%` }}
                  transition={{ duration: 0.5 }} />
              </div>
            </div>
          </motion.div>
        )}

        {/* ── All voted celebration — FREE/PAID events only (org version appears below categories) ── */}
        {allVoted && !isOrganizational && (
          <motion.div className="glass-card p-6 mb-8 text-center border-green-500/30 bg-green-500/5"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="w-16 h-16 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="font-display font-bold text-xl mb-2">All Votes Cast! 🎉</h3>
            <p className="text-muted-foreground text-sm mb-5">
              You've voted in all {totalCategories} categories. Your votes are encrypted and recorded.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {event.results_published && (
                <Link to={`/results/${slug}`}>
                  <Button className="gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90">
                    View Results <ChevronRight className="w-4 h-4" />
                  </Button>
                </Link>
              )}
              <Link to="/">
                <Button variant="outline" className="gap-2">Back to Homepage</Button>
              </Link>
            </div>
          </motion.div>
        )}

        {/* ── Ended Banner ── */}
        {isEnded && (
          <motion.div className="glass-card p-5 mb-8 border-yellow-500/20 bg-yellow-500/5 flex items-center justify-between flex-wrap gap-3"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex items-center gap-3">
              <Trophy className="w-5 h-5 text-yellow-400" />
              <div>
                <p className="font-semibold">This event has ended</p>
                <p className="text-sm text-muted-foreground">Final results are now available</p>
              </div>
            </div>
            <Link to={`/results/${slug}`}>
              <Button size="sm" className="gap-1.5 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/30">
                View Results <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </motion.div>
        )}

        {/* ── Paused Banner ── */}
        {isPaused && (
          <div className="glass-card p-4 mb-8 border-yellow-500/20 bg-yellow-500/5 flex items-center gap-3">
            <span className="text-xl">⏸</span>
            <p className="text-sm text-yellow-400 font-medium">Voting is temporarily paused for this event.</p>
          </div>
        )}

        {/* ── ORG ELECTION: multi-step ballot flow ── */}
        <div ref={ballotTopRef} />
        {isOrganizational && rollVerified && isActive && orgStep !== 'done' && (() => {
          const ballot     = (voterBallot || event.categories || []) as any[];
          const globalCats = ballot.filter((c: any) => c.is_global !== false);
          const groupCats  = ballot.filter((c: any) => c.is_global === false);
          const hasGroup   = groupCats.length > 0;
          const currentCats = (orgSection === 'global' || !hasGroup) ? globalCats : groupCats;
          const allGlobalSelected = globalCats.every((c: any) => !!selectedCandidates[c.id]);
          const totalSelected = ballot.filter((c: any) => !!selectedCandidates[c.id]).length;

          const CandidateCard = ({ cat, candidate }: { cat: any; candidate: any }) => {
            const isChosen = selectedCandidates[cat.id] === candidate.id;
            return (
              <motion.div whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedCandidates(prev => ({ ...prev, [cat.id]: candidate.id }))}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150 ${
                  isChosen ? 'border-secondary/60 bg-secondary/8 ring-1 ring-secondary/30'
                           : 'border-border/40 hover:border-secondary/30 hover:bg-secondary/5'
                }`}>
                {candidate.photo
                  ? <img src={candidate.photo} alt={candidate.name} className={`w-11 h-11 rounded-full object-cover flex-shrink-0 ring-2 ${isChosen ? 'ring-secondary/50' : 'ring-border/30'}`} />
                  : <div className={`w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm ring-2 ${isChosen ? 'bg-secondary/10 text-secondary ring-secondary/30' : 'bg-muted text-muted-foreground ring-border/20'}`}>{candidate.name[0]}</div>
                }
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm truncate ${isChosen ? 'text-secondary' : ''}`}>{candidate.name}</p>
                  {candidate.description && <p className="text-xs text-muted-foreground truncate">{candidate.description}</p>}
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${isChosen ? 'bg-secondary border-secondary' : 'border-border'}`}>
                  {isChosen && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </motion.div>
            );
          };

          return (
            <AnimatePresence mode="wait">
              {orgStep === 'selecting' && (
                <motion.div key="selecting" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  {hasGroup && (
                    <div className="flex gap-2 mb-6 p-1 bg-muted rounded-xl">
                      {[{ key: 'global', label: 'General Ballot', icon: ListChecks, count: globalCats.length },
                        { key: 'group',  label: 'Group Ballot',   icon: Users,      count: groupCats.length }]
                      .map(({ key, label, icon: Icon, count }) => (
                        <button key={key} onClick={() => setOrgSection(key as any)}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${orgSection === key ? 'bg-card text-foreground shadow-sm border border-border/40' : 'text-muted-foreground hover:text-foreground'}`}>
                          <Icon className="w-3.5 h-3.5" />{label}
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${orgSection === key ? 'bg-secondary/10 text-secondary' : 'bg-muted-foreground/10'}`}>{count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-5">
                    <p className="text-sm font-medium text-muted-foreground">{totalSelected} of {ballot.length} selected</p>
                    <div className="flex gap-1">
                      {ballot.map((c: any) => (
                        <div key={c.id} className={`h-1.5 w-6 rounded-full transition-all ${selectedCandidates[c.id] ? 'bg-secondary' : 'bg-muted'}`} />
                      ))}
                    </div>
                  </div>
                  <div className="space-y-6">
                    {currentCats.map((cat: any) => {
                      const isSelected = !!selectedCandidates[cat.id];
                      return (
                        <motion.div key={cat.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
                          <div className={`p-4 border-b border-border/30 flex items-center justify-between ${isSelected ? 'bg-secondary/5' : ''}`}>
                            <div>
                              <h3 className="font-semibold text-sm">{cat.name}</h3>
                              {cat.description && <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>}
                            </div>
                            {isSelected
                              ? <span className="flex items-center gap-1 text-xs text-secondary font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> Selected</span>
                              : <span className="text-xs text-muted-foreground">{cat.candidates?.length || 0} candidates</span>
                            }
                          </div>
                          <div className="p-3 space-y-2">
                            {(cat.candidates || []).map((cand: any) => <CandidateCard key={cand.id} cat={cat} candidate={cand} />)}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                  <div className="mt-8 flex gap-3">
                    {hasGroup && orgSection === 'global'
                      ? <Button onClick={() => { setOrgSection('group'); scrollToBallotTop(); }} disabled={!allGlobalSelected}
                          className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/90 h-12 gap-2">
                          Next: Group Ballot <ChevronRight className="w-4 h-4" />
                        </Button>
                      : <Button onClick={() => { setOrgStep('review'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={totalSelected === 0}
                          className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/90 h-12 gap-2">
                          <ClipboardList className="w-4 h-4" /> Review My Ballot
                        </Button>
                    }
                    {hasGroup && orgSection === 'group' && (
                      <Button variant="outline" onClick={() => setOrgSection('global')} className="h-12 gap-2">
                        <ArrowLeft className="w-4 h-4" /> Back
                      </Button>
                    )}
                  </div>
                  {!allGlobalSelected && orgSection === 'global' && hasGroup && (
                    <p className="text-xs text-muted-foreground text-center mt-3">Select a candidate in every category to continue to your group ballot</p>
                  )}
                </motion.div>
              )}

              {orgStep === 'review' && (
                <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <div className="glass-card overflow-hidden mb-6">
                    <div className="p-5 border-b border-border/30 bg-secondary/5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center">
                          <ClipboardList className="w-5 h-5 text-secondary" />
                        </div>
                        <div>
                          <h3 className="font-display font-bold text-lg">Review Your Ballot</h3>
                          <p className="text-xs text-muted-foreground">Confirm your selections — this cannot be undone</p>
                        </div>
                      </div>
                    </div>
                    <div className="divide-y divide-border/20">
                      {ballot.map((cat: any) => {
                        const cand = cat.candidates?.find((c: any) => c.id === selectedCandidates[cat.id]);
                        return (
                          <div key={cat.id} className="flex items-center justify-between px-5 py-4">
                            <div>
                              <p className="text-xs text-muted-foreground">{cat.name}</p>
                              {cand
                                ? <div className="flex items-center gap-2 mt-1">
                                    {cand.photo && <img src={cand.photo} alt={cand.name} className="w-6 h-6 rounded-full object-cover ring-1 ring-secondary/30" />}
                                    <p className="font-semibold text-sm text-secondary">{cand.name}</p>
                                  </div>
                                : <p className="text-xs text-muted-foreground italic mt-1">No selection — will be skipped</p>
                              }
                            </div>
                            {cand ? <CheckCircle2 className="w-4 h-4 text-secondary flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                    <div className="p-4 bg-muted/30 border-t border-border/20">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Shield className="w-3.5 h-3.5" />
                        <span>{totalSelected} of {ballot.length} categories selected · Encrypted end-to-end</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => { setOrgStep('selecting'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex-1 h-12 gap-2">
                      <RotateCcw className="w-4 h-4" /> Edit Selections
                    </Button>
                    <Button onClick={handleOrgBulkSubmit} disabled={orgSubmitting || totalSelected === 0}
                      className="flex-1 h-12 gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-lg shadow-secondary/20">
                      {orgSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : <><Vote className="w-4 h-4" /> Confirm & Cast Votes</>}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground text-center mt-3">Once confirmed, your ballot is final and cannot be changed.</p>
                </motion.div>
              )}
            </AnimatePresence>
          );
        })()}

        {/* ── ORG ELECTION: Done — auto-redirect to code entry ── */}
        {isOrganizational && rollVerified && orgStep === 'done' && (() => {
          // Auto-redirect after 5 seconds
          return (
            <OrgDoneCard
              voterRollName={voterRollName}
              eventTitle={event.title}
              onReset={resetForNextVoter}
            />
          );
        })()}

        {/* ── NON-ORG: standard per-category voting ── */}
        {!isOrganizational && (() => {
          const visibleCategories = event.categories || [];
          return visibleCategories.length === 0 ? (
          <div className="glass-card p-16 text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="font-medium mb-1">No categories yet</p>
            <p className="text-sm">Check back soon.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {visibleCategories.map((category: any, ci: number) => {
              const totalCatVotes = category.candidates?.reduce((s: number, c: any) => s + (c.vote_count || 0), 0) || 0;
              const hasVoted      = votedCategories.includes(category.id);
              const selected      = selectedCandidates[category.id];
              const isProcessing  = processingCategories.has(category.id);

              const sortedCands   = [...(category.candidates || [])].sort((a: any, b: any) => b.vote_count - a.vote_count);
              const winner        = isEnded && sortedCands[0];
              const isTied        = isEnded && sortedCands.length > 1 && sortedCands[0]?.vote_count === sortedCands[1]?.vote_count && sortedCands[0]?.vote_count > 0;

              return (
                <motion.div key={category.id}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: ci * 0.08 }}>

                  {/* Category header */}
                  <div className="flex items-center gap-3 mb-5 flex-wrap">
                    <div className="w-9 h-9 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center text-secondary font-bold text-sm flex-shrink-0">
                      {ci + 1}
                    </div>
                    <div className="flex-1">
                      <h2 className="font-display font-bold text-xl">{category.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        {category.candidates?.length || 0} candidates
                        {((!event.hide_vote_counts && event.show_live_results) || isEnded) && ` · ${totalCatVotes.toLocaleString()} votes`}
                      </p>
                    </div>
                    {hasVoted && !event.is_paid && (
                      <span className="flex items-center gap-1.5 text-xs text-green-400 font-medium px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Voted
                      </span>
                    )}
                    {isProcessing && (
                      <span className="flex items-center gap-1.5 text-xs text-yellow-400 font-medium px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...
                      </span>
                    )}
                    {isTied && (
                      <span className="text-xs text-muted-foreground px-3 py-1 rounded-full bg-muted border border-border">
                        🤝 Tied
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                    {/* ── Candidates ── */}
                    <div className="lg:col-span-2 space-y-3">
                      {category.candidates?.length === 0 ? (
                        <div className="glass-card p-8 text-center text-muted-foreground text-sm">
                          No candidates added yet.
                        </div>
                      ) : (
                        category.candidates?.map((candidate: any, i: number) => {
                          const pct        = totalCatVotes > 0 ? Math.round((candidate.vote_count / totalCatVotes) * 100) : 0;
                          const isSelected = selected === candidate.id;
                          const isWinner   = isEnded && !isTied && winner?.id === candidate.id;
                          const canVote    = isActive && (!hasVoted || event.is_paid) && !isPaused && !isProcessing;

                          return (
                            <motion.div key={candidate.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.04 }}
                              onClick={() => canVote && handleSelectCandidate(category.id, candidate.id)}
                              className={`relative rounded-xl border p-4 transition-all duration-200 ${
                                canVote ? "cursor-pointer" : "cursor-default"
                              } ${
                                isWinner
                                  ? "border-yellow-500/40 bg-yellow-500/5 ring-1 ring-yellow-500/20"
                                  : isSelected && !hasVoted
                                    ? "border-secondary/60 bg-secondary/5 ring-1 ring-secondary/20"
                                    : hasVoted && isSelected
                                      ? "border-green-500/40 bg-green-500/5"
                                      : canVote
                                        ? "border-border/50 bg-card hover:border-secondary/30 hover:bg-secondary/5"
                                        : "border-border/30 bg-card/50"
                              }`}
                            >
                              {isWinner && (
                                <div className="absolute -top-3 -right-3 w-7 h-7 rounded-full bg-yellow-500 flex items-center justify-center shadow-lg shadow-yellow-500/30 z-10">
                                  <Trophy className="w-3.5 h-3.5 text-white" />
                                </div>
                              )}

                              <div className="flex items-center gap-3">
                                {candidate.photo ? (
                                  <img src={candidate.photo} alt={candidate.name}
                                    className={`w-12 h-12 rounded-full object-cover flex-shrink-0 ring-2 ${
                                      isWinner ? "ring-yellow-500/50" :
                                      isSelected ? "ring-secondary/50" :
                                      "ring-border/50"
                                    }`} />
                                ) : (
                                  <div className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center text-lg font-bold ring-2 ${
                                    isWinner   ? "bg-yellow-500/10 text-yellow-400 ring-yellow-500/30" :
                                    isSelected ? "bg-secondary/10 text-secondary ring-secondary/30" :
                                    "bg-muted text-muted-foreground ring-border/30"
                                  }`}>
                                    {candidate.name[0]}
                                  </div>
                                )}

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-1">
                                    <h3 className={`font-semibold text-sm truncate ${isWinner ? "text-yellow-400" : ""}`}>
                                      {candidate.name}
                                    </h3>
                                    {(!event.hide_vote_counts && event.show_live_results || isEnded) && (
                                      <span className={`text-sm font-bold ml-2 flex-shrink-0 ${
                                        isWinner ? "text-yellow-400" : "text-muted-foreground"
                                      }`}>{pct}%</span>
                                    )}
                                  </div>
                                  {candidate.description && (
                                    <p className="text-xs text-muted-foreground mb-1.5 truncate">{candidate.description}</p>
                                  )}
                                  <div className="flex items-center gap-2">
                                    {(event.hide_vote_counts || !event.show_live_results) && !isEnded ? (
                                      <div className="flex-1 h-1.5 bg-muted rounded-full" />
                                    ) : (
                                      <>
                                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                          <motion.div
                                            className={`h-full rounded-full ${isWinner ? "bg-yellow-500" : isSelected ? "bg-secondary" : "bg-secondary/60"}`}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${pct}%` }}
                                            transition={{ duration: 0.7, delay: i * 0.05 }}
                                          />
                                        </div>
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                                          {candidate.vote_count?.toLocaleString() || 0}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {isSelected && !hasVoted && (
                                  <CheckCircle2 className="w-5 h-5 text-secondary flex-shrink-0" />
                                )}
                                {hasVoted && isSelected && (
                                  <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                                )}
                              </div>
                            </motion.div>
                          );
                        })
                      )}
                    </div>

                    {/* ── Vote Panel ── */}
                    <div>
                      <div className="glass-card p-5 lg:sticky lg:top-24">
                        <AnimatePresence mode="wait">

                          {hasVoted && !event.is_paid ? (
                            <motion.div key="voted"
                              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                              className="text-center py-2">
                              <div className="w-14 h-14 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center mx-auto mb-3">
                                <CheckCircle2 className="w-7 h-7 text-green-400" />
                              </div>
                              <h4 className="font-display font-bold text-base mb-1">Vote Recorded!</h4>
                              <p className="text-xs text-muted-foreground mb-1">
                                You voted for <strong className="text-secondary">
                                  {category.candidates?.find((c: any) => c.id === selected)?.name}
                                </strong>
                              </p>
                              <p className="text-xs text-muted-foreground mb-4">Encrypted and tamper-proof.</p>
                              {isActive && event.show_live_results && (
                                <Link to={`/results/${slug}`}>
                                  <Button variant="outline" size="sm" className="w-full gap-1 text-xs">
                                    Live Results <ChevronRight className="w-3 h-3" />
                                  </Button>
                                </Link>
                              )}
                            </motion.div>

                          ) : isEnded ? (
                            <motion.div key="ended" className="text-center py-2">
                              <Trophy className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
                              <h4 className="font-display font-bold mb-1">Voting Closed</h4>
                              <p className="text-xs text-muted-foreground mb-4">This event has ended.</p>
                              <Link to={`/results/${slug}`}>
                                <Button size="sm" className="w-full gap-1 bg-secondary text-secondary-foreground hover:bg-secondary/90">
                                  See Results <ChevronRight className="w-3.5 h-3.5" />
                                </Button>
                              </Link>
                            </motion.div>

                          ) : isPaused ? (
                            <motion.div key="paused" className="text-center py-2">
                              <span className="text-4xl block mb-3">⏸</span>
                              <h4 className="font-display font-bold mb-1">Voting Paused</h4>
                              <p className="text-xs text-muted-foreground">Check back later.</p>
                            </motion.div>

                          ) : isProcessing ? (
  <motion.div key="processing"
    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
    className="text-center py-3">
    <div className="relative w-16 h-16 mx-auto mb-4">
      <div className="absolute inset-0 rounded-full bg-secondary/20 animate-ping" />
      <div className="relative w-16 h-16 rounded-full bg-secondary/10 border-2 border-secondary/40 flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-secondary animate-spin" />
      </div>
    </div>
    <h4 className="font-display font-bold text-base mb-2">Securing Your Vote</h4>
    <div className="space-y-1.5 mb-3">
      <p className="text-xs text-secondary font-medium flex items-center justify-center gap-1.5">
        <CheckCircle2 className="w-3 h-3" /> Payment confirmed
      </p>
      <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" /> Recording your vote...
      </p>
    </div>
    <p className="text-[10px] text-muted-foreground/60 flex items-center justify-center gap-1">
      <Shield className="w-3 h-3" /> End-to-end encrypted
    </p>
  </motion.div>

                          ) : (
                            <motion.div key="voting">
                              <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
                                <Flame className="w-4 h-4 text-secondary" /> Cast Your Vote
                              </h3>

                              <div className="space-y-2 mb-4 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Vote type</span>
                                  <span className="font-medium capitalize">{event.voting_type?.replace("_", " ") || "single choice"}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Fee</span>
                                  <span className={`font-medium ${event.is_paid ? "text-red-400" : "text-red-400"}`}>
                                    {event.is_paid ? `${event.currency} ${event.price_per_vote}/vote` : "Free"}
                                  </span>
                                </div>
                                {(event.show_live_results || isEnded) && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Total votes</span>
                                    <span className="font-medium">{totalCatVotes.toLocaleString()}</span>
                                  </div>
                                )}
                              </div>

                              {/* Quantity selector — paid events only */}
                              {event.is_paid && (
                                <div className="mb-4">
                                  <p className="text-xs text-muted-foreground mb-2">Number of votes</p>
                                  <div className="flex items-center gap-3">
                                    <button
                                      onClick={() => updateQuantity(category.id, -1)}
                                      className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center hover:bg-muted/80 transition-colors">
                                      <Minus className="w-3.5 h-3.5" />
                                    </button>
                                    <div className="flex-1 text-center">
                                      <span className="text-lg font-bold">{getQuantity(category.id)}</span>
                                      <p className="text-xs text-muted-foreground">
                                        = {event.currency} {(parseFloat(event.price_per_vote) * getQuantity(category.id)).toFixed(2)}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => updateQuantity(category.id, 1)}
                                      className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center hover:bg-muted/80 transition-colors">
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Selected preview */}
                              <div className={`mb-4 p-3 rounded-lg border text-xs transition-all ${
                                selected ? "bg-secondary/10 border-secondary/30" : "bg-muted/30 border-border/40"
                              }`}>
                                {selected ? (
                                  <>
                                    <p className="text-muted-foreground mb-0.5">Selected</p>
                                    <p className="font-semibold text-secondary">
                                      {category.candidates?.find((c: any) => c.id === selected)?.name}
                                    </p>
                                    {event.is_paid && (
                                      <p className="text-yellow-400 mt-1">
                                        {getQuantity(category.id)} vote{getQuantity(category.id) > 1 ? "s" : ""} · {event.currency} {(parseFloat(event.price_per_vote) * getQuantity(category.id)).toFixed(2)}
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-muted-foreground text-center py-0.5">← Select a candidate</p>
                                )}
                              </div>

                              <Button
                                onClick={() => handleVote(category.id)}
                                disabled={!selected || voteLoading || paymentStep[category.id] === 'verifying' || isProcessing}
                                className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-lg shadow-secondary/20 mb-3"
                              >
                                {paymentStep[category.id] === 'verifying'
                                  ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Securing vote...</>
                                  : voteLoading
                                    ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Casting votes...</>
                                    : event.is_paid
                                      ? `Pay & Vote (${event.currency} ${(parseFloat(event.price_per_vote) * getQuantity(category.id)).toFixed(2)})`
                                      : "Submit Vote"
                                }
                              </Button>
                              <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                                <Shield className="w-3 h-3" /> Encrypted end-to-end
                              </p>
                            </motion.div>
                          )}

                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        );
        })()}

      </div>
      <Footer />

      {/* ── Payment Modal ── */}
      {event?.is_paid && (
        <PaymentModal
          open={paymentModal.open}
          onClose={() => setPaymentModal({ open: false, categoryId: "" })}
          onSuccess={(reference) => {
            const categoryId = paymentModal.categoryId;
            setPaymentModal({ open: false, categoryId: "" });
            handlePaymentSuccess(reference, categoryId);
          }}
          eventTitle={event.title}
          eventSlug={slug!}
          categoryId={paymentModal.categoryId}
          candidateName={
            event.categories
              ?.flatMap((c: any) => c.candidates || [])
              .find((c: any) => c.id === selectedCandidates[paymentModal.categoryId])?.name || ""
          }
          candidateId={selectedCandidates[paymentModal.categoryId] || ""}
          quantity={getQuantity(paymentModal.categoryId)}
          pricePerVote={parseFloat(event.price_per_vote)}
          currency={event.currency}
          guestPhone={guestPhone}
          onGuestPhoneChange={setGuestPhone}
          email={(() => {
            if (isAuthenticated) {
              const e = (user as any)?.email || "";
              if (e.endsWith("@phone.evoting.local") || e.endsWith("@ussd.evoting.local")) {
                const phone = (user as any)?.phone || "";
                const clean = phone.replace(/^\+/, "").replace(/\s/g, "");
                return clean ? clean + "@celervote.com" : "voter@celervote.com";
              }
              return e || "voter@celervote.com";
            }
            if (guestPhone) {
              const clean = guestPhone.replace(/^\+/, "").replace(/\s/g, "");
              return clean ? clean + "@celervote.com" : "voter@celervote.com";
            }
            return "";
          })()}
        />
      )}
    </>
  )}
  </div>
);
};

export default EventDetailPage;