import React, { memo } from 'react';
import { View, Text, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { colors, fonts, radii } from '@/theme';
import type { TeachingBlock, TeachingRun } from '@/services/assemblyApi';

/**
 * Texte d'un chapitre, bloc par bloc — D-FIN-13 (JP 06/11), contrat 06/11 §3. Texte brut, aucun HTML interprété ; les
 * versets sont en carte, la référence dessous (maquette Enseignement, écran 4).
 *
 * <p>`onBlockLayout` donne la place de chaque bloc : la position de lecture est un INDEX de bloc, pas des pixels (la
 * reprise doit tenir sur un autre appareil et à une autre taille de texte). `memo` : défiler ne redessine pas le texte.
 */
const TeachingBlocks = memo(function TeachingBlocks({
  blocks,
  fontSize,
  onBlockLayout,
}: {
  blocks: TeachingBlock[];
  fontSize: number;
  onBlockLayout?: (index: number, top: number, height: number) => void;
}) {
  return (
    <View style={styles.root}>
      {blocks.map((block, i) => (
        <View
          key={i}
          onLayout={
            onBlockLayout
              ? (e: LayoutChangeEvent) => onBlockLayout(i, e.nativeEvent.layout.y, e.nativeEvent.layout.height)
              : undefined
          }
        >
          <Block block={block} fontSize={fontSize} />
        </View>
      ))}
    </View>
  );
});

export default TeachingBlocks;

/** Le gras a sa propre fonte (polices nommées par graisse, `app/_layout.tsx`), pour rester rendu sur Android. */
function Runs({ runs, serif }: { runs: TeachingRun[] | null | undefined; serif?: boolean }) {
  return (
    <>
      {(runs ?? []).map((run, i) => (
        <Text key={i} style={[run.bold ? (serif ? styles.boldSerif : styles.bold) : null, run.italic ? styles.italic : null]}>
          {run.text}
        </Text>
      ))}
    </>
  );
}

function Block({ block, fontSize }: { block: TeachingBlock; fontSize: number }) {
  const body = { fontSize, lineHeight: Math.round(fontSize * 1.56) };
  switch (block.type) {
    case 'h2':
      return (
        <Text
          accessibilityRole="header"
          style={[styles.h2, { fontSize: fontSize + 5, lineHeight: Math.round((fontSize + 5) * 1.24) }]}
        >
          <Runs runs={block.runs} serif />
        </Text>
      );
    case 'h3':
      return (
        <Text
          accessibilityRole="header"
          style={[styles.h3, { fontSize: fontSize + 2, lineHeight: Math.round((fontSize + 2) * 1.3) }]}
        >
          <Runs runs={block.runs} serif />
        </Text>
      );
    case 'verse':
      return (
        <View style={styles.verse}>
          <Text style={[styles.verseText, { fontSize: fontSize - 0.5, lineHeight: Math.round(fontSize * 1.5) }]}>
            <Runs runs={block.runs} serif />
          </Text>
          {!!block.reference && <Text style={styles.reference}>{block.reference}</Text>}
        </View>
      );
    case 'list':
      return (
        <View style={styles.list}>
          {(block.items ?? []).map((item, i) => (
            <View key={i} style={styles.item}>
              <Text style={[styles.body, body]}>•</Text>
              <Text style={[styles.body, styles.itemText, body]}>
                <Runs runs={item} />
              </Text>
            </View>
          ))}
        </View>
      );
    case 'p':
    default:
      return (
        <Text style={[styles.body, body]}>
          <Runs runs={block.runs} />
        </Text>
      );
  }
}

const styles = StyleSheet.create({
  root: { gap: 13 },
  body: { fontFamily: fonts.sans, color: colors.ink },
  bold: { fontFamily: 'Inter_700Bold' },
  boldSerif: { fontFamily: 'Fraunces_600SemiBold' },
  italic: { fontStyle: 'italic' },
  h2: { fontFamily: fonts.serif, color: colors.ink, marginTop: 8 },
  h3: { fontFamily: fonts.serif, color: colors.ink, marginTop: 4 },
  verse: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.paper,
    borderRadius: radii.md,
  },
  verseText: { fontFamily: fonts.serif, fontStyle: 'italic', color: colors.ink },
  reference: { fontFamily: fonts.sans, fontSize: 12.5, color: colors.ink2, marginTop: 7 },
  list: { gap: 6 },
  item: { flexDirection: 'row', gap: 8 },
  itemText: { flex: 1 },
});
