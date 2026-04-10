import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import EventsPage from "./pages/EventsPage";
import EventDetailPage from "./pages/EventDetailPage";
import ResultsPage from "./pages/ResultsPage";
import AuthPage from "./pages/AuthPage";
import AdminDashboard from "./pages/AdminDashboard";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminEventsPage from "./pages/admin/AdminEventsPage";
import AdminCandidatesPage from "./pages/admin/AdminCandidatesPage";
import AdminVotersPage from "./pages/admin/AdminVotersPage";
import AdminPaymentsPage from "./pages/admin/AdminPaymentsPage";
import AdminNotificationsPage from "./pages/admin/AdminNotificationsPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";
import AdminTicketsPage from "./pages/admin/AdminTicketsPage";
import TicketsPage from "./pages/TicketsPage";
import TicketEventDetailPage from "./pages/TicketEventDetailPage";
import ServicesPage from "./pages/ServicesPage";
import AdminFraudPage from "./pages/admin/AdminFraudPage";
import AdminVoterRollPage from "./pages/admin/AdminVoterRollPage";
import AdminOfficialsPage from "./pages/admin/AdminOfficialsPage";
import OfficialLoginPage from "./pages/official/OfficialLoginPage";
import OfficialDashboard from "./pages/official/OfficialDashboard";
import { PrivacyPage, TermsPage, SecurityPage, ContactPage } from "./pages/LegalPages";
import { useAuth } from "./context/AuthContext";



const queryClient = new QueryClient();

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => { window.history.scrollRestoration = "manual"; }, []);
  return null;
};

const ProtectedRoute = ({ children, adminOnly = false }: { children: any; adminOnly?: boolean }) => {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/events" replace />;
  return children;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          {/* Public routes */}
          <Route path="/"              element={<Index />} />
          <Route path="/events"        element={<EventsPage />} />
          <Route path="/events/:slug"  element={<EventDetailPage />} />
          <Route path="/results"       element={<ResultsPage />} />
          <Route path="/results/:slug" element={<ResultsPage />} />
          <Route path="/auth"          element={<AuthPage />} />
          <Route path="/services"       element={<ServicesPage />} />

          {/* Ticket routes */}
          <Route path="/tickets"             element={<TicketsPage />} />
          <Route path="/tickets/:slug"       element={<TicketEventDetailPage />} />

          {/* Legal & Support */}
          <Route path="/privacy"  element={<PrivacyPage />} />
          <Route path="/terms"    element={<TermsPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/contact"  element={<ContactPage />} />

          {/* Admin routes */}
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>}>
            <Route index                element={<AdminDashboard />} />
            <Route path="events"        element={<AdminEventsPage />} />
            <Route path="candidates"    element={<AdminCandidatesPage />} />
            <Route path="voters"        element={<AdminVotersPage />} />
            <Route path="payments"      element={<AdminPaymentsPage />} />
            <Route path="notifications" element={<AdminNotificationsPage />} />
            <Route path="settings"      element={<AdminSettingsPage />} />
            <Route path="tickets"       element={<AdminTicketsPage />} />
            <Route path="fraud"         element={<AdminFraudPage />} />
            <Route path="voter-roll"    element={<AdminVoterRollPage />} />
            <Route path="officials"     element={<AdminOfficialsPage />} />
          </Route>

          {/* Official portal routes (standalone — no admin layout) */}
          <Route path="/official/login"     element={<OfficialLoginPage />} />
          <Route path="/official/dashboard" element={<OfficialDashboard />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
