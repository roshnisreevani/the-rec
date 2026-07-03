import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ACCENT_ROTATION, BORDER, COLORS, FONTS, RADII, textOnAccent } from '@/constants/style';
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
        <Text style={styles.empty}>
          {editing ? 'Nothing picked yet — search below.' : 'No sports claimed yet. Bold strategy.'}
        </Text>
      ) : (
        selected.map((value, index) => {
          const accent = ACCENT_ROTATION[index % ACCENT_ROTATION.length];
          return (
            <Pressable
              key={value}
              disabled={!editing}
              onPress={() => onToggle?.(value)}
              style={[styles.pill, { backgroundColor: accent }]}>
              <Text style={[styles.pillText, { color: textOnAccent(accent) }]}>
                {labelFor(value)}
                {editing ? '  ×' : ''}
              </Text>
            </Pressable>
          );
        })
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
        placeholderTextColor="#8A8378"
        value={query}
        onChangeText={setQuery}
      />

      {query.trim().length > 0 ? (
        suggestions.length > 0 ? (
          <View style={styles.wrap}>
            {suggestions.map((s) => (
              <Pressable
                key={s.value}
                onPress={() => {
                  onToggle?.(s.value);
                  setQuery('');
                }}
                style={styles.suggestionPill}>
                <Text style={styles.suggestionPillText}>+ {s.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>Nothing matches "{query}". Try "other".</Text>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    borderWidth: BORDER.width,
    borderColor: COLORS.ink,
    borderRadius: RADII.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pillText: { fontFamily: FONTS.bodyBold, fontSize: 13 },
  suggestionPill: {
    borderWidth: 1.5,
    borderColor: COLORS.ink,
    borderStyle: 'dashed',
    borderRadius: RADII.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.white,
  },
  suggestionPillText: { fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.ink },
  searchInput: {
    borderWidth: 1.5,
    borderColor: COLORS.ink,
    borderRadius: RADII.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.ink,
    backgroundColor: COLORS.white,
  },
  empty: { fontFamily: FONTS.body, fontStyle: 'italic', color: COLORS.ink, opacity: 0.6, fontSize: 13 },
});
