import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from './Card';
import Label from './Label';
import Field from './Field';
import Button from './Button';
import { colors, fonts, radii } from '../theme';
import { useDonationCategories } from '../hooks/useDonationCategories';
import { useLanguage } from '../contexts/LanguageContext';
import { fmtAmount, fmtDateLong } from '../utils/format';
import type { DeclarationLineRequest } from '../services/donationApi';

/**
 * Lot T7 (décision J-1, JP 14/09) — SAISIE D'UNE DÉCLARATION MULTI-RUBRIQUES.
 *
 * <p>RECETTE 15/09 (JP) — LA VENTILATION EST UNE GRILLE FIXE, PLUS UNE LISTE À CONSTRUIRE.
 * Toutes les rubriques du référentiel sont affichées d'emblée, dans l'ordre du référentiel, et on
 * saisit les montants en une seule passe. Une rubrique laissée vide VAUT ZÉRO : elle n'a plus à
 * être ajoutée, choisie, ni retirée. Il n'y a donc plus de bouton « Ajouter une rubrique » ni de
 * sélecteur de rubrique.
 *
 * <p>⚠ UNE RUBRIQUE À ZÉRO N'EST JAMAIS ENVOYÉE. `don_declaration_line.amount` porte
 * `CHECK (amount > 0)` et `don_declaration.declared_total` aussi (13-don-declaration.sql) : une
 * ligne à 0 ferait échouer l'insertion entière. Le zéro est un fait d'AFFICHAGE ; `draftLinesToRequest`
 * filtre les lignes vides, et `firstDraftError` exige au moins un montant saisi.
 *
 * <p>Une date, UNE devise, N lignes « rubrique + montant », et un total CALCULÉ EN DIRECT à partir
 * des lignes : la personne ne saisit jamais le total elle-même. Le serveur exige malgré tout
 * `declaredTotal = Σ des lignes` (422 `DECLARED_TOTAL_MISMATCH`) — l'envoyer calculé, plutôt que
 * saisi, rend l'écart impossible par construction côté mobile.
 *
 * <p>Une seule devise par déclaration (J-1) : le sélecteur est donc au niveau du versement, pas de
 * la ligne. Un versement est fait en une monnaie ; mélanger deux devises dans un total le rendrait
 * faux, et aucun trésorier ne saurait quoi rapprocher.
 *
 * <p>AUCUN champ bancaire, aucun moyen de versement, aucune référence (décision D0-10) : le module
 * est 100 % déclaratif. Ne pas réintroduire de « Moyen » ni de « Référence » ici.
 *
 * <p>Partagé par `app/declare.tsx` (création) et `app/donation/edit/[id].tsx` (correction) — les
 * deux écrans saisissent exactement la même chose, et une correction ne doit pas offrir moins que
 * la déclaration initiale.
 */

export const DECLARATION_CURRENCIES = ['GBP', 'EUR', 'USD'];

/** Une ligne en cours de saisie. `id` n'existe que pour une ligne DÉJÀ enregistrée (correction). */
export interface DraftLine {
  /** Clé de rendu locale, stable tant que la ligne vit à l'écran. Jamais envoyée au serveur. */
  key: string;
  id?: string;
  category: string | null;
  /** Saisie brute : la virgule décimale est admise, la conversion se fait à l'envoi. */
  amount: string;
  note: string;
}

let lineCounter = 0;

export function newDraftLine(partial: Partial<DraftLine> = {}): DraftLine {
  lineCounter += 1;
  return { key: `l${lineCounter}`, category: null, amount: '', note: '', ...partial };
}

/** Montant d'une ligne, ou `NaN` si la saisie n'est pas un nombre exploitable. */
export function parseDraftAmount(raw: string): number {
  return Number.parseFloat(raw.replace(',', '.'));
}

/**
 * Total en direct. Somme en CENTIMES puis division : `0.1 + 0.2` en flottant donne
 * `0.30000000000000004`, que le serveur refuserait en `DECLARED_TOTAL_MISMATCH` face à des
 * montants de ligne arrondis à deux décimales.
 */
