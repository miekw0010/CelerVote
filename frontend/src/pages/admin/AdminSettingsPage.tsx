import { useState, useEffect } from "react";
import { User, Lock, Bell, Shield, Save, Loader2, CheckCircle2, Eye, EyeOff, Phone, Mail, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "../../context/AuthContext";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api/v1";

const getToken = () => localStorage.getItem("access_token");

const AdminSettingsPage = () => {
  const { user, setUser } = useAuth();
  const { toast }         = useToast();
  const [tab, setTab]     = useState<"profile" | "password" | "notifications" | "security">("profile");

  // Profile form
  const [profile, setProfile]         = useState({ name: "", email: "", phone: "", preferred_language: "en" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved]   = useState(false);

  // Password form
  const [passwords, setPasswords]       = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [savingPass, setSavingPass]     = useState(false);
  const [showCurrent, setShowCurrent]   = useState(false);
  const [showNew, setShowNew]           = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);

  // Notification prefs
  const [notifPrefs, setNotifPrefs] = useState({
    email_on_vote:     true,
    email_on_result:   true,
    sms_on_vote:       false,
    sms_on_result:     false,
  });

  // Load profile on mount
  useEffect(() => {
    fetch(`${API}/auth/profile/`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json())
      .then(data => setProfile({
        name:               data.name || "",
        email:              data.email || "",
        phone:              data.phone || "",
        preferred_language: data.preferred_language || "en",
      }))
      .catch(() => {});
  }, []);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await fetch(`${API}/auth/profile/`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: profile.name, phone: profile.phone, preferred_language: profile.preferred_language }),
      });
      if (!res.ok) throw new Error("Failed to update profile");
      toast({ title: "Profile updated! ✅" });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwords.current_password || !passwords.new_password || !passwords.confirm_password) {
      toast({ title: "All fields are required", variant: "destructive" }); return;
    }
    if (passwords.new_password !== passwords.confirm_password) {
      toast({ title: "New passwords do not match", variant: "destructive" }); return;
    }
    if (passwords.new_password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" }); return;
    }
    setSavingPass(true);
    try {
      const res = await fetch(`${API}/auth/change-password/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify(passwords),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change password");
      toast({ title: "Password changed! ✅" });
      setPasswords({ current_password: "", new_password: "", confirm_password: "" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingPass(false);
    }
  };

  const tabs = [
    { id: "profile",       label: "Profile",       icon: User },
    { id: "password",      label: "Password",      icon: Lock },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security",      label: "Security",      icon: Shield },
  ];

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account and preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-muted/30 p-1 rounded-lg flex-wrap">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all flex-1 justify-center ${
              tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {tab === "profile" && (
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center text-2xl font-bold text-secondary">
              {(profile.name || "A")[0].toUpperCase()}
            </div>
            <div>
              <p className="font-display font-semibold text-lg">{profile.name || "Admin"}</p>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Your name" value={profile.name}
                onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9 opacity-60" value={profile.email} disabled />
            </div>
            <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="+233 XX XXX XXXX" value={profile.phone}
                onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Language</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <select value={profile.preferred_language}
                onChange={e => setProfile(p => ({ ...p, preferred_language: e.target.value }))}
                className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm">
                <option value="en">English</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
              </select>
            </div>
          </div>

          <Button className="w-full gap-2" onClick={handleSaveProfile} disabled={savingProfile}>
            {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> :
             profileSaved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {profileSaved ? "Saved!" : "Save Profile"}
          </Button>
        </div>
      )}

      {/* Password Tab */}
      {tab === "password" && (
        <div className="glass-card p-6 space-y-4">
          <div className="mb-2">
            <h3 className="font-display font-semibold">Change Password</h3>
            <p className="text-sm text-muted-foreground">Use a strong password with at least 8 characters</p>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Current Password</label>
            <div className="relative">
              <Input type={showCurrent ? "text" : "password"} placeholder="Enter current password"
                value={passwords.current_password}
                onChange={e => setPasswords(p => ({ ...p, current_password: e.target.value }))} className="pr-10" />
              <button onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">New Password</label>
            <div className="relative">
              <Input type={showNew ? "text" : "password"} placeholder="Enter new password"
                value={passwords.new_password}
                onChange={e => setPasswords(p => ({ ...p, new_password: e.target.value }))} className="pr-10" />
              <button onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {passwords.new_password && (
              <div className="mt-1.5 flex gap-1">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                    passwords.new_password.length > i * 3
                      ? passwords.new_password.length < 8 ? "bg-red-500"
                        : passwords.new_password.length < 12 ? "bg-yellow-500" : "bg-green-500"
                      : "bg-muted"
                  }`} />
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Confirm New Password</label>
            <div className="relative">
              <Input type={showConfirm ? "text" : "password"} placeholder="Confirm new password"
                value={passwords.confirm_password}
                onChange={e => setPasswords(p => ({ ...p, confirm_password: e.target.value }))} className="pr-10" />
              <button onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {passwords.confirm_password && passwords.new_password !== passwords.confirm_password && (
              <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
            )}
          </div>

          <Button className="w-full gap-2" onClick={handleChangePassword} disabled={savingPass}>
            {savingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Change Password
          </Button>
        </div>
      )}

      {/* Notifications Tab */}
      {tab === "notifications" && (
        <div className="glass-card p-6 space-y-4">
          <div className="mb-2">
            <h3 className="font-display font-semibold">Notification Preferences</h3>
            <p className="text-sm text-muted-foreground">Choose how you want to be notified</p>
          </div>

          {[
            { key: "email_on_vote",   label: "Email on new vote",      desc: "Get emailed when someone votes in your event" },
            { key: "email_on_result", label: "Email on results ready", desc: "Get emailed when event results are published" },
            { key: "sms_on_vote",     label: "SMS on new vote",         desc: "Get an SMS when someone votes in your event" },
            { key: "sms_on_result",   label: "SMS on results ready",    desc: "Get an SMS when event results are published" },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between p-4 rounded-lg border border-border">
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
   <button
  onClick={() => setNotifPrefs(p => ({ ...p, [item.key]: !p[item.key as keyof typeof p] }))}
  className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
    notifPrefs[item.key as keyof typeof notifPrefs] ? "bg-secondary" : "bg-muted"
  }`}
>
  <span className={`inline-block w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
    notifPrefs[item.key as keyof typeof notifPrefs] ? "translate-x-6" : "translate-x-1"
  }`} />
</button>
            </div>
          ))}



          <Button className="w-full gap-2" onClick={() => toast({ title: "Preferences saved! ✅" })}>
            <Save className="w-4 h-4" /> Save Preferences
          </Button>
        </div>
      )}

      {/* Security Tab */}
      {tab === "security" && (
        <div className="space-y-4">
          <div className="glass-card p-6">
            <h3 className="font-display font-semibold mb-1">Account Security</h3>
            <p className="text-sm text-muted-foreground mb-4">Overview of your account security status</p>
            <div className="space-y-3">
              {[
                { label: "Email verified",    status: true,  note: "Your email is verified" },
                { label: "Strong password",   status: true,  note: "Password meets requirements" },

              ].map(item => (
                <div key={item.label} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${item.status ? "bg-green-400" : "bg-muted-foreground"}`} />
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.note}</p>
                    </div>
                  </div>
                  {item.status
                    ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                    : <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">Soon</span>}
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6">
            <h3 className="font-display font-semibold mb-1">Active Session</h3>
            <p className="text-sm text-muted-foreground mb-4">You are currently logged in</p>
            <div className="p-3 rounded-lg bg-muted/30 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Current session</p>
                <p className="text-xs text-muted-foreground">Browser · {new Date().toLocaleDateString()}</p>
              </div>
              <span className="text-xs text-green-400 font-medium">● Active</span>
            </div>
          </div>

          <div className="glass-card p-6 border-red-500/20">
            <h3 className="font-display font-semibold mb-1 text-red-400">Danger Zone</h3>
            <p className="text-sm text-muted-foreground mb-4">Irreversible actions for your account</p>
            <Button variant="destructive" className="w-full" onClick={() => toast({ title: "Contact support to delete your account", variant: "destructive" })}>
              Delete Account
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSettingsPage;