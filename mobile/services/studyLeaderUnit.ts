import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * D-BER-01 / RG-BER-17 (JP 29/10) — dernière assemblée choisie dans le sélecteur du Message de
 * Bertoua d'un dirigeant de plusieurs assemblées. Liée au COMPTE (`shephr.study.leaderUnit.v1.{userId}`),
 * jamais au jeton. Simple confort d'affichage : toute erreur de lecture / écriture est avalée
 * (mémoire illisible ou absente = choix par défaut, sans message).
 */
export function leaderUnitKey(userId: string): string {
  return `shephr.study.leaderUnit.v1.${userId}`;
}

export async function readLeaderUnit(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(leaderUnitKey(userId));
    return raw && raw.trim() ? raw : null;
  } catch {
    return null;
  }
}

export async function writeLeaderUnit(userId: string | null | undefined, unitId: string): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(leaderUnitKey(userId), unitId);
  } catch {
    // RG-BER-17 : sans mémoire, le choix par défaut s'appliquera au prochain lancement.
  }
}