export function draftTotal(lines: DraftLine[]): number {
  const cents = lines.reduce((sum, l) => {
    const value = parseDraftAmount(l.amount);
    return Number.isFinite(value) && value > 0 ? sum + Math.round(value * 100) : sum;
  }, 0);
  return cents / 100;
}

/** Arrondi comptable à deux décimales — appliqué à chaque ligne comme au total. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Une rubrique qu'on n'a pas remplie. Vaut zéro, et ne part pas au serveur. */
export function isBlankAmount(raw: string): boolean {
  return raw.trim() === '';
}

/**
 * Aligne la ventilation sur le référentiel : UNE ligne par rubrique, dans l'ordre du référentiel.
 *
 * <p>Les lignes DÉJÀ saisies sont conservées telles quelles (montant, note, et surtout `id`, sans
 * lequel une correction renumérote la ligne comptable). Une rubrique sans ligne reçoit une ligne
 * vierge. Les lignes portant une rubrique ABSENTE du référentiel — désactivée depuis la
 * déclaration — sont conservées à la fin : les faire disparaître effacerait un montant déjà déclaré.
 *
 * <p>Renvoie la référence D'ORIGINE quand rien ne change : l'effet appelant peut donc comparer par
 * identité sans boucler.
 */
export function syncLinesToCategories(lines: DraftLine[], codes: string[]): DraftLine[] {
  const kept = new Set<string>();
  const next: DraftLine[] = [];
  for (const code of codes) {
    const existing = lines.filter((l) => l.category === code);
    if (existing.length > 0) {
      // Plusieurs lignes sur la même rubrique : donnée héritée de l'ancienne saisie libre. On les
      // garde toutes plutôt que de les fusionner — fusionner détruirait des lignes comptables.
      existing.forEach((l) => { next.push(l); kept.add(l.key); });
    } else {
      next.push(newDraftLine({ category: code }));
    }
  }
  for (const l of lines) {
    if (!kept.has(l.key) && l.category !== null) next.push(l);
  }
  const unchanged = next.length === lines.length && next.every((l, i) => l === lines[i]);
  return unchanged ? lines : next;
}

export type DraftError = 'NO_AMOUNT' | 'INVALID_AMOUNT';

/**
 * Premier défaut bloquant, ou `null` si la ventilation est envoyable.
 *
 * <p>Une rubrique vide est ignorée (elle vaut zéro). Ce qui est refusé : une saisie qui n'est pas
 * un nombre exploitable, et une déclaration où RIEN n'a été saisi — le serveur exige
 * `declared_total > 0`.
 */
export function firstDraftError(lines: DraftLine[]): DraftError | null {
  let filled = 0;
  for (const line of lines) {
    if (isBlankAmount(line.amount)) continue;
    const value = parseDraftAmount(line.amount);
    if (!Number.isFinite(value) || value <= 0 || !line.category) return 'INVALID_AMOUNT';
    filled += 1;
  }
  return filled === 0 ? 'NO_AMOUNT' : null;
}

/**
 * Ventilation prête à envoyer. `id` est conservé pour qu'une correction ACTUALISE la ligne
 * existante au lieu de la remplacer : le serveur renumérote sinon la ligne comptable associée.
 */
export function draftLinesToRequest(lines: DraftLine[]): DeclarationLineRequest[] {
  return lines
    // Les rubriques laissées vides valent zéro et NE PARTENT PAS : `CHECK (amount > 0)` en base.
    .filter((line) => !isBlankAmount(line.amount) && parseDraftAmount(line.amount) > 0)
    .map((line) => ({
      ...(line.id ? { id: line.id } : {}),
      category: line.category ?? undefined,
      amount: round2(parseDraftAmount(line.amount)),
      ...(line.note.trim() ? { note: line.note.trim() } : {}),
    }));
}

interface Props {
  date: Date;
  onDateChange: (d: Date) => void;
  currency: string;
  onCurrencyChange: (c: string) => void;
  lines: DraftLine[];
  onLinesChange: (lines: DraftLine[]) => void;
}

