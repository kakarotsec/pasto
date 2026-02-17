import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface CleanupEvent {
  id: number;
  created_at: string;
  deleted_items: number;
  deleted_bytes: number;
}

interface DiagnosticsData {
  itemTtlMinutes: number;
  maxItemsPerSession: number;
  totalItems: number;
  approxStorageBytes: number;
  cleanupEvents: CleanupEvent[];
  failedAttemptsLastHour: number;
  now: string;
}

interface DiagnosticsPayload {
  ok: boolean;
  diagnostics?: DiagnosticsData;
  error?: string;
  message?: string;
}

interface ForceCleanupStats {
  totalDeletedItems: number;
  totalDeletedBytes: number;
  sessionsTouched: number;
  itemTtlMinutes: number;
  maxItemsPerSession: number;
  ranAt: string;
}

interface AdminSettings {
  lockdownEnabled: boolean;
  announcementEnabled: boolean;
  announcementTitle: string;
  announcementBody: string;
  announcementLink: string;
  updatedAt: string;
}

const AdminPage: React.FC = () => {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleanupStats, setCleanupStats] = useState<ForceCleanupStats | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const [diagRes, settingsRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-diagnostics`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ password }),
        }),
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-settings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ password }),
        }),
      ]);

      const diagData: DiagnosticsPayload = await diagRes.json();
      const settingsData: { ok?: boolean; settings?: AdminSettings; error?: string; message?: string } =
        await settingsRes.json();

      if (!diagRes.ok || !diagData.ok || !diagData.diagnostics) {
        setDiagnostics(null);
        const msg = diagData.message || diagData.error || "Access denied";
        setError(msg);
        toast({ title: "Admin access failed", description: msg, variant: "destructive" });
        return;
      }

      if (!settingsRes.ok || !settingsData.ok || !settingsData.settings) {
        const msg = settingsData.message || settingsData.error || "Failed to load admin settings";
        setError(msg);
        toast({ title: "Admin settings failed", description: msg, variant: "destructive" });
        return;
      }

      setDiagnostics(diagData.diagnostics);
      setCleanupStats(null);
      setSettings(settingsData.settings);
      setPassword("");
      toast({ title: "Admin diagnostics loaded", description: "Admin view refreshed." });
    } catch (err: unknown) {
      console.error(err);
      setError("Could not reach admin endpoints.");
      toast({ title: "Admin error", description: "Could not reach admin endpoints.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let i = 0;
    while (value >= 1024 && i < units.length - 1) {
      value /= 1024;
      i++;
    }
    return `${value.toFixed(1)} ${units[i]}`;
  };

  const handleForceCleanup = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-force-cleanup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ password }),
      });

      const data: { ok?: boolean; stats?: ForceCleanupStats; error?: string; message?: string } = await res.json();

      if (!res.ok || !data.ok || !data.stats) {
        const msg = data.message || data.error || "Force cleanup failed";
        setError(msg);
        toast({ title: "Force cleanup failed", description: msg, variant: "destructive" });
        return;
      }

      setCleanupStats(data.stats);
      toast({
        title: "Cleanup run completed",
        description: `Removed ${data.stats.totalDeletedItems} item(s), ${formatBytes(
          data.stats.totalDeletedBytes,
        )} across ${data.stats.sessionsTouched} session(s).`,
      });
    } catch (err: unknown) {
      console.error(err);
      setError("Could not reach force cleanup endpoint.");
      toast({
        title: "Force cleanup error",
        description: "Could not reach force cleanup endpoint.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          password,
          settings: {
            lockdownEnabled: settings.lockdownEnabled,
            announcementEnabled: settings.announcementEnabled,
            announcementTitle: settings.announcementTitle,
            announcementBody: settings.announcementBody,
            announcementLink: settings.announcementLink,
          },
        }),
      });

      const data: { ok?: boolean; settings?: AdminSettings; error?: string; message?: string } = await res.json();

      if (!res.ok || !data.ok || !data.settings) {
        const msg = data.message || data.error || "Failed to save settings";
        setError(msg);
        toast({ title: "Save failed", description: msg, variant: "destructive" });
        return;
      }

      setSettings(data.settings);
      setPassword("");
      toast({ title: "Settings saved", description: "Global controls updated.", variant: "default" });
    } catch (err: unknown) {
      console.error(err);
      setError("Could not reach admin settings endpoint.");
      toast({
        title: "Settings error",
        description: "Could not reach admin settings endpoint.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-3xl rounded-[1.75rem] border border-border/80 bg-card shadow-xl shadow-black/40 px-6 py-7 space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="space-y-1">
            <h1 className="text-base font-semibold tracking-tight">Pasto admin</h1>
            <p className="text-xs text-muted-foreground">
              Secure control room for storage limits, automatic cleanup, and security attempts.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="uppercase tracking-[0.18em]">Backend</span>
            <span className="inline-flex items-center rounded-full border border-border/70 px-2.5 py-0.5 bg-background/60">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5" />
              <span>Online</span>
            </span>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr),minmax(0,1fr)]">
          <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-border/80 bg-background/60 p-4">
            <div className="space-y-1">
              <label htmlFor="admin-password" className="text-xs font-medium text-foreground">
                Admin password
              </label>
              <Input
                id="admin-password"
                type="password"
                autoComplete="off"
                className="h-9 text-xs"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {error && <p className="text-[11px] text-destructive">{error}</p>}
              <p className="text-[11px] text-muted-foreground">
                Wrong guesses are rate-limited by IP. A correct password will always work, even after failures.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  disabled={loading || !password.trim()}
                >
                  {loading ? "Working..." : diagnostics ? "Re-auth & refresh" : "Enter"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  disabled={loading || !password.trim()}
                  onClick={handleForceCleanup}
                >
                  Force cleanup now
                </Button>
              </div>
              {diagnostics && (
                <p className="text-[11px] text-muted-foreground">
                  Snapshot as of {new Date(diagnostics.now).toLocaleTimeString()}.
                </p>
              )}
            </div>
            {cleanupStats && (
              <p className="text-[11px] text-muted-foreground">
                Last manual cleanup at {new Date(cleanupStats.ranAt).toLocaleTimeString()}: removed {" "}
                <span className="font-mono">{cleanupStats.totalDeletedItems}</span> item(s), {" "}
                <span className="font-mono">{formatBytes(cleanupStats.totalDeletedBytes)}</span> across {" "}
                <span className="font-mono">{cleanupStats.sessionsTouched}</span> session(s).
              </p>
            )}
          </form>

          <div className="space-y-3 text-[11px] text-muted-foreground">
            <div className="rounded-2xl border border-dashed border-border/70 bg-background/60 p-4 space-y-2">
              <h2 className="text-xs font-semibold text-foreground">What this panel controls</h2>
              <ul className="list-disc list-inside space-y-1">
                <li>Enforces a small, fixed storage budget for all users.</li>
                <li>Shows live item counts and an approximate storage footprint.</li>
                <li>Keeps a log of automatic and manual cleanup runs plus admin access attempts.</li>
              </ul>
              <p>
                Cleanup runs automatically in the background. Use the manual button when you want to aggressively trim old
                data immediately.
              </p>
            </div>

            {settings && (
              <div className="rounded-2xl border border-border/80 bg-background/60 p-4 space-y-3 text-[11px]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xs font-semibold text-foreground">Global controls</h2>
                    <p className="text-[11px] text-muted-foreground">
                      Toggle lockdown mode and an optional announcement banner for all users.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    disabled={loading || !password.trim()}
                    onClick={handleSaveSettings}
                  >
                    Save settings
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-[11px] font-medium text-foreground">Lockdown mode</p>
                    <p className="text-[11px] text-muted-foreground">
                      When enabled, new links, joins, and uploads are blocked. Existing items remain readable.
                    </p>
                    <label
                      htmlFor="lockdown-toggle"
                      className="inline-flex items-center gap-2.5 cursor-pointer select-none text-[11px]"
                    >
                      <span className="relative">
                        <input
                          id="lockdown-toggle"
                          type="checkbox"
                          className="peer sr-only"
                          checked={settings.lockdownEnabled}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              lockdownEnabled: e.target.checked,
                            })
                          }
                        />
                        <span className="block h-5 w-9 rounded-full bg-muted-foreground/30 transition-colors duration-200 peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background" />
                        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-4" />
                      </span>
                      <span>Enable lockdown</span>
                    </label>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[11px] font-medium text-foreground">Announcement</p>
                    <p className="text-[11px] text-muted-foreground">
                      Show a small popup to every user with a message (for example donation info or maintenance notice).
                    </p>
                    <label
                      htmlFor="announcement-toggle"
                      className="inline-flex items-center gap-2.5 cursor-pointer select-none text-[11px]"
                    >
                      <span className="relative">
                        <input
                          id="announcement-toggle"
                          type="checkbox"
                          className="peer sr-only"
                          checked={settings.announcementEnabled}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              announcementEnabled: e.target.checked,
                            })
                          }
                        />
                        <span className="block h-5 w-9 rounded-full bg-muted-foreground/30 transition-colors duration-200 peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background" />
                        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-4" />
                      </span>
                      <span>Show announcement</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label htmlFor="announcement-title" className="text-[11px] font-medium text-foreground">
                        Announcement title
                      </label>
                      <Input
                        id="announcement-title"
                        className="h-8 text-xs"
                        value={settings.announcementTitle}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            announcementTitle: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="announcement-updated" className="text-[11px] font-medium text-muted-foreground">
                        Last updated
                      </label>
                      <p id="announcement-updated" className="text-[11px] text-muted-foreground">
                        {new Date(settings.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="announcement-body" className="text-[11px] font-medium text-foreground">
                      Announcement body
                    </label>
                    <textarea
                      id="announcement-body"
                      className="w-full min-h-[80px] rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-primary"
                      value={settings.announcementBody}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          announcementBody: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="announcement-link" className="text-[11px] font-medium text-foreground">
                      Link URL <span className="text-muted-foreground font-normal">(Patreon, Ko-fi, etc.)</span>
                    </label>
                    <Input
                      id="announcement-link"
                      className="h-8 text-xs"
                      placeholder="https://patreon.com/yourpage"
                      value={settings.announcementLink}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          announcementLink: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {diagnostics && (
          <section className="space-y-4 text-xs text-muted-foreground">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-background/60 p-3 space-y-1">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Lifetime</p>
                <p className="text-sm font-semibold text-foreground">
                  ~{diagnostics.itemTtlMinutes} minutes
                </p>
                <p>Items older than this window are candidates for cleanup.</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/60 p-3 space-y-1">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Per-link cap</p>
                <p className="text-sm font-semibold text-foreground">{diagnostics.maxItemsPerSession} items</p>
                <p>Oldest items above this cap are trimmed first per link.</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/60 p-3 space-y-1">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Approx storage</p>
                <p className="text-sm font-semibold text-foreground">{formatBytes(diagnostics.approxStorageBytes)}</p>
                <p>Total size of all stored files across all links.</p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr),minmax(0,1fr)]">
              <div>
                <h2 className="text-sm font-medium text-foreground mb-1">Recent cleanup events</h2>
                {diagnostics.cleanupEvents.length === 0 ? (
                  <p>No cleanup events recorded yet. They will appear here as the system trims old data.</p>
                ) : (
                  <ul className="space-y-1">
                    {diagnostics.cleanupEvents.map((event) => (
                      <li
                        key={event.id}
                        className="flex items-center justify-between rounded-lg border border-border/70 bg-background/40 px-3 py-2"
                      >
                        <div className="space-y-0.5">
                          <p className="text-foreground">
                            Removed {event.deleted_items} item{event.deleted_items === 1 ? "" : "s"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(event.created_at).toLocaleString()} · {formatBytes(event.deleted_bytes)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/60 p-4 space-y-2">
                <h2 className="text-sm font-medium text-foreground">Security & attempts</h2>
                <p>
                  Failed admin attempts in last hour: <span className="font-mono">{diagnostics.failedAttemptsLastHour}</span>
                </p>
                <p>
                  This count is tracked server-side by IP. Use it to spot suspicious guessing without exposing any
                  user-identifying data.
                </p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default AdminPage;
