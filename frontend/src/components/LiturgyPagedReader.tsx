/**
 * Engine C — lettore a pagine discrete.
 * Misura i segmenti (anche durante A±), aspetta che altezze e viewport si
 * stabilizzino, spezza i troppi alti, poi mostra la micro-pagina.
 * Finché la misura nuova non è valida tiene l'impaginato precedente.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import {
  countPackableSegments,
  fillMissingSegmentHeights,
  isPackableSegmentKind,
  isSplittableSegment,
  packedPageMaxHeight,
  packedPagesCoverAllPackable,
  packSegmentIndicesIntoPages,
  splitSegmentForPaging,
  type SegmentPackMeta,
} from "../liturgyPaginationEngine";
import { DEFAULT_FONT_SIZE } from "../SettingsContext";

export type LiturgyPagedReaderProps = {
  segments: SegmentPackMeta[];
  microIndex: number;
  paddingBottom?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
  remountKey: string;
  fontSize?: number;
  renderSegment: (segment: SegmentPackMeta, segmentIndex: number) => React.ReactNode;
  onPagesReady: (totalPages: number) => void;
  onMeasuring?: (measuring: boolean) => void;
};

const MAX_EXPAND_PASSES = 80;
const MIN_CREDIBLE_VIEWPORT = 140;
const HEIGHT_STABLE_MS = 50;
const OVERFLOW_SLACK = 1.12;
const MAX_OVERFLOW_RETRIES = 3;

function segmentsSignature(segments: SegmentPackMeta[]): string {
  return segments
    .map((s) => `${s.kind}:${s.text?.length ?? 0}:${s.text?.slice(0, 32) ?? ""}:${s.packGroup ?? ""}`)
    .join("|");
}

export function LiturgyPagedReader({
  segments,
  microIndex,
  paddingBottom = 0,
  contentContainerStyle,
  remountKey,
  fontSize = DEFAULT_FONT_SIZE,
  renderSegment,
  onPagesReady,
  onMeasuring,
}: LiturgyPagedReaderProps) {
  const viewportHRef = useRef(0);
  const [layoutTick, setLayoutTick] = useState(0);
  const [pages, setPages] = useState<number[][] | null>(null);
  const heightsRef = useRef<Map<number, number>>(new Map());
  const [heightsTick, setHeightsTick] = useState(0);
  const [effectiveSegments, setEffectiveSegments] = useState(segments);
  const expandPassesRef = useRef(0);
  const overflowRetriesRef = useRef(0);
  const [measuring, setMeasuring] = useState(true);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const packGenRef = useRef(0);
  const contentSig = useMemo(() => segmentsSignature(segments), [segments]);

  const packableCount = useMemo(
    () => countPackableSegments(effectiveSegments),
    [effectiveSegments],
  );

  const onMeasuringRef = useRef(onMeasuring);
  const onPagesReadyRef = useRef(onPagesReady);
  onMeasuringRef.current = onMeasuring;
  onPagesReadyRef.current = onPagesReady;

  const paddingForPack = Math.max(16, paddingBottom * 0.35);

  const setMeasuringFlag = (m: boolean) => {
    setMeasuring(m);
    onMeasuringRef.current?.(m);
  };

  const allHeightsReady = () => {
    if (packableCount === 0) return false;
    const heights = heightsRef.current;
    if (heights.size < packableCount) return false;
    for (let i = 0; i < effectiveSegments.length; i++) {
      if (!isPackableSegmentKind(effectiveSegments[i]?.kind ?? "")) continue;
      const h = heights.get(i);
      if (h == null || h <= 0) return false;
    }
    return true;
  };

  const credibleViewport = () => {
    const vh = viewportHRef.current;
    return vh >= MIN_CREDIBLE_VIEWPORT ? vh : 0;
  };

  const tryPackPages = (allowIncomplete = false): boolean => {
    const vh = allowIncomplete
      ? (credibleViewport() || Math.max(MIN_CREDIBLE_VIEWPORT, viewportHRef.current) || 480)
      : credibleViewport();
    if (vh <= 0 || packableCount === 0) return false;

    if (!allHeightsReady()) {
      if (!allowIncomplete) return false;
      fillMissingSegmentHeights(effectiveSegments, heightsRef.current, fontSize);
    }

    const heights = heightsRef.current;
    const usable = Math.max(180, vh - paddingForPack);

    if (expandPassesRef.current < MAX_EXPAND_PASSES) {
      for (let i = 0; i < effectiveSegments.length; i++) {
        const seg = effectiveSegments[i];
        if (!isSplittableSegment(seg)) continue;
        const h = heights.get(i) ?? 0;
        if (h <= usable * 0.98) continue;

        const parts = splitSegmentForPaging(seg);
        if (parts.length <= 1) continue;

        expandPassesRef.current += 1;
        heightsRef.current = new Map();
        setHeightsTick(0);
        setMeasuringFlag(true);
        setEffectiveSegments([
          ...effectiveSegments.slice(0, i),
          ...parts,
          ...effectiveSegments.slice(i + 1),
        ]);
        return false;
      }
    }

    const packed = packSegmentIndicesIntoPages(effectiveSegments, heights, vh, {
      paddingBottom: paddingForPack,
    });
    if (!packedPagesCoverAllPackable(packed, effectiveSegments) && !allowIncomplete) {
      return false;
    }
    const maxPageH = packedPageMaxHeight(packed, heights);
    if (maxPageH > usable * OVERFLOW_SLACK && !allowIncomplete && expandPassesRef.current < MAX_EXPAND_PASSES) {
      return false;
    }

    setPages(packed);
    onPagesReadyRef.current(Math.max(1, packed.length));
    setMeasuringFlag(false);
    return true;
  };

  const schedulePack = () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    const snap = () =>
      `${viewportHRef.current}|${[...heightsRef.current.entries()]
        .map(([k, v]) => `${k}:${v.toFixed(1)}`)
        .join(",")}`;
    const first = snap();
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      if (snap() !== first) {
        schedulePack();
        return;
      }
      tryPackPages(false);
    }, HEIGHT_STABLE_MS);
  };

  useEffect(() => {
    packGenRef.current += 1;
    expandPassesRef.current = 0;
    overflowRetriesRef.current = 0;
    setEffectiveSegments(segments);
    heightsRef.current = new Map();
    setHeightsTick(0);
    setMeasuringFlag(true);
    const frame = requestAnimationFrame(() => {
      setLayoutTick((n) => n + 1);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
    // contentSig copre il contenuto; remountKey copre font/interlinea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remountKey, contentSig]);

  useEffect(() => {
    if (packableCount === 0) return;
    if (credibleViewport() <= 0) return;
    if (!allHeightsReady()) return;
    schedulePack();
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutTick, heightsTick, packableCount, effectiveSegments, paddingBottom]);

  useEffect(() => {
    if (!measuring) return;
    const gen = packGenRef.current;
    const timers = [
      setTimeout(() => {
        if (gen !== packGenRef.current) return;
        tryPackPages(false);
      }, 450),
      setTimeout(() => {
        if (gen !== packGenRef.current) return;
        tryPackPages(false);
      }, 1100),
      setTimeout(() => {
        if (gen !== packGenRef.current) return;
        if (tryPackPages(false)) return;
        tryPackPages(true);
      }, 2600),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remountKey, contentSig, measuring, effectiveSegments, paddingBottom]);

  const recordHeight = (index: number, height: number) => {
    if (!isPackableSegmentKind(effectiveSegments[index]?.kind ?? "")) return;
    const prev = heightsRef.current.get(index);
    if (prev != null && Math.abs(prev - height) < 0.5) return;
    heightsRef.current.set(index, height);
    setHeightsTick((n) => n + 1);
  };

  const ready = pages != null && pages.length > 0;
  const safeMicro = ready
    ? Math.max(0, Math.min(microIndex, pages!.length - 1))
    : 0;
  const visibleIndices = ready ? pages![safeMicro] ?? [] : [];
  const showMeasure = measuring || !ready;

  return (
    <View
      style={{ flex: 1, overflow: "hidden" }}
      collapsable={false}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h < MIN_CREDIBLE_VIEWPORT) return;
        if (Math.abs(h - viewportHRef.current) > 1) {
          viewportHRef.current = h;
          setLayoutTick((n) => n + 1);
        }
      }}
      testID="liturgy-paged-reader"
    >
      {ready ? (
        <View
          style={[contentContainerStyle, { paddingBottom }]}
          testID="liturgy-paged-visible"
          onLayout={(e) => {
            const contentH = e.nativeEvent.layout.height;
            const vh = viewportHRef.current;
            if (
              measuring ||
              vh < MIN_CREDIBLE_VIEWPORT ||
              contentH <= vh * OVERFLOW_SLACK ||
              overflowRetriesRef.current >= MAX_OVERFLOW_RETRIES
            ) {
              return;
            }
            overflowRetriesRef.current += 1;
            heightsRef.current = new Map();
            setMeasuringFlag(true);
            setLayoutTick((n) => n + 1);
          }}
        >
          {visibleIndices.map((j) => (
            <React.Fragment key={`vis-${j}`}>
              {renderSegment(effectiveSegments[j], j)}
            </React.Fragment>
          ))}
        </View>
      ) : null}
      {showMeasure ? (
        <View
          pointerEvents="none"
          collapsable={false}
          style={{
            position: "absolute",
            opacity: 0.02,
            left: 0,
            right: 0,
            top: 0,
            zIndex: -1,
          }}
          testID="liturgy-paged-measure"
          key={`measure-${remountKey}-${contentSig}`}
        >
          <View style={contentContainerStyle} collapsable={false}>
            {effectiveSegments.map((seg, j) => {
              if (!isPackableSegmentKind(seg.kind)) return null;
              return (
                <View
                  key={`m-${j}-${seg.kind}-${seg.text?.length ?? 0}`}
                  collapsable={false}
                  onLayout={(e) => {
                    const h = e.nativeEvent.layout.height;
                    if (h > 0) recordHeight(j, h);
                  }}
                >
                  {renderSegment(seg, j)}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}
