import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Fragment } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { WEIGHT, type ThemeColors } from '@/constants/style';
import { useThemeColors } from '@/contexts/theme-context';

function renderInline(line: string, key: number, colors: ThemeColors) {
  const parts = line.split(/(\*\*.*?\*\*)/g).filter(Boolean);
  return (
    <Text key={key} style={{ color: colors.text, fontSize: 14, lineHeight: 21 }}>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <Text key={i} style={{ fontWeight: WEIGHT.bold }}>
            {part.slice(2, -2)}
          </Text>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </Text>
  );
}

export function LegalDocScreen({ title, content }: { title: string; content: string }) {
  const router = useRouter();
  const colors = useThemeColors();
  const blocks = content.split('\n\n');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
        </AnimatedPressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{title}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {blocks.map((block, i) => {
          if (block.startsWith('## ')) {
            return (
              <Text key={i} style={[styles.sectionTitle, { color: colors.text }]}>
                {block.replace('## ', '')}
              </Text>
            );
          }
          if (block.includes('\n- ')) {
            const lines = block.split('\n');
            return (
              <View key={i} style={{ gap: 4 }}>
                {lines.map((line, j) =>
                  line.startsWith('- ') ? (
                    <Text key={j} style={{ color: colors.text, fontSize: 14, lineHeight: 21 }}>
                      {'\u2022  '}
                      {line.replace('- ', '')}
                    </Text>
                  ) : (
                    renderInline(line, j, colors)
                  )
                )}
              </View>
            );
          }
          return renderInline(block, i, colors);
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 16, fontWeight: WEIGHT.bold },
  content: { padding: 20, paddingBottom: 60, gap: 16 },
  sectionTitle: { fontSize: 16, fontWeight: WEIGHT.bold, marginTop: 8 },
});
