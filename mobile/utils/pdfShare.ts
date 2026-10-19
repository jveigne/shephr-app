import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

/**
 * Impression et partage d'un document HTML en PDF A4 — factorisé pour le journal d'une assemblée
 * (`app/(tabs)/assembly/journal.tsx`) et le journal consolidé de la Hiérarchie (D-ASM-18, JP 08/10).
 *
 * - Web : `printAsync` ouvre la boîte d'impression du navigateur (« Enregistrer en PDF »).
 * - Natif : `printToFileAsync` → renommage (le destinataire reçoit un nom lisible) → feuille de
 *   partage (Fichiers, WhatsApp, e-mail).
 *
 * @returns 'printed' (web), 'shared', ou 'unavailable' quand le partage n'existe pas sur
 *          l'appareil — l'appelant prévient alors l'utilisateur dans sa langue.
 */
export async function printAndSharePdf({
  html,
  fileName,
  dialogTitle,
}: {
  html: string;
  fileName: string;
  dialogTitle: string;
}): Promise<'printed' | 'shared' | 'unavailable'> {
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return 'printed';
  }

  // A4 en points.
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  // ⚠ SDK 57 : `File.move` est ASYNCHRONE (l'ancien comportement s'appelle `moveSync`). Sans
  // `await`, le partage partait pendant le déplacement et livrait un PDF illisible (JP 08/10).
  // On partage la destination elle-même plutôt que de compter sur la mise à jour de `uri`.
  const target = new File(Paths.cache, fileName);
  await new File(uri).move(target, { overwrite: true });
  if (!target.exists || target.size === 0) throw new Error('JOURNAL_FILE_MISSING');
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  await Sharing.shareAsync(target.uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle,
  });
  return 'shared';
}
