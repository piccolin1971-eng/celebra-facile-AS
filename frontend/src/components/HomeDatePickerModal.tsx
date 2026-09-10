import React, { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { buildMonthCalendarDays, type CalendarDayEntry } from "../calendarMonth";
import { localDateStr, parseLocalDate } from "../dateUtils";

const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const WEEK_HEADERS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

type ThemeColors = {
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  primary: string;
  onPrimary: string;
  liturgicalGreen: string;
  liturgicalRed: string;
  liturgicalPurple: string;
  liturgicalWhite: string;
  liturgicalRose: string;
};

type Props = {
  visible: boolean;
  initialDateISO: string;
  colors: ThemeColors;
  fontSize: number;
  scaledFont: (n: number) => number;
  onPick: (dateISO: string) => void;
  onCancel: () => void;
};

function colorHex(colors: ThemeColors, liturgicalColor: string): string {
  switch (liturgicalColor) {
    case "bianco":
      return colors.liturgicalWhite;
    case "rosso":
      return colors.liturgicalRed;
    case "viola":
      return colors.liturgicalPurple;
    case "rosa":
      return colors.liturgicalRose;
    default:
      return colors.liturgicalGreen;
  }
}

export function HomeDatePickerModal({
  visible,
  initialDateISO,
  colors,
  fontSize,
  scaledFont,
  onPick,
  onCancel,
}: Props) {
  const initial = parseLocalDate(initialDateISO);
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth() + 1);

  useEffect(() => {
    if (!visible) return;
    const d = parseLocalDate(initialDateISO);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth() + 1);
  }, [visible, initialDateISO]);

  const monthDays = useMemo(
    () => buildMonthCalendarDays(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const firstWeekdayMon0 = (new Date(viewYear, viewMonth - 1, 1).getDay() + 6) % 7;
  const gridRows = useMemo(() => {
    const cells: Array<CalendarDayEntry | null> = [
      ...Array.from({ length: firstWeekdayMon0 }, () => null),
      ...monthDays,
    ];
    const rows: Array<Array<CalendarDayEntry | null>> = [];
    for (let i = 0; i < cells.length; i += 7) {
      const row = cells.slice(i, i + 7);
      while (row.length < 7) row.push(null);
      rows.push(row);
    }
    return rows;
  }, [firstWeekdayMon0, monthDays]);
  const styles = makeStyles(colors, fontSize);
  const webClickable = Platform.OS === "web" ? ({ cursor: "pointer" } as const) : undefined;

  const shiftMonth = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  };

  const todayISO = localDateStr(new Date());

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card} testID="home-date-picker">
          <View style={styles.header}>
            <TouchableOpacity
              style={[styles.navBtn, webClickable]}
              onPress={() => shiftMonth(-1)}
              accessibilityLabel="Mese precedente"
              testID="date-picker-prev-month"
            >
              <Ionicons name="chevron-back" size={scaledFont(50)} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>
              {MONTHS[viewMonth - 1]} {viewYear}
            </Text>
            <TouchableOpacity
              style={[styles.navBtn, webClickable]}
              onPress={() => shiftMonth(1)}
              accessibilityLabel="Mese successivo"
              testID="date-picker-next-month"
            >
              <Ionicons name="chevron-forward" size={scaledFont(50)} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEK_HEADERS.map((w) => (
              <Text key={w} style={styles.weekHeader}>
                {w}
              </Text>
            ))}
          </View>

          <ScrollView style={styles.gridScroll} contentContainerStyle={styles.gridBody}>
            {gridRows.map((row, rowIdx) => (
              <View key={`row-${rowIdx}`} style={styles.gridRow}>
                {row.map((day, colIdx) => {
                  if (!day) {
                    return <View key={`empty-${rowIdx}-${colIdx}`} style={styles.cell} />;
                  }
                  const isSelected = day.dateISO === initialDateISO;
                  const isToday = day.dateISO === todayISO;
                  const hex = colorHex(colors, day.liturgicalColor);
                  return (
                    <TouchableOpacity
                      key={day.dateISO}
                      style={[
                        styles.cell,
                        isSelected && styles.cellSelected,
                        isToday && !isSelected && styles.cellToday,
                        webClickable,
                      ]}
                      onPress={() => onPick(day.dateISO)}
                      testID={`date-picker-day-${day.dateISO}`}
                      accessibilityLabel={`${day.weekdayShort} ${day.dayNum}, ${day.title}`}
                    >
                      <View style={styles.cellInner}>
                        <View
                          style={[
                            styles.colorDot,
                            {
                              backgroundColor: hex,
                              borderWidth: day.liturgicalColor === "bianco" ? 1 : 0,
                              borderColor: colors.border,
                            },
                          ]}
                        />
                        <Text style={[styles.cellNum, isSelected && styles.cellNumSelected]}>
                          {day.dayNum}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.cancelBtn, webClickable]}
            onPress={onCancel}
            testID="date-picker-cancel"
          >
            <Text style={styles.cancelText}>Annulla</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ThemeColors, fontSize: number) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "center",
      padding: 20,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.border,
      padding: 16,
      maxHeight: "88%",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    navBtn: {
      padding: 8,
      minWidth: 44,
      alignItems: "center",
    },
    monthTitle: {
      fontSize: Math.round(fontSize * 1.38),
      fontWeight: "800",
      color: colors.textPrimary,
    },
    weekRow: {
      flexDirection: "row",
      marginBottom: 6,
    },
    weekHeader: {
      flex: 1,
      textAlign: "center",
      fontSize: Math.round(fontSize * 0.88),
      fontWeight: "700",
      color: colors.textSecondary,
    },
    gridScroll: { maxHeight: 374 },
    gridBody: { gap: 4 },
    gridRow: {
      flexDirection: "row",
      gap: 4,
    },
    cell: {
      flex: 1,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      paddingVertical: 4,
      paddingHorizontal: 2,
    },
    cellInner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    cellSelected: {
      backgroundColor: colors.primary,
    },
    cellToday: {
      borderWidth: 2,
      borderColor: colors.primary,
    },
    colorDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
    },
    cellNum: {
      fontSize: Math.round(fontSize * 1.09),
      fontWeight: "700",
      color: colors.textPrimary,
    },
    cellNumSelected: {
      color: colors.onPrimary,
    },
    cancelBtn: {
      marginTop: 12,
      alignSelf: "center",
      paddingVertical: 10,
      paddingHorizontal: 24,
    },
    cancelText: {
      fontSize: Math.round(fontSize * 1.14),
      fontWeight: "700",
      color: colors.textSecondary,
    },
  });
}