export default function DeclarationForm({
  date,
  onDateChange,
  currency,
  onCurrencyChange,
  lines,
  onLinesChange,
}: Props) {
  const { t } = useLanguage();
  const { categories, loading: catsLoading, labelOf, metaOf } = useDonationCategories();
  const [pickingDate, setPickingDate] = useState(false);

  const total = useMemo(() => draftTotal(lines), [lines]);

  // La ventilation SUIT le référentiel : une ligne par rubrique, créée dès qu'il arrive. C'est ce
  // qui remplace l'ancienne construction ligne à ligne. `syncLinesToCategories` rend la référence
  // d'origine quand rien ne change — la comparaison par identité suffit donc à ne pas boucler.
  useEffect(() => {
    if (categories.length === 0) return;
    const next = syncLinesToCategories(lines, categories.map((c) => c.code));
    if (next !== lines) onLinesChange(next);
  }, [categories, lines, onLinesChange]);

  const patchLine = (key: string, patch: Partial<DraftLine>) =>
    onLinesChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <>
      <Card style={styles.totalCard}>
        <Label style={{ color: colors.mossSoft, textAlign: 'center' }}>
          {t('declare.totalDeclared')}
        </Label>
        <Text style={styles.totalValue}>{fmtAmount(total, currency)}</Text>
        <Text style={styles.totalHint}>{t('declare.totalComputed')}</Text>
        <View style={styles.currencyRow}>
          {DECLARATION_CURRENCIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => onCurrencyChange(c)}
              style={[styles.currencyBtn, c === currency && styles.currencyBtnOn]}
            >
              <Text
                style={[styles.currencyText, { color: c === currency ? colors.moss : colors.ink3 }]}
              >
                {c}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.totalHint}>{t('declare.singleCurrency')}</Text>
      </Card>

      <View style={{ marginTop: 18 }}>
        <Label style={{ marginBottom: 8 }}>{t('declare.date')}</Label>
        <Card onPress={() => setPickingDate(true)} style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={20} color={colors.mossSoft} />
          <Text style={styles.dateText}>{fmtDateLong(date)}</Text>
          {isToday(date) && <Text style={styles.dateChip}>{t('common.today')}</Text>}
          <Ionicons name="chevron-down" size={16} color={colors.ink3} />
        </Card>
      </View>

      <View style={{ marginTop: 18 }}>
        <Label style={{ marginBottom: 8 }}>{t('declare.breakdown')}</Label>

        {catsLoading && categories.length === 0 && (
          <Text style={styles.hint}>{t('common.loading')}</Text>
        )}

        {/* Toutes les rubriques tiennent sur UNE ligne chacune : la grille complète est longue,
            et empiler intitulé + montant + note ferait défiler six fois pour un versement qui,
            le plus souvent, n'en concerne qu'une ou deux. La note ne s'ouvre donc qu'une fois un
            montant saisi — sans montant, elle n'a rien à annoter. Recette 15/09. */}
        <View style={{ gap: 8 }}>
          {lines.map((line) => {
            const meta = metaOf(line.category);
            const filled = !isBlankAmount(line.amount);
            return (
              <Card key={line.key} style={styles.lineCard}>
                <View style={styles.lineRow}>
                  <View style={[styles.lineIcon, { backgroundColor: meta.tone + '22' }]}>
                    <Ionicons name={meta.icon} size={15} color={meta.tone} />
                  </View>
                  {/* La rubrique n'est plus un choix : c'est l'INTITULÉ de la ligne. */}
                  <Text style={styles.lineCategory} numberOfLines={1}>
                    {line.category ? labelOf(line.category) : ''}
                  </Text>
                  <Text style={[styles.lineCurrency, filled && styles.lineCurrencyOn]}>
                    {symbolOf(currency)}
                  </Text>
                  <TextInput
                    value={line.amount}
                    onChangeText={(v) => patchLine(line.key, { amount: v.replace(/[^0-9.,]/g, '') })}
                    keyboardType="decimal-pad"
                    style={[styles.lineAmount, filled && styles.lineAmountOn]}
                    maxLength={9}
                    placeholder="0"
                    placeholderTextColor={colors.ink3}
                    accessibilityLabel={`${line.category ? labelOf(line.category) : ''} — ${t('declare.amount')}`}
                  />
                </View>

                {filled && (
                  <Field
                    value={line.note}
                    onChangeText={(v) => patchLine(line.key, { note: v })}
                    placeholder={t('declare.notePlaceholder')}
                    style={styles.lineNote}
                  />
                )}
              </Card>
            );
          })}
        </View>

      </View>

      <DatePickerModal
        visible={pickingDate}
        value={date}
        onClose={() => setPickingDate(false)}
        onChange={(d) => {
          onDateChange(d);
          setPickingDate(false);
        }}
      />

    </>
  );
}

