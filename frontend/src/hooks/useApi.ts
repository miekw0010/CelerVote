/**
 * useApi.ts
 * Custom React hooks for all API calls.
 * Use these in your pages/components instead of calling the API directly.
 */

import { useState, useEffect, useCallback } from "react";
import { eventsApi, votingApi, analyticsApi, connectToLiveResults } from "../lib/api";
import { useToast } from "./use-toast";

// ── useEvents ─────────────────────────────────────────────────────

export const useEvents = (params?: { status?: string; search?: string }) => {
  const [events, setEvents]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        const data = await eventsApi.listEvents(params);
        setEvents(data.results || data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [params?.status, params?.search]);

  return { events, loading, error };
};

// ── useEvent ──────────────────────────────────────────────────────

export const useEvent = (slug: string) => {
  const [event, setEvent]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    const fetchEvent = async () => {
      try {
        setLoading(true);
        const data = await eventsApi.getEvent(slug);
        setEvent(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchEvent();
    }, [slug]);

    const refetch = () => {
      if (!slug) return;
      eventsApi.getEvent(slug).then(setEvent).catch(console.error);
    };

    return { event, loading, error, refetch };
};



// ── useAdminEvents ────────────────────────────────────────────────

export const useAdminEvents = () => {
  const [events, setEvents]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast }             = useToast();

  const fetchEvents = useCallback(async () => {
    // Don't fetch if no token — avoids empty data on initial render before auth loads
    const token = localStorage.getItem("access_token");
    if (!token) { setLoading(false); return; }
    try {
      setLoading(true);
      const data = await eventsApi.adminListEvents();
      setEvents(data.results || data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch when the access token appears in localStorage (handles initial auth load race)
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) fetchEvents();
    else setLoading(false);
  }, []);

  const createEvent = async (data: object) => {
    try {
      const newEvent = await eventsApi.adminCreateEvent(data);
      await fetchEvents();
      toast({ title: "Event created!", description: "Your event is ready." });
      return newEvent;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      throw err;
    }
  };

  const changeStatus = async (slug: string, status: string) => {
    try {
      await eventsApi.adminChangeStatus(slug, status);
      await fetchEvents();
      toast({ title: "Status updated!", description: `Event is now ${status}.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const deleteEvent = async (slug: string) => {
    try {
      await eventsApi.adminDeleteEvent(slug);
      await fetchEvents();
      toast({ title: "Event deleted." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return { events, loading, createEvent, changeStatus, deleteEvent, refetch: fetchEvents };
};

// ── useCastVote ───────────────────────────────────────────────────

export const useCastVote = () => {
  const [loading, setLoading] = useState(false);

  const castVote = async (data: {
    event_slug: string;
    category_id: string;
    candidate_ids: string[];
    payment_ref?: string;
    quantity?: number; 
  }) => {
    try {
      setLoading(true);
      const result = await votingApi.castVote(data);
      return result;
    } catch (err: any) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { castVote, loading };
};
// ── useLiveResults ────────────────────────────────────────────────

export const useLiveResults = (slug: string) => {
    const [results, setResults]     = useState<any>(null);
    const [loading, setLoading]     = useState(true);
    const [connected, setConnected] = useState(false);
    useEffect(() => {
      // Reset state when slug changes
      setResults(null);
      setConnected(false);

      if (!slug) {
        setLoading(false);
        return;
      }

      setLoading(true);

      // First load via REST
      votingApi.getLiveResults(slug)
        .then(data => { setResults(data); setLoading(false); })
        .catch(() => setLoading(false));

      // Then connect WebSocket for live updates
      let ws: WebSocket;
      try {
        ws = connectToLiveResults(
          slug,
          (message) => {
            if (message.type === "initial_results" || message.type === "vote_update") {
              setResults(message.data);
              setConnected(true);
            }
          },
          () => setConnected(false)
        );
      } catch {
        setConnected(false);
      }
      return () => {
        ws?.close();
      };
    }, [slug]);
    return { results, loading, connected };
  };
// ── useAnalytics ──────────────────────────────────────────────────

export const useAnalytics = () => {
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    analyticsApi.getDashboard()
      .then(data => setDashboard(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return { dashboard, loading };
};

export const useEventAnalytics = (slug: string) => {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!slug) return;
    analyticsApi.getEventAnalytics(slug)
      .then(data => setAnalytics(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [slug]);

  return { analytics, loading };
};