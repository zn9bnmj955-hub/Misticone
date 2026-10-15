"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyChanges, applyCommand, createIdGenerator, EngineError, type Change, type Command, type EngineState } from "@orgasport/engine";
import { getBrowserClient } from "@/lib/supabase/client";

/**
 * Scoring table state, offline first:
 * - every action is applied at once on this device with the same engine as
 *   the server, then queued (localStorage) and sent in order;
 * - nothing is lost when the network drops: the queue is retried until the
 *   server confirms (each action has an id, so a retry is never applied twice);
 * - other devices' changes arrive through a realtime broadcast.
 */

export interface TableTournament {
  id: string;
  code: string;
  name: string;
  status: string;
  sportSlug: string;
  teamFormat: string | null;
  startsAt: string | null;
  nameDisplay: "full" | "initials";
  maxTeams: number | null;
  clubName: string | null;
  city: string | null;
}

export interface Snapshot {
  version: number;
  actor: { kind: "account" | "pin"; label: string; canManageAccess?: boolean };
  tournament: TableTournament;
  state: EngineState;
}

export interface QueuedOp {
  clientOpId: string;
  at: string;
  command: Command;
}

export interface FailedOp {
  op: QueuedOp;
  code: string;
  details?: Record<string, string | number>;
}

const snapKey = (code: string) => `os_table_${code}`;
const outboxKey = (code: string) => `os_outbox_${code}`;

function read<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the in-memory queue still works this session.
  }
}

export function newOpId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function applyLocal(state: EngineState, op: QueuedOp): EngineState {
  return applyCommand(state, op.command, { now: op.at, newId: createIdGenerator(op.clientOpId), seed: op.clientOpId }).state;
}

export function useScoringTable(code: string) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [outbox, setOutbox] = useState<QueuedOp[]>([]);
  const [failed, setFailed] = useState<FailedOp[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [notice, setNotice] = useState<{ code: string; details?: Record<string, string | number> } | null>(null);
  const snapRef = useRef<Snapshot | null>(null);
  const outboxRef = useRef<QueuedOp[]>([]);
  const sendingRef = useRef(false);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(2000);

  const setSnapshot = useCallback(
    (s: Snapshot) => {
      snapRef.current = s;
      setSnap(s);
      write(snapKey(code), s);
    },
    [code],
  );
  const setQueue = useCallback(
    (q: QueuedOp[]) => {
      outboxRef.current = q;
      setOutbox(q);
      write(outboxKey(code), q);
    },
    [code],
  );

  // Restore what this device had (works offline).
  useEffect(() => {
    const cached = read<Snapshot>(snapKey(code));
    const queued = read<QueuedOp[]>(outboxKey(code)) ?? [];
    /* eslint-disable react-hooks/set-state-in-effect -- restoring device storage after hydration */
    if (cached) {
      snapRef.current = cached;
      setSnap(cached);
    }
    outboxRef.current = queued;
    setOutbox(queued);
    setOnline(navigator.onLine);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [code]);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/t/${code}/state`, { cache: "no-store" });
      if (res.status === 401) {
        setUnauthorized(true);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setSnapshot((await res.json()) as Snapshot);
      setOnline(true);
    } catch {
      setOnline(false);
    }
  }, [code, setSnapshot]);

  const flush = useCallback(async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSyncing(true);
    try {
      while (outboxRef.current.length > 0) {
        const op = outboxRef.current[0]!;
        let res: Response;
        try {
          res = await fetch(`/api/t/${code}/commands`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(op),
          });
        } catch {
          setOnline(false);
          break;
        }
        setOnline(true);
        if (res.status === 401) {
          setUnauthorized(true);
          break;
        }
        if (res.status === 409 || res.status === 429 || res.status >= 500) break; // retry later
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          version?: number;
          changes?: Change[];
          error?: { code: string; details?: Record<string, string | number> };
        };
        setQueue(outboxRef.current.slice(1));
        if (!res.ok || !body.ok) {
          setFailed((f) => [...f, { op, code: body.error?.code ?? "BAD_REQUEST", details: body.error?.details }]);
          await fetchState();
          continue;
        }
        const current = snapRef.current;
        if (current && body.version === current.version + 1 && body.changes) {
          setSnapshot({ ...current, version: body.version, state: applyChanges(current.state, body.changes) });
        } else if (current && body.version !== current.version) {
          await fetchState();
        }
      }
      backoffRef.current = 2000;
    } finally {
      sendingRef.current = false;
      setSyncing(false);
      if (outboxRef.current.length > 0) {
        if (retryRef.current) clearTimeout(retryRef.current);
        retryRef.current = setTimeout(() => void flush(), backoffRef.current);
        backoffRef.current = Math.min(backoffRef.current * 2, 30_000);
      }
    }
  }, [code, fetchState, setQueue, setSnapshot]);

  // First load, network events, periodic safety refresh.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void fetchState().then(() => flush());
    const goOnline = () => {
      setOnline(true);
      void flush().then(() => fetchState());
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const timer = setInterval(() => {
      if (outboxRef.current.length === 0) void fetchState();
      else void flush();
    }, 20_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(timer);
    };
  }, [fetchState, flush]);

  // Other devices' actions, live.
  useEffect(() => {
    const supabase = getBrowserClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`tournament:${code}`, { config: { private: true } })
      .on("broadcast", { event: "update" }, (msg) => {
        const v = (msg.payload as { version?: number })?.version ?? 0;
        if (snapRef.current && v <= snapRef.current.version) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          if (outboxRef.current.length === 0) void fetchState();
        }, 400);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [code, fetchState]);

  /** What the screen shows: server state + actions not yet confirmed. */
  const view = useMemo(() => {
    if (!snap) return null;
    let s = snap.state;
    for (const op of outbox) {
      try {
        s = applyLocal(s, op);
      } catch {
        // The server will refuse it too; it will show up in "À vérifier".
      }
    }
    return s;
  }, [snap, outbox]);

  const dispatch = useCallback(
    (command: Command): boolean => {
      if (!view) return false;
      const op: QueuedOp = { clientOpId: newOpId(), at: new Date().toISOString(), command };
      try {
        applyLocal(view, op);
      } catch (e) {
        if (e instanceof EngineError) {
          setNotice({ code: e.code, details: e.details });
          return false;
        }
        throw e;
      }
      setNotice(null);
      setQueue([...outboxRef.current, op]);
      void flush();
      return true;
    },
    [view, flush, setQueue],
  );

  const undo = useCallback(
    async (actionId: number): Promise<{ ok: boolean; error?: { code: string; details?: Record<string, string | number> } }> => {
      const res = await fetch(`/api/t/${code}/undo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionId, clientOpId: newOpId() }),
      }).catch(() => null);
      if (!res) {
        setNotice({ code: "BUSY" });
        return { ok: false, error: { code: "BUSY" } };
      }
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: { code: string; details?: Record<string, string | number> } };
      if (!body.ok) {
        const error = body.error ?? { code: "BAD_REQUEST" };
        setNotice(error);
        return { ok: false, error };
      }
      await fetchState();
      return { ok: true };
    },
    [code, fetchState],
  );

  return {
    snap,
    view,
    outbox,
    failed,
    online,
    syncing,
    unauthorized,
    notice,
    dispatch,
    undo,
    refresh: fetchState,
    clearNotice: () => setNotice(null),
    dismissFailed: () => setFailed([]),
  };
}

export type ScoringTable = ReturnType<typeof useScoringTable>;
