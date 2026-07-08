import { ChevronDown, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
import { SPORTS, type SportTag } from '@/lib/sports';

type Props = {
  value: SportTag | null;
  onChange: (value: SportTag | null) => void;
};

export function SportPickerField({ value, onChange }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = SPORTS.find((s) => s.value === value) ?? null;

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return SPORTS;
    return SPORTS.filter((s) => s.label.toLowerCase().includes(trimmed));
  }, [query]);

  const handleSelect = (tag: SportTag) => {
    onChange(tag);
    setQuery('');
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
  };

  return (
    <View>
      <AnimatedPressable style={styles.trigger} onPress={() => setOpen(true)}>
        {selected ? (
          <View style={styles.triggerSelected}>
            <Text style={styles.triggerSelectedText}>
              {selected.emoji} {selected.label}
            </Text>
            <Pressable hitSlop={8} onPress={handleClear}>
              <X size={16} color={colors.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>
        ) : (
          <Text style={styles.triggerPlaceholder}>What sport was this?</Text>
        )}
        <ChevronDown size={18} color={colors.textSecondary} strokeWidth={2} />
      </AnimatedPressable>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent={false}>
        <SafeAreaView style={styles.modalFlex} edges={['top']}>
          <View style={[styles.modalHeader, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
            <Text style={styles.modalTitle}>Pick a sport</Text>
            <AnimatedPressable onPress={() => setOpen(false)} hitSlop={12}>
              <X size={22} color={colors.text} strokeWidth={2} />
            </AnimatedPressable>
          </View>

          <TextInput
            style={styles.searchInput}
            placeholder="search sports, hobbies, activities…"
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.value}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <AnimatedPressable style={styles.row} onPress={() => handleSelect(item.value)}>
                <Text style={styles.rowText}>
                  {item.emoji} {item.label}
                </Text>
              </AnimatedPressable>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>Nothing matches "{query}". Try "other".</Text>
            }
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.background,
    },
    triggerPlaceholder: { fontSize: 15, color: colors.textSecondary },
    triggerSelected: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    triggerSelectedText: { fontSize: 15, fontWeight: WEIGHT.semibold, color: colors.text },
    modalFlex: { flex: 1, backgroundColor: colors.background },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: { fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    searchInput: {
      margin: 16,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.background,
    },
    row: {
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    rowText: { fontSize: 15, color: colors.text },
    empty: { textAlign: 'center', marginTop: 40, fontStyle: 'italic', color: colors.textSecondary },
  });
}
