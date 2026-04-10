import { } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export function Footer() {
  const navigate = useNavigate();

  const handleLink = (to: string) => {
    navigate(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const footerLinks = [
    {
      title: "Platform",
      links: [
        { label: "Events",    to: "/events" },
        { label: "Results",   to: "/results" },
        { label: "How It Works", to: "/#how-it-works" },
        { label: "Services", to: "/services" },
      ],
    },
    {
      title: "Support",
      links: [
        { label: "Help Center", to: "/contact" },
        { label: "Contact Us",  to: "/contact" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy Policy",   to: "/privacy" },
        { label: "Terms of Service", to: "/terms" },
        { label: "Security",         to: "/security" },
      ],
    },
  ];

  return (
    <footer className="border-t border-border bg-card">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <Link to="/" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2 mb-4">
              <img src="/logo.png" alt="CelerVote" className="h-18 md:h-20 w-auto" />
            </Link>
            <p className="text-sm text-muted-foreground">
              Secure electronic voting for schools, contests, and surveys.
            </p>
          </div>
          {footerLinks.map((col) => (
            <div key={col.title}>
              <h4 style={{fontFamily:"'Montserrat',sans-serif",fontWeight:800,fontSize:"0.875rem",marginBottom:"0.75rem",color:"#002856"}}>{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <button
                      onClick={() => handleLink(link.to)}
                      className="text-sm transition-colors text-left" style={{ color: "#555", fontFamily: "'Montserrat', sans-serif", fontWeight: 500 }}
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      {/* Navy bottom bar */}
      <div style={{ backgroundColor: "hsl(240 100% 12%)" }} className="py-4 text-center text-xs text-white/80">
        © {new Date().getFullYear()} CelerVote. All rights reserved.
      </div>
    </footer>
  );
}