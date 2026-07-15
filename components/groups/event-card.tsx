import { Calendar, MapPin, Trophy } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { InitialsAvatar } from '@/components/profile/initials-avatar';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { GOLD, ON_ACCENT, RADII, WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';
import { errorMessage } from '@/lib/error-message';
import {
  formatEventDate,
  isConcluded,
  isFull,
  rsvpToEvent,
  voteMvp,
  type GroupEvent,
  type RsvpStatus,
} from '@/lib/events';
import { SPORTS } from '@/lib/sports';

type Props = {
  event: GroupEvent;
  currentUserId: string;
  onChanged: () => void; // reload after any RSVP/vote write
};

/** Per-sport accent, rotated across the existing palette (coral/blue/gold)
 * so every sport gets a stable color without inventing new ones. */
function accentFor(sport: string | null, colors: ThemeColors): string {
  const idx = SPORTS.findIndex((s) => s.value === sport);
  if (idx < 0) return colors.blue;
  return [colors.coral, colors.blue, GOLD][idx % 3];
}

export function EventCard({ event, currentUserId, onChanged }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false); // re-open RSVP buttons
  const [changingVote, setChangingVote] = useState(false);
  const [attendeesOpen, setAttendeesOpen] = useState(false);

  const sportOption = SPORTS.find((s) => s.value === event.sport);
  const accent = accentFor(event.sport, colors);

  const concluded = isConcluded(event);
  const full = isFull(event);
  const nearFull =
    !full &&
    event.maxSpots !== null &&
    (event.maxSpots - event.attendingCount <= 2 || event.attendingCount / event.maxSpots >= 0.8);

  const spotsLabel =
    event.attendingCount === 0 && event.maxSpots === null
      ? "No one's in yet"
      : event.maxSpots === null
        ? `${event.attendingCount} going`
        : `${event.attendingCount} of ${event.maxSpots} spots filled`;
  const fillPct = event.maxSpots === null ? 0 : Math.min(100, (event.attendingCount / event.maxSpots) * 100);

  const MAX_FACES = 4;
  const visibleFaces = event.attendees.slice(0, MAX_FACES);
  const hiddenFaces = event.attendingCount - visibleFaces.length;
  const hasAnyResponse = event.attendees.length > 0 || event.decliners.length > 0;

  const handleRsvp = async (status: RsvpStatus) => {
    setBusy(true);
    try {
      await rsvpToEvent(event, currentUserId, status);
      setChanging(false);
      onChanged();
    } catch (e) {
      Alert.alert('Could not save your RSVP', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleVote = async (votedForId: string) => {
    setBusy(true);
    try {
      await voteMvp(event.id, currentUserId, votedForId);
      setChangingVote(false);
      onChanged();
    } catch (e) {
      Alert.alert('Could not save your vote', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const showRsvpButtons = !concluded && (event.myStatus === null || changing);
  const showVotePicker = concluded && (event.myVoteFor === null || changingVote);
  const leaderVotes = event.mvpTally[0]?.votes ?? 0;

  return (
    <View style={styles.card}>
      {/* Accent header band — the "sports card" face */}
      <View style={[styles.band, { backgroundColor: `${accent}1A`, borderLeftColor: accent }]}>
        <View style={styles.bandTopRow}>
          <Text style={[styles.bandSport, { color: accent }]}>
            {sportOption ? `${sportOption.emoji} ${sportOption.label.toUpperCase()}` : '🏟️ PICKUP'}
          </Text>
          {full ? (
            <View style={styles.fullPill}>
              <Text style={styles.fullPillText}>FULL</Text>
            </View>
          ) : nearFull ? (
            <View style={styles.nearFullPill}>
              <Text style={styles.nearFullPillText}>ALMOST FULL</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.bandTitle} numberOfLines={1}>
          {event.title}
        </Text>
      </View>

      <View style={styles.body}>
        <View style={styles.metaRow}>
          <Calendar size={13} color={colors.textSecondary} strokeWidth={1.75} />
          <Text style={styles.metaText}>{formatEventDate(event.eventDate)}</Text>
        </View>
        {event.location ? (
          <View style={styles.metaRow}>
            <MapPin size={13} color={colors.textSecondary} strokeWidth={1.75} />
            <Text style={styles.metaText} numberOfLines={1}>
              {event.location}
            </Text>
          </View>
        ) : null}

        <AnimatedPressable
          style={styles.attendRow}
          onPress={() => setAttendeesOpen(true)}
          disabled={!hasAnyResponse}>
          {visibleFaces.length > 0 ? (
            <View style={styles.facepile}>
              {visibleFaces.map((attendee, index) => (
                <View key={attendee.userId} style={[styles.faceWrap, index > 0 && styles.faceOverlap]}>
                  {attendee.avatarUrl ? (
                    <Image source={{ uri: attendee.avatarUrl }} style={styles.faceImage} />
                  ) : (
                    <InitialsAvatar name={attendee.name} size={26} />
                  )}
                </View>
              ))}
              {hiddenFaces > 0 ? (
                <View style={[styles.faceWrap, styles.faceOverlap, styles.moreBubble]}>
                  <Text style={styles.moreBubbleText}>+{hiddenFaces}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <Text style={[styles.spots, full && styles.spotsFull]}>{spotsLabel}</Text>
        </AnimatedPressable>
        {event.maxSpots !== null ? (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${fillPct}%`, backgroundColor: full ? colors.coral : accent },
              ]}
            />
          </View>
        ) : null}

        {busy ? (
          <ActivityIndicator color={colors.text} style={styles.busy} />
        ) : !concluded ? (
          showRsvpButtons ? (
            <View style={styles.buttonRow}>
              <AnimatedPressable
                style={[styles.primaryButton, full && event.myStatus !== 'attending' && styles.buttonDisabled]}
                onPress={() => handleRsvp('attending')}
                disabled={full && event.myStatus !== 'attending'}>
                <Text style={styles.primaryButtonText}>I&apos;m in</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.secondaryButton} onPress={() => handleRsvp('declined')}>
                <Text style={styles.secondaryButtonText}>Can&apos;t make it</Text>
              </AnimatedPressable>
            </View>
          ) : (
            <View style={styles.statusRow}>
              <View style={event.myStatus === 'attending' ? styles.statusChipIn : styles.statusChipOut}>
                <Text style={event.myStatus === 'attending' ? styles.statusChipInText : styles.statusChipOutText}>
                  {event.myStatus === 'attending' ? "You're in ✓" : 'Not going'}
                </Text>
              </View>
              <AnimatedPressable onPress={() => setChanging(true)} hitSlop={6}>
                <Text style={styles.changeText}>Change</Text>
              </AnimatedPressable>
            </View>
          )
        ) : (
          <View style={styles.mvpSection}>
            <View style={styles.mvpHeader}>
              <Trophy size={14} color={GOLD} strokeWidth={2} />
              <Text style={styles.mvpTitle}>MVP vote</Text>
            </View>

            {event.attendees.length === 0 ? (
              <Text style={styles.mvpEmpty}>No one RSVP&apos;d as attending — nothing to vote on.</Text>
            ) : showVotePicker ? (
              event.attendees.map((attendee) => (
                <View key={attendee.userId} style={styles.mvpRow}>
                  {attendee.avatarUrl ? (
                    <Image source={{ uri: attendee.avatarUrl }} style={styles.mvpAvatar} />
                  ) : (
                    <InitialsAvatar name={attendee.name} size={28} />
                  )}
                  <Text style={styles.mvpName} numberOfLines={1}>
                    {attendee.name}
                  </Text>
                  {attendee.userId === currentUserId ? (
                    <Text style={styles.mvpSelfNote}>that&apos;s you</Text>
                  ) : (
                    <AnimatedPressable style={styles.voteButton} onPress={() => handleVote(attendee.userId)}>
                      <Text style={styles.voteButtonText}>Vote</Text>
                    </AnimatedPressable>
                  )}
                </View>
              ))
            ) : (
              <>
                {event.mvpTally.length === 0 ? (
                  <Text style={styles.mvpEmpty}>No votes yet.</Text>
                ) : (
                  event.mvpTally.map((row) => (
                    <View key={row.userId} style={styles.mvpRow}>
                      {row.avatarUrl ? (
                        <Image source={{ uri: row.avatarUrl }} style={styles.mvpAvatar} />
                      ) : (
                        <InitialsAvatar name={row.name} size={28} />
                      )}
                      <Text style={styles.mvpName} numberOfLines={1}>
                        {row.votes === leaderVotes ? '👑 ' : ''}
                        {row.name}
                      </Text>
                      <Text style={styles.mvpVotes}>
                        {row.votes} vote{row.votes === 1 ? '' : 's'}
                      </Text>
                    </View>
                  ))
                )}
                <AnimatedPressable onPress={() => setChangingVote(true)} hitSlop={6}>
                  <Text style={styles.changeText}>Change my vote</Text>
                </AnimatedPressable>
              </>
            )}
          </View>
        )}
      </View>

      {/* Who's in / who's out */}
      <Modal visible={attendeesOpen} transparent animationType="fade" onRequestClose={() => setAttendeesOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAttendeesOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {event.title}
            </Text>
            <ScrollView contentContainerStyle={styles.modalList}>
              <Text style={styles.modalSection}>Going ({event.attendingCount})</Text>
              {event.attendees.length === 0 ? (
                <Text style={styles.modalEmpty}>No one yet.</Text>
              ) : (
                event.attendees.map((person) => (
                  <View key={person.userId} style={styles.personRow}>
                    {person.avatarUrl ? (
                      <Image source={{ uri: person.avatarUrl }} style={styles.personAvatar} />
                    ) : (
                      <InitialsAvatar name={person.name} size={30} />
                    )}
                    <Text style={styles.personName} numberOfLines={1}>
                      {person.name}
                    </Text>
                  </View>
                ))
              )}
              {event.decliners.length > 0 ? (
                <>
                  <Text style={styles.modalSection}>Can&apos;t make it ({event.decliners.length})</Text>
                  {event.decliners.map((person) => (
                    <View key={person.userId} style={styles.personRow}>
                      {person.avatarUrl ? (
                        <Image source={{ uri: person.avatarUrl }} style={styles.personAvatar} />
                      ) : (
                        <InitialsAvatar name={person.name} size={30} />
                      )}
                      <Text style={styles.personName} numberOfLines={1}>
                        {person.name}
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}
            </ScrollView>
            <AnimatedPressable style={styles.modalDone} onPress={() => setAttendeesOpen(false)}>
              <Text style={styles.modalDoneText}>Done</Text>
            </AnimatedPressable>
          </Pressable>
        </Pressable>
      </Modal>
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
      overflow: 'hidden',
      marginBottom: 12,
    },
    band: { borderLeftWidth: 3, paddingHorizontal: 14, paddingVertical: 10, gap: 3 },
    bandTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    bandSport: { fontSize: 11, fontWeight: WEIGHT.bold, letterSpacing: 0.6 },
    bandTitle: { fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text },
    fullPill: {
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    fullPillText: { fontSize: 10, fontWeight: WEIGHT.bold, color: ON_ACCENT },
    nearFullPill: {
      backgroundColor: GOLD,
      borderRadius: RADII.pill,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    nearFullPillText: { fontSize: 10, fontWeight: WEIGHT.bold, color: '#3A2E00' },
    body: { padding: 14, gap: 6 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    metaText: { fontSize: 12, color: colors.textSecondary, flexShrink: 1 },
    // Facepile row: overlapping avatars + the (now secondary) spots caption.
    attendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
    facepile: { flexDirection: 'row', alignItems: 'center' },
    faceWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 2,
      borderColor: colors.background,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    faceOverlap: { marginLeft: -10 },
    faceImage: { width: 26, height: 26, borderRadius: 13 },
    moreBubble: { backgroundColor: colors.borderSoft },
    moreBubbleText: { fontSize: 10, fontWeight: WEIGHT.bold, color: colors.textSecondary },
    spots: { flexShrink: 1, fontSize: 11, fontWeight: WEIGHT.semibold, color: colors.textSecondary },
    spotsFull: { color: colors.coral },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
    },
    modalCard: {
      alignSelf: 'stretch',
      maxHeight: '70%',
      backgroundColor: colors.background,
      borderRadius: RADII.lg,
      padding: 20,
      gap: 10,
    },
    modalTitle: { fontSize: 16, fontWeight: WEIGHT.bold, color: colors.text, textAlign: 'center' },
    modalList: { gap: 8 },
    modalSection: { fontSize: 12, fontWeight: WEIGHT.bold, color: colors.textSecondary, marginTop: 6 },
    modalEmpty: { fontSize: 13, fontStyle: 'italic', color: colors.textSecondary },
    personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
    personAvatar: { width: 30, height: 30, borderRadius: 15 },
    personName: { flex: 1, fontSize: 14, fontWeight: WEIGHT.medium, color: colors.text },
    modalDone: {
      marginTop: 4,
      backgroundColor: colors.coral,
      borderRadius: RADII.md,
      paddingVertical: 11,
      alignItems: 'center',
    },
    modalDoneText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 14 },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.borderSoft,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 3 },
    busy: { marginTop: 8, alignSelf: 'flex-start' },
    buttonRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
    primaryButton: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: colors.coral,
      borderRadius: RADII.md,
      paddingVertical: 10,
    },
    primaryButtonText: { color: ON_ACCENT, fontWeight: WEIGHT.semibold, fontSize: 13 },
    buttonDisabled: { opacity: 0.4 },
    secondaryButton: {
      flex: 1,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.md,
      paddingVertical: 10,
    },
    secondaryButtonText: { color: colors.text, fontWeight: WEIGHT.semibold, fontSize: 13 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
    statusChipIn: {
      borderWidth: 1,
      borderColor: colors.blue,
      borderRadius: RADII.pill,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    statusChipInText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.blue },
    statusChipOut: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADII.pill,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    statusChipOutText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.textSecondary },
    changeText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.textSecondary },
    mvpSection: { marginTop: 6, gap: 8 },
    mvpHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    mvpTitle: { fontSize: 13, fontWeight: WEIGHT.bold, color: colors.text },
    mvpEmpty: { fontSize: 12, fontStyle: 'italic', color: colors.textSecondary },
    mvpRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    mvpAvatar: { width: 28, height: 28, borderRadius: 14 },
    mvpName: { flex: 1, fontSize: 13, fontWeight: WEIGHT.medium, color: colors.text },
    mvpSelfNote: { fontSize: 11, fontStyle: 'italic', color: colors.textSecondary },
    voteButton: {
      backgroundColor: colors.coral,
      borderRadius: RADII.pill,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    voteButtonText: { fontSize: 12, fontWeight: WEIGHT.semibold, color: ON_ACCENT },
    mvpVotes: { fontSize: 12, fontWeight: WEIGHT.semibold, color: colors.textSecondary },
  });
}
