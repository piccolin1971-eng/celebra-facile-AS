/**
 * Paginazione Kindle su un singolo ScrollView (es. Orazionale).
 * Stessa logica di /celebra: micro-pagine da misure riga + maschera in basso.
 *
 * Evita il "vibrazione": una volta bloccate le misure non si ricalcola;
 * padding e stato UI non cambiano a ogni frame.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
  type ScrollView,
} from "react-native";
import {
  buildKindlePageStarts,
  fillLineGaps,
  findNearestPageIndex,
  measureDomTextLines,
  pageMaskHeight,
  quantizeLineBoxes,
  startsSignature,
  type LineBox,
} from "./kindlePages";

type Opts = {
  enabled: boolean;
  /** Cambia quando si apre un’altra preghiera o cambia il font. */
  resetKey: string;
  fontSize: number;
  tapAreaTestId?: string;
};

export function useKindleScrollPaging({
  enabled,
  resetKey,
  fontSize,
  tapAreaTestId = "orazionale-kindle-area",
}: Opts) {
  const scrollRef = useRef<ScrollView | null>(null);
  const viewportHRef = useRef(0);
  const contentHRef = useRef(0);
  const startsRef = useRef<number[]>([0]);
  const linesRef = useRef<LineBox[]>([]);
  const lockedRef = useRef(false);
  const microIdxRef = useRef(0);
  const nativeLinesRef = useRef<LineBox[]>([]);
  const rebuildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollYRef = useRef(0);
  const lastMaskRef = useRef(0);
  const lastUiRef = useRef({ index: 0, total: 1 });
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const [microPageUi, setMicroPageUi] = useState({ index: 0, total: 1 });
  const [maskH, setMaskH] = useState(0);

  const lineH = Math.max(20, Math.round(fontSize * 1.6));
  // Padding fisso indipendente dal font (stesso motivo di /celebra).
  const pageBottomPad = 960;
  const remeasuringRef = useRef(false);

  const getScrollHtmlEl = useCallback((): HTMLElement | null => {
    const ref = scrollRef.current as any;
    if (ref) {
      try {
        if (typeof ref.getScrollableNode === "function") {
          const n = ref.getScrollableNode() as HTMLElement;
          if (n) return n;
        }
        if (typeof ref.getInnerViewNode === "function") {
          const inner = ref.getInnerViewNode();
          const el =
            (inner?.parentElement as HTMLElement) || (inner as HTMLElement);
          if (el) return el;
        }
      } catch {
        /* ignore */
      }
    }
    if (typeof document === "undefined") return null;
    const area = document.querySelector(`[data-testid="${tapAreaTestId}"]`);
    if (!area) return null;
    const found = Array.from(area.querySelectorAll("div")).find(
      (d) =>
        (d as HTMLElement).scrollHeight >
          (d as HTMLElement).clientHeight + 40 &&
        (d as HTMLElement).clientHeight > 120,
    );
    return (found as HTMLElement) || null;
  }, [tapAreaTestId]);

  const collectLines = useCallback((): LineBox[] => {
    if (Platform.OS === "web") {
      const domLines = measureDomTextLines(getScrollHtmlEl());
      if (domLines.length >= 2) return quantizeLineBoxes(domLines);
    }
    if (nativeLinesRef.current.length >= 2) {
      return quantizeLineBoxes(fillLineGaps(nativeLinesRef.current));
    }
    const end = Math.max(0, contentHRef.current - pageBottomPad);
    const out: LineBox[] = [];
    for (let y = 0; y < end; y += lineH) {
      out.push({ y, height: lineH });
    }
    return quantizeLineBoxes(out);
  }, [getScrollHtmlEl, lineH, pageBottomPad]);

  const applyMicro = useCallback((mi: number, starts: number[], lines: LineBox[]) => {
    const safe = Math.max(0, Math.min(mi, starts.length - 1));
    microIdxRef.current = safe;
    const y = starts[safe] ?? 0;
    // Su web: clientHeight reale dello scroll (può differire da onLayout).
    if (Platform.OS === "web") {
      const el = getScrollHtmlEl();
      const live = el?.clientHeight ?? 0;
      if (live > 40) viewportHRef.current = live;
    }
    const vh = viewportHRef.current;
    const textEnd = lines.length
      ? lines[lines.length - 1].y + lines[lines.length - 1].height
      : Math.max(0, contentHRef.current - pageBottomPad);
    const nextMask = pageMaskHeight(starts, safe, lines, vh, textEnd);

    if (Math.abs(y - lastScrollYRef.current) > 0.5) {
      lastScrollYRef.current = y;
      scrollRef.current?.scrollTo?.({ y, animated: false });
    }

    const ui = { index: safe, total: Math.max(1, starts.length) };
    if (
      ui.index !== lastUiRef.current.index ||
      ui.total !== lastUiRef.current.total
    ) {
      lastUiRef.current = ui;
      setMicroPageUi(ui);
    }
    if (Math.abs(nextMask - lastMaskRef.current) > 1) {
      lastMaskRef.current = nextMask;
      setMaskH(nextMask);
    }
  }, [getScrollHtmlEl, pageBottomPad]);

  const rebuild = useCallback(
    (opts?: { force?: boolean; allowLock?: boolean }) => {
      if (!enabledRef.current) return;
      const vh = viewportHRef.current;
      if (vh <= 0) return;

      if (!opts?.force && lockedRef.current && startsRef.current.length > 0) {
        applyMicro(microIdxRef.current, startsRef.current, linesRef.current);
        return;
      }

      const lines = collectLines();
      if (lines.length < 2 && contentHRef.current < vh + 40) {
        // Contenuto corto / misure non pronte: una sola pagina, niente scroll.
        startsRef.current = [0];
        linesRef.current = lines;
        applyMicro(0, [0], lines);
        if (opts?.allowLock !== false && lines.length >= 2) {
          lockedRef.current = true;
        }
        return;
      }

      const textEnd = Math.max(
        Math.max(0, contentHRef.current - pageBottomPad),
        lines.length
          ? lines[lines.length - 1].y + lines[lines.length - 1].height
          : 0,
      );
      const starts = buildKindlePageStarts(lines, vh, textEnd);
      startsRef.current = starts;
      linesRef.current = lines;

      const allowLock = opts?.allowLock !== false;
      const span =
        lines.length >= 2
          ? lines[lines.length - 1].y +
            lines[lines.length - 1].height -
            lines[0].y
          : 0;
      // Blocca solo a richiesta e con misure decenti (evita freeze su A± precoce).
      if (allowLock) {
        if (lines.length >= 3 && (span >= vh * 0.4 || span >= textEnd * 0.4)) {
          lockedRef.current = true;
        }
      } else {
        lockedRef.current = false;
      }

      applyMicro(microIdxRef.current, starts, lines);
    },
    [applyMicro, collectLines, pageBottomPad],
  );

  const scheduleRebuild = useCallback((force?: boolean) => {
    if (!enabledRef.current) return;
    if (remeasuringRef.current && !force) return;
    // Se già bloccato, ignora i rebuild "soft" (layout/content che ritoccano).
    if (!force && lockedRef.current) return;
    if (rebuildTimerRef.current) clearTimeout(rebuildTimerRef.current);
    rebuildTimerRef.current = setTimeout(() => {
      rebuildTimerRef.current = null;
      rebuild(force ? { force: true } : undefined);
    }, 160);
  }, [rebuild]);

  // Reset a cambio preghiera / font: aspetta layout, due misure uguali, poi lock.
  useEffect(() => {
    if (!enabled) {
      lockedRef.current = false;
      remeasuringRef.current = false;
      lastScrollYRef.current = 0;
      lastMaskRef.current = 0;
      lastUiRef.current = { index: 0, total: 1 };
      setMaskH(0);
      setMicroPageUi({ index: 0, total: 1 });
      return;
    }
    lockedRef.current = false;
    remeasuringRef.current = true;
    startsRef.current = [0];
    linesRef.current = [];
    nativeLinesRef.current = [];
    microIdxRef.current = 0;
    lastScrollYRef.current = -1;
    lastMaskRef.current = -1;
    lastUiRef.current = { index: -1, total: -1 };
    setMicroPageUi({ index: 0, total: 1 });
    setMaskH(0);
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const measureOnce = () => {
      rebuild({ force: true, allowLock: false });
      return {
        sig: startsSignature(startsRef.current),
        n: linesRef.current.length,
      };
    };

    const finish = () => {
      if (cancelled) return;
      rebuild({ force: true, allowLock: true });
      lockedRef.current = true;
      remeasuringRef.current = false;
      applyMicro(0, startsRef.current, linesRef.current);
    };

    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        let attempts = 0;
        let prevSig = "";
        const poll = () => {
          if (cancelled) return;
          attempts += 1;
          const { sig, n } = measureOnce();
          if (n >= 3 && sig === prevSig && sig.length > 0) {
            finish();
            return;
          }
          prevSig = sig;
          if (attempts >= 8) {
            finish();
            return;
          }
          timers.push(setTimeout(poll, 200));
        };
        poll();
      }, 550),
    );

    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
      remeasuringRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo resetKey/enabled
  }, [enabled, resetKey]);

  useEffect(() => {
    return () => {
      if (rebuildTimerRef.current) clearTimeout(rebuildTimerRef.current);
    };
  }, []);

  const tapNext = useCallback(() => {
    if (!enabledRef.current) return;
    let starts = startsRef.current;
    if (!starts.length || (starts.length === 1 && !lockedRef.current)) {
      rebuild({ force: true });
      starts = startsRef.current;
    }
    let mi = microIdxRef.current;
    if (starts.length > 1) {
      const nearest = findNearestPageIndex(starts, lastScrollYRef.current);
      if (Math.abs((starts[mi] ?? 0) - lastScrollYRef.current) > 24) {
        mi = nearest;
        microIdxRef.current = mi;
      }
    }
    // A fine preghiera: stop (niente avanzamento oltre).
    if (mi + 1 < starts.length) {
      applyMicro(mi + 1, starts, linesRef.current);
    }
  }, [applyMicro, rebuild]);

  const tapPrev = useCallback(() => {
    if (!enabledRef.current) return;
    const starts = startsRef.current;
    if (!starts.length) return;
    let mi = microIdxRef.current;
    // Anche dall’ultima pagina: riallinea all’Y reale, poi torna indietro.
    const nearest = findNearestPageIndex(starts, lastScrollYRef.current);
    if (Math.abs((starts[mi] ?? 0) - lastScrollYRef.current) > 24) {
      mi = nearest;
    }
    microIdxRef.current = mi;
    if (mi > 0) {
      applyMicro(mi - 1, starts, linesRef.current);
    }
  }, [applyMicro]);

  const onLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      const h = e.nativeEvent.layout.height;
      const prev = viewportHRef.current;
      viewportHRef.current = h;
      if (!enabledRef.current) return;
      // Solo se l’altezza viewport cambia in modo significativo.
      if (Math.abs(h - prev) > 8) {
        if (lockedRef.current && prev > 0) {
          // Cambio reale (es. barra stato): forza un solo rebuild.
          lockedRef.current = false;
          scheduleRebuild(true);
        } else {
          scheduleRebuild();
        }
      } else if (!lockedRef.current) {
        scheduleRebuild();
      }
    },
    [scheduleRebuild],
  );

  const onContentSizeChange = useCallback(
    (_w: number, h: number) => {
      const prev = contentHRef.current;
      contentHRef.current = h;
      if (!enabledRef.current || lockedRef.current) return;
      if (Math.abs(h - prev) > 20 || prev === 0) {
        scheduleRebuild();
      }
    },
    [scheduleRebuild],
  );

  const onBodyTextLayoutWithOffset = useCallback(
    (offsetY: number) => (e: NativeSyntheticEvent<TextLayoutEventData>) => {
      if (!enabledRef.current || lockedRef.current) return;
      nativeLinesRef.current = (e.nativeEvent.lines || []).map((ln) => ({
        y: ln.y + offsetY,
        height: ln.height,
      }));
      scheduleRebuild();
    },
    [scheduleRebuild],
  );

  return {
    scrollRef,
    pageBottomPad,
    maskH,
    microPageUi,
    tapNext,
    tapPrev,
    onLayout,
    onContentSizeChange,
    onBodyTextLayoutWithOffset,
  };
}
