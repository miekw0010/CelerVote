import { PaymentModal } from "../components/PaymentModal";
import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Users, Clock, Shield, CheckCircle2, Share2,
  Loader2, Trophy, ChevronRight, Lock, Calendar,
  BarChart2, Zap, Radio, Minus, Plus, AlertCircle,
  Vote, ListChecks, ClipboardList, RotateCcw, Search, Hash,
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

const typeIcon: Record<string, any> = { election: Trophy, contest: Zap, survey: BarChart2, live_show: Radio };
const typeEmoji: Record<string, string> = { election: "🗳️", contest: "🏆", survey: "📊", live_show: "📺" };

function OrgDoneCard({ voterRollName, eventTitle, onReset }: { voterRollName: string; eventTitle: string; onReset: () => void }) {
  const [countdown, setCountdown] = useState(5);
  useEffect(() => {
    const t = setInterval(() => setCountdown(n => { if (n <= 1) { clearInterval(t); onReset(); return 0; } return n - 1; }), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <motion.div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center shadow-lg"
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
      <div className="w-20 h-20 rounded-full bg-green-100 border-2 border-green-200 flex items-center justify-center mx-auto mb-5">
        <CheckCircle2 className="w-10 h-10 text-green-500" />
      </div>
      <h3 className="font-extrabold text-2xl mb-2">Voting Complete! 🎉</h3>
      <p className="text-muted-foreground text-sm mb-2 max-w-sm mx-auto">
        <strong>{voterRollName}</strong>'s votes recorded for <strong>{eventTitle}</strong>.
      </p>
      <div className="flex items-center justify-center mb-4">
        <div className="relative w-14 h-14">
          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="24" fill="none" stroke="#e2e8f0" strokeWidth="4" />
            <motion.circle cx="28" cy="28" r="24" fill="none" stroke={ORANGE} strokeWidth="4"
              strokeDasharray={`${2 * Math.PI * 24}`} initial={{ strokeDashoffset: 0 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 24 }} transition={{ duration: 5, ease: "linear" }}
              strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-black" style={{ color: ORANGE }}>{countdown}</span>
          </div>
        </div>
      </div>
      <Button onClick={onReset} className="gap-2 text-white" style={{ background: NAVY }}>
        <RotateCcw className="w-4 h-4" /> Next Voter
      </Button>
    </motion.div>
  );
}

function CategoryCard({ category, index, onSelect, votedCategories, event }: {
  category: any; index: number; onSelect: (c: any) => void; votedCategories: string[]; event: any;
}) {
  const hasVoted   = votedCategories.includes(category.id);
  const totalVotes = (category.candidates || []).reduce((s: number, c: any) => s + (c.vote_count || 0), 0);
  const count      = category.candidates?.length || 0;
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07 }}
      onClick={() => onSelect(category)}
      className="group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl"
      style={{ border: `2px solid ${hasVoted ? "#bbf7d0" : "#e2e8f0"}`, background: hasVoted ? "#f0fdf4" : "white" }}>
      <div className="relative h-32 flex items-center justify-center overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #004080 100%)` }}>
        <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-10" style={{ background: ORANGE }} />
        <div className="absolute -left-4 -bottom-4 w-16 h-16 rounded-full opacity-10" style={{ background: ORANGE }} />
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg z-10"
          style={{ background: hasVoted ? "#22c55e22" : `${ORANGE}22`, border: `2px solid ${hasVoted ? "#22c55e55" : ORANGE + "55"}` }}>
          {hasVoted ? <CheckCircle2 className="w-7 h-7 text-green-400" /> : <Vote className="w-7 h-7" style={{ color: ORANGE }} />}
        </div>
        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-white text-xs font-bold" style={{ background: ORANGE }}>
          {count} Contestant{count !== 1 ? "s" : ""}
        </div>
        {hasVoted && (
          <div className="absolute top-3 left-3 flex items-center gap-1 px-2.5 py-1 rounded-full text-green-300 text-xs font-semibold bg-green-500/20 border border-green-500/30">
            <CheckCircle2 className="w-3 h-3" /> Voted
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-extrabold text-base mb-1 leading-tight transition-colors" style={{ color: "inherit" }}>{category.name}</h3>
        {category.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{category.description}</p>}
        <div className="flex items-center justify-between mt-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Vote className="w-3.5 h-3.5" style={{ color: ORANGE }} />
            {(!event.hide_vote_counts && event.show_live_results) || event.status === "ended"
              ? `${totalVotes.toLocaleString()} votes` : "Vote now"}
          </span>
          <span className="flex items-center gap-1 text-xs font-bold" style={{ color: ORANGE }}>
            Vote Now <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function CandidateCard({ candidate, event, isSelected, hasVoted, isWinner, isTied, isProcessing, onSelect, totalCatVotes }: {
  candidate: any; event: any; isSelected: boolean; hasVoted: boolean; isWinner: boolean;
  isTied: boolean; isProcessing: boolean; onSelect: () => void; totalCatVotes: number;
}) {
  const isActive  = event.status === "active";
  const isEnded   = event.status === "ended";
  const canVote   = isActive && (!hasVoted || event.is_paid) && !isProcessing;
  const pct       = totalCatVotes > 0 ? Math.round((candidate.vote_count / totalCatVotes) * 100) : 0;
  const showVotes = (!event.hide_vote_counts && event.show_live_results) || isEnded;
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
      whileTap={canVote ? { scale: 0.98 } : {}}
      onClick={() => canVote && onSelect()}
      className="relative rounded-2xl overflow-hidden transition-all duration-200 bg-white"
      style={{
        cursor: canVote ? "pointer" : "default",
        border: isWinner ? "2px solid #eab308" : isSelected && !hasVoted ? `2px solid ${NAVY}` : hasVoted && isSelected ? "2px solid #22c55e" : "2px solid #e2e8f0",
        boxShadow: isSelected && !hasVoted ? `0 8px 32px -4px ${NAVY}33` : isWinner ? "0 8px 32px -4px #eab30833" : "0 2px 12px -2px #00285611",
      }}>
      {isWinner && (
        <div className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full flex items-center justify-center shadow-lg" style={{ background: "#eab308" }}>
          <Trophy className="w-4 h-4 text-white" />
        </div>
      )}
      {isSelected && !hasVoted && (
        <div className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full flex items-center justify-center shadow-lg" style={{ background: NAVY }}>
          <CheckCircle2 className="w-5 h-5 text-white" />
        </div>
      )}
      <div className="relative w-full" style={{ paddingBottom: "80%" }}>
        {candidate.photo
          ? <img src={candidate.photo} alt={candidate.name} className="absolute inset-0 w-full h-full object-cover object-top" />
          : <div className="absolute inset-0 flex items-center justify-center text-6xl font-black"
              style={{ background: isWinner ? "linear-gradient(135deg,#eab30822,#eab30808)" : isSelected ? `linear-gradient(135deg,${NAVY}18,${NAVY}08)` : "linear-gradient(135deg,#f8fafc,#f1f5f9)", color: isWinner ? "#eab308" : isSelected ? NAVY : "#94a3b8" }}>
              {candidate.name[0]}
            </div>
        }
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent z-10" />
        {candidate.code && (
          <div className="absolute top-3 left-3 z-20 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-white text-xs font-black tracking-wider shadow-lg"
            style={{ background: ORANGE, border: "1.5px solid rgba(255,255,255,0.3)" }}>
            <Hash className="w-3 h-3" />{candidate.code}
          </div>
        )}
        {showVotes && (
          <div className="absolute bottom-3 right-3 z-20 px-2.5 py-1 rounded-lg text-white text-xs font-bold shadow"
            style={{ background: isWinner ? "#eab308" : NAVY }}>
            {candidate.vote_count?.toLocaleString() || 0} votes
          </div>
        )}
        {showVotes && totalCatVotes > 0 && (
          <div className="absolute bottom-3 left-3 z-20 text-white text-xs font-black" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
            {pct}%
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-extrabold text-base mb-1 leading-tight" style={{ color: isWinner ? "#eab308" : isSelected ? NAVY : "inherit" }}>
          {candidate.name}
        </h3>
        {candidate.description
          ? <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">{candidate.description}</p>
          : <p className="text-xs mb-3 italic text-gray-400">No bio available</p>
        }
        {showVotes && (
          <div className="mb-3">
            <div className="h-1.5 rounded-full overflow-hidden bg-gray-100">
              <motion.div className="h-full rounded-full" style={{ background: isWinner ? "#eab308" : ORANGE }}
                initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
            </div>
          </div>
        )}
        {canVote && (
          <button className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
            style={{ background: isSelected ? NAVY : "transparent", color: isSelected ? "white" : NAVY, border: `2px solid ${NAVY}` }}>
            <Vote className="w-4 h-4" />{isSelected ? "Selected ✓" : "Cast Your Vote"}
          </button>
        )}
        {hasVoted && isSelected && (
          <div className="flex items-center justify-center gap-1.5 py-2 text-green-600 text-sm font-bold">
            <CheckCircle2 className="w-4 h-4" /> Vote Recorded
          </div>
        )}
        {isEnded && isWinner && !isTied && (
          <div className="flex items-center justify-center gap-1.5 py-2 text-xs font-bold" style={{ color: "#eab308" }}>
            <Trophy className="w-4 h-4" /> Winner 🏆
          </div>
        )}
      </div>
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

  const [selectedCategory, setSelectedCategory]     = useState<any|null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string,string>>({});
  const [votedCategories, setVotedCategories]        = useState<string[]>([]);
  const [voteQuantity, setVoteQuantity]              = useState<Record<string,number>>({});
  const [paymentStep, setPaymentStep]                = useState<Record<string,'select'|'verifying'|'done'>>({});
  const [paymentModal, setPaymentModal]              = useState<{open:boolean;categoryId:string}>({open:false,categoryId:""});
  const [guestPhone, setGuestPhone]                  = useState("");
  const [processingCategories, setProcessingCategories] = useState<Set<string>>(new Set());
  const [categorySearch, setCategorySearch]          = useState("");

  const [voterRollToken, setVoterRollToken]     = useState<string|null>(null);
  const codeRefs = Array.from({length:6},()=>useRef<HTMLInputElement>(null));
  const [voterBallot, setVoterBallot]           = useState<any[]|null>(null);
  const [voterRollId, setVoterRollId]           = useState("");
  const [voterRollName, setVoterRollName]       = useState("");
  const [voterRollError, setVoterRollError]     = useState("");
  const [voterRollLoading, setVoterRollLoading] = useState(false);
  const [orgStep, setOrgStep]                   = useState<'selecting'|'review'|'done'>('selecting');
  const [orgSubmitting, setOrgSubmitting]       = useState(false);
  const [orgSection, setOrgSection]             = useState<'global'|'group'>('global');

  const ballotTopRef    = useRef<HTMLDivElement>(null);
  const candidateTopRef = useRef<HTMLDivElement>(null);
  const scrollToBallotTop = useCallback(()=>{ setTimeout(()=>ballotTopRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),50); },[]);

  useEffect(()=>{ window.scrollTo(0,0); },[slug]);

  const handleBackToCategories = () => { setSelectedCategory(null); window.scrollTo({top:0,behavior:'smooth'}); };
  const isOrganizational = event?.voting_mode === 'organizational';
  const rollVerified     = isOrganizational && !!voterRollToken;

  const resetForNextVoter = useCallback(()=>{
    setVoterRollToken(null); setVoterRollName(""); setVoterRollId("");
    setVoterRollError(""); setVoterBallot(null); setSelectedCandidates({});
    setVotedCategories([]); setOrgStep('selecting'); setOrgSection('global');
    window.scrollTo({top:0,behavior:'smooth'});
    localStorage.removeItem("access_token"); localStorage.removeItem("refresh_token");
  },[]);

  const handleVerifyVoterId = async () => {
    if (voterRollId.length < 6) return;
    setVoterRollLoading(true); setVoterRollError("");
    try {
      const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";
      const res  = await fetch(`${API}/events/${slug}/verify-code/`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({code:voterRollId.trim()}),
      });
      const data = await res.json();
      if (!res.ok){ setVoterRollError(data.error||"Verification failed."); return; }
      setVoterRollToken(data.tokens.access); setVoterRollName(data.voter_name);
      if(data.ballot) setVoterBallot(data.ballot);
      localStorage.setItem("access_token",data.tokens.access);
      localStorage.setItem("refresh_token",data.tokens.refresh);
      setOrgStep('selecting'); setOrgSection('global'); setSelectedCandidates({});
      toast({title:`Welcome, ${data.voter_name}! 🗳️`,description:"Code verified."});
    } catch { setVoterRollError("Network error. Try again."); }
    finally { setVoterRollLoading(false); }
  };

  const lockCategory   = (id:string)=>setProcessingCategories(p=>new Set(p).add(id));
  const unlockCategory = (id:string)=>setProcessingCategories(p=>{const s=new Set(p);s.delete(id);return s;});

  const fireConfetti = () => {
    confetti({particleCount:80,spread:60,origin:{y:0.7},colors:[NAVY,ORANGE,"#ffffff"]});
    setTimeout(()=>confetti({particleCount:40,spread:80,origin:{y:0.6,x:0.3},colors:[NAVY,ORANGE]}),250);
    setTimeout(()=>confetti({particleCount:40,spread:80,origin:{y:0.6,x:0.7},colors:[NAVY,ORANGE]}),450);
  };

  const handleOrgBulkSubmit = async () => {
    const ballot=(voterBallot||event?.categories||[]);
    const votes=ballot.map((c:any)=>({category_id:c.id,candidate_id:selectedCandidates[c.id]})).filter((v:any)=>!!v.candidate_id);
    if(!votes.length){toast({title:"No selections",variant:"destructive"});return;}
    setOrgSubmitting(true);
    try{ await castBulkVote(slug!,votes); fireConfetti(); setOrgStep('done'); window.scrollTo({top:0,behavior:'smooth'}); refetch(); }
    catch(err:any){ toast({title:"Submission failed",description:err?.message||"Something went wrong.",variant:"destructive"}); }
    finally{ setOrgSubmitting(false); }
  };

  const getQuantity    = (id:string)=>voteQuantity[id]||1;
  const updateQuantity = (id:string,d:number)=>setVoteQuantity(p=>({...p,[id]:Math.max(1,Math.min(100,(p[id]||1)+d))}));

  const handleSelectCandidate = (categoryId:string,candidateId:string)=>{
    if(votedCategories.includes(categoryId)&&!event?.is_paid) return;
    setSelectedCandidates(p=>({...p,[categoryId]:candidateId}));
  };

  const handleVote = async (categoryId:string)=>{
    const candidateId=selectedCandidates[categoryId];
    if(event.is_paid){
      if(!candidateId){toast({title:"Select a candidate first",variant:"destructive"});return;}
      if(processingCategories.has(categoryId)){toast({title:"Please wait",variant:"destructive"});return;}
      if(!event.is_open){toast({title:"Voting closed",variant:"destructive"});return;}
      setPaymentModal({open:true,categoryId});return;
    }
    if(!isOrganizational&&!isAuthenticated){toast({title:"Login required",variant:"destructive"});navigate("/auth");return;}
    if(!candidateId) return;
    if(votedCategories.includes(categoryId)){toast({title:"Already voted",variant:"destructive"});return;}
    try{
      await castVote({event_slug:slug!,category_id:categoryId,candidate_ids:[candidateId]});
      setVotedCategories(p=>[...p,categoryId]);
      fireConfetti(); refetch();
      toast({title:"Vote cast! 🎉",description:"Your vote has been recorded."});
      setTimeout(handleBackToCategories,1800);
    }catch(err:any){
      const msg=err?.message||'';
      if(msg.includes('already')) toast({title:"Already voted",variant:"destructive"});
      else toast({title:"Vote failed",description:msg||"Something went wrong.",variant:"destructive"});
    }
  };

  const handlePaymentSuccess = async (reference:string,categoryId:string)=>{
    lockCategory(categoryId);
    setPaymentStep(p=>({...p,[categoryId]:'verifying'}));
    const qty=getQuantity(categoryId);
    const attempt=async(n:number):Promise<void>=>{
      try{
        await castVote({event_slug:slug!,category_id:categoryId,candidate_ids:[selectedCandidates[categoryId]],payment_ref:reference,quantity:qty});
        setVotedCategories(p=>[...p,categoryId]);
        setPaymentStep(p=>({...p,[categoryId]:'done'}));
        fireConfetti(); refetch();
        toast({title:"Votes cast! 🎉",description:`${qty} vote(s) recorded.`});
        setTimeout(()=>{ setPaymentStep(p=>({...p,[categoryId]:'select'})); setSelectedCandidates(p=>({...p,[categoryId]:''})); setVoteQuantity(p=>({...p,[categoryId]:1})); unlockCategory(categoryId); },1500);
      }catch(err:any){
        const msg=err?.message||'';
        if(msg.includes('already been used')){
          setVotedCategories(p=>[...p,categoryId]); setPaymentStep(p=>({...p,[categoryId]:'done'})); fireConfetti(); refetch();
          toast({title:"Votes cast! 🎉"});
          setTimeout(()=>{ setPaymentStep(p=>({...p,[categoryId]:'select'})); setSelectedCandidates(p=>({...p,[categoryId]:''})); setVoteQuantity(p=>({...p,[categoryId]:1})); unlockCategory(categoryId); },1500);
          return;
        }
        if(n<4){ toast({title:`Retrying... (${n}/4)`}); await new Promise(r=>setTimeout(r,n*1500)); return attempt(n+1); }
        unlockCategory(categoryId); setPaymentStep(p=>({...p,[categoryId]:'select'}));
        toast({title:"Vote not recorded — keep your ref!",description:`Ref: ${reference}`,variant:"destructive",duration:15000});
      }
    };
    await attempt(1);
  };

  const handleShare=()=>{ navigator.clipboard.writeText(window.location.href); toast({title:"Link copied! 🔗"}); };
  const getTimeLeft=(t:string)=>{
    if(!t) return null;
    const d=new Date(t).getTime()-Date.now();
    if(d<=0) return null;
    const h=Math.floor(d/3600000),days=Math.floor(h/24);
    if(days>0) return `${days}d ${h%24}h left`;
    if(h>0) return `${h}h left`;
    return "Ending soon";
  };

  if(loading) return(
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-3">
        <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{color:ORANGE}}/>
        <p className="text-sm text-muted-foreground">Loading event…</p>
      </div>
    </div>
  );
  if(error||!event) return(
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center p-10 rounded-2xl border bg-white shadow">
        <p className="text-muted-foreground mb-4">{error||"Event not found."}</p>
        <Link to="/events"><Button variant="outline">Back to Events</Button></Link>
      </div>
    </div>
  );

  const isEnded  = event.status==="ended";
  const isActive = event.status==="active";
  const isPaused = event.status==="paused";
  const timeLeft = getTimeLeft(event.end_time);
  const TypeIcon = typeIcon[event.event_type]||Trophy;

  const allCategories      = event.categories||[];
  const filteredCategories = allCategories.filter((c:any)=>c.name.toLowerCase().includes(categorySearch.toLowerCase()));

  const activeCatData    = selectedCategory ? allCategories.find((c:any)=>c.id===selectedCategory.id) : null;
  const sortedCandidates = activeCatData ? [...(activeCatData.candidates||[])].sort((a:any,b:any)=>b.vote_count-a.vote_count) : [];
  const totalCatVotes    = sortedCandidates.reduce((s:number,c:any)=>s+(c.vote_count||0),0);
  const winner           = isEnded&&sortedCandidates[0];
  const isTied           = isEnded&&sortedCandidates.length>1&&sortedCandidates[0]?.vote_count===sortedCandidates[1]?.vote_count&&sortedCandidates[0]?.vote_count>0;
  const catHasVoted      = selectedCategory ? votedCategories.includes(selectedCategory.id) : false;
  const catSelected      = selectedCategory ? selectedCandidates[selectedCategory.id] : null;
  const catIsProcessing  = selectedCategory ? processingCategories.has(selectedCategory.id) : false;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Org: Code Entry */}
      {isOrganizational&&!rollVerified&&isActive&&(
        <div className="min-h-screen flex items-center justify-center px-4" style={{paddingTop:80}}>
          <div className="w-full max-w-lg">
            <motion.div className="text-center mb-10" initial={{opacity:0,y:-20}} animate={{opacity:1,y:0}}>
              {event.banner_image
                ?<img src={event.banner_image} alt={event.title} className="w-20 h-20 rounded-2xl object-cover mx-auto mb-5 shadow-lg"/>
                :<div className="w-20 h-20 rounded-2xl mx-auto mb-5 flex items-center justify-center text-4xl shadow-lg" style={{background:`linear-gradient(135deg,${NAVY},#004080)`}}>🗳️</div>
              }
              <h1 className="text-3xl font-extrabold mb-2">{event.title}</h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
                style={{background:`${NAVY}11`,borderColor:`${NAVY}33`,color:NAVY}}>
                <Shield className="w-3 h-3"/> Organizational Election
              </span>
              <p className="text-muted-foreground text-sm mt-4 max-w-sm mx-auto">
                Enter your 6-character voting code received via SMS.
              </p>
            </motion.div>
            <motion.div className="rounded-3xl shadow-xl overflow-hidden bg-white border border-gray-100"
              initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.1}}>
              <div className="h-1.5 w-full" style={{background:`linear-gradient(90deg,${NAVY},${ORANGE})`}}/>
              <div className="p-8">
                <p className="text-center text-sm font-bold text-muted-foreground mb-6 uppercase tracking-widest">Your Voting Code</p>
                <div className="flex justify-center gap-2 sm:gap-3 mb-6">
                  {Array.from({length:6}).map((_,i)=>(
                    <input key={i} ref={codeRefs[i]} type="text" inputMode="text" maxLength={1}
                      value={voterRollId[i]||""} autoFocus={i===0} autoComplete="off"
                      autoCapitalize="characters" spellCheck={false}
                      onChange={e=>{
                        const ch=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
                        if(!ch) return;
                        const arr=voterRollId.split(''); arr[i]=ch[ch.length-1];
                        const next=arr.join('').slice(0,6); setVoterRollId(next); setVoterRollError('');
                        if(i<5) setTimeout(()=>codeRefs[i+1].current?.focus(),0);
                        if(i===5) setTimeout(handleVerifyVoterId,100);
                      }}
                      onKeyDown={e=>{
                        if(e.key==='Backspace'){
                          e.preventDefault();
                          const arr=voterRollId.split('');
                          if(arr[i]) arr[i]=''; else if(i>0){arr[i-1]='';codeRefs[i-1].current?.focus();}
                          setVoterRollId(arr.join('').slice(0,6)); setVoterRollError('');
                        }
                        if(e.key==='Enter'&&voterRollId.length===6) handleVerifyVoterId();
                      }}
                      onFocus={e=>e.target.select()}
                      onPaste={e=>{
                        e.preventDefault();
                        const p=e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
                        setVoterRollId(p); setVoterRollError('');
                        setTimeout(()=>codeRefs[Math.min(p.length,5)].current?.focus(),0);
                        if(p.length===6) setTimeout(handleVerifyVoterId,150);
                      }}
                      className="w-11 h-14 rounded-xl text-center font-mono font-black text-2xl transition-all focus:outline-none border-2"
                      style={{borderColor:voterRollError?"#ef4444":voterRollId[i]?ORANGE:"#e2e8f0",background:voterRollId[i]?`${ORANGE}11`:"#f8fafc",color:voterRollId[i]?NAVY:"#94a3b8"}}
                    />
                  ))}
                </div>
                {voterRollError&&(
                  <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 mb-5">
                    <span className="text-lg">⚠️</span>
                    <p className="text-red-600 text-sm font-medium">{voterRollError}</p>
                  </motion.div>
                )}
                <button onClick={handleVerifyVoterId} disabled={voterRollLoading||voterRollId.length<6}
                  className="w-full h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2 text-white transition-all disabled:opacity-40"
                  style={{background:`linear-gradient(135deg,${NAVY},#004080)`}}>
                  {voterRollLoading?<><Loader2 className="w-5 h-5 animate-spin"/>Verifying…</>:<><Shield className="w-5 h-5"/>Access My Ballot</>}
                </button>
                <p className="text-center text-xs text-muted-foreground mt-4">🔒 Each code is single-use</p>
              </div>
            </motion.div>
          </div>
        </div>
      )}

      {isOrganizational&&rollVerified&&(
        <div className="fixed top-16 inset-x-0 z-40 flex justify-center px-4 pt-2 pointer-events-none">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full text-green-700 text-xs font-semibold bg-green-50 border border-green-200 shadow">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500"/> Verified as {voterRollName}
          </div>
        </div>
      )}

      {isOrganizational&&!rollVerified&&isActive?null:(<>
        {/* Banner */}
        <div className="relative h-52 md:h-80 overflow-hidden">
          {event.banner_image
            ?<img src={event.banner_image} alt={event.title} className="w-full h-full object-cover"/>
            :<div className="w-full h-full flex items-center justify-center" style={{background:`linear-gradient(135deg,${NAVY},#004080)`}}>
               <span className="text-9xl opacity-10">{typeEmoji[event.event_type]||"🗳️"}</span>
             </div>
          }
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent"/>
          {isActive&&(
            <div className="absolute top-5 left-5 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"/>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400"/>
              </span>
              <span className="text-xs font-black text-white px-1.5 py-0.5 rounded" style={{background:"#dc2626"}}>LIVE NOW</span>
            </div>
          )}
          {timeLeft&&isActive&&(
            <div className="absolute top-5 right-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 text-orange-300 text-xs font-medium">
              <Clock className="w-3.5 h-3.5"/>{timeLeft}
            </div>
          )}
        </div>

        <div className="container mx-auto px-4 max-w-6xl -mt-10 relative z-10 pb-24">
          {selectedCategory&&!isOrganizational?(
            <button onClick={handleBackToCategories} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors group">
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform"/> Back to Categories
            </button>
          ):(
            <Link to="/events" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors group">
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform"/> Back to Events
            </Link>
          )}

          {/* Event header */}
          <motion.div className="mb-8" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${isActive?"bg-green-50 text-green-700 border-green-200":isPaused?"bg-yellow-50 text-yellow-700 border-yellow-200":isEnded?"bg-gray-100 text-gray-500 border-gray-200":"bg-blue-50 text-blue-700 border-blue-200"}`}>
                {isActive&&<span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"/>}
                {isActive?"Live Now":isPaused?"Paused":isEnded?"Ended":"Upcoming"}
              </span>
              <Badge variant="outline" className="capitalize gap-1"><TypeIcon className="w-3 h-3"/>{event.event_type?.replace("_"," ")}</Badge>
              {event.is_paid
                ?<Badge variant="outline" className="text-red-500 border-red-200">{event.currency} {event.price_per_vote}/vote</Badge>
                :<Badge variant="outline" className="text-green-600 border-green-200">Free</Badge>
              }
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold mb-3">{event.title}</h1>
            {event.description&&<p className="text-muted-foreground max-w-2xl mb-4 leading-relaxed">{event.description}</p>}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              {(event.show_live_results||isEnded)&&(
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" style={{color:ORANGE}}/>
                  <strong className="text-foreground">{event.total_votes?.toLocaleString()||0}</strong> votes cast
                </span>
              )}
              {event.end_time&&(
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" style={{color:ORANGE}}/>
                  Ends {new Date(event.end_time).toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}
                </span>
              )}
              <span className="flex items-center gap-1.5"><Lock className="w-4 h-4" style={{color:ORANGE}}/>Encrypted</span>
              <button onClick={handleShare} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                <Share2 className="w-4 h-4"/>Share
              </button>
            </div>
          </motion.div>

          {isEnded&&(
            <motion.div className="p-5 mb-8 rounded-2xl border border-yellow-200 bg-yellow-50 flex items-center justify-between flex-wrap gap-3" initial={{opacity:0}} animate={{opacity:1}}>
              <div className="flex items-center gap-3">
                <Trophy className="w-5 h-5 text-yellow-500"/>
                <div><p className="font-bold">This event has ended</p><p className="text-sm text-muted-foreground">Final results available</p></div>
              </div>
              <Link to={`/results/${slug}`}>
                <Button size="sm" className="gap-1.5 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-300">
                  View Results<ChevronRight className="w-3.5 h-3.5"/>
                </Button>
              </Link>
            </motion.div>
          )}
          {isPaused&&(
            <div className="p-4 mb-8 rounded-2xl border border-yellow-200 bg-yellow-50 flex items-center gap-3">
              <span className="text-xl">⏸</span>
              <p className="text-sm text-yellow-700 font-medium">Voting is temporarily paused.</p>
            </div>
          )}

          <div ref={ballotTopRef}/>
          {/* Org ballot */}
          {isOrganizational&&rollVerified&&isActive&&orgStep!=='done'&&(()=>{
            const ballot=(voterBallot||event.categories||[]) as any[];
            const globalCats=ballot.filter((c:any)=>c.is_global!==false);
            const groupCats=ballot.filter((c:any)=>c.is_global===false);
            const hasGroup=groupCats.length>0;
            const curCats=(orgSection==='global'||!hasGroup)?globalCats:groupCats;
            const totalSel=ballot.filter((c:any)=>!!selectedCandidates[c.id]).length;
            const allGlobal=globalCats.every((c:any)=>!!selectedCandidates[c.id]);
            const OrgCandCard=({cat,cand}:{cat:any;cand:any})=>{
              const chosen=selectedCandidates[cat.id]===cand.id;
              return(
                <motion.div whileTap={{scale:0.98}} onClick={()=>setSelectedCandidates(p=>({...p,[cat.id]:cand.id}))}
                  className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all"
                  style={{borderColor:chosen?NAVY:"#e2e8f0",background:chosen?`${NAVY}08`:"white"}}>
                  {cand.photo
                    ?<img src={cand.photo} alt={cand.name} className="w-11 h-11 rounded-full object-cover flex-shrink-0" style={{outline:`2px solid ${chosen?ORANGE:"#e2e8f0"}`}}/>
                    :<div className="w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm" style={{background:chosen?`${NAVY}18`:"#f1f5f9",color:chosen?NAVY:"#94a3b8"}}>{cand.name[0]}</div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{color:chosen?NAVY:"inherit"}}>{cand.name}</p>
                    {cand.description&&<p className="text-xs text-muted-foreground truncate">{cand.description}</p>}
                  </div>
                  <div className="w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all" style={{borderColor:chosen?NAVY:"#e2e8f0",background:chosen?NAVY:"white"}}>
                    {chosen&&<div className="w-2 h-2 rounded-full bg-white"/>}
                  </div>
                </motion.div>
              );
            };
            return(
              <AnimatePresence mode="wait">
                {orgStep==='selecting'&&(
                  <motion.div key="sel" initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-20}}>
                    {hasGroup&&(
                      <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-xl">
                        {[{k:'global',label:'General',icon:ListChecks,n:globalCats.length},{k:'group',label:'Group',icon:Users,n:groupCats.length}].map(({k,label,icon:Ic,n})=>(
                          <button key={k} onClick={()=>setOrgSection(k as any)}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all"
                            style={{background:orgSection===k?"white":"transparent",color:orgSection===k?NAVY:"#64748b",boxShadow:orgSection===k?"0 1px 4px rgba(0,0,0,0.08)":"none"}}>
                            <Ic className="w-3.5 h-3.5"/>{label}
                            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{background:orgSection===k?`${ORANGE}22`:"#e2e8f0",color:orgSection===k?ORANGE:"#94a3b8"}}>{n}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-5">
                      <p className="text-sm text-muted-foreground">{totalSel} of {ballot.length} selected</p>
                      <div className="flex gap-1">
                        {ballot.map((c:any)=>(
                          <div key={c.id} className="h-1.5 w-6 rounded-full transition-all" style={{background:selectedCandidates[c.id]?ORANGE:"#e2e8f0"}}/>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-5">
                      {curCats.map((cat:any)=>{
                        const sel=!!selectedCandidates[cat.id];
                        return(
                          <motion.div key={cat.id} initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} className="rounded-2xl border overflow-hidden shadow-sm bg-white" style={{borderColor:sel?`${NAVY}33`:"#e2e8f0"}}>
                            <div className="p-4 border-b flex items-center justify-between" style={{borderColor:"#f1f5f9",background:sel?`${NAVY}05`:"white"}}>
                              <div>
                                <h3 className="font-bold text-sm">{cat.name}</h3>
                                {cat.description&&<p className="text-xs text-muted-foreground">{cat.description}</p>}
                              </div>
                              {sel
                                ?<span className="flex items-center gap-1 text-xs font-medium" style={{color:ORANGE}}><CheckCircle2 className="w-3.5 h-3.5"/>Selected</span>
                                :<span className="text-xs text-muted-foreground">{cat.candidates?.length||0} candidates</span>
                              }
                            </div>
                            <div className="p-3 space-y-2">
                              {(cat.candidates||[]).map((c:any)=><OrgCandCard key={c.id} cat={cat} cand={c}/>)}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                    <div className="mt-8 flex gap-3">
                      {hasGroup&&orgSection==='global'
                        ?<Button onClick={()=>{setOrgSection('group');scrollToBallotTop();}} disabled={!allGlobal} className="flex-1 h-12 gap-2 text-white" style={{background:NAVY}}>
                           Next: Group Ballot<ChevronRight className="w-4 h-4"/>
                         </Button>
                        :<Button onClick={()=>{setOrgStep('review');window.scrollTo({top:0,behavior:'smooth'});}} disabled={totalSel===0} className="flex-1 h-12 gap-2 text-white" style={{background:NAVY}}>
                           <ClipboardList className="w-4 h-4"/>Review Ballot
                         </Button>
                      }
                      {hasGroup&&orgSection==='group'&&(
                        <Button variant="outline" onClick={()=>setOrgSection('global')} className="h-12 gap-2">
                          <ArrowLeft className="w-4 h-4"/>Back
                        </Button>
                      )}
                    </div>
                  </motion.div>
                )}
                {orgStep==='review'&&(
                  <motion.div key="rev" initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-20}}>
                    <div className="rounded-2xl border overflow-hidden mb-6 shadow-sm bg-white" style={{borderColor:"#e2e8f0"}}>
                      <div className="p-5 border-b" style={{background:`${NAVY}05`,borderColor:"#f1f5f9"}}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:`${NAVY}11`,border:`1.5px solid ${NAVY}22`}}>
                            <ClipboardList className="w-5 h-5" style={{color:NAVY}}/>
                          </div>
                          <div><h3 className="font-extrabold text-lg">Review Your Ballot</h3><p className="text-xs text-muted-foreground">Confirm — cannot be undone</p></div>
                        </div>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {ballot.map((cat:any)=>{
                          const cand=cat.candidates?.find((c:any)=>c.id===selectedCandidates[cat.id]);
                          return(
                            <div key={cat.id} className="flex items-center justify-between px-5 py-4">
                              <div>
                                <p className="text-xs text-muted-foreground">{cat.name}</p>
                                {cand
                                  ?<div className="flex items-center gap-2 mt-1">
                                     {cand.photo&&<img src={cand.photo} alt={cand.name} className="w-6 h-6 rounded-full object-cover"/>}
                                     <p className="font-bold text-sm" style={{color:NAVY}}>{cand.name}</p>
                                   </div>
                                  :<p className="text-xs text-muted-foreground italic mt-1">No selection</p>
                                }
                              </div>
                              {cand?<CheckCircle2 className="w-4 h-4" style={{color:ORANGE}}/>:<AlertCircle className="w-4 h-4 text-muted-foreground"/>}
                            </div>
                          );
                        })}
                      </div>
                      <div className="p-4 bg-gray-50 border-t border-gray-100">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Shield className="w-3.5 h-3.5"/>{totalSel} of {ballot.length} selected · End-to-end encrypted
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={()=>{setOrgStep('selecting');window.scrollTo({top:0,behavior:'smooth'});}} className="flex-1 h-12 gap-2">
                        <RotateCcw className="w-4 h-4"/>Edit
                      </Button>
                      <Button onClick={handleOrgBulkSubmit} disabled={orgSubmitting||totalSel===0} className="flex-1 h-12 gap-2 text-white shadow-lg" style={{background:`linear-gradient(135deg,${NAVY},#004080)`}}>
                        {orgSubmitting?<><Loader2 className="w-4 h-4 animate-spin"/>Submitting…</>:<><Vote className="w-4 h-4"/>Confirm & Cast Votes</>}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            );
          })()}
          {isOrganizational&&rollVerified&&orgStep==='done'&&(
            <OrgDoneCard voterRollName={voterRollName} eventTitle={event.title} onReset={resetForNextVoter}/>
          )}

          {/* NON-ORG FLOW */}
          {!isOrganizational&&(()=>{
            if(!selectedCategory){
              return(
                <AnimatePresence mode="wait">
                  <motion.div key="cats" initial={{opacity:0}} animate={{opacity:1}}>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
                      <div>
                        <h2 className="text-2xl font-extrabold mb-1">Available Categories <span style={{color:ORANGE}}>.</span></h2>
                        <p className="text-muted-foreground text-sm max-w-lg">Browse through our categories and vote for your favourites. Your vote matters in determining the winners.</p>
                      </div>
                      {allCategories.length>4&&(
                        <div className="relative w-full sm:w-64 flex-shrink-0">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
                          <input type="text" placeholder="Search categories…" value={categorySearch} onChange={e=>setCategorySearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none transition-colors"
                            style={{borderColor:categorySearch?NAVY:"#e2e8f0"}}/>
                        </div>
                      )}
                    </div>
                    {filteredCategories.length===0
                      ?<div className="p-16 text-center text-muted-foreground rounded-2xl border border-dashed border-gray-200"><p className="font-medium mb-1">No categories found</p></div>
                      :<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                         {filteredCategories.map((cat:any,i:number)=>(
                           <CategoryCard key={cat.id} category={cat} index={i} onSelect={setSelectedCategory} votedCategories={votedCategories} event={event}/>
                         ))}
                       </div>
                    }
                    {votedCategories.length>0&&allCategories.length>1&&(
                      <motion.div className="p-4 mt-8 rounded-2xl border border-gray-100 bg-white shadow-sm flex items-center gap-4" initial={{opacity:0}} animate={{opacity:1}}>
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-1.5">
                            <span className="text-muted-foreground">Voting progress</span>
                            <span className="font-bold" style={{color:ORANGE}}>{votedCategories.length}/{allCategories.length}</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <motion.div className="h-full rounded-full" style={{background:`linear-gradient(90deg,${NAVY},${ORANGE})`}}
                              initial={{width:0}} animate={{width:`${(votedCategories.length/allCategories.length)*100}%`}} transition={{duration:0.5}}/>
                          </div>
                        </div>
                        {votedCategories.length>=allCategories.length&&!event.is_paid&&<CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0"/>}
                      </motion.div>
                    )}
                    {votedCategories.length>=allCategories.length&&allCategories.length>0&&!event.is_paid&&(
                      <motion.div className="p-6 mt-6 text-center rounded-2xl border border-green-200 bg-green-50" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}}>
                        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3"/>
                        <h3 className="font-extrabold text-xl mb-2">All Votes Cast! 🎉</h3>
                        <p className="text-muted-foreground text-sm mb-4">You've voted in all {allCategories.length} categories.</p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                          {event.results_published&&<Link to={`/results/${slug}`}><Button className="gap-2 text-white" style={{background:NAVY}}>View Results<ChevronRight className="w-4 h-4"/></Button></Link>}
                          <Link to="/"><Button variant="outline">Back to Homepage</Button></Link>
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                </AnimatePresence>
              );
            }
            return(
              <AnimatePresence mode="wait">
                <motion.div key={`cands-${selectedCategory?.id}`} initial={{opacity:0,x:30}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-30}}>
                  <div className="mb-6" ref={candidateTopRef}>
                    <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
                      <h2 className="text-2xl font-extrabold">{selectedCategory?.name}</h2>
                      {catHasVoted&&!event.is_paid&&(
                        <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-700">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500"/>Voted
                        </span>
                      )}
                    </div>
                    {selectedCategory?.description&&<p className="text-sm text-muted-foreground mb-1">{selectedCategory.description}</p>}
                    <p className="text-xs text-muted-foreground">
                      {sortedCandidates.length} contestant{sortedCandidates.length!==1?"s":""}
                      {((!event.hide_vote_counts&&event.show_live_results)||isEnded)&&` · ${totalCatVotes.toLocaleString()} votes`}
                    </p>
                  </div>
                  {sortedCandidates.length===0
                    ?<div className="p-16 text-center text-muted-foreground rounded-2xl border border-dashed border-gray-200">
                       <Users className="w-12 h-12 mx-auto mb-4 opacity-20"/><p className="font-medium mb-1">No contestants yet</p>
                     </div>
                    :<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
                       {sortedCandidates.map((cand:any)=>(
                         <CandidateCard key={cand.id} candidate={cand} event={event}
                           isSelected={catSelected===cand.id} hasVoted={catHasVoted}
                           isWinner={!!(isEnded&&!isTied&&(winner as any)?.id===cand.id)}
                           isTied={isTied} isProcessing={catIsProcessing} totalCatVotes={totalCatVotes}
                           onSelect={()=>handleSelectCandidate(selectedCategory.id,cand.id)}/>
                       ))}
                     </div>
                  }
                  {event.is_paid&&catSelected&&isActive&&!catIsProcessing&&(
                    <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} className="sticky bottom-6 p-4 rounded-2xl border shadow-xl bg-white" style={{borderColor:`${NAVY}33`,boxShadow:`0 8px 32px -4px ${NAVY}22`}}>
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground">Selected</p>
                          <p className="font-bold truncate" style={{color:NAVY}}>{activeCatData?.candidates?.find((c:any)=>c.id===catSelected)?.name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={()=>updateQuantity(selectedCategory.id,-1)} className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center hover:bg-gray-200"><Minus className="w-3.5 h-3.5"/></button>
                          <div className="text-center min-w-[3rem]">
                            <span className="font-black">{getQuantity(selectedCategory.id)}</span>
                            <p className="text-xs text-muted-foreground">{event.currency} {(parseFloat(event.price_per_vote)*getQuantity(selectedCategory.id)).toFixed(2)}</p>
                          </div>
                          <button onClick={()=>updateQuantity(selectedCategory.id,1)} className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center hover:bg-gray-200"><Plus className="w-3.5 h-3.5"/></button>
                        </div>
                        <Button onClick={()=>handleVote(selectedCategory.id)} disabled={paymentStep[selectedCategory.id]==='verifying'} className="gap-2 text-white shadow-lg" style={{background:`linear-gradient(135deg,${NAVY},#004080)`}}>
                          {paymentStep[selectedCategory.id]==='verifying'?<><Loader2 className="w-4 h-4 animate-spin"/>Processing…</>:<>Pay & Vote · {event.currency} {(parseFloat(event.price_per_vote)*getQuantity(selectedCategory.id)).toFixed(2)}</>}
                        </Button>
                      </div>
                    </motion.div>
                  )}
                  {!event.is_paid&&catSelected&&isActive&&!catHasVoted&&(
                    <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="sticky bottom-6 p-4 rounded-2xl border shadow-xl bg-white" style={{borderColor:`${NAVY}33`,boxShadow:`0 8px 32px -4px ${NAVY}22`}}>
                      <div className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground">Ready to vote for</p>
                          <p className="font-bold truncate" style={{color:NAVY}}>{activeCatData?.candidates?.find((c:any)=>c.id===catSelected)?.name}</p>
                        </div>
                        <Button onClick={()=>handleVote(selectedCategory.id)} disabled={voteLoading} className="gap-2 text-white shadow-lg" style={{background:`linear-gradient(135deg,${NAVY},#004080)`}}>
                          {voteLoading?<><Loader2 className="w-4 h-4 animate-spin"/>Casting…</>:<><Vote className="w-4 h-4"/>Submit Vote</>}
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              </AnimatePresence>
            );
          })()}
        </div>
        <Footer/>
        {event?.is_paid&&(
          <PaymentModal
            open={paymentModal.open}
            onClose={()=>setPaymentModal({open:false,categoryId:""})}
            onSuccess={(ref)=>{ const cid=paymentModal.categoryId; setPaymentModal({open:false,categoryId:""}); handlePaymentSuccess(ref,cid); }}
            eventTitle={event.title} eventSlug={slug!}
            categoryId={paymentModal.categoryId}
            candidateName={event.categories?.flatMap((c:any)=>c.candidates||[]).find((c:any)=>c.id===selectedCandidates[paymentModal.categoryId])?.name||""}
            candidateId={selectedCandidates[paymentModal.categoryId]||""}
            quantity={getQuantity(paymentModal.categoryId)}
            pricePerVote={parseFloat(event.price_per_vote)}
            currency={event.currency}
            guestPhone={guestPhone}
            onGuestPhoneChange={setGuestPhone}
            email={(()=>{
              if(isAuthenticated){
                const e=(user as any)?.email||"";
                if(e.endsWith("@phone.evoting.local")||e.endsWith("@ussd.evoting.local")){
                  const phone=(user as any)?.phone||"";
                  const clean=phone.replace(/^\+/,"").replace(/\s/g,"");
                  return clean?clean+"@celervote.com":"voter@celervote.com";
                }
                return e||"voter@celervote.com";
              }
              if(guestPhone){const clean=guestPhone.replace(/^\+/,"").replace(/\s/g,"");return clean?clean+"@celervote.com":"voter@celervote.com";}
              return "";
            })()}
          />
        )}
      </>)}
    </div>
  );
};

export default EventDetailPage;
