import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Phone, Loader2, ArrowLeft, KeyRound, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { officialsApi } from "@/lib/api";

export default function OfficialLoginPage() {
  const navigate        = useNavigate();
  const { toast }       = useToast();

  const [step, setStep]           = useState<"phone" | "otp">("phone");
  const [phone, setPhone]         = useState("");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [devOtp, setDevOtp]       = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);
  const [resending, setResending]     = useState(false);
  const otpRefs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null));

  // Countdown timer
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  const startResendTimer = () => setResendTimer(60);

  const handleRequestOtp = async () => {
    if (!phone.trim()) { setError("Please enter your phone number."); return; }
    setLoading(true); setError("");
    try {
      const res = await officialsApi.requestOtp(phone.trim());
      if (res?.debug_code) setDevOtp(res.debug_code);
      // Use the normalized phone returned by server so verify matches stored format
      if (res?.phone) setPhone(res.phone);
      setStep("otp");
      startResendTimer();
      toast({ title: "OTP sent", description: "Check your phone for the 6-digit code." });
    } catch (e: any) {
      setError(e?.message || "Phone number not registered as an official.");
    } finally { setLoading(false); }
  };

  const handleResendOtp = async () => {
    setResending(true); setError("");
    try {
      const res = await officialsApi.requestOtp(phone.trim());
      if (res?.debug_code) setDevOtp(res.debug_code);
      if (res?.phone) setPhone(res.phone);
      setOtpDigits(["", "", "", "", "", ""]);
      startResendTimer();
      setTimeout(() => otpRefs[0].current?.focus(), 50);
      toast({ title: "New OTP sent ✅", description: "Check your phone for a fresh code." });
    } catch (e: any) {
      setError(e?.message || "Failed to resend OTP.");
    } finally { setResending(false); }
  };

  const handleVerifyOtp = async () => {
    const code = otpDigits.join("");
    if (code.length < 6) return; // silently ignore incomplete — user is still typing
    setLoading(true); setError("");
    try {
      const data = await officialsApi.verifyOtp(phone.trim(), code);
      localStorage.setItem("official_access_token",  data.tokens.access);
      localStorage.setItem("official_refresh_token", data.tokens.refresh);
      localStorage.setItem("official_profile",       JSON.stringify(data.official));
      localStorage.setItem("access_token",  data.tokens.access);
      localStorage.setItem("refresh_token", data.tokens.refresh);
      toast({ title: `Welcome, ${data.official.name}! ✅` });
      navigate("/official/dashboard");
    } catch (e: any) {
      setError(e?.message || "Invalid code. Please try again.");
      setOtpDigits(["", "", "", "", "", ""]);
      setTimeout(() => otpRefs[0].current?.focus(), 50);
    } finally { setLoading(false); }
  };

  const handleOtpChange = (idx: number, val: string) => {
    const ch = val.replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[idx] = ch;
    setOtpDigits(next);
    setError("");
    if (ch && idx < 5) setTimeout(() => otpRefs[idx + 1].current?.focus(), 0);
    if (idx === 5 && ch) setTimeout(() => handleVerifyOtp(), 100);
  };

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...otpDigits];
      if (next[idx]) { next[idx] = ""; setOtpDigits(next); }
      else if (idx > 0) { next[idx - 1] = ""; setOtpDigits(next); otpRefs[idx - 1].current?.focus(); }
    }
    if (e.key === "ArrowLeft"  && idx > 0) otpRefs[idx - 1].current?.focus();
    if (e.key === "ArrowRight" && idx < 5) otpRefs[idx + 1].current?.focus();
    if (e.key === "Enter" && otpDigits.join("").length === 6) handleVerifyOtp();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4"
      style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <div className="w-full max-w-md">

        {/* Header */}
        <motion.div className="text-center mb-10" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center shadow-lg"
            style={{ background: "linear-gradient(135deg, #01003c, #020057)" }}>
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-display font-black mb-1">Official Portal</h1>
          <p className="text-sm text-muted-foreground">CelerVote · Authorised officials only</p>
        </motion.div>

        {/* Card */}
        <motion.div className="bg-card border border-border/40 rounded-3xl shadow-xl overflow-hidden"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="h-1.5 w-full" style={{ background: "linear-gradient(90deg, #01003c, #6366f1, #C9A84C)" }} />
          <div className="p-8">

            <AnimatePresence mode="wait">

              {/* Step 1 — Phone */}
              {step === "phone" && (
                <motion.div key="phone" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-9 h-9 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center">
                      <Phone className="w-4 h-4 text-secondary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Enter your phone number</p>
                      <p className="text-xs text-muted-foreground">We'll send a one-time code to verify you</p>
                    </div>
                  </div>

                  <Input
                    type="tel"
                    placeholder="+233 XX XXX XXXX"
                    value={phone}
                    onChange={e => { setPhone(e.target.value); setError(""); }}
                    onKeyDown={e => e.key === "Enter" && handleRequestOtp()}
                    className="h-12 text-base mb-4"
                    autoFocus
                  />

                  {error && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="text-xs text-destructive mb-4 flex items-center gap-1.5">
                      <span>⚠️</span> {error}
                    </motion.p>
                  )}

                  <button onClick={handleRequestOtp} disabled={loading || !phone.trim()}
                    className="w-full h-12 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98]"
                    style={{ background: "linear-gradient(135deg, #01003c, #020057)" }}>
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : <><Shield className="w-4 h-4" /> Send OTP</>}
                  </button>
                </motion.div>
              )}

              {/* Step 2 — OTP */}
              {step === "otp" && (
                <motion.div key="otp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-9 h-9 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center">
                      <KeyRound className="w-4 h-4 text-secondary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Enter your 6-digit code</p>
                      <p className="text-xs text-muted-foreground">Sent to <span className="font-medium text-foreground">{phone}</span></p>
                    </div>
                  </div>

                  {/* Dev-mode OTP banner */}
                  {devOtp && (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-5">
                      <span className="text-amber-500 text-base">🔑</span>
                      <div>
                        <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Dev mode — OTP</p>
                        <p className="text-lg font-mono font-black tracking-widest text-amber-600">{devOtp}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-center gap-2 mb-5">
                    {otpDigits.map((d, i) => (
                      <input key={i} ref={otpRefs[i]}
                        type="text" inputMode="numeric" maxLength={1}
                        value={d} autoFocus={i === 0}
                        onChange={e => handleOtpChange(i, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(i, e)}
                        onFocus={e => e.target.select()}
                        onPaste={e => {
                          e.preventDefault();
                          const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6).split("");
                          const next = [...otpDigits];
                          pasted.forEach((ch, pi) => { if (pi < 6) next[pi] = ch; });
                          setOtpDigits(next);
                          if (pasted.length === 6) setTimeout(() => handleVerifyOtp(), 100);
                        }}
                        className={`w-11 h-14 rounded-xl text-center font-mono font-black text-2xl transition-all duration-150 focus:outline-none border-2 bg-muted/30 ${
                          d ? "border-secondary bg-secondary/10 text-foreground" : "border-border text-muted-foreground focus:border-secondary/70"
                        } ${error ? "border-destructive/50" : ""}`}
                      />
                    ))}
                  </div>

                  {error && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 mb-4">
                      <span className="text-destructive">⚠️</span>
                      <p className="text-xs text-destructive font-medium">{error}</p>
                    </motion.div>
                  )}

                  <button onClick={handleVerifyOtp} disabled={loading || otpDigits.join("").length < 6}
                    className="w-full h-12 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 active:scale-[0.98] mb-3"
                    style={{ background: "linear-gradient(135deg, #01003c, #020057)" }}>
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</> : <><CheckCircle2 className="w-4 h-4" /> Verify & Login</>}
                  </button>

                  {/* Resend row */}
                  <div className="flex items-center justify-center gap-3 mb-2">
                    {resendTimer > 0 ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <RefreshCw className="w-3 h-3" /> Resend in {resendTimer}s
                      </p>
                    ) : (
                      <button onClick={handleResendOtp} disabled={resending}
                        className="text-xs text-secondary hover:underline flex items-center gap-1.5 disabled:opacity-50">
                        {resending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Resend OTP
                      </button>
                    )}
                  </div>

                  <button onClick={() => { setStep("phone"); setOtpDigits(["","","","","",""]); setError(""); setDevOtp(null); setResendTimer(0); }}
                    className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1 py-1">
                    <ArrowLeft className="w-3 h-3" /> Change phone number
                  </button>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </motion.div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Not an official? <a href="/" className="text-secondary hover:underline">Go to CelerVote home</a>
        </p>
      </div>
    </div>
  );
}
