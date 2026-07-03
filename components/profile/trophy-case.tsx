import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ACCENT_ROTATION, BORDER, COLORS, FONTS, RADII, textOnAccent } from '@/constants/style';
import type { Trophy } from '@/lib/profile';

const QUICK_EMOJI = [
  '🔥', '🏆', '🎯', '🐌', '⭐', '💀', '😤', '🥎',
  '🏀', '⚽', '🎾', '🏓', '🥇', '👑', '🚀', '😅',
];

type EditProps = {
  editing: true;
  trophies: Trophy[];
  onAdd: (trophy: Omit<Trophy, 'id'>) => void;
  onRemove: (id: string) => void;
};

type ViewProps = {
  editing: false;
  trophies: Trophy[];
};

type Props = EditProps | ViewProps;

export function TrophyCase(props: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [icon, setIcon] = useState('🏆');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');

  const resetForm = () => {
    setIcon('🏆');
    setTitle('');
    setSubtitle('');
    setFormOpen(false);
  };

  const handleAdd = () => {
    if (!props.editing) return;
    if (!title.trim()) return;
    props.onAdd({ icon: icon.trim() || '🏆', title: title.trim(), subtitle: subtitle.trim() });
    resetForm();
  };

  return (
    <View style={styles.wrap}>
      {props.trophies.length === 0 ? (
        <Text style={styles.empty}>
          {props.editing ? 'No hardware yet — add your first dubious achievement.' : 'Case is empty. Humbling.'}
        </Text>
      ) : (
        <View style={styles.grid}>
          {props.trophies.map((trophy, index) => {
            const accent = ACCENT_ROTATION[index % ACCENT_ROTATION.length];
            const rotate = index % 2 === 0 ? '-3deg' : '3deg';
            const textColor = textOnAccent(accent);
            return (
              <View key={trophy.id} style={[styles.badge, { backgroundColor: accent, transform: [{ rotate }] }]}>
                {props.editing ? (
                  <Pressable style={styles.removeButton} onPress={() => props.onRemove(trophy.id)} hitSlop={8}>
                    <Text style={styles.removeButtonText}>×</Text>
                  </Pressable>
                ) : null}
                <Text style={styles.badgeIcon}>{trophy.icon}</Text>
                <Text style={[styles.badgeTitle, { color: textColor }]} numberOfLines={2}>
                  {trophy.title}
                </Text>
                {trophy.subtitle ? (
                  <Text style={[styles.badgeSubtitle, { color: textColor }]} numberOfLines={2}>
                    {trophy.subtitle}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {props.editing ? (
        formOpen ? (
          <View style={styles.form}>
            <Text style={styles.formLabel}>pick an icon</Text>
            <View style={styles.emojiRow}>
              {QUICK_EMOJI.map((e) => (
                <Pressable
                  key={e}
                  onPress={() => setIcon(e)}
                  style={[styles.emojiOption, icon === e && styles.emojiOptionActive]}>
                  <Text style={styles.emojiOptionText}>{e}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder="or type/paste any emoji"
              placeholderTextColor="#8A8378"
              value={icon}
              onChangeText={setIcon}
              maxLength={4}
            />
            <TextInput
              style={styles.input}
              placeholder="title — e.g. Showed up 10 weeks straight"
              placeholderTextColor="#8A8378"
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={styles.input}
              placeholder="subtitle — e.g. Attendance, mostly out of guilt"
              placeholderTextColor="#8A8378"
              value={subtitle}
              onChangeText={setSubtitle}
            />
            <View style={styles.formActions}>
              <Pressable onPress={resetForm} hitSlop={8}>
                <Text style={styles.cancelText}>cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.addButton, !title.trim() && styles.addButtonDisabled]}
                onPress={handleAdd}
                disabled={!title.trim()}>
                <Text style={styles.addButtonText}>add to case</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={styles.addTile} onPress={() => setFormOpen(true)}>
            <Text style={styles.addTileText}>+ add trophy</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  empty: { fontFamily: FONTS.body, fontStyle: 'italic', color: COLORS.ink, opacity: 0.6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, rowGap: 18 },
  badge: {
    width: '46%',
    minHeight: 118,
    borderWidth: BORDER.width,
    borderColor: COLORS.ink,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 64,
    borderBottomRightRadius: 14,
    borderBottomLeftRadius: 64,
    padding: 14,
    paddingTop: 18,
    gap: 3,
  },
  badgeIcon: { fontSize: 22 },
  badgeTitle: { fontFamily: FONTS.bodyBold, fontSize: 13 },
  badgeSubtitle: { fontFamily: FONTS.body, fontSize: 11, opacity: 0.9 },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.cream,
    borderWidth: 2,
    borderColor: COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  removeButtonText: { fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.ink, lineHeight: 14 },
  addTile: {
    borderWidth: BORDER.width,
    borderColor: COLORS.ink,
    borderStyle: 'dashed',
    borderRadius: RADII.md,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  addTileText: { fontFamily: FONTS.bodyBold, color: COLORS.ink, fontSize: 13 },
  form: {
    borderWidth: BORDER.width,
    borderColor: COLORS.ink,
    borderRadius: RADII.md,
    padding: 14,
    gap: 10,
    backgroundColor: COLORS.white,
  },
  formLabel: { fontFamily: FONTS.bodyBold, fontSize: 12, color: COLORS.ink, opacity: 0.7 },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emojiOption: {
    width: 36,
    height: 36,
    borderRadius: RADII.sm,
    borderWidth: 1.5,
    borderColor: COLORS.ink,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.cream,
  },
  emojiOptionActive: { backgroundColor: COLORS.mustard },
  emojiOptionText: { fontSize: 18 },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.ink,
    borderRadius: RADII.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: FONTS.body,
    fontSize: 14,
    color: COLORS.ink,
    backgroundColor: COLORS.cream,
  },
  formActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16 },
  cancelText: { fontFamily: FONTS.bodyMedium, color: COLORS.ink, opacity: 0.6, fontSize: 13 },
  addButton: {
    backgroundColor: COLORS.coral,
    borderWidth: BORDER.width,
    borderColor: COLORS.ink,
    borderRadius: RADII.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  addButtonDisabled: { opacity: 0.4 },
  addButtonText: { fontFamily: FONTS.bodyBold, color: COLORS.white, fontSize: 13 },
});
