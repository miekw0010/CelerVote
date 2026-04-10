import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Phone, ArrowRight, Vote, Shield, Loader2, User, RefreshCw, ChevronRight, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Navbar } from "@/components/Navbar";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";

type Step = "contact" | "returning" | "name" | "otp";

// ── Validation helpers ────────────────────────────────────────────────────────
const isValidEmail = (val: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val.trim());

const normalizePhone = (raw: string): string => {
  let cleaned = raw.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  // Fix: +233 followed by local 0XXXXXXXXX e.g. +2330241234567 -> 233241234567
  if (cleaned.startsWith("2330") && cleaned.length === 13) cleaned = "233" + cleaned.slice(4);
  // Local Ghanaian 0XXXXXXXXX -> 233XXXXXXXXX
  if (cleaned.startsWith("0") && cleaned.length === 10) cleaned = "233" + cleaned.slice(1);
  if (cleaned.startsWith("233") && cleaned.length === 12) return "+" + cleaned;
  if (cleaned.length >= 7 && /^\d+$/.test(cleaned)) return "+" + cleaned;
  return raw;
};

const isValidPhone = (val: string) => {
  const normalized = normalizePhone(val);
  return /^\+[0-9]{9,15}$/.test(normalized);
};

const validateContact = (method: "email" | "sms", value: string): string | null => {
  if (!value.trim()) return `Please enter your ${method === "email" ? "email address" : "phone number"}.`;
  if (method === "email" && !isValidEmail(value)) return "Please enter a valid email address (e.g. you@example.com).";
  if (method === "sms" && !isValidPhone(value)) return "Please enter a valid phone number (e.g. 0241234567 or +233241234567).";
  return null;
};

const AuthPage = () => {
  const [method, setMethod]             = useState<"email" | "sms">("sms");
  const [step, setStep]                 = useState<Step>("contact");
  const [contact, setContact]           = useState("");
  const [name, setName]                 = useState("");
  const [code, setCode]                 = useState("");
  const [loading, setLoading]           = useState(false);
  const [resendTimer, setResendTimer]   = useState(0);
  const [existingName, setExistingName] = useState("");
  const [contactError, setContactError] = useState("");
  const [nameError, setNameError]       = useState("");

  const { requestOTP, verifyOTP } = useAuth();
  const { toast }                 = useToast();
  const navigate                  = useNavigate();

  const startResendTimer = () => {
    setResendTimer(60);
    const interval = setInterval(() => {
      setResendTimer(t => {
        if (t <= 1) { clearInterval(interval); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  // ── Step 1: Check if user exists ──────────────────────────────────────────
  const handleCheckUser = async () => {
    const error = validateContact(method, contact);
    if (error) { setContactError(error); return; }
    setContactError("");
    try {
      setLoading(true);
      const body = method === "email"
        ? { email: contact.trim() }
        : { phone: normalizePhone(contact.trim()) };
      const res  = await fetch(`${API}/auth/check-user/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.exists) {
        setExistingName(data.name || "");
        setStep("returning");
      } else {
        setStep("name");
      }
    } catch (err: any) {
      toast({ title: "Something went wrong", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Send OTP ──────────────────────────────────────────────────────
  const sendOTP = async () => {
    if (step === "name") {
      if (!name.trim()) { setNameError("Please enter your full name."); return; }
      if (name.trim().length < 2) { setNameError("Name must be at least 2 characters."); return; }
      if (!/^[a-zA-Z\s\-']+$/.test(name.trim())) { setNameError("Name should only contain letters, spaces, or hyphens."); return; }
      setNameError("");
    }
    try {
      setLoading(true);
      await requestOTP(method, method === 'sms' ? normalizePhone(contact.trim()) : contact.trim());
      toast({ title: "Code sent! 📧", description: `Check your ${method === "email" ? "inbox" : "messages"}.` });
      setStep("otp");
      startResendTimer();
    } catch (err: any) {
      toast({ title: "Failed to send code", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Verify OTP ────────────────────────────────────────────────────
  const handleVerifyOTP = async () => {
    if (code.length !== 6) {
      toast({ title: "Please enter the 6-digit code.", variant: "destructive" });
      return;
    }
    try {
      setLoading(true);
      await verifyOTP(method, method === 'sms' ? normalizePhone(contact.trim()) : contact.trim(), code, name.trim() || undefined);
      toast({ title: "Welcome! 🎉", description: "You are now signed in." });
      navigate("/");
    } catch (err: any) {
      toast({ title: "Invalid code", description: err.message, variant: "destructive" });
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  // ── Resend ────────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendTimer > 0) return;
    try {
      setLoading(true);
      setCode("");
      await requestOTP(method, method === 'sms' ? normalizePhone(contact.trim()) : contact.trim());
      toast({ title: "New code sent!" });
      startResendTimer();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const stepConfig = {
    contact:   { title: "Sign In to Vote",                                           subtitle: "Enter your phone number or email to continue." },
    returning: { title: "Welcome Back! 👋",                                          subtitle: `Good to see you again, ${existingName || "voter"}` },
    name:      { title: "One Last Thing",                                            subtitle: "Tell us your name to get started." },
    otp:       { title: `Check Your ${method === "email" ? "Inbox" : "Messages"}`,  subtitle: `We sent a 6-digit code to ${contact}` },
  };

  const stepIndex: Record<Step, number> = { contact: 0, returning: 1, name: 1, otp: 2 };

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <Navbar />

      <div className="pt-24 pb-20 flex items-center justify-center min-h-screen relative z-10">
        <motion.div
          className="w-full max-w-md mx-4"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* ── Step indicators ── */}
          <div className="flex items-center justify-center gap-2 mb-8">
            {["Contact", "Details", "Verify"].map((label, i) => {
              const current = stepIndex[step];
              const done    = i < current;
              const active  = i === current;
              return (
                <div key={label} className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300" style={{ background: (done || active) ? "#002856" : "#e5e7eb", color: (done || active) ? "white" : "#999", transform: active ? "scale(1.1)" : "scale(1)" }}>
                      {done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                    </div>
                    <span className="text-[10px] font-medium transition-colors" style={{ color: active ? "#e87200" : "#999" }}>
                      {label}
                    </span>
                  </div>
                  {i < 2 && (
                    <div className="w-12 h-0.5 rounded-full mb-4 transition-all duration-500" style={{ background: i < current ? "#002856" : "#e5e7eb" }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Header ── */}
          <motion.div
            className="text-center mb-6"
            key={step + "-header"}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg" style={{ background: "#002856" }}>
              <Vote className="w-7 h-7 text-white" />
            </div>
            {step === "contact" && (
              <>
                <p className="text-lg font-semibold text-foreground">Confirm your identity to continue.</p>
                <p className="text-sm text-muted-foreground mt-1">Enter your phone number or email below.</p>
              </>
            )}
            {step !== "contact" && (
              <p className="text-lg font-semibold text-foreground">{stepConfig[step].subtitle}</p>
            )}
          </motion.div>

          {/* ── Card ── */}
          <div className="glass-card p-6 shadow-xl">
            <AnimatePresence mode="wait">

              {/* ── Step 1: Contact ── */}
              {step === "contact" && (
                <motion.div key="contact"
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <div className="flex rounded-xl bg-muted p-1">
                    {(["sms", "email"] as const).map((m) => (
                      <button key={m}
                        onClick={() => { setMethod(m); setContact(""); setContactError(""); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                          method === m ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {m === "email" ? <Mail className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                        {m === "email" ? "Email" : "Phone (SMS)"}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      {method === "email" ? "Email Address" : "Phone Number"}
                    </label>
                    <div className="relative">
                      {method === "email"
                        ? <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        : <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      }
                      <Input
                        type={method === "email" ? "email" : "tel"}
                        placeholder={method === "email" ? "you@example.com" : "+233241234567"}
                        value={contact}
                        onChange={e => { setContact(e.target.value); setContactError(""); }}
                        onKeyDown={e => e.key === "Enter" && handleCheckUser()}
                        className={`pl-10 h-12 ${contactError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        autoFocus
                      />
                    </div>
                    {contactError ? (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-1.5 text-xs text-destructive mt-1.5"
                      >
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {contactError}
                      </motion.p>
                    ) : method === "sms" && (
                      <p className="text-xs text-muted-foreground mt-1.5 pl-1">Include country code e.g. +233241234567</p>
                    )}
                  </div>

                  <Button
                    className="w-full gap-2 h-12 font-bold text-white rounded-xl" style={{ background: '#002856', fontFamily: "'Montserrat', sans-serif", letterSpacing: '0.03em', border: 'none' }}
                    onClick={handleCheckUser} disabled={loading || !contact.trim()}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <> Continue <ChevronRight className="w-4 h-4" /></>}
                  </Button>
                </motion.div>
              )}

              {/* ── Step 1b: Returning User ── */}
              {step === "returning" && (
                <motion.div key="returning"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}
                  className="space-y-5"
                >
                  <div className="flex flex-col items-center py-4">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4 shadow-lg" style={{ background: '#002856' }}>
                      <span className="text-3xl font-bold text-white">
                        {existingName ? existingName[0].toUpperCase() : "?"}
                      </span>
                    </div>
                    <h3 className="font-display font-bold text-xl">{existingName || "Welcome back!"}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{contact}</p>
                  </div>

                  <div className="flex items-center gap-3 p-4 rounded-xl" style={{ background: 'rgba(0,40,86,0.06)', border: '1px solid rgba(0,40,86,0.15)' }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#002856' }}>
                      <CheckCircle2 className="w-5 h-5" style={{ color: "#002856" }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Account Found</p>
                      <p className="text-xs text-muted-foreground">We'll send a verification code to sign you in</p>
                    </div>
                  </div>

                  <Button
                    className="w-full gap-2 h-12 font-bold text-white rounded-xl" style={{ background: '#002856', fontFamily: "'Montserrat', sans-serif", letterSpacing: '0.03em', border: 'none' }}
                    onClick={sendOTP} disabled={loading}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <> Send Verification Code <ArrowRight className="w-4 h-4" /></>}
                  </Button>

                  <button onClick={() => setStep("contact")}
                    className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors text-center">
                    ← Use a different email or phone
                  </button>
                </motion.div>
              )}

              {/* ── Step 2: Name ── */}
              {step === "name" && (
                <motion.div key="name"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 border border-border">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#002856' }}>
                      {method === "email" ? <Mail className="w-4 h-4 text-white" /> : <Phone className="w-4 h-4 text-white" />}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Signing in as</p>
                      <p className="text-sm font-semibold text-foreground">{contact}</p>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Your Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="e.g. John Mensah"
                        value={name}
                        onChange={e => { setName(e.target.value); setNameError(""); }}
                        onKeyDown={e => e.key === "Enter" && name.trim() && sendOTP()}
                        className={`pl-10 h-12 ${nameError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        autoFocus
                      />
                    </div>
                    {nameError ? (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-1.5 text-xs text-destructive mt-1.5"
                      >
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {nameError}
                      </motion.p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1.5 pl-1">This is how you'll appear on the platform.</p>
                    )}
                  </div>

                  <Button
                    className="w-full gap-2 h-12 font-bold text-white rounded-xl" style={{ background: '#002856', fontFamily: "'Montserrat', sans-serif", letterSpacing: '0.03em', border: 'none' }}
                    onClick={sendOTP} disabled={loading || !name.trim()}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <> Send Verification Code <ArrowRight className="w-4 h-4" /></>}
                  </Button>

                  <button onClick={() => setStep("contact")}
                    className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors text-center">
                    ← Use a different email or phone
                  </button>
                </motion.div>
              )}

              {/* ── Step 3: OTP ── */}
              {step === "otp" && (
                <motion.div key="otp"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}
                  className="space-y-6"
                >
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 border border-border">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#002856' }}>
                      {method === "email" ? <Mail className="w-4 h-4 text-white" /> : <Phone className="w-4 h-4 text-white" />}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Code sent to</p>
                      <p className="text-sm font-semibold text-foreground">{contact}</p>
                    </div>
                  </div>

                  <div className="text-center space-y-4">
                    <p className="text-sm text-muted-foreground">Enter the 6-digit verification code</p>
                    <div className="flex justify-center">
                      <InputOTP maxLength={6} value={code} onChange={val => setCode(val)} onComplete={handleVerifyOTP}>
                        <InputOTPGroup>
                          {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    <p className="text-xs text-muted-foreground">Code expires in 10 minutes</p>
                  </div>

                  <Button
                    className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90 h-12 font-semibold"
                    onClick={handleVerifyOTP} disabled={loading || code.length !== 6}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify & Sign In"}
                  </Button>

                  <div className="flex items-center justify-between text-sm">
                    <button onClick={() => { setStep("contact"); setCode(""); }}
                      className="text-muted-foreground hover:text-foreground transition-colors">
                      ← Change {method === "email" ? "email" : "number"}
                    </button>
                    <button onClick={handleResend} disabled={loading || resendTimer > 0}
                      className={`flex items-center gap-1.5 transition-colors ${
                        resendTimer > 0 ? "text-muted-foreground cursor-not-allowed" : "text-secondary hover:text-secondary/80"
                      }`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend code"}
                    </button>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>

          <p className="text-xs text-muted-foreground text-center mt-5 flex items-center justify-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-secondary" />
            Secured with end-to-end encryption · Powered by CelerVote
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default AuthPage;