function symbolOf(currency: string): string {
  return currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
}

/** Minuit local — comparaisons de jours sans dérive d'heure. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isToday(d: Date): boolean {
  return startOfDay(d).getTime() === startOfDay(new Date()).getTime();
}

/**
 * Sélecteur de date maison — aucune dépendance ajoutée : le dépôt n'embarque pas de
 * `datetimepicker`, et l'écran tient avec les primitives locales (`Card`, `Button`).
 *
 * Défaut F (14/09) : la date du don n'était pas saisissable. Seul le PASSÉ (ou le jour même)
 * est sélectionnable, en miroir du `@PastOrPresent` posé côté backend sur `donationDate` :
 * un jour futur est grisé et la navigation ne dépasse pas le mois courant. La garde serveur
 * reste la référence — celle-ci évite seulement un aller-retour en erreur.
 */
export function DatePickerModal({
  visible,
  value,
  onClose,
  onChange,
}: {
  visible: boolean;
  value: Date;
  onClose: () => void;
  onChange: (d: Date) => void;
}) {
  const { t } = useLanguage();
  const [cursor, setCursor] = useState(() => startOfMonth(value));

  // À chaque ouverture, le calendrier se repositionne sur le mois de la date déjà choisie.
  useEffect(() => {
    if (visible) setCursor(startOfMonth(value));
  }, [visible, value]);

  const today = startOfDay(new Date());
  const months = t('common.monthsLong').split(',');
  const weekdays = t('common.weekdayInitials').split(',');

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // semaine du lundi au dimanche
  const dayCount = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: dayCount }, (_, i) => i + 1),
  ];
  const canGoNext = startOfMonth(today).getTime() > cursor.getTime();
  const selected = startOfDay(value);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.pickerBackdrop} onPress={onClose}>
        <Pressable style={styles.pickerCard} onPress={() => {}}>
          <Text style={styles.pickerTitle}>{t('declare.pickDate')}</Text>

          <View style={styles.pickerHead}>
            <Pressable
              onPress={() => setCursor(new Date(year, month - 1, 1))}
              hitSlop={8}
              style={styles.navBtn}
            >
              <Ionicons name="chevron-back" size={18} color={colors.ink2} />
            </Pressable>
            <Text style={styles.pickerMonth}>
              {months[month]} {year}
            </Text>
            <Pressable
              onPress={() => canGoNext && setCursor(new Date(year, month + 1, 1))}
              hitSlop={8}
              disabled={!canGoNext}
              style={[styles.navBtn, !canGoNext && styles.navBtnOff]}
            >
              <Ionicons name="chevron-forward" size={18} color={colors.ink2} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {weekdays.map((w, i) => (
              <Text key={i} style={styles.weekCell}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.dayGrid}>
            {cells.map((day, i) => {
              if (day === null) return <View key={`e${i}`} style={styles.dayCell} />;
              const d = new Date(year, month, day);
              const future = d.getTime() > today.getTime();
              const on = d.getTime() === selected.getTime();
              return (
                <Pressable
                  key={day}
                  disabled={future}
                  onPress={() => onChange(d)}
                  style={styles.dayCell}
                >
                  <Text
                    style={[styles.dayText, on && styles.dayTextOn, future && styles.dayTextOff]}
                  >
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.pickerHint}>{t('declare.pickDateHint')}</Text>

          <View style={styles.pickerActions}>
            <Button
              label={t('common.today')}
              variant="ghost"
              onPress={() => onChange(today)}
              style={{ flex: 1 }}
            />
            <Button label={t('common.cancel')} onPress={onClose} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  totalCard: { paddingVertical: 22, paddingHorizontal: 22, marginTop: 18, alignItems: 'center' },
  totalValue: {
    fontFamily: fonts.serif,
    fontSize: 48,
    fontWeight: '500',
    color: colors.ink,
    letterSpacing: -1,
    marginTop: 8,
  },
  totalHint: {
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.ink3,
    marginTop: 8,
    textAlign: 'center',
  },
  currencyRow: {
    flexDirection: 'row',
    marginTop: 12,
    backgroundColor: 'rgba(42,38,32,0.05)',
    borderRadius: 99,
    padding: 3,
  },
  currencyBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99 },
  currencyBtnOn: {
    backgroundColor: colors.paper,
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 1,
  },
  currencyText: { fontFamily: fonts.mono, fontSize: 12, fontWeight: '600' },
  dateRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateText: { flex: 1, fontFamily: fonts.sans, fontSize: 15, fontWeight: '500', color: colors.ink },
  dateChip: { fontFamily: fonts.sans, fontSize: 12, color: colors.earthDeep, fontWeight: '700' },
  hint: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3, paddingVertical: 10 },
  lineCard: { paddingHorizontal: 12, paddingVertical: 9 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineCategory: {
    flex: 1,
    // `minWidth: 0` est INDISPENSABLE : sans lui, un enfant flex garde sa largeur intrinsèque
    // (`min-width: auto`) et, sur React Native Web, le <input> du montant refuse de rétrécir —
    // c'est alors l'intitulé qui se fait tronquer (« Offrande » coupé, recette 15/09).
    minWidth: 0,
    fontFamily: fonts.sans,
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.ink,
  },
  // Montant en retrait tant qu'il vaut zéro : la grille se lit d'un coup d'œil et les
  // rubriques effectivement servies ressortent seules.
  lineCurrency: { fontFamily: fonts.serif, fontSize: 15, color: colors.ink3 },
  lineCurrencyOn: { color: colors.ink2 },
  lineAmount: {
    // Largeur FIXE, pas un `minWidth` : le montant occupe une colonne constante (les chiffres
    // s'alignent d'une rubrique à l'autre) et ne réclame plus d'espace à l'intitulé.
    width: 86,
    minWidth: 0,
    textAlign: 'right',
    fontFamily: fonts.serif,
    fontSize: 19,
    fontWeight: '500',
    color: colors.ink3,
    paddingVertical: 0,
    letterSpacing: -0.3,
  },
  lineAmountOn: { color: colors.ink, fontSize: 21 },
  lineNote: { marginTop: 8, paddingVertical: 8, fontSize: 13 },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,18,14,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  pickerCard: {
    backgroundColor: colors.paper,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hair,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
  },
  pickerTitle: {
    fontFamily: fonts.serif,
    fontSize: 20,
    color: colors.ink,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  catRowLabel: { flex: 1, fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: colors.ink },
  pickerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  pickerMonth: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.sans,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
    textTransform: 'capitalize',
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mossTint,
  },
  navBtnOff: { opacity: 0.35 },
  weekRow: { flexDirection: 'row', marginTop: 12 },
  weekCell: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.ink3,
    textTransform: 'uppercase',
  },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  dayCell: { width: `${100 / 7}%`, height: 40, alignItems: 'center', justifyContent: 'center' },
  dayText: {
    width: 34,
    height: 34,
    lineHeight: 34,
    textAlign: 'center',
    borderRadius: 17,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.ink,
    overflow: 'hidden',
  },
  dayTextOn: { backgroundColor: colors.moss, color: colors.white, fontWeight: '700' },
  dayTextOff: { color: colors.ink3, opacity: 0.4 },
  pickerHint: {
    marginTop: 10,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: colors.ink3,
    textAlign: 'center',
  },
  pickerActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
});
