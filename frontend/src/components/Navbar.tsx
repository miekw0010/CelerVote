import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, ChevronRight, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../context/AuthContext";

const NAVY   = "#002856";
const ORANGE = "#e87200";

const navLinks = [
  { label: "HOME",        path: "/" },
  { label: "EVENTS",      path: "/events" },
  { label: "BUY TICKETS", path: "/tickets" },
  { label: "RESULTS",     path: "/results" },
  { label: "HOW IT WORKS",path: "/#how-it-works" },
  { label: "SERVICES",    path: "/services" },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, isAdmin, logout } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (location.hash) {
      const el = document.querySelector(location.hash);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [location]);

  const handleNavClick = (path: string) => {
    setMobileOpen(false);
    if (path.includes("#")) {
      const [base, hash] = path.split("#");
      if (location.pathname === (base || "/")) {
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
      } else {
        navigate(path);
      }
    }
  };

  const handleLogout = async () => { await logout(); navigate("/auth"); };

  const isActive = (path: string) => {
    if (path.includes("#")) return false;
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white" style={{ boxShadow: scrolled ? '0 2px 16px rgba(0,40,86,0.1)' : '0 1px 0 rgba(0,40,86,0.08)' }}>
      <div className="container mx-auto flex items-center justify-between h-16 px-4">

        {/* Logo */}
        <Link to="/" className="flex items-center">
          <img src="/logo.png" alt="CelerVote" className="h-10 w-auto" />
        </Link>

        {/* Desktop Nav Links */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={() => handleNavClick(link.path)}
              className="px-4 py-2 text-sm font-bold transition-all relative group"
              style={{
                color: isActive(link.path) ? ORANGE : NAVY,
                fontFamily: "'Montserrat', sans-serif",
                letterSpacing: '0.05em',
              }}
            >
              {link.label}
              <span style={{
                position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
                height: '2px', background: ORANGE, borderRadius: '2px',
                width: isActive(link.path) ? '80%' : '0',
                transition: 'width 0.2s ease',
              }} className="group-hover:!w-4/5" />
            </Link>
          ))}
        </div>

        {/* Desktop Auth */}
        <div className="hidden md:flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: NAVY }}>
                <User className="w-4 h-4" />
                <span>{user?.name}</span>
              </div>
              {isAdmin && (
                <Link to="/admin">
                  <Button size="sm" className="cta-button gap-1 px-4 h-9 text-xs">
                    Dashboard <ChevronRight className="w-3 h-3" />
                  </Button>
                </Link>
              )}
              <Button variant="ghost" size="sm" onClick={handleLogout}
                className="gap-2 text-sm font-semibold" style={{ color: NAVY }}>
                <LogOut className="w-4 h-4" /> Sign Out
              </Button>
            </>
          ) : (
            <>
              <Link to="/auth">
                <span className="text-sm font-bold cursor-pointer hover:opacity-70 transition-opacity" style={{ color: NAVY, letterSpacing: '0.05em' }}>LOG IN</span>
              </Link>
              <Link to="/auth">
                <Button className="px-5 h-9 text-sm rounded font-bold text-white" style={{ background: '#e87200', fontFamily:"'Montserrat',sans-serif", letterSpacing: '0.05em' }}>
                  GET STARTED
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile Toggle */}
        <button className="md:hidden p-2" onClick={() => setMobileOpen(!mobileOpen)} style={{ color: NAVY }}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="md:hidden overflow-hidden border-t bg-white" style={{ borderColor: 'rgba(0,40,86,0.1)' }}>
            <div className="p-4 flex flex-col gap-1">
              {navLinks.map((link) => (
                <Link key={link.path} to={link.path} onClick={() => handleNavClick(link.path)}
                  className="px-4 py-3 text-sm font-bold transition-colors rounded"
                  style={{ color: isActive(link.path) ? ORANGE : NAVY, letterSpacing: '0.05em', background: isActive(link.path) ? 'rgba(0,40,86,0.05)' : 'transparent' }}>
                  {link.label}
                </Link>
              ))}
              <div className="flex flex-col gap-2 mt-3 pt-3 border-t" style={{ borderColor: 'rgba(0,40,86,0.1)' }}>
                {isAuthenticated ? (
                  <>
                    <div className="flex items-center gap-2 text-sm font-semibold px-2" style={{ color: NAVY }}>
                      <User className="w-4 h-4" /><span>{user?.name}</span>
                    </div>
                    {isAdmin && (
                      <Link to="/admin" onClick={() => setMobileOpen(false)}>
                        <Button className="w-full cta-button">Dashboard</Button>
                      </Link>
                    )}
                    <Button variant="outline" className="w-full gap-2 font-bold" onClick={handleLogout} style={{ color: NAVY, borderColor: NAVY }}>
                      <LogOut className="w-4 h-4" /> Sign Out
                    </Button>
                  </>
                ) : (
                  <>
                    <Link to="/auth" onClick={() => setMobileOpen(false)}>
                      <Button variant="outline" className="w-full font-bold" style={{ color: NAVY, borderColor: NAVY }}>LOG IN</Button>
                    </Link>
                    <Link to="/auth" onClick={() => setMobileOpen(false)}>
                      <Button className="w-full font-bold text-white" style={{ background: '#e87200', fontFamily:"'Montserrat',sans-serif" }}>GET STARTED</Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
