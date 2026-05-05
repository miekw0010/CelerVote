import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Shield, FileText, Lock, Mail, Phone, MessageSquare, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <div className="pt-24 pb-20">
      <div className="container mx-auto px-4 max-w-3xl">
        {children}
      </div>
    </div>
    <Footer />
  </div>
);

const SectionTitle = ({ icon: Icon, title, subtitle }: { icon: any, title: string, subtitle: string }) => (
  <div className="mb-10">
    <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center mb-4">
      <Icon className="w-6 h-6 text-secondary" />
    </div>
    <h1 className="text-3xl font-display font-bold mb-2">{title}</h1>
    <p className="text-muted-foreground">{subtitle}</p>
    <div className="mt-4 text-xs text-muted-foreground">Last updated: March 2026</div>
  </div>
);

// ── Privacy Policy ────────────────────────────────────────────────
export const PrivacyPage = () => (
  <PageWrapper>
    <SectionTitle icon={Lock} title="Privacy Policy" subtitle="How we collect, use, and protect your data." />
    <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">

      <div className="glass-card p-6">
        <h2 className="font-display font-semibold text-foreground text-base mb-3">1. Information We Collect</h2>
        <p className="mb-3">When you use CelerVote, we collect the following information:</p>
        <ul className="space-y-2 list-disc list-inside">
          <li><strong className="text-foreground">Contact information</strong> — your email address or phone number used for OTP authentication.</li>
          <li><strong className="text-foreground">Voting activity</strong> — which events you participated in and when (not which candidate you voted for).</li>
          <li><strong className="text-foreground">Device information</strong> — IP address and browser/device type for fraud detection.</li>
          <li><strong className="text-foreground">Payment information</strong> — transaction references for paid votes (we do not store card numbers).</li>
        </ul>
      </div>

      <div className="glass-card p-6">
        <h2 className="font-display font-semibold text-foreground text-base mb-3">2. How We Use Your Information</h2>
        <ul className="space-y-2 list-disc list-inside">
          <li>To verify your identity via OTP before voting.</li>
          <li>To prevent duplicate or fraudulent votes.</li>
          <li>To send you notifications about events you participated in.</li>
          <li>To improve our platform and detect abuse.</li>
        </ul>
      </div>

      <div className="glass-card p-6">
        <h2 className="font-display font-semibold text-foreground text-base mb-3">3. Vote Secrecy</h2>
        <p>Your individual vote choices are <strong className="text-foreground">encrypted end-to-end</strong> and are never linked to your identity in our public-facing systems. Event organizers can only see aggregate results, not who voted for whom.</p>
      </div>

      <div className="glass-card p-6">
        <h2 className="font-display font-semibold text-foreground text-base mb-3">4. Data Sharing</h2>
        <p className="mb-3">We do not sell your personal data. We only share data with:</p>
        <ul className="space-y-2 list-disc list-inside">
          <li><strong className="text-foreground">Payment processors</strong> (Paystack) — for processing paid votes.</li>
          <li><strong className="text-foreground">SMS providers</strong> (Africa's Talking) — for sending OTP codes.</li>
          <li><strong className="text-foreground">Cloud storage</strong> (Cloudinary) — for storing candidate and event images.</li>
        </ul>
      </div>

      <div className="glass-card p-6">
        <h2 className="font-display font-semibold text-foreground text-base mb-3">5. Data Retention</h2>
        <p>We retain your account data for as long as your account is active. Voting records are retained for audit purposes for up to 2 years after an event ends. You may request deletion of your account by contacting us.</p>
      </div>

      <div className="glass-card p-6">
        <h2 className="font-display font-semibold text-foreground text-base mb-3">6. Your Rights</h2>
        <ul className="space-y-2 list-disc list-inside">
          <li>Request a copy of your personal data.</li>
          <li>Request correction of inaccurate data.</li>
          <li>Request deletion of your account and data.</li>
          <li>Opt out of marketing communications.</li>
        </ul>
        <p className="mt-3">To exercise these rights, contact us at <a href="mailto:privacy@celervote.com" className="text-secondary hover:underline">privacy@celervote.com</a>.</p>
      </div>
    </div>
  </PageWrapper>
);

// ── Terms of Service ──────────────────────────────────────────────
export const TermsPage = () => (
  <PageWrapper>
    <SectionTitle icon={FileText} title="Terms of Service" subtitle="Rules and guidelines for using CelerVote." />
    <div className="space-y-8 text-sm leading-relaxed text-muted-foreground">

      <div className="glass-card p-6">
        <h2 className="font-display font-semibold text-foreground text-base mb-3">1. Acceptance of Terms</h2>
        <p>By accessing or using CelerVote, you agree to be bound by these Terms of Service. If you do not agree, please do not use our platform.</p>
      </div>

      <div className="glass-card p-6">
        <h2 className="font-display font-semibold text-foreground text-base mb-3">2. Permitted Use</h2>
        <p className="mb-3">You may use CelerVote to:</p>
        <ul className="space-y-2 list-disc list-inside">
          <li>Participate in legitimate elections, contests, and surveys.</li>
          <li>Create and manage voting events for your organization.</li>
          <li>View publicly available election results.</li>
        </ul>
      </div>

      <div className="glass-card p-6">
        <h2 className="font-display font-semibold text-foreground text-base mb-3">3. Prohibited Activities</h2>
        <p className="mb-3">You may not:</p>
        <ul className="space-y-2 list-disc list-inside">
          <li>Vote more than once in any election where multiple votes are not permitted.</li>
          <li>Use automated tools or bots to cast votes.</li>
          <li>Attempt to manipulate, hack, or interfere with any election.</li>
          <li>Create fraudulent accounts or impersonate others.</li>
          <li>Use the platform for illegal purposes.</li>
        </ul>
      </div>

      <div className="glass-card p-6">
        <h2 className="font-display font-semibold text-foreground text-base mb-3">4. Event Organizer Responsibilities</h2>
        <p>If you create events on CelerVote, you are responsible for ensuring that your elections comply with all applicable laws and regulations, and that you have the authority to conduct such elections.</p>
      </div>

      <div className="glass-card p-6">
        <h2 className="font-display font-semibold text-foreground text-base mb-3">5. Payments</h2>
        <p>For paid voting events, all transactions are processed securely. Refunds are at the discretion of the event organizer. CelerVote is not responsible for disputes between voters and organizers.</p>
      </div>

      <div className="glass-card p-6">
        <h2 className="font-display font-semibold text-foreground text-base mb-3">6. Limitation of Liability</h2>
        <p>CelerVote is provided "as is". We are not liable for any damages arising from the use of our platform, including but not limited to election disputes, technical outages, or data loss.</p>
      </div>

      <div className="glass-card p-6">
        <h2 className="font-display font-semibold text-foreground text-base mb-3">7. Changes to Terms</h2>
        <p>We may update these terms at any time. Continued use of the platform after changes constitutes acceptance of the new terms.</p>
      </div>
    </div>
  </PageWrapper>
);

// ── Security ──────────────────────────────────────────────────────
export const SecurityPage = () => (
  <PageWrapper>
    <SectionTitle icon={Shield} title="Security" subtitle="How we keep your votes and data safe." />
    <div className="space-y-6">

      {[
        {
          title: "End-to-End Vote Encryption",
          desc: "Every vote is encrypted before it leaves your device. The encryption key is unique to each voting session, ensuring that even our servers cannot link a vote to a specific voter.",
          icon: Lock,
        },
        {
          title: "OTP Authentication",
          desc: "All voters must verify their identity via a one-time password (OTP) sent to their email or phone before casting a vote. This prevents unauthorized voting.",
          icon: Shield,
        },
        {
          title: "Fraud Detection",
          desc: "Our real-time fraud detection system monitors for suspicious activity including duplicate votes, unusual voting patterns, and bot activity. Suspicious sessions are automatically flagged for review.",
          icon: Shield,
        },
        {
          title: "Audit Trail",
          desc: "Every voting action is logged with a tamper-proof audit trail. This allows event organizers and administrators to verify the integrity of any election.",
          icon: FileText,
        },
        {
          title: "Secure Infrastructure",
          desc: "Our platform is hosted on secure cloud infrastructure with regular security updates, automated backups, and 99.9% uptime SLA.",
          icon: Shield,
        },
        {
          title: "Data Encryption at Rest",
          desc: "All sensitive data stored in our database is encrypted at rest using industry-standard AES-256 encryption.",
          icon: Lock,
        },
      ].map((item) => (
        <div key={item.title} className="glass-card p-6 flex gap-4">
          <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <item.icon className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h3 className="font-display font-semibold mb-2">{item.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
          </div>
        </div>
      ))}

      <div className="glass-card p-6 border-secondary/20 bg-secondary/5">
        <p className="text-sm text-muted-foreground">
          Found a security vulnerability? Please report it responsibly to <a href="mailto:celervote@gmail.com" className="text-secondary hover:underline">security@celervote.com</a>. We take all reports seriously and will respond within 48 hours.
        </p>
      </div>
    </div>
  </PageWrapper>
);

// ── Contact / Help ────────────────────────────────────────────────
export const ContactPage = () => {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sent, setSent] = useState(false);

  const handleSubmit = () => {
    if (!form.name || !form.email || !form.message) {
      toast({ title: "Please fill in all required fields", variant: "destructive" }); return;
    }
    setSent(true);
    toast({ title: "Message sent! ✅", description: "We'll get back to you within 24 hours." });
  };

  return (
    <PageWrapper>
      <SectionTitle icon={MessageSquare} title="Contact & Help" subtitle="Get help or reach out to our team." />

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        {[
          { icon: Mail,  title: "Email Us",      value: "celervote@gmail.com",  desc: "We respond within 24 hours" },
          { icon: Phone, title: "WhatsApp",       value: "+233 50 180 2950",      desc: "Mon–Fri, 9am–6pm GMT" },
        ].map(item => (
          <div key={item.title} className="glass-card p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
              <item.icon className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <p className="font-medium text-sm">{item.title}</p>
              <p className="text-secondary text-sm">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div className="glass-card p-6 mb-6">
        <h2 className="font-display font-semibold mb-4">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {[
            { q: "How do I vote?", a: "Go to Events, select an active event, choose your candidate and click Submit Vote. You'll need to verify your identity via OTP first." },
            { q: "Is my vote anonymous?", a: "Yes. Your vote choice is encrypted and cannot be linked back to you. Only aggregate results are visible." },
            { q: "How do I create an event?", a: "Register as an admin, log in to the dashboard, and click New Event. You can then add categories and candidates." },
            { q: "What payment methods are supported?", a: "We support MTN Mobile Money, Vodafone Cash, AirtelTigo Money, and card payments via Paystack." },
            { q: "Can I vote from my phone?", a: "Yes! CelerVote is fully responsive and works on all devices including feature phones via USSD." },
            { q: "How do I reset my password?", a: "Admin accounts can reset passwords in Settings. Voter accounts use OTP login so no password is needed." },
          ].map((item, i) => (
            <div key={i} className="border-b border-border/50 pb-4 last:border-0 last:pb-0">
              <p className="font-medium text-sm mb-1">{item.q}</p>
              <p className="text-sm text-muted-foreground">{item.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contact Form */}
      {!sent ? (
        <div className="glass-card p-6">
          <h2 className="font-display font-semibold mb-4">Send us a message</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Name *</label>
                <Input placeholder="Your name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Email *</label>
                <Input placeholder="your@email.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Subject</label>
              <Input placeholder="What's this about?" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Message *</label>
              <textarea
                className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-secondary"
                placeholder="Describe your issue or question..."
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              />
            </div>
            <Button className="w-full" onClick={handleSubmit}>Send Message</Button>
          </div>
        </div>
      ) : (
        <div className="glass-card p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-green-400" />
          </div>
          <h3 className="font-display font-semibold text-lg mb-2">Message Sent!</h3>
          <p className="text-sm text-muted-foreground mb-4">We'll get back to you at <strong>{form.email}</strong> within 24 hours.</p>
          <Button variant="outline" size="sm" onClick={() => setSent(false)}>Send Another</Button>
        </div>
      )}
    </PageWrapper>
  );
};
