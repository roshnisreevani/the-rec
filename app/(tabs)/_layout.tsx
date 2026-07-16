import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router';
import { CirclePlus, Images, MessageSquare, User, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { useAuth } from '@/contexts/auth-context';
import { useThemeColors } from '@/contexts/theme-context';
import { fetchTotalUnreadCount } from '@/lib/banter';

// Not tied to any one screen's focus (the badge should stay accurate no
// matter which tab you're on), so this polls independently and a bit less
// aggressively than the open chat screen's own 4s poll.
const UNREAD_POLL_MS = 15000;

export default function TabLayout() {
  const colors = useThemeColors();
  const router = useRouter();
  const { session } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!session?.user.id) return;
    let cancelled = false;
    const poll = () => {
      fetchTotalUnreadCount()
        .then((count) => {
          if (!cancelled) setUnreadCount(count);
        })
        .catch(() => {});
    };
    poll();
    const timer = setInterval(poll, UNREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session?.user.id]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.coral,
        tabBarInactiveTintColor: colors.textSecondary,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
      }}>
      <Tabs.Screen
        name="profile"
        options={{
          title: 'My Locker',
          tabBarIcon: ({ color }) => <User size={24} color={color} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Teams',
          tabBarIcon: ({ color }) => <Users size={24} color={color} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="create-post-tab"
        options={{
          title: '',
          tabBarIcon: ({ color }) => <CirclePlus size={28} color={color} strokeWidth={1.75} />,
        }}
        listeners={{
          // The "+" tab never actually navigates to a tab screen — it opens
          // the create-post modal on top of whatever tab you're already on.
          tabPress: (e) => {
            e.preventDefault();
            router.push('/create-post');
          },
        }}
      />
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Scoreboard',
          tabBarIcon: ({ color }) => <Images size={24} color={color} strokeWidth={1.75} />,
        }}
      />
      <Tabs.Screen
        name="banter"
        options={{
          title: 'Banter',
          tabBarIcon: ({ color }) => <MessageSquare size={24} color={color} strokeWidth={1.75} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.coral },
        }}
      />
      {/*
        index.tsx and explore.tsx are leftover files from the default Expo template.
        This session's tools can't delete files from your project, so they're hidden
        from the tab bar here instead. Feel free to delete both files by hand.
      */}
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
