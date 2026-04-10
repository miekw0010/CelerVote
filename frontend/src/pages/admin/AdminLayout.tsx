import { useState } from "react";
import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { Vote, BarChart3, Calendar, Users, CreditCard, Bell, Settings, LogOut, Menu, X, ChevronRight, Ticket, Shield, UserCog } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

const sidebarItems = [
  { title: "Overview",      icon: BarChart3,  url: "/admin" },
  { title: "Events",        icon: Calendar,   url: "/admin/events" },
  { title: "Candidates",    icon: Users,      url: "/admin/candidates" },
  { title: "Voters",        icon: Vote,       url: "/admin/voters" },
  { title: "Voter Roll",    icon: Users,      url: "/admin/voter-roll" },
  { title: "Fraud Flags",   icon: Shield,     url: "/admin/fraud" },
  { title: "Tickets",       icon: Ticket,     url: "/admin/tickets" },
  { title: "Officials",     icon: UserCog,    url: "/admin/officials" },
  { title: "Payments",      icon: CreditCard, url: "/admin/payments" },
  { title: "Notifications", icon: Bell,       url: "/admin/notifications" },
  { title: "Settings",      icon: Settings,   url: "/admin/settings" },
];

const AdminLayout = () => {
  const { user, logout, isAuthenticated, isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => { await logout(); navigate("/auth"); };

  // Wait for AuthContext to finish reading localStorage before checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect if not authenticated or not an admin
  if (!isAuthenticated || !isAdmin) {
    navigate("/auth", { replace: true });
    return null;
  }

  const isActive = (url: string) => {
    if (url === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(url);
  };

  const currentPage = sidebarItems.find(item => isActive(item.url))?.title || "Dashboard";

  const NavLinks = ({ onClose }: { onClose?: () => void }) => (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      {sidebarItems.map((item) => {
        const active = isActive(item.url);
        return (
          <Link key={item.title} to={item.url} onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              active
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}>
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{item.title}</span>
            {active && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
          </Link>
        );
      })}
    </nav>
  );

  const UserFooter = () => (
    <div className="p-4 border-t border-border">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center text-secondary font-bold text-sm flex-shrink-0">
          {(user?.name || user?.email || "A")[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{user?.name || "Admin"}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>
      </div>
      <button onClick={handleLogout}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors w-full px-2 py-1.5 rounded-lg hover:bg-destructive/10">
        <LogOut className="w-4 h-4" /> Sign Out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 border-r border-border bg-card fixed inset-y-0 left-0 z-30">
        <div className="p-5 border-b border-border">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="CelerVote" className="h-8 w-auto" />
          </Link>
        </div>
        <NavLinks />
        <UserFooter />
      </aside>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile Drawer */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col transition-transform duration-300 md:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <Link to="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
            <img src="/logo.png" alt="CelerVote" className="h-7 w-auto" />
          </Link>
          <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <NavLinks onClose={() => setMobileOpen(false)} />
        <UserFooter />
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 md:ml-60">
        <header className="h-14 border-b border-border flex items-center px-4 bg-card gap-3 sticky top-0 z-20">
          <button onClick={() => setMobileOpen(true)} className="md:hidden p-2 rounded-lg hover:bg-muted">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-semibold truncate">{currentPage}</h1>
          </div>
          <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center text-secondary font-bold text-sm">
            {(user?.name || user?.email || "A")[0].toUpperCase()}
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-visible">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
