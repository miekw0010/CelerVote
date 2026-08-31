import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, ArrowLeft, ArrowRight, Loader2, CheckCircle2,
  ImageIcon, X, Calendar, Tag, User, Mic2, Phone, MessageSquare, Users, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";
const NAVY = "#002856";
const ORANGE = "#e87200";

type NominatableEvent = {
  id: string; slug: string; title: string; thumbnail: string | null; banner_image: string | null;
  event_type: string; nominations_open: boolean;
  categories: { id: string; name: string }[];
};

const typeEmoji: Record<string, string> = {
  election: "🗳️", contest: "🏆", survey: "📊", live_show: "📺",
};

const normalizePhone = (raw: string): string => {
  let cleaned = raw.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  if (cleaned.startsWith("2330") && cleaned.length === 13) cleaned = "233" + cleaned.slice(4);
  if (cleaned.startsWith("0") && cleaned.length === 10) cleaned = "233" + cleaned.slice(1);
  if (cleaned.startsWith("233") && cleaned.length === 12) return "+" + cleaned;
  if (cleaned.length >= 7 && /^\d+$/.test(cleaned)) return "+" + cleaned;
  return raw;
};
const isValidPhone = (val: string) => /^\+[0-9]{9,15}$/.test(normalizePhone(val));

async function compressImage(file: File, maxSize = 900, quality = 0.85): Promise<File> {
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

const STEPS = ["event", "category", "full_name", "stage_name", "phone", "photo", "reason", "review"] as const;
type StepKey = typeof STEPS[number];

const STEP_LABELS: Record<StepKey, string> = {
  event: "Event", full_name: "Your Name", stage_name: "Stage Name", phone: "Phone",
  category: "Category", photo: "Photo", reason: "Reason", review: "Review",
};

const NominatePage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [events, setEvents] = useState<NominatableEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [stepIdx, setStepIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [selectedEventId, setSelectedEventId] = useState("");
  const [fullName, setFullName] = useState("");
  const [stageName, setStageName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const currentStepRef = useRef<HTMLDivElement>(null);

  const selectedEvent = events.find(e => e.id === selectedEventId);
  const step = STEPS[stepIdx];

  useEffect(() => {
    fetch(`${API}/events/nominate/options/`)
      .then(r => r.json())
      .then(data => setEvents(Array.isArray(data) ? data : []))
      .catch(() => setEvents([]))
      .finally(() => setLoadingEvents(false));
  }, []);

  useEffect(() => {
    currentStepRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [stepIdx]);

  const canAdvance = (): boolean => {
    switch (step) {
      case "event":      return !!selectedEventId;
      case "full_name":  return fullName.trim().length >= 2;
      case "stage_name": return stageName.trim().length >= 1;
      case "phone":       return isValidPhone(phone);
      case "category":   return !!categoryId;
      case "photo":      return !!photoFile;
      case "reason":     return true; // optional
      default:           return true;
    }
  };

  const next = () => {
    if (step === "phone" && !isValidPhone(phone)) {
      setPhoneError("Enter a valid phone number (e.g. 0241234567 or +233241234567).");
      return;
    }
    setPhoneError("");
    if (stepIdx < STEPS.length - 1) setStepIdx(i => i + 1);
  };
  const back = () => { if (stepIdx > 0) setStepIdx(i => i - 1); };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    compressImage(file).then(c => { setPhotoFile(c); setPreview(URL.createObjectURL(c)); });
  };

  const handleSubmit = async () => {
    if (!selectedEvent) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("category", categoryId);
      fd.append("full_name", fullName.trim());
      fd.append("stage_name", stageName.trim());
      fd.append("phone", normalizePhone(phone.trim()));
      if (reason.trim()) fd.append("reason", reason.trim());
      if (photoFile) fd.append("photo", photoFile);

      const res = await fetch(`${API}/events/${selectedEvent.slug}/nominate/`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not submit nomination.");

      setDone(true);
    } catch (e: any) {
      toast({ title: "Submission failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingEvents) {
    return (
      <div className="min-h-screen bg-background" style={{ fontFamily: "'Montserrat', sans-serif" }}>
        <Navbar />
        <div className="pt-24 pb-20 flex items-center justify-center min-h-screen">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!loadingEvents && events.length === 0) {
    return (
      <div className="min-h-screen bg-background" style={{ fontFamily: "'Montserrat', sans-serif" }}>
        <Navbar />
        <div className="pt-24 pb-20 flex flex-col items-center justify-center min-h-screen text-center px-4">
          <Sparkles className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-lg font-semibold">No events are open for nomination right now.</p>
          <p className="text-sm text-muted-foreground mt-1">Please check back soon.</p>
          <Button className="mt-6" variant="outline" onClick={() => navigate("/events")}>Browse Events</Button>
        </div>
        <Footer />
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background" style={{ fontFamily: "'Montserrat', sans-serif" }}>
        <Navbar />
        <div className="pt-24 pb-20 flex items-center justify-center min-h-screen px-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-8 max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: `${ORANGE}15` }}>
              <CheckCircle2 className="w-8 h-8" style={{ color: ORANGE }} />
            </div>
            <h2 className="text-xl font-display font-bold mb-2">Nomination submitted!</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Your nomination for <strong>{selectedEvent?.title}</strong> is now pending review.
              You'll receive an SMS once it's approved and you're live as a contestant.
            </p>
            <Button className="w-full cta-button" onClick={() => navigate("/events")}>Back to Events</Button>
          </motion.div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <Navbar />
      <div className="pt-24 pb-20 flex items-center justify-center min-h-screen px-4">
        <motion.div className={`w-full ${step === "event" ? "max-w-4xl" : "max-w-lg"}`} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>

          {/* Modern step progress */}
          <div className="mb-8">
            <div className="h-1 rounded-full bg-muted overflow-hidden mb-5">
              <motion.div className="h-full rounded-full" style={{ background: ORANGE }}
                initial={false}
                animate={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
            <style>{`.nominate-steps::-webkit-scrollbar { display: none; }`}</style>
            <div className="relative">
              <div className="nominate-steps flex items-start overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {STEPS.map((s, i) => {
                const isDone = i < stepIdx;
                const isCurrent = i === stepIdx;
                return (
                  <div key={s} className="flex items-center flex-shrink-0" ref={isCurrent ? currentStepRef : undefined}>
                    <div className="flex flex-col items-center" style={{ minWidth: 62 }}>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 flex-shrink-0"
                        style={{
                          background: isDone ? ORANGE : isCurrent ? "white" : "#f1f1f1",
                          border: isCurrent ? `2px solid ${ORANGE}` : "2px solid transparent",
                          color: isDone ? "white" : isCurrent ? ORANGE : "#9ca3af",
                          boxShadow: isCurrent ? `0 0 0 4px ${ORANGE}1a` : "none",
                        }}>
                        {isDone ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : i + 1}
                      </div>
                      <span className="text-[10px] mt-1.5 font-medium text-center leading-tight whitespace-nowrap"
                        style={{ color: isCurrent ? ORANGE : isDone ? "#374151" : "#9ca3af" }}>
                        {STEP_LABELS[s]}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="h-0.5 rounded-full transition-colors duration-300 mb-4" style={{ width: 20, background: isDone ? ORANGE : "#e5e7eb" }} />
                    )}
                  </div>
                );
              })}
              </div>
              <div className="pointer-events-none absolute top-0 left-0 h-full w-6" style={{ background: "linear-gradient(90deg, white, transparent)" }} />
              <div className="pointer-events-none absolute top-0 right-0 h-full w-6" style={{ background: "linear-gradient(270deg, white, transparent)" }} />
            </div>
          </div>

          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg" style={{ background: NAVY }}>
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <p className="text-lg font-semibold text-foreground">Nominate Yourself</p>
          </div>

          <div className="glass-card p-6 shadow-xl">
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="space-y-4">

                {step === "event" && (
                  <div>
                    <label className="text-sm font-medium mb-2 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Which event are you nominating yourself for?</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[65vh] overflow-y-auto pr-1">
                      {events.map(ev => {
                        const isSelected = selectedEventId === ev.id;
                        const image = ev.banner_image || ev.thumbnail;
                        return (
                          <button key={ev.id}
                            onClick={() => {
                              if (!ev.nominations_open) {
                                toast({ title: "Nominations are currently closed", description: `${ev.title} is not accepting nominations right now.`, variant: "destructive" });
                                return;
                              }
                              setSelectedEventId(ev.id); setCategoryId("");
                            }}
                            className={`relative rounded-xl border-2 overflow-hidden text-left transition-all ${!ev.nominations_open ? "opacity-60" : "hover:shadow-lg hover:-translate-y-0.5"}`}
                            style={{
                              borderColor: isSelected ? ORANGE : "var(--border)",
                              boxShadow: isSelected ? `0 0 0 3px ${ORANGE}33, 0 8px 20px ${ORANGE}26` : "none",
                            }}>
                            {isSelected && (
                              <div className="absolute top-3 right-3 z-20 w-6 h-6 rounded-full flex items-center justify-center shadow-md border-2 border-white" style={{ background: ORANGE }}>
                                <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                              </div>
                            )}
                            <div className="relative h-32 overflow-hidden bg-muted">
                              {image ? (
                                <img src={image} alt={ev.title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${NAVY}15, ${ORANGE}15)` }}>
                                  <span className="text-4xl opacity-30">{typeEmoji[ev.event_type] || "🏆"}</span>
                                </div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent" />
                              {isSelected && <div className="absolute inset-0" style={{ background: `${ORANGE}22` }} />}
                              <div className="absolute top-2 left-2">
                                {ev.nominations_open
                                  ? <span className="text-[10px] font-bold text-white bg-green-600/90 backdrop-blur-sm px-2 py-0.5 rounded-full">OPEN</span>
                                  : <span className="text-[10px] font-bold text-white bg-destructive/90 backdrop-blur-sm px-2 py-0.5 rounded-full">CLOSED</span>}
                              </div>
                              <div className="absolute bottom-2 left-3 right-3">
                                <p className="text-sm font-bold text-white truncate">{ev.title}</p>
                              </div>
                            </div>
                            <div className="px-3 py-2 flex flex-col gap-1" style={{ background: isSelected ? `${ORANGE}12` : "white" }}>
                              <span className="text-xs text-muted-foreground font-medium capitalize flex items-center gap-1">
                                {typeEmoji[ev.event_type] || "🏆"} {ev.event_type?.replace("_", " ")}
                              </span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Users className="w-3 h-3" /> {ev.categories.length} categories
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {step === "full_name" && (
                  <div>
                    <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Your Full Name</label>
                    <p className="text-xs text-muted-foreground mb-2">Your legal name - kept private, not shown publicly.</p>
                    <Input placeholder="e.g. Kwame Asante Mensah" value={fullName} onChange={e => setFullName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && canAdvance() && next()} className="h-12" autoFocus />
                  </div>
                )}

                {step === "stage_name" && (
                  <div>
                    <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5"><Mic2 className="w-3.5 h-3.5" /> Your Stage Name</label>
                    <p className="text-xs text-muted-foreground mb-2">This is what voters will see on the ballot.</p>
                    <Input placeholder="e.g. K Money" value={stageName} onChange={e => setStageName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && canAdvance() && next()} className="h-12" autoFocus />
                  </div>
                )}

                {step === "phone" && (
                  <div>
                    <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone Number</label>
                    <p className="text-xs text-muted-foreground mb-2">We'll text you your contestant code once approved.</p>
                    <Input type="tel" placeholder="0241234567" value={phone}
                      onChange={e => { setPhone(e.target.value); setPhoneError(""); }}
                      onKeyDown={e => e.key === "Enter" && next()}
                      className={`h-12 ${phoneError ? "border-destructive focus-visible:ring-destructive" : ""}`} autoFocus />
                    {phoneError && <p className="text-xs text-destructive mt-1.5">{phoneError}</p>}
                  </div>
                )}

                {step === "category" && (
                  <div>
                    <label className="text-sm font-medium mb-2 flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> Which category?</label>
                    {(selectedEvent?.categories.length || 0) === 0
                      ? <p className="text-sm text-muted-foreground">This event has no open categories yet.</p>
                      : <div className="flex flex-wrap gap-2">
                          {selectedEvent!.categories.map(cat => (
                            <button key={cat.id} onClick={() => setCategoryId(cat.id)}
                              className="px-3 py-2 rounded-lg text-sm font-medium border transition-all"
                              style={{ borderColor: categoryId === cat.id ? ORANGE : "var(--border)", background: categoryId === cat.id ? `${ORANGE}15` : "transparent", color: categoryId === cat.id ? ORANGE : undefined }}>
                              {cat.name}
                            </button>
                          ))}
                        </div>
                    }
                  </div>
                )}

                {step === "photo" && (
                  <div>
                    <label className="text-sm font-medium mb-2 flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" /> Upload Your Photo</label>
                    <div onClick={() => fileRef.current?.click()}
                      className="relative w-56 mx-auto rounded-lg border-2 border-dashed border-border hover:border-secondary cursor-pointer overflow-hidden bg-muted/30">
                      <div className="w-full" style={{ paddingBottom: "80%" }} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        {preview
                          ? <><img src={preview} className="absolute inset-0 w-full h-full object-contain" />
                              <button onClick={e => { e.stopPropagation(); setPreview(null); setPhotoFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                                className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white"><X className="w-3 h-3" /></button></>
                          : <div className="text-center px-3"><ImageIcon className="w-8 h-8 mx-auto mb-1 text-muted-foreground opacity-50" /><p className="text-xs text-muted-foreground">Click to upload</p></div>}
                      </div>
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                    <p className="text-xs text-muted-foreground text-center mt-3 leading-relaxed">
                      Please upload a nice, clear photo of yourself. This will be your official picture on the site, seen by everyone who votes for you.
                    </p>
                  </div>
                )}

                {step === "reason" && (
                  <div>
                    <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Reason for Nomination <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <Textarea placeholder="Tell us why you'd make a great contestant..." value={reason} onChange={e => setReason(e.target.value)} rows={4} />
                  </div>
                )}

                {step === "review" && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium mb-1">Review your nomination</p>
                    {[
                      ["Event", selectedEvent?.title],
                      ["Full Name", fullName],
                      ["Stage Name", stageName],
                      ["Phone", normalizePhone(phone)],
                      ["Category", selectedEvent?.categories.find(c => c.id === categoryId)?.name],
                      ["Reason", reason || "-"],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-start justify-between gap-3 text-sm py-1.5 border-b border-border/50 last:border-0">
                        <span className="text-muted-foreground flex-shrink-0">{label}</span>
                        <span className="font-medium text-right">{value}</span>
                      </div>
                    ))}
                    {preview && (
                      <div className="flex justify-center pt-2">
                        <img src={preview} className="w-20 h-20 rounded-xl object-cover ring-2 ring-border/30" />
                      </div>
                    )}
                  </div>
                )}

              </motion.div>
            </AnimatePresence>

            <div className="flex gap-2 mt-6">
              {stepIdx > 0 && (
                <Button variant="outline" className="gap-1" onClick={back} disabled={submitting}>
                  <ArrowLeft className="w-4 h-4" /> Back
                </Button>
              )}
              {step !== "review" ? (
                <Button className="flex-1 gap-1 cta-button" onClick={next} disabled={!canAdvance()}>
                  Next <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button className="flex-1 cta-button" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Nomination"}
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
      <Footer />
    </div>
  );
};

export default NominatePage;
