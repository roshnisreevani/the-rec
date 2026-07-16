import { X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
import { SPORTS, type SportTag } from '@/lib/sports';

const MAX_SUGGESTIONS = 20;

type Props = {
  editing: boolean;
  selected: SportTag[];
  onToggle?: (tag: SportTag) => void;
};

function labelFor(value: SportTag): string {
  return SPORTS.find((s) => s.value === value)?.label ?? value;
}

export function SportTagsField({ editing, selected, onToggle }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState('');

  const suggestions = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    return SPORTS.filter(
      (s) => s.label.toLowerCase().includes(trimmed) && !selected.includes(s.value)
    ).slice(0, MAX_SUGGESTIONS);
  }, [query, selected]);

  const selectedPills = (
    <View style={styles.wrap}>
      {selected.length === 0 ? (
        editing ? <Text style={styles.empty}>Nothing picked yet — search below.</Text> : null
      ) : (
        selected.map((value) => (
          <AnimatedPressable
            key={value}
            disabled={!editing}
            onPress={() => onToggle?.(value)}
            style={styles.pill}>
            <Text style={styles.pillText}>{labelFor(value)}</Text>
            {editing ? <X size={13} color={colors.text} strokeWidth={2.25} /> : null}
          </AnimatedPressable>
        ))
      )}
    </View>
  );

  if (!editing) return selectedPills;

  return (
    <View style={styles.container}>
      {selectedPills}

      <TextInput
        style={styles.searchInput}
        placeholder="search sports, hobbies, activities…"
        placeholderTextColor={colors.textSecondary}
        value={query}
        onChangeText={setQuery}
      />

      {query.trim().length > 0 ? (
        suggestions.length > 0 ? (
          <View style={styles.wrap}>
            {suggestions.map((s) => (
              <AnimatedPressable
                key={s.value}
                onPress={() => {
                  onToggle?.(s.value);
                  setQuery('');
                }}
                style={styles.suggestionPill}>
                <Text style={styles.suggestionPillText}>+ {s.label}</Text>
              </AnimatedPressable>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>Nothing matches "{query}". Try "other".</Text>
        )
      ) : null}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { gap: 10 },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderWidth: 1.5,
      borderColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 13,
      paddingVertical: 7,
      backgroundColor: colors.background,
    },
    pillText: { fontWeight: WEIGHT.semibold, fontSize: 13, color: colors.text },
    suggestionPill: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.background,
    },
    suggestionPillText: { fontWeight: WEIGHT.medium, fontSize: 12, color: colors.textSecondary },
    searchInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.text,
      backgroundColor: colors.background,
    },
    empty: { fontStyle: 'italic', color: colors.textSecondary, fontSize: 13 },
  });
}
