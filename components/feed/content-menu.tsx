import { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
import type { ReportReason } from '@/lib/moderation';

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other', label: 'Other' },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  // Show "Delete" — true if you wrote this content, OR (for comments) you
  // own the post it's on, since post owners can moderate their own comments.
  canDelete: boolean;
  // Show "Report" + "Block" — true whenever it isn't your own content,
  // regardless of whether you can also delete it (e.g. a post owner can
  // both delete AND report/block someone else's comment on their post).
  showReportAndBlock: boolean;
  authorName: string;
  onDelete: () => void;
  onReport: (reason: ReportReason) => void;
  onBlock: () => void;
};

// The "..." action sheet used on both posts and comments.
export function ContentMenu({
  visible,
  onClose,
  canDelete,
  showReportAndBlock,
  authorName,
  onDelete,
  onReport,
  onBlock,
}: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [step, setStep] = useState<'menu' | 'report'>('menu');

  useEffect(() => {
    if (visible) setStep('menu');
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {step === 'menu' ? (
            <>
              {canDelete ? (
                <AnimatedPressable
                  style={styles.option}
                  onPress={() => {
                    onClose();
                    onDelete();
                  }}>
                  <Text style={[styles.optionText, styles.dangerText]}>Delete</Text>
                </AnimatedPressable>
              ) : null}

              {showReportAndBlock ? (
                <>
                  {canDelete ? <View style={styles.divider} /> : null}
                  <AnimatedPressable style={styles.option} onPress={() => setStep('report')}>
                    <Text style={styles.optionText}>Report</Text>
                  </AnimatedPressable>
                  <View style={styles.divider} />
                  <AnimatedPressable
                    style={styles.option}
                    onPress={() => {
                      onClose();
                      onBlock();
                    }}>
                    <Text style={[styles.optionText, styles.dangerText]}>Block {authorName}</Text>
                  </AnimatedPressable>
                </>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.sheetTitle}>Why are you reporting this?</Text>
              {REPORT_REASONS.map((reason, i) => (
                <View key={reason.value}>
                  {i > 0 ? <View style={styles.divider} /> : null}
                  <AnimatedPressable
                    style={styles.option}
                    onPress={() => {
                      onClose();
                      onReport(reason.value);
                    }}>
                    <Text style={styles.optionText}>{reason.label}</Text>
                  </AnimatedPressable>
                </View>
              ))}
            </>
          )}

          <View style={styles.cancelWrap}>
            <AnimatedPressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </AnimatedPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: RADII.lg,
      borderTopRightRadius: RADII.lg,
      paddingBottom: 24,
      paddingTop: 8,
    },
    sheetTitle: {
      fontSize: 12,
      fontWeight: WEIGHT.semibold,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: 12,
    },
    option: { paddingVertical: 16, alignItems: 'center' },
    optionText: { fontSize: 15, fontWeight: WEIGHT.medium, color: colors.text },
    dangerText: { color: colors.danger },
    divider: { height: 1, backgroundColor: colors.borderSoft },
    cancelWrap: { marginTop: 8, paddingHorizontal: 16 },
    cancelButton: {
      paddingVertical: 14,
      borderRadius: RADII.md,
      backgroundColor: colors.borderSoft,
      alignItems: 'center',
    },
    cancelText: { fontSize: 15, fontWeight: WEIGHT.semibold, color: colors.text },
  });
}
