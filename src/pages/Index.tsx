import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { motion } from "framer-motion";
import QRCode from "react-qr-code";
import { Html5Qrcode } from "html5-qrcode";
import { Check, Copy, Upload, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const HIDDEN_PIN = "937415";
const MAX_FILE_SIZE_MB = 50;
const MAX_FILES_PER_UPLOAD = 5;

interface ClipItem {
  id: string;
  session_id: string;
  created_at: string;
  type: string;
  text_content: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  file_path: string | null;
}

type LinkState = "idle" | "active" | "closed";

const Index: React.FC = () => {
  const location = useLocation();
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const updateUrlWithSessionCode = (code: string | null) => {
    const url = new URL(window.location.href);
    if (code) {
      url.searchParams.set("session", code);
    } else {
      url.searchParams.delete("session");
    }
    window.history.replaceState(null, "", url.toString());
  };

  const initialSessionFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("session") ?? "";
  }, [location.search]);

  const [sessionCodeInput, setSessionCodeInput] = useState(initialSessionFromUrl);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [items, setItems] = useState<ClipItem[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lockdown, setLockdown] = useState(false);
  const [linkState, setLinkState] = useState<LinkState>("idle");
  const [pollPhase, setPollPhase] = useState<"fast" | "normal">("normal");
  const [closedSessionCode, setClosedSessionCode] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<{
    enabled: boolean;
    title: string;
    body: string;
    link: string;
  }>({
    enabled: false,
    title: "",
    body: "",
    link: "",
  });
  const [announcementOpen, setAnnouncementOpen] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const connectedAtRef = useRef<number>(0);
  const [draggingOver, setDraggingOver] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "error">("connecting");


  const transitionToClosed = useCallback(
    (code?: string | null) => {
      const closedCode = (code ?? sessionCode ?? sessionCodeInput ?? initialSessionFromUrl)?.trim() || null;
      if (closedCode) updateUrlWithSessionCode(closedCode);

      setClosedSessionCode(closedCode);
      setLinkState("closed");
      setSessionId(null);
      setSessionCode(closedCode);
      setDraft("");
      setItems([]);
      setRealtimeStatus("connecting");

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    },
    [initialSessionFromUrl, sessionCode, sessionCodeInput],
  );

  const resetToHome = useCallback(() => {
    setClosedSessionCode(null);
    setLinkState("idle");
    setSessionId(null);
    setSessionCode(null);
    setSessionCodeInput("");
    updateUrlWithSessionCode(null);
    setDraft("");
    setItems([]);
    setRealtimeStatus("connecting");

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  const createSession = async () => {
    if (creating) return;
    if (lockdown) {
      toast({
        title: "Temporarily paused",
        description: "New links are currently disabled by the admin.",
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clipbeam-create-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ pin: HIDDEN_PIN }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create link");

      setSessionId(data.sessionId);
      setSessionCode(data.sessionCode);
      setLinkState("active");
      setClosedSessionCode(null);
      updateUrlWithSessionCode(data.sessionCode);
      setDraft("");
      setItems([]);
      connectedAtRef.current = Date.now();

      setPollPhase("fast");
      setupRealtime(data.sessionId);
      void fetchItems(data.sessionCode);
    } catch (error: any) {
      toast({ title: "Could not start link", description: error.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const setupRealtime = useCallback(
    (sid: string) => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      setRealtimeStatus("connecting");

      const channel = supabase
        .channel(`clipbeam-session-${sid}`)
        .on("broadcast", { event: "live_text" }, (payload) => {
          const text = (payload as any).payload?.text;
          if (typeof text === "string") {
            setDraft(text);
          }
        })
        .on("broadcast", { event: "session_closed" }, (payload) => {
          const code = (payload as any).payload?.sessionCode;
          transitionToClosed(typeof code === "string" ? code : null);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setRealtimeStatus("connected");
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setRealtimeStatus("error");
          }
        });

      channelRef.current = channel;
    },
    [transitionToClosed, toast],
  );

  const cleanupRealtime = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setRealtimeStatus("connecting");
  }, []);

  useEffect(() => cleanupRealtime, [cleanupRealtime]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-settings`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        });
        const data: {
          ok?: boolean;
          settings?: {
            lockdownEnabled: boolean;
            announcementEnabled: boolean;
            announcementTitle: string;
            announcementBody: string;
            announcementLink: string;
          };
        } = await res.json();

        if (res.ok && data.ok && data.settings) {
          setLockdown(data.settings.lockdownEnabled);
          const enabled = data.settings.announcementEnabled;
          const title = data.settings.announcementTitle ?? "";
          const body = data.settings.announcementBody ?? "";
          const link = data.settings.announcementLink ?? "";
          setAnnouncement({ enabled, title, body, link });
          setAnnouncementOpen(enabled && (!!title || !!body));
        }
      } catch {
        // Non-critical; ignore failures silently.
      }
    };

    void loadSettings();
  }, []);

  const fetchItems = useCallback(
    async (code: string | null) => {
      if (!code) return;
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clipbeam-get-items?sessionCode=${encodeURIComponent(
            code,
          )}&pin=${HIDDEN_PIN}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          },
        );

        const data = await res.json();

        if (!res.ok) {
          if (res.status === 401 && (data?.error === "Invalid session" || data?.error === "Invalid PIN")) {
            transitionToClosed(code);
            return;
          }
          console.error("Failed to fetch items:", data.error ?? res.statusText);
          return;
        }

        setItems((data.items ?? []) as ClipItem[]);
      } catch (error) {
        console.error("Failed to fetch items:", error);
      }
    },
    [transitionToClosed],
  );

  const joinSession = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    setConnecting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clipbeam-join-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ sessionCode: trimmed, pin: HIDDEN_PIN }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401 && data?.error === "Invalid session") {
          transitionToClosed(trimmed);
          return;
        }
        throw new Error(data.error ?? "Failed to connect");
      }

      setSessionId(data.sessionId);
      setSessionCode(data.sessionCode);
      setLinkState("active");
      setClosedSessionCode(null);
      updateUrlWithSessionCode(data.sessionCode);
      connectedAtRef.current = Date.now();

      setPollPhase("fast");
      setupRealtime(data.sessionId);
      void fetchItems(data.sessionCode);
    } catch (error: any) {
      toast({ title: "Could not connect", description: error.message, variant: "destructive" });
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    if (linkState === "closed") return;
    if (!initialSessionFromUrl) return;
    if (sessionId || sessionCode) return;

    void joinSession(initialSessionFromUrl);
  }, [initialSessionFromUrl, sessionId, sessionCode, linkState]);
  const handleDraftChange = async (value: string) => {
    setDraft(value);
    if (!sessionId || !channelRef.current) return;
    channelRef.current.send({
      type: "broadcast",
      event: "live_text",
      payload: { text: value },
    });
  };

  const handleCopyCode = async () => {
    if (!sessionCode) return;
    await navigator.clipboard.writeText(sessionCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleEndSession = async () => {
    if (!sessionCode || ending) return;
    setEnding(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clipbeam-end-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ sessionCode, pin: HIDDEN_PIN }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to close link");

      // Notify other connected devices immediately (no refresh required).
      await channelRef.current?.send({
        type: "broadcast",
        event: "session_closed",
        payload: { sessionCode, endedAt: new Date().toISOString() },
      });

      setLinkState("idle");
      setClosedSessionCode(null);
      setSessionId(null);
      setSessionCode(null);
      updateUrlWithSessionCode(null);
      setDraft("");
      setItems([]);
      cleanupRealtime();
    } catch (error: any) {
      toast({ title: "Could not close link", description: error.message, variant: "destructive" });
    } finally {
      setEnding(false);
    }
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || !sessionCode) return;

    if (lockdown) {
      toast({
        title: "Temporarily paused",
        description: "Uploads are currently disabled by the admin.",
        variant: "destructive",
      });
      return;
    }

    const fileArray = Array.from(files);

    if (fileArray.length > MAX_FILES_PER_UPLOAD) {
      toast({
        title: "Too many files",
        description: `You can upload up to ${MAX_FILES_PER_UPLOAD} files at once.`,
        variant: "destructive",
      });
      return;
    }

    for (const file of fileArray) {
      const sizeMb = file.size / (1024 * 1024);
      if (sizeMb > MAX_FILE_SIZE_MB) {
        toast({
          title: "File too large",
          description: `"${file.name}" is over ${MAX_FILE_SIZE_MB} MB and was skipped.`,
          variant: "destructive",
        });
        continue;
      }

      try {
        const safeName = file.name
          .normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9._-]/g, "-");

        const path = `${sessionId ?? "unknown"}/${Date.now()}-${safeName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("clipbeam-items")
          .upload(path, file);

        if (uploadError) throw uploadError;

        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clipbeam-send-item`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            sessionCode,
            pin: HIDDEN_PIN,
            type: file.type.startsWith("image/") ? "image" : "file",
            text: null,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            filePath: uploadData?.path ?? path,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401 && data?.error === "Invalid session") {
            transitionToClosed(sessionCode);
            return;
          }
          throw new Error(data.error ?? "Failed to share file");
        }
        setItems((prev) => [data.item, ...prev]);
      } catch (error: any) {
        toast({ title: "File upload failed", description: error.message, variant: "destructive" });
      }
    }
  };

  const handleDownload = async (item: ClipItem) => {
    if (!item.file_path) return;

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/clipbeam-items/${item.file_path}`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404 || response.status === 400) {
          // File was cleaned up by the backend
          setItems((prev) => prev.filter((i) => i.id !== item.id));
          toast({
            title: "File no longer available",
            description: "This file has expired and was automatically removed.",
          });
          return;
        }
        throw new Error("Download failed");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = item.file_name ?? "file";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(objectUrl);
    } catch (error: any) {
      toast({ title: "Download failed", description: error.message ?? "Could not download file" });
    }
  };

  // QR scanner lifecycle
  const [scannerStatus, setScannerStatus] = useState<"loading" | "active" | "error">("loading");
  const [scannerErrorMsg, setScannerErrorMsg] = useState("");

  useEffect(() => {
    if (!scannerOpen) {
      qrScannerRef.current?.stop().catch(() => { });
      setScannerStatus("loading");
      setScannerErrorMsg("");
      return;
    }

    let cancelled = false;
    const qr = new Html5Qrcode("qr-reader");
    qrScannerRef.current = qr;

    const onScanSuccess = (text: string) => {
      if (cancelled) return;
      setScannerOpen(false);
      qr.stop().catch(() => { });

      let code = text;
      try {
        const url = new URL(text);
        code = url.searchParams.get("session") ?? text;
      } catch {
        // Not a URL — use raw text as the session code
      }

      const target = `${window.location.origin}${window.location.pathname}?session=${encodeURIComponent(code.trim())}`;
      window.location.href = target;
    };

    const scanConfig = { fps: 10, qrbox: 250 };

    const startScanner = async () => {
      // Try back camera (phones)
      try {
        await qr.start({ facingMode: "environment" }, scanConfig, onScanSuccess, undefined);
        if (!cancelled) setScannerStatus("active");
        return;
      } catch { /* not available */ }

      if (cancelled) return;

      // Try front camera (laptops/desktops)
      try {
        await qr.start({ facingMode: "user" }, scanConfig, onScanSuccess, undefined);
        if (!cancelled) setScannerStatus("active");
        return;
      } catch { /* not available */ }

      if (cancelled) return;

      // Try any available camera by ID
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras.length > 0) {
          await qr.start(cameras[0].id, scanConfig, onScanSuccess, undefined);
          if (!cancelled) setScannerStatus("active");
          return;
        }
      } catch { /* failed */ }

      if (cancelled) return;
      setScannerStatus("error");
      setScannerErrorMsg("No camera found. Check browser permissions or try a different device.");
    };

    void startScanner();

    return () => {
      cancelled = true;
      qr.stop().catch(() => { });
    };
  }, [scannerOpen]);

  const isConnected = linkState === "active" && !!sessionId && !!sessionCode;

  useEffect(() => {
    if (linkState !== "active") return;
    if (!sessionCode || !isConnected) return;

    const pollMs = pollPhase === "fast" ? 1000 : 2000;

    const interval = setInterval(() => {
      void fetchItems(sessionCode);
    }, pollMs);

    let relaxTimer: ReturnType<typeof setTimeout> | undefined;
    if (pollPhase === "fast") {
      const elapsed = Date.now() - connectedAtRef.current;
      const remaining = Math.max(0, 10_000 - elapsed);
      relaxTimer = setTimeout(() => setPollPhase("normal"), remaining);
    }

    return () => {
      clearInterval(interval);
      if (relaxTimer) clearTimeout(relaxTimer);
    };
  }, [sessionCode, isConnected, fetchItems, linkState, pollPhase]);



  // Drag-and-drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingOver(false);
    if (e.dataTransfer.files?.length) {
      void handleFilesSelected(e.dataTransfer.files);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col px-4 py-4 sm:py-6">
      {lockdown && (
        <div className="w-full max-w-4xl mx-auto mb-3 rounded-xl border border-border/80 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          New links, joins, and uploads are temporarily paused by the admin.
        </div>
      )}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between gap-3 pb-3 sm:pb-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="h-[32px] w-[32px] shrink-0 relative">
            <div className="absolute top-[2px] left-[2px] h-[20px] w-[20px] rounded-[0.4rem] bg-primary/35 border border-primary/25" />
            <div className="absolute bottom-[2px] right-[2px] h-[20px] w-[20px] rounded-[0.4rem] bg-primary border border-primary/70">
              <div className="absolute inset-0 rounded-[0.4rem] border-t border-l border-white/15" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Pasto</p>
            <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
              The bridge between your screens.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] sm:text-xs text-muted-foreground">
          <Dialog open={announcement.enabled ? announcementOpen : undefined} onOpenChange={announcement.enabled ? setAnnouncementOpen : undefined}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center hover:text-foreground transition-colors"
              >
                {announcement.enabled ? "Announcement" : "About"}
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{announcement.enabled && announcement.title ? announcement.title : "How Pasto works"}</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-3 text-xs text-muted-foreground">
                    {announcement.enabled && announcement.body ? (
                      <div className="space-y-4">
                        <p className="leading-relaxed">{announcement.body}</p>
                        {announcement.link && (
                          <a
                            href={announcement.link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-md hover:bg-primary/90 transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                          >
                            {(() => {
                              try {
                                const host = new URL(announcement.link).hostname.replace("www.", "");
                                if (host.includes("patreon")) return "Support on Patreon";
                                if (host.includes("ko-fi")) return "Buy me a Coffee";
                                if (host.includes("buymeacoffee")) return "Buy me a Coffee";
                                if (host.includes("github.com/sponsors")) return "Sponsor on GitHub";
                                if (host.includes("paypal")) return "Donate via PayPal";
                                return "Support this project";
                              } catch {
                                return "Support this project";
                              }
                            })()}
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                          </a>
                        )}
                      </div>
                    ) : (
                      <>
                        <p>
                          A Pasto link creates a private, real-time workspace between your devices. Anyone with the code or QR can access it while active.
                        </p>
                        <p>
                          Share files up to {MAX_FILE_SIZE_MB} MB each.
                        </p>
                        <p>
                          Nothing stays. When a link closes, all content is permanently erased.
                        </p>
                        <p>
                          No accounts, no history, no footprint.
                        </p>
                        <div className="pt-2 border-t border-border/40 mt-3 flex items-center justify-between gap-3">
                          <div className="text-[11px] text-muted-foreground">
                            <p className="font-medium text-xs text-foreground">Built by Rifat Al Jubayer</p>
                            <p>A small utility focused on secure, short-lived sharing between your own devices.</p>
                          </div>
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="text-[11px] px-3 py-1 border-border/70 bg-background/60 hover:bg-background/80"
                          >
                            <a href="https://github.com/kakarotsec" target="_blank" rel="noreferrer">
                              View GitHub
                            </a>
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center py-4">
        {linkState === "closed" ? (
          <motion.main
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="w-full max-w-xl rounded-[1.75rem] border border-border/80 bg-card shadow-xl shadow-black/40 px-4 sm:px-6 py-6 sm:py-7 space-y-4"
          >
            <header className="space-y-1">
              <h1 className="text-base font-semibold tracking-tight">Link closed</h1>
              <p className="text-xs text-muted-foreground">
                This Pasto link was closed from another device. Start a new link, or join a different one.
              </p>
              {closedSessionCode && (
                <p className="text-xs text-muted-foreground">
                  Closed code: <span className="font-mono tracking-[0.16em]">{closedSessionCode}</span>
                </p>
              )}
            </header>

            <div className="pt-2">
              <Button className="w-full h-11 text-sm font-medium" onClick={resetToHome}>
                Start a new link
              </Button>
            </div>
          </motion.main>
        ) : !isConnected ? (
          <motion.main
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="w-full max-w-xl rounded-[1.75rem] border border-border/80 bg-card shadow-xl shadow-black/40 px-4 sm:px-6 py-6 sm:py-7 space-y-6"
          >
            <header className="space-y-1">
              <h1 className="text-base font-semibold tracking-tight">Start a new Pasto link</h1>
              <p className="text-xs text-muted-foreground">
                Open a private link and share text, files, and images across your devices in real time.
              </p>
            </header>

            <div className="space-y-2 mt-3">
              <Button
                className="w-full h-11 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_0_1px_rgba(15,23,42,0.5)]"
                onClick={createSession}
                disabled={creating}
              >
                {creating ? "Creating..." : "Create link"}
              </Button>
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              <span>or join an existing link</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-3">
              <Input
                placeholder="Link code"
                className="h-11 text-center tracking-[0.25em] text-sm bg-secondary/40 border-border/80 focus-visible:ring-ring/70"
                value={sessionCodeInput}
                onChange={(e) => setSessionCodeInput(e.target.value)}
              />
              <div className="flex gap-3 justify-center">
                <Button
                  variant="outline"
                  className="h-11 min-w-[9rem] px-6 text-sm font-medium border-border/80 bg-secondary/60 hover:bg-secondary/80"
                  onClick={() => joinSession(sessionCodeInput)}
                  disabled={connecting || !sessionCodeInput.trim()}
                >
                  {connecting ? "Joining..." : "Join"}
                </Button>
                <Button
                  variant="outline"
                  className="h-11 px-5 text-xs font-medium whitespace-nowrap border-border/80 bg-secondary/40 hover:bg-secondary/60"
                  onClick={() => setScannerOpen(true)}
                >
                  Scan QR
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Create on one device, join from another with the code or QR.
            </p>
            <p className="text-[10px] text-muted-foreground/50 text-center">
              Built by <a href="https://github.com/kakarotsec" target="_blank" rel="noreferrer" className="hover:text-muted-foreground transition-colors">Rifat Al Jubayer</a>
            </p>
          </motion.main>
        ) : (
          <motion.main
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="w-full max-w-3xl rounded-[1.75rem] border border-border/80 bg-card shadow-xl shadow-black/40 px-4 sm:px-6 py-6 sm:py-7 space-y-6"
          >
            <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <h1 className="text-base font-semibold tracking-tight">Current link</h1>
                <p className="text-xs text-muted-foreground">
                  Your devices are linked. Type, paste, or drag & drop files below.
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  {realtimeStatus === "connected" ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      </span>
                      Connected
                    </span>
                  ) : realtimeStatus === "error" ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-400/80">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400/80" />
                      </span>
                      Polling mode
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-400">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
                      </span>
                      Connecting…
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-start gap-2 sm:items-end">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground uppercase tracking-[0.22em]">Code</span>
                  <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-secondary/60 px-3 py-[5px] text-xs font-mono">
                    <span className="tracking-[0.16em]">{sessionCode}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                      onClick={handleCopyCode}
                    >
                      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    </Button>
                    {copied && <span className="text-[10px] text-emerald-400 animate-in fade-in">Copied!</span>}
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
                      disabled={ending}
                    >
                      <X className="h-3 w-3" />
                      {ending ? "Closing…" : "Close link"}
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="max-w-[22rem] rounded-2xl border-border/60 p-5">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-sm">Close this link?</AlertDialogTitle>
                      <AlertDialogDescription className="text-xs leading-relaxed">
                        All connected devices will be disconnected and shared content will be cleared.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2 sm:gap-2">
                      <AlertDialogCancel className="h-9 rounded-lg text-xs">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleEndSession}
                        className="h-9 rounded-lg text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Close link
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </header>

            <section className="space-y-2">
              <Textarea
                className="min-h-[190px] text-sm bg-secondary/40 border-border/80 focus-visible:ring-ring/70"
                placeholder="Type or paste anything. It appears on all connected devices instantly."
                value={draft}
                onChange={(e) => handleDraftChange(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Syncs across all connected devices as you type.
              </p>
            </section>

            <section className="grid gap-4 sm:grid-cols-[1.5fr,minmax(0,1fr)]">
              <div
                className={`rounded-2xl border-2 border-dashed transition-colors ${draggingOver
                  ? "border-primary bg-primary/10"
                  : "border-border/70 bg-secondary/50"
                  } p-4 flex flex-col gap-3`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-medium">Files & images</h2>
                    <p className="text-xs text-muted-foreground">
                      Drag here or tap Browse. Max {MAX_FILE_SIZE_MB} MB per file.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs flex items-center gap-1 border-border/80 bg-background/40 hover:bg-background/70"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3 w-3" />
                    Browse
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFilesSelected(e.target.files)}
                  />
                </div>

                {draggingOver && (
                  <div className="flex items-center justify-center py-6 text-xs text-primary font-medium">
                    Drop files here to upload
                  </div>
                )}

                <div className="mt-1 max-h-48 overflow-y-auto space-y-2 text-xs">
                  {items.length === 0 && !draggingOver ? (
                    <p className="text-muted-foreground text-xs">
                      No items yet. Shared files and images will appear here automatically.
                    </p>
                  ) : (
                    items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/40 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">
                            {item.type === "text" ? item.text_content ?? "Text" : item.file_name ?? "File"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(item.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                        {item.type !== "text" && item.file_path && (
                          <button
                            type="button"
                            onClick={() => handleDownload(item)}
                            className="text-xs font-medium text-primary hover:text-primary/90"
                          >
                            Download
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-secondary/50 p-4 flex flex-col items-center justify-center gap-3">
                <div className="self-start text-sm font-medium">QR code</div>
                <p className="text-xs text-muted-foreground text-center">
                  Scan with your phone to connect instantly.
                </p>
                <div className="mt-2 rounded-lg bg-white p-3 shadow-[0_0_0_1px_rgba(15,23,42,0.6)]">
                  <QRCode
                    value={`${window.location.origin}?session=${sessionCode}`}
                    size={148}
                    bgColor="hsl(0 0% 100%)"
                    fgColor="hsl(0 0% 0%)"
                    level="H"
                  />
                </div>
              </div>
            </section>
          </motion.main>
        )}
      </div>


      {scannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur">
          <div className="w-full max-w-sm rounded-2xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Scan QR code</h2>
              <Button size="icon" variant="ghost" onClick={() => setScannerOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {scannerStatus === "loading" && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p>Starting camera…</p>
              </div>
            )}

            {scannerStatus === "error" && (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-xs text-muted-foreground">
                <p className="font-medium text-destructive">{scannerErrorMsg}</p>
                <Button size="sm" variant="outline" className="mt-2 text-xs" onClick={() => setScannerOpen(false)}>
                  Close
                </Button>
              </div>
            )}

            <div
              id="qr-reader"
              className={`rounded-lg overflow-hidden bg-black ${scannerStatus === "active" ? "" : "h-0"}`}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
// Force Vercel rebuild - 2026-02-15
