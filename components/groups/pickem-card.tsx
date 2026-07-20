import { Calendar, MessageCircle, MoreHorizontal } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ContentMenu, type ReportReasonOption } from '@/components/moderation/content-menu';
import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import type { ReportReason } from '@/lib/moderation';
import {
  formatDeadline,
  isExpired,
  reportPickEm,
  votePickEm,
  type PickEm,
  type PickEmPerson,
  type PickEmSide,
} from '@/lib/pickem';

const PICKEM_REPORT_REASONS: ReportReasonOption[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment / Bullying' },
  { value: 'hate_speech', label: 'Hate speech' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'other', label: 'Other' },
];

type Props = {
  pickEm: PickEm;
  currentUserId: string;
  isGroupOwner: boolean;
  onChanged: () => void; // reload after a vote
  onOpenComments: () => void;
  onDelete: (pickEm: PickEm) => void; // parent owns confirm + optimistic removal
  onBlockCreator: (pickEm: PickEm) => void;
};

export function PickEmCard({
  pickEm,
  currentUserId,
  isGroupOwner,
  onChanged,
  onOpenComments,
  onDelete,
  onBlockCreator,
}: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [otherReasonOpen, setOtherReasonOpen] = useState(false);
  const [otherDetails, setOtherDetails] = useState('');
  const [reporting, setReporting] = useState(false);

  const isOwn = pickEm.createdBy === currentUserId;
  const canDelete = isOwn || isGroupOwner;
  const expired = isExpired(pickEm);

  const totalVotes = pickEm.votesA + pickEm.votesB;
  const pctA = totalVotes === 0 ? 50 : Math.round((pickEm.votesA / totalVotes) * 100);
  const canVote = !pickEm.amParticipant && !expired;

  const handleVote = async (side: PickEmSide) => {
    if (!canVote || busy) return;
    setBusy(true);
    try {
      await votePickEm(pickEm.id, currentUserId, side);
      onChanged();
    } catch (e) {
      Alert.alert('Could not save your pick', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submitReport = async (reason: ReportReason, details?: string | null) => {
    setReporting(true);
    try {
      await reportPickEm(currentUserId, pickEm.id, reason, details);
      Alert.alert('Reported', "Thanks for flagging this — we'll take a look.");
    } catch (e) {
      Alert.alert('Could not send report', errorMessage(e));
    } finally {
      setReporting(false);
      setOtherReasonOpen(false);
      setOtherDetails('');
    }
  };

  const handleReport = (reason: ReportReason) => {
    if (reason === 'other') {
      setOtherReasonOpen(true); // collect free text before submitting
      return;
    }
    submitReport(reason);
  };

  return (
    <View style={[styles.card, expired && styles.cardExpired]}>
      <View style={styles.headerRow}>
        <View style={styles.headerTextWrap}>
          {pickEm.title ? (
            <Text style={styles.title} numberOfLines={2}>
              {pickEm.title}
            </Text>
          ) : null}
          {expired ? (
            <View style={styles.expiredBadge}>
              <Text style={styles.expiredBadgeText}>EXPIRED</Text>
            </View>
          ) : pickEm.expiresAt ? (
            <View style={styles.deadlineRow}>
              <Calendar size={11} color={colors.textSecondary} strokeWidth={2} />
              <Text style={styles.deadlineText}>Voting ends {formatDeadline(pickEm.expiresAt)}</Text>
            </View>
          ) : null}
        </View>
        <Pressable hitSlop={10} onPress={() => setMenuOpen(true)}>
          <MoreHorizontal size={18} color={colors.textSecondary} strokeWidth={1.75} />
        </Pressable>
      </View>

      <View style={styles.matchupRow}>
        <SideStack people={pickEm.sideA} align="flex-start" muted={expired} styles={styles} />
        <Text style={styles.vs}>VS</Text>
        <SideStack people={pickEm.sideB} align="flex-end" muted={expired} styles={styles} />
      </View>

      {/* Two-segment tally bar: coral = A, blue = B */}
      <View style={styles.tallyBar}>
        <View style={[styles.tallyFillA, { width: `${pctA}%` }]} />
        <View style={styles.tallyFillB} />
      </View>
      <View style={styles.tallyLabels}>
        <Text style={styles.tallyLabelA}>
          {pickEm.votesA} pick{pickEm.votesA === 1 ? '' : 's'}
        </Text>
        <Text style={styles.tallyLabelB}>
          {pickEm.votesB} pick{pickEm.votesB === 1 ? '' : 's'}
        </Text>
      </View>

      {busy ? (
        <ActivityIndicator color={colors.text} style={styles.busy} />
      ) : expired ? (
        <Text style={styles.participantNote}>Voting closed.</Text>
      ) : canVote ? (
        <View style={styles.voteRow}>
          <AnimatedPressable
            style={[styles.voteButton, pickEm.myVote === 'a' ? styles.voteButtonAActive : styles.voteButtonIdle]}
            onPress={() => handleVote('a')}>
            <Text style={pickEm.myVote === 'a' ? styles.voteButtonActiveText : styles.voteButtonIdleText}>
              Pick A{pickEm.myVote === 'a' ? ' ✓' : ''}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.voteButton, pickEm.myVote === 'b' ? styles.voteButtonBActive : styles.voteButtonIdle]}
            onPress={() => handleVote('b')}>
            <Text style={pickEm.myVote === 'b' ? styles.voteButtonActiveText : styles.voteButtonIdleText}>
              Pick B{pickEm.myVote === 'b' ? ' ✓' : ''}
            </Text>
          </AnimatedPressable>
        </View>
      ) : (
        <Text style={styles.participantNote}>You&apos;re in this matchup — you can&apos;t vote on it.</Text>
      )}

      <AnimatedPressable style={styles.commentButton} onPress={onOpenComments} hitSlop={6}>
        <MessageCircle size={15} color={colors.blue} strokeWidth={1.75} />
        <Text style={styles.commentButtonText}>Comments</Text>
      </AnimatedPressable>

      <ContentMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        canDelete={canDelete}
        showReportAndBlock={!isOwn}
        authorName={pickEm.createdByName}
        onDelete={() => onDelete(pickEm)}
        onReport={handleReport}
        onBlock={() => onBlockCreator(pickEm)}
        reportReasons={PICKEM_REPORT_REASONS}
      />

      {/* Free-text detail for the "Other" report reason. */}
      <Modal
        visible={otherReasonOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setOtherReasonOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOtherReasonOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Tell us more (optional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="What's going on?"
              placeholderTextColor={colors.textSecondary}
              value={otherDetails}
              onChangeText={setOtherDetails}
              multiline
            />
            <AnimatedPressable
              style={styles.modalSubmit}
              onPress={() => submitReport('other', otherDetails)}
              disabled={reporting}>
              {reporting ? (
                <ActivityIndicator color={ON_ACCENT} size="small" />
              ) : (
                <Text style={styles.modalSubmitText}>Submit report</Text>
              )}
            </AnimatedPressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SideStack({
  people,
  align,
  muted,
  styles,
}: {
  people: PickEmPerson[];
  align: 'flex-start' | 'flex-end';
  muted: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={[styles.side, { alignItems: align }]}>
      {people.map((p) => (
        <View key={p.userId} style={[styles.person, muted && styles.personMuted]}>
          {p.avatarUrl ? (
            <Image source={{ uri: p.avatarUrl }} style={styles.personAvatar} />
          ) : (
            <InitialsAvatar name={p.name} size={30} />
          )}
          <Text style={styles.personName} numberOfLines={1}>
            {p.name}
          </Text>
        </View>
      ))}
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.lg,
      backgroundColor: colors.background,
      padding: 14,
      gap: 10,
      marginBottom: 12,
    },
    cardExpired: { opacity: 0.6 },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    headerTextWrap: { flex: 1, gap: 4 },
    title: { fontSize: 15, fontWeight: WEIGHT.bold, color: colors.text },
    deadlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    deadlineText: { fontSize: 11, color: colors.textSecondary },
    expiredBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.borderSoft,
      borderRadius: RADII.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    expiredBadgeText: { fontSize: 10, fontWeight: WEIGHT.bold, color: colors.textSecondary, letterSpacing: 0.4 },
    matchupRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    side: { flex: 1, gap: 6 },
    person: { flexDirection: 'row', alignItems: 'center', gap: 7, maxWidth: '100%' },
    personMuted: { opacity: 0.7 },
    personAvatar: { width: 30, height: 30, borderRadius: 15 },
    personName: { flexShrink: 1, fontSize: 13, fontWeight: WEIGHT.medium, color: colors.text },
    vs: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.textSecondary },
    tallyBar: {
      flexDirection: 'row',
      height: 8,
      borderRadius: 4,
      overflow: 'hidden',
      backgroundColor: colors.blue,
    },
    tallyFillA: { height: '100%', backgroundColor: colors.coral },
    tallyFillB: { flex: 1, height: '100%', backgroundColor: colors.blue },
    tallyLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    tallyLabelA: { fontSize: 11, fontWeight: WEIGHT.semibold, color: colors.coral },
    tallyLabelB: { fontSize: 11, fontWeight: WEIGHT.semibold, color: colors.blue },
    busy: { marginVertical: 4, alignSelf: 'flex-start' },
    voteRow: { flexDirection: 'row', gap: 10 },
    voteButton: { flex: 1, alignItems: 'center', borderRadius: RADII.md, paddingVertical: 10, borderWidth: 1 },
    voteButtonIdle: { borderColor: colors.border },
    voteButtonIdleText: { fontSize: 13, fontWeight: WEIGHT.semibold, color: colors.text },
    voteButtonAActive: { backgroundColor: colors.coral, borderColor: colors.coral },
    voteButtonBActive: { backgroundColor: colors.blue, borderColor: colors.blue },
    voteButtonActiveText: { fontSize: 13, fontWeight: WEIGHT.semibold, color: ON_ACCENT },
    participantNote: { fontSize: 12, fontStyle: 'italic', color: colors.textSecondary },
    commentButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
    commentButtonText: { fontSize: 13, fontWeight: WEIGHT.semibold, color: colors.blue },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
    },
    modalCard: {
      alignSelf: 'stretch',
      backgroundColor: colors.background,
      borderRadius: RADII.lg,
      padding: 20,
      gap: 12,
    },
    modalTitle: { fontSize: 15, fontWeight: WEIGHT.bold, color: colors.text },
    modalInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingHorizontal: 13,
      paddingVertical: 11,
      fontSize: 14,
      color: colors.text,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    modalSubmit: {
      backgroundColor: colors.coral,
      borderRadius: RADII.md,
      paddingVertical: 12,
      alignItems: 'center',
    },
    modalSubmitText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 14 },
  });
}
