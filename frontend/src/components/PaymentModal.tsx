import React, { useState, useEffect, useRef } from "react";
import { getAccessToken } from "../lib/api";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
declare const PaystackPop: any;
import {
  X, Shield, CreditCard, Smartphone, Lock,
  CheckCircle2, Loader2, ChevronRight, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaymentModalProps {
  open:               boolean;
  onClose:            () => void;
  onSuccess:          (reference: string) => void;
  eventTitle:         string;
  eventSlug:          string;
  categoryId:         string;
  candidateName:      string;
  candidateId:        string;
  quantity:           number;
  pricePerVote:       number;
  currency:           string;
  email:              string;
  guestPhone?:        string;
  onGuestPhoneChange?: (phone: string) => void;
}
const TEAL = "#01003c";
const PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "";

export function PaymentModal({
  open, onClose, onSuccess,
  eventTitle, eventSlug, categoryId, candidateId, candidateName, quantity,
  pricePerVote, currency, email, guestPhone = "", onGuestPhoneChange,
}: PaymentModalProps) {
  const [step, setStep]       = useState<"review" | "processing" | "success" | "failed">("review");
  const [errMsg, setErrMsg]   = useState("");
  const [localPhone, setLocalPhone] = useState("");
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const verifiedRef = useRef(false);
  const currentReferenceRef = useRef<string>("");

  const isGuestRef = useRef(!email || email === "voter@celervote.com" || email === "");
  const isGuest = isGuestRef.current;

  const normalizePhone = (raw: string): string => {
    let cleaned = raw.replace(/[\s\-\(\)]/g, "");
    if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
    if (cleaned.startsWith("2330") && cleaned.length === 13) cleaned = "233" + cleaned.slice(4);
    if (cleaned.startsWith("0") && cleaned.length === 10) cleaned = "233" + cleaned.slice(1);
    if (cleaned.startsWith("233") && cleaned.length === 12) return "+" + cleaned;
    if (cleaned.length >= 7 && /^\d+$/.test(cleaned)) return "+" + cleaned;
    return raw;
  };

  const effectivePhone = localPhone || guestPhone;
  const effectiveEmail = isGuest && effectivePhone
    ? effectivePhone.replace(/^\+/, "").replace(/\s/g, "") + "@celervote.com"
    : email;

  useEffect(() => {
    if (open) {
      setStep("review");
      setErrMsg("");
      setLocalPhone("");
      verifiedRef.current = false;
      currentReferenceRef.current = "";
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      isGuestRef.current = !email || email === "voter@celervote.com" || email === "";
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  const totalAmount = pricePerVote * quantity;

  const checkPaymentStatus = async (ref: string): Promise<boolean> => {
    try {
      const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";
      const token = getAccessToken() || "";
      const res = await fetch(`${API}/payments/status/${ref}/`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.votes_cast > 0 || data.status === "success") {
        verifiedRef.current = true;
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setStep("success");
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ["#01003c", "#C9A84C", "#ffffff", "#ffd700"] });
        setTimeout(() => confetti({ particleCount: 50, spread: 90, origin: { y: 0.5, x: 0.2 }, colors: ["#01003c", "#C9A84C"] }), 250);
        setTimeout(() => confetti({ particleCount: 50, spread: 90, origin: { y: 0.5, x: 0.8 }, colors: ["#01003c", "#C9A84C"] }), 500);
        setTimeout(() => { onSuccess(ref); }, 1800);
        return true;
      }
      return false;
    } catch (e) {
      console.error("Status check failed:", e);
      return false;
    }
  };

  const startPolling = (reference: string) => {
    let pollCount = 0;
    const MAX_POLLS = 24; // 24 × 5s = 2 minutes (covers slow MoMo networks)

    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    pollingRef.current = setInterval(async () => {
      if (verifiedRef.current) {
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
        return;
      }
      pollCount++;
      if (pollCount > MAX_POLLS) {
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
        if (!verifiedRef.current) {
          setErrMsg("Payment confirmation is taking longer than expected. Please check your votes or contact support with your reference: " + currentReferenceRef.current);
          setStep("failed");
        }
        return;
      }
      await checkPaymentStatus(reference);
    }, 5000);
  };

  const handlePay = async () => {
    if (isGuest) {
      if (!effectivePhone) {
        setErrMsg("Please enter your phone number to continue.");
        setStep("failed");
        return;
      }
      const normalized = normalizePhone(effectivePhone);
      if (!/^\+[0-9]{9,15}$/.test(normalized)) {
        setErrMsg("Please enter a valid phone number (e.g. 0241234567 or +233241234567).");
        setStep("failed");
        return;
      }
    }
    if (!effectiveEmail || !effectiveEmail.includes("@")) {
      setErrMsg("A valid contact is required to process payment.");
      setStep("failed");
      return;
    }
    setStep("processing");

    try {
      const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";
      const token = getAccessToken() || "";

      const res = await fetch(`${API}/payments/initialize/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          event_slug:   eventSlug,
          votes_count:  quantity,
          email:        effectiveEmail,
          phone:        effectivePhone ? normalizePhone(effectivePhone) : "",
          category_id:  categoryId,
          candidate_id: candidateId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to initialize payment");
      }

      const data = await res.json();
      const reference = data.reference;
      currentReferenceRef.current = reference;
      verifiedRef.current = false;

      // ── Wait for Paystack V2 library to be ready (max 10 seconds) ──────────
      // The script tag in index.html loads it but CDN can be slow on mobile.
      // We wait here (AFTER the backend call succeeded) so the user isn't
      // blocked before we even know if payment init worked.
      const getPaystackConstructor = (): any => {
        // Paystack V2 inline.js exposes either window.Paystack or window.PaystackPop
        if (typeof (window as any).Paystack !== "undefined") return (window as any).Paystack;
        if (typeof (window as any).PaystackPop !== "undefined") return (window as any).PaystackPop;
        return null;
      };

      let PaystackConstructor = getPaystackConstructor();
      if (!PaystackConstructor) {
        // Not loaded yet — poll every 500ms for up to 10 seconds
        await new Promise<void>((resolve, reject) => {
          let waited = 0;
          const interval = setInterval(() => {
            PaystackConstructor = getPaystackConstructor();
            if (PaystackConstructor) { clearInterval(interval); resolve(); return; }
            waited += 500;
            if (waited >= 10000) {
              clearInterval(interval);
              reject(new Error("Payment library failed to load. Please refresh the page and try again."));
            }
          }, 500);
        });
      }

      // ── Open the EXISTING backend transaction via accessCode ──────────────
      // Using key+email+amount creates a NEW transaction with a different
      // reference — webhook fires for EVOTE-xxx but castVote sends T8675309.
      // accessCode opens the transaction the backend already created.
      const paystackInstance = new PaystackConstructor();
      paystackInstance.newTransaction({
        accessCode: data.access_code,

        onSuccess: (transaction: any) => {
          console.log("Paystack onSuccess:", transaction.reference);
          verifiedRef.current = true;
          if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
          setStep("success");
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ["#01003c", "#C9A84C", "#ffffff", "#ffd700"] });
          setTimeout(() => confetti({ particleCount: 50, spread: 90, origin: { y: 0.5, x: 0.2 }, colors: ["#01003c", "#C9A84C"] }), 250);
          setTimeout(() => confetti({ particleCount: 50, spread: 90, origin: { y: 0.5, x: 0.8 }, colors: ["#01003c", "#C9A84C"] }), 500);
          // Use backend reference — transaction.reference is the same when accessCode is used
          setTimeout(() => { onSuccess(reference); }, 1800);
        },

        onCancel: () => {
          console.log("Paystack cancelled");
          if (!verifiedRef.current) {
            if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
            setStep("review");
          }
        },

        onError: (error: any) => {
          console.error("Paystack error:", error);
          if (!verifiedRef.current) {
            if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
            setErrMsg(error.message || "Payment failed to load");
            setStep("failed");
          }
        },
      });

      // Poll /payments/status/ every 5 s as a safety net:
      // If onSuccess fires before castVote() completes (MoMo delay),
      // polling detects votes_cast > 0 and shows success automatically.
      startPolling(reference);

    } catch (err: any) {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      setErrMsg(err.message || "Payment initialization failed.");
      setStep("failed");
    }
  };

  const handleClose = () => {
    if (step === "processing") return;
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    setStep("review");
    setErrMsg("");
    onClose();
  };

  const manualCheckStatus = async () => {
    const ref = currentReferenceRef.current;
    if (!ref) { setErrMsg("No payment reference found."); setStep("failed"); return; }
    setStep("processing");
    try {
      const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";
      const token = getAccessToken() || "";
      const res = await fetch(`${API}/payments/status/${ref}/`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.votes_cast > 0 || data.status === "success") {
        setStep("success");
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ["#01003c", "#C9A84C", "#ffffff", "#ffd700"] });
        setTimeout(() => confetti({ particleCount: 50, spread: 90, origin: { y: 0.5, x: 0.2 }, colors: ["#01003c", "#C9A84C"] }), 250);
        setTimeout(() => confetti({ particleCount: 50, spread: 90, origin: { y: 0.5, x: 0.8 }, colors: ["#01003c", "#C9A84C"] }), 500);
        setTimeout(() => onSuccess(ref), 1800);
        return;
      }
      setErrMsg("Vote not yet confirmed. Please wait a moment and try again, or contact support with ref: " + ref);
      setStep("failed");
    } catch (e) {
      setErrMsg("Could not check status. Please try again.");
      setStep("failed");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={handleClose}
          />

          <motion.div
            className="relative w-full max-w-md z-10"
            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
          >
            {/* Header */}
            <div className="bg-[#0f172a] rounded-t-2xl p-5 border-b border-white/10">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#C9A84C]/20 border border-[#C9A84C]/30 flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-[#C9A84C]" />
                  </div>
                  <div>
                    <p className="text-xs text-[#94a3b8]">CelerVote</p>
                    <p className="text-sm font-bold text-white leading-none">Secure Payment</p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  disabled={step === "processing"}
                  className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors disabled:opacity-50">
                  <X className="w-4 h-4 text-[#94a3b8]" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="bg-[#1e293b] rounded-b-2xl overflow-hidden">
              <AnimatePresence mode="wait">

                {/* ── Review ── */}
                {step === "review" && (
                  <motion.div key="review"
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="p-5 space-y-4">

                    <div className="bg-[#0f172a] rounded-xl p-4 space-y-3">
                      <p className="text-xs text-[#64748b] uppercase tracking-wider font-semibold">Order Summary</p>
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <span className="text-xs text-[#94a3b8]">Event</span>
                          <span className="text-xs font-medium text-white text-right max-w-[60%]">{eventTitle}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-[#94a3b8]">Voting for</span>
                          <span className="text-xs font-semibold text-[#C9A84C]">{candidateName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-[#94a3b8]">Votes</span>
                          <span className="text-xs font-medium text-white">{quantity} × {currency} {pricePerVote.toFixed(2)}</span>
                        </div>
                        <div className="border-t border-white/10 pt-2 flex justify-between">
                          <span className="text-sm font-bold text-white">Total</span>
                          <span className="text-lg font-bold text-[#C9A84C]">{currency} {totalAmount.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-[#64748b] uppercase tracking-wider font-semibold mb-2">Pay With</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { icon: CreditCard, label: "Card" },
                          { icon: Smartphone, label: "Mobile Money" },
                          { icon: CreditCard, label: "Bank Transfer" },
                        ].map(({ icon: Icon, label }) => (
                          <div key={label}
                            className="bg-[#0f172a] rounded-lg p-2.5 flex flex-col items-center gap-1.5 border border-white/5">
                            <Icon className="w-4 h-4 text-[#94a3b8]" />
                            <span className="text-[10px] text-[#94a3b8] text-center leading-tight">{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {isGuest && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-[#64748b] uppercase tracking-wider font-semibold">Your Phone Number</p>
                        <input
                          type="tel"
                          placeholder="0241234567 or +233241234567"
                          value={effectivePhone}
                          onChange={e => { setLocalPhone(e.target.value); }}
                          onBlur={e => { setLocalPhone(normalizePhone(e.target.value)); }}
                          className="w-full h-10 rounded-lg bg-[#0f172a] border border-white/10 text-white text-sm px-3 focus:outline-none focus:border-white/30 placeholder:text-[#475569]"
                        />
                        <p className="text-[10px] text-[#475569]">Used to identify your vote. No account needed.</p>
                      </div>
                    )}

                    <button
                      onClick={handlePay}
                      className="w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                      style={{ background: "linear-gradient(135deg, #01003c, #020057)", color: "white" }}
                    >
                      <Lock className="w-4 h-4" />
                      Pay {currency} {totalAmount.toFixed(2)} Securely
                      <ChevronRight className="w-4 h-4" />
                    </button>

                    <div className="flex items-center justify-center gap-4 pt-1">
                      <div className="flex items-center gap-1">
                        <Shield className="w-3 h-3 text-[#94a3b8]" />
                        <span className="text-[10px] text-[#64748b]">SSL Secured</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Lock className="w-3 h-3 text-[#94a3b8]" />
                        <span className="text-[10px] text-[#64748b]">Powered by Paystack</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── Processing ── */}
                {step === "processing" && (
                  <motion.div key="processing"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-8 flex flex-col items-center justify-center gap-4 min-h-[200px]">
                    <div className="w-16 h-16 rounded-full bg-[#C9A84C]/10 border border-[#C9A84C]/20 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-[#C9A84C] animate-spin" />
                    </div>
                    <div className="text-center space-y-2">
                      <p className="font-semibold text-white">Waiting for payment</p>
                      <p className="text-xs text-[#94a3b8]">
                        📱 <strong>Mobile Money users:</strong> check your phone for a PIN prompt and approve it.
                      </p>
                      <p className="text-xs text-[#64748b]">
                        Mobile Money can take up to 3 minutes. Do not close this window.
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* ── Success ── */}
                {step === "success" && (
                  <motion.div key="success"
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="p-8 flex flex-col items-center justify-center gap-4 min-h-[200px]">
                    <motion.div
                      initial={{ scale: 0 }} animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200, damping: 15 }}
                      className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500/40 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-green-400" />
                    </motion.div>
                    <div className="text-center">
                      <p className="font-bold text-white text-lg">Payment Successful!</p>
                      <p className="text-xs text-[#64748b] mt-1">Casting your votes now...</p>
                    </div>
                    <Loader2 className="w-5 h-5 text-[#C9A84C] animate-spin" />
                  </motion.div>
                )}

                {/* ── Failed ── */}
                {step === "failed" && (
                  <motion.div key="failed"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="p-8 flex flex-col items-center justify-center gap-4 min-h-[200px]">
                    <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                      <AlertCircle className="w-8 h-8 text-red-400" />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-white">Payment Confirmation Delayed</p>
                      <p className="text-xs text-[#64748b] mt-1">{errMsg || "Your payment may have been processed. Please check your vote status."}</p>
                    </div>
                    <div className="flex gap-3">
                      <Button onClick={manualCheckStatus} variant="outline" size="sm">
                        Check Vote Status
                      </Button>
                      <Button onClick={() => { setStep("review"); setErrMsg(""); }} variant="outline" size="sm">
                        Try Again
                      </Button>
                    </div>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
