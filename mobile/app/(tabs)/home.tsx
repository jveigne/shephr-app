import React, { Children, useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, RefreshControl, Linking, Platform } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import ScreenShell from '@/components/ScreenShell';
import Card from '@/components/Card';
import Label from '@/components/Label';
import Amount from '@/components/Amount';
import { colors, fonts, radii } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import { canDeclareEvents, hasMemberGoals, isAttachedAccount, isMinistryWideGoals } from '@/services/authApi';
import { getSummary, type CurrencyTotal, type DonationSummary } from '@/services/statsApi';
import { fmtAmount, monthLabel } from '@/utils/format';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCityFollowUp } from '@/hooks/useCityFollowUp';
import { useTeachingHub, type TeachingResume } from '@/hooks/useTeachingHub';
import { cityOpen } from '@/utils/cityFollowUp';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export default function HomeScreen() {
  const { me, isLeader, isTreasurer, hasGoals, hasDonations, hasEvents, hasMemberCare, hasAssembly } = useAuth();
  const { t } = useLanguage();
  const [summary, setSummary] = useState<DonationSummary | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const attached = isAttachedAccount(me);
  // Contrat FIN §11.1 et maquette de l'accueil (JP 06/11) : compte non rattaché = Cantiques, Créer et « Rejoindre » seuls.
  // Un trésorier garde l'accès à sa Trésorerie : son affectation à un nœud ne passe pas par `goalUnitId`.
  const showDonations = hasDonations && (attached || isTreasurer);
  // D-FIN-12 (JP 06/11) : Bertoua, enseignements et Documents derrière une tuile « Enseignement » (règles dans le hook).
  const hub = useTeachingHub();
  // JP 28/10 — tuile « Suivi de la ville » (offre Néhémie, axe GÉOGRAPHIQUE) : villes de
  // `/study/localities` ∪ `/assembly/localities`, indépendante de la tuile Bertoua et du catalogue
  // d'étude (un LEADER / SECRETARIAT qui n'a que JOURNAL, un ministère sans étude la voient aussi).
  const { cities, reload: reloadCities } = useCityFollowUp();
  const onlyCity = cities.length === 1 ? cities[0] : null;
  const citiesLocked = cities.length > 0 && !cities.some(cityOpen);

  // `hasDonations` arrive après coup (les modules accessibles sont chargés en asynchrone après le
  // token) : il DOIT être en dépendance, sinon `load` reste figé sur la valeur `false` du 1er rendu
  // et les données de dons ne se chargent jamais.
  const load = useCallback(async () => {
    if (!hasDonations) return; // module Dons non couvert par un abonnement : rien à charger
    // `listDonations` n'est plus appelé ici depuis le retrait de « Dons récents » (15/09) :
    // l'accueil n'a plus besoin que du résumé du mois.
    const [s] = await Promise.allSettled([getSummary()]);
    // Défaut B (14/09) : `/donations/stats/summary` était réservé aux dirigeants ; le 403 était
    // avalé ici et le bloc affichait « 0 » à un fidèle qui avait pourtant déclaré. Depuis le lot
    // T2 l'endpoint est ouvert à tout membre abonné, SCOPÉ SUR SES PROPRES DONS (périmètre de
    // trésorerie s'il est trésorier). Un échec résiduel se dit désormais à l'écran.
    if (s.status === 'fulfilled') setSummary(s.value);
    setSummaryFailed(s.status === 'rejected');
  }, [hasDonations]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([load(), hub.reload(), reloadCities()]);
    } finally {
      setRefreshing(false);
    }
  };

  const firstName = (me?.fullName ?? '').split(' ')[0] || '';
  const initials = (me?.fullName ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

  // Défaut D (14/09) : l'accueil ne suppose plus une devise unique. La déclaration accepte
  // GBP/EUR/USD : un total « toutes devises confondues » n'a aucun sens comptable, on affiche
  // donc UNE LIGNE PAR DEVISE. L'objectif annuel en dur (3 000 £) est retiré : il n'est
  // paramétrable nulle part, il ne doit donc pas être montré.
  const monthLines = buildMonthLines(summary);
  const yearLines = sortedTotals(summary?.yearToDate);

  const today = new Date();

  // Lot S1 (21/07) : brique visible de TOUS ; le contenu de l'écran s'adapte au rôle (listes scopées
  // côté backend). Sa place change selon le rattachement : voir les lignes ci-dessous.
  const createTile = (
    <Tile
      label={t('dashboard.tiles.structure')}
      hint={t('dashboard.tiles.structureHint')}
      icon="add"
      tone={colors.moss}
      onPress={() => router.push('/structure')}
    />
  );

  const teachingTile = buildTeachingTile(hub, t);

  return (
    <ScreenShell
      refreshControl={
        <RefreshControl tintColor={colors.moss} refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.date}>
            {monthLabel(today.getMonth(), true).charAt(0).toUpperCase() +
              monthLabel(today.getMonth(), true).slice(1)}{' '}
            {today.getDate()}, {today.getFullYear()}
          </Text>
          <Text style={styles.greeting}>
            {t('dashboard.welcomeBack')}{'\n'}
            <Text style={styles.greetingItalic}>{firstName || '…'}</Text>.
          </Text>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/profile')} style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || '·'}</Text>
        </Pressable>
      </View>

     {/* <View style={styles.verseCard}>
        <Text style={styles.verseText}>
          {t('dashboard.verse')}
        </Text>
        <Text style={styles.verseRef}>{t('dashboard.verseRef')}</Text>
      </View>*/}

      {/* Feature A — le simple membre accède aussi à SES objectifs depuis l'accueil.
          Défaut A (14/09) : cette tuile était conditionnée par `!hasDonations` et disparaissait
          dès l'activation du module Dons. Le but quinquennal est CENTRAL : elle reste affichée
          quoi qu'il arrive. Ne jamais la re-conditionner sur un abonnement Dons. */}
      {(hasGoals || hasMemberGoals(me)) && (
        <Card onPress={() => router.push('/(tabs)/goals')} style={styles.scopeCta}>
          <Ionicons name="flag" size={26} color={colors.white} />
          <View style={{ flex: 1 }}>
            <Text style={styles.scopeTitle}>{t('dashboard.myGoals')}</Text>
            <Text style={styles.scopeSub}>{t('dashboard.myGoalsSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.white} />
        </Card>
      )}

      {/* Maquette de l'accueil (JP 06/11) — compte non rattaché : une invitation à rejoindre, à la
          place de « Mes objectifs ». */}
      {!!me && !attached && (
        <Card onPress={() => router.push('/(auth)/join')} style={[styles.scopeCta, { backgroundColor: colors.mossSoft }]}>
          <Ionicons name="home-outline" size={26} color={colors.white} />
          <View style={{ flex: 1 }}>
            <Text style={styles.scopeTitle}>{t('dashboard.joinTitle')}</Text>
            <Text style={styles.scopeSub}>{t('dashboard.joinHint')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.white} />
        </Card>
      )}

      {/* Plan FIN §5.3 (JP 06/11) — pleine largeur sous « Mes objectifs », seulement s'il y a quelque chose à faire. */}
      {!!hub.resume && <ResumeCard resume={hub.resume} />}

      {/* §5.3 du plan FIN (JP 06/11) — l'accueil se lit par lignes, dans cet ordre :
          1) Enseignement, Cantiques ; 2) Suivi de la ville s'il l'a, Hiérarchie ;
          3) Créer une assemblée, Déclarer un évènement ; 4) Déclarer un don, Trésorerie.
          Une tuile seule sur sa ligne prend toute la largeur (`TileRow`). */}
      <View style={styles.tileGrid}>
        <TileRow>
          {/* D-FIN-12 (JP 06/11) — la tuile Enseignement remplace « Le Message de Bertoua » (plan 21/10 §6.3, D-ETU-54) et
              « Documents » (plan 18/10, D-DOC-14). Conditions de chaque entrée inchangées (`useTeachingHub`). Pastille
              « En cours » conservée tant qu'une séance est ouverte. */}
          {teachingTile}
          {/* §5.3 du plan FIN (JP 06/11) : ouvre CMFIPraise si elle est installée, sinon son store ;
              plus de fenêtre intermédiaire. */}
          <Tile
            label={t('dashboard.tiles.cantique')}
            hint={t('dashboard.tiles.cantiqueHint')}
            icon="musical-notes-outline"
            tone={colors.earthDeep}
            onPress={openCantiques}
          />
          {/* Maquette de l'accueil (JP 06/11) : compte non rattaché, Cantiques et Créer sur une ligne. */}
          {!attached && createTile}
        </TileRow>

        <TileRow>
          {/* JP 28/10 — « Suivi de la ville » : Bertoua, Journal de la ville et Évènements des villes
              dont le compte est responsable (liste vide pour un membre / dirigeant d'unité, D-ABO-21).
              Pastille « Offre Néhémie » si aucune ville n'ouvre de suivi ; aucun prix (D-OFF-09). */}
          {cities.length > 0 && (
          <Tile
            label={t('study.city.entry')}
            hint={cityTileHint(me, cities, t)}
            icon="business-outline"
            tone={colors.mossDeep}
            badge={citiesLocked ? t('dashboard.tiles.cityLocked') : undefined}
            onPress={() =>
              router.push(onlyCity ? { pathname: '/study/city', params: { localityId: onlyCity.localityId } } : '/study/city')
            }
          />
          )}
          {/* RDG 25/07 : la Hiérarchie est un outil de dirigeant, sans objet pour le simple fidèle.
              §5.3 bis du plan FIN (JP 06/11) : la tuile Membres est retirée de l'accueil ; le même
              écran s'ouvre depuis la Hiérarchie et depuis le Suivi de la ville. */}
          {isLeader && (
          <Tile
            label={t('dashboard.tiles.hierarchie')}
            hint={t('dashboard.tiles.hierarchieHint')}
            icon="git-network-outline"
            tone="#7A8B6F"
            onPress={() => router.push('/hierarchie')}
          />
          )}
        </TileRow>

        <TileRow>
          {attached && createTile}
          {/* Plan 14/10 (§6.3, spec Recensement §4.1). RG-06 : invisible sans l'abonnement EVENTS
              (D-EVT-05). RG-ACT-01 : réservée aux comptes rattachés (`canDeclareEvents`) ; l'écran
              relit `canDeclare` côté serveur. D-EVT-14 : pour le simple membre, cet écran est sa vue
              d'assemblée, son « Mes actions ».
              D-FIN-11 (JP 06/11) : « Évènements » quitte la barre du bas ; la tuile, renommée
              « Déclarer un évènement », ouvre l'écran, qui contient déjà la déclaration. */}
          {hasEvents && canDeclareEvents(me) && (
          <Tile
            label={t('dashboard.tiles.events')}
            hint={t('dashboard.tiles.eventsHint')}
            icon="megaphone-outline"
            tone={colors.clay}
            onPress={() => router.push('/(tabs)/events')}
          />
          )}
          {/* D-FIN-11 (JP 06/11, écart du plan FIN §11) : « Brebis » s'ouvre depuis l'onglet Assemblées, absent quand
              le ministère a coupé ASSEMBLY (D-OFF-01). MEMBER_CARE reste alors actif : cette tuile est son accès.
              Le contrôle `!hasAssembly` évite un doublon avec l'entrée de l'écran Assemblées. */}
          {isLeader && hasMemberCare && !hasAssembly && (
          <Tile
            label={t('tabs.care')}
            hint={t('dashboard.tiles.careHint')}
            icon="heart-outline"
            tone={colors.mossDeep}
            onPress={() => router.push('/(tabs)/care')}
          />
          )}
        </TileRow>
      </View>

      {/* D-FIN-10 (JP 06/11) — carte « Vos dons ce mois-ci » juste au-dessus de la ligne Dons, et
          cliquable : depuis que « Déclarations » a quitté la barre du bas (D-FIN-11), elle en est
          l'accès. Fond sombre de la maquette de l'accueil. */}
      {showDonations && (
      <Card style={styles.hero} onPress={() => router.push('/(tabs)/donations')}>
        <View style={styles.heroTop}>
          <Label style={{ color: colors.white }}>{t('dashboard.thisMonth')}</Label>
          <Ionicons name="chevron-forward" size={18} color={colors.white} />
        </View>
        {summaryFailed ? (
          <Text style={styles.heroEmpty}>{t('dashboard.summaryUnavailable')}</Text>
        ) : monthLines.length === 0 ? (
          <Text style={styles.heroEmpty}>{t('dashboard.noneThisMonth')}</Text>
        ) : (
          monthLines.map((line, i) => (
            <View key={line.currency} style={i > 0 ? styles.extraCurrency : undefined}>
              <Amount
                value={line.total}
                currency={line.currency}
                size={i === 0 ? 46 : 28}
                showDecimals
                color={colors.white}
                subColor={colors.parchment}
              />
              <View style={styles.diffRow}>
                <Ionicons
                  name={line.diff >= 0 ? 'arrow-up' : 'arrow-down'}
                  size={14}
                  color={line.diff >= 0 ? colors.parchment : colors.earth}
                />
                <Text
                  style={[
                    styles.diffPct,
                    { color: line.diff >= 0 ? colors.parchment : colors.earth },
                  ]}
                >
                  {line.diff >= 0 ? '+' : '\u2212'}
                  {Math.abs(line.diffPct)}%
                </Text>
                <Text style={styles.diffNote}>
                  {t('dashboard.vsLastMonth', { amount: fmtAmount(line.lastTotal, line.currency) })}
                </Text>
              </View>
            </View>
          ))
        )}

        {yearLines.length > 0 && (
          <>
            <View style={styles.heroDivider} />
            <Label style={{ color: colors.white }}>{t('dashboard.yearTotal')}</Label>
            {yearLines.map((y) => (
              <View key={y.currency} style={styles.yearRow}>
                <Amount value={y.total} currency={y.currency} size={24} showDecimals color={colors.white} subColor={colors.parchment} />
              </View>
            ))}
          </>
        )}
      </Card>
      )}

      {showDonations && (
      <View style={[styles.tileGrid, { marginTop: 12 }]}>
        <TileRow>
          <Tile
            label={t('dashboard.tiles.declare')}
            hint={t('dashboard.tiles.declareHint')}
            icon="heart-outline"
            tone={colors.mossSoft}
            onPress={() => router.push('/declare')}
          />
          {/* JP 15/09 — la Trésorerie était une carte pleine largeur en BAS de l'accueil, sous les
              dons récents : il fallait défiler tout l'écran pour la trouver. En tuile, à côté de
              « Déclarer un don », elle se lit d'un coup d'œil. C'est aussi devenu son SEUL accès :
              l'onglet de la barre du bas a été masqué le même jour (voir `(tabs)/_layout.tsx`).
              Gaté sur `isTreasurer`, JAMAIS sur `isLeader` (lot T4, défaut C) : le rang pastoral
              ne confère rien côté Dons, et un dirigeant Goals récoltait sinon des 403 silencieux. */}
          {isTreasurer && (
          <Tile
            label={t('dashboard.tiles.treasury')}
            hint={t('dashboard.tiles.treasuryHint')}
            icon="wallet-outline"
            tone={colors.earthDeep}
            onPress={() => router.push('/(tabs)/leader')}
          />
          )}
        </TileRow>
      </View>
      )}

      {/* JP 15/09 — « Dons récents » retiré de l'accueil : la même liste, complète et
          filtrable, est l'objet de l'onglet « Déclarations ». La répéter ici allongeait l'écran
          sans rien apprendre, et reléguait les tuiles d'action au-dessus d'un long défilement. */}
    </ScreenShell>
  );
}

/**
 * Tuile « Enseignement » (D-FIN-12, plan FIN §5.3) : visible dès qu'une entrée l'est. Une seule entrée : son nom d'origine et
 * ouverture directe. Tant qu'une lecture est en cours, on n'annonce pas encore « une seule entrée » : le nom ne saute pas.
 */
function buildTeachingTile(hub: ReturnType<typeof useTeachingHub>, t: (key: string, options?: any) => string) {
  if (hub.entryCount === 0) return null;
  const badge = hub.studyLive ? t('study.tile.live') : undefined;
  if (hub.entryCount === 1 && !hub.pending) {
    const course = hub.courses[0];
    if (course) {
      return (
        <Tile
          label={course.name}
          hint={course.author ?? t('teaching.tile.title')}
          icon="book-outline"
          tone={colors.moss}
          primary
          onPress={() => router.push({ pathname: '/teaching/course/[id]', params: { id: course.id } })}
        />
      );
    }
    if (hub.study) {
      return (
        <Tile
          label={t('study.tile.title')}
          hint={t('study.tile.hint')}
          icon="school-outline"
          tone={colors.moss}
          primary
          badge={badge}
          onPress={() => router.push('/study')}
        />
      );
    }
    return (
      <Tile
        label={t('dashboard.tiles.documents')}
        hint={t('dashboard.tiles.documentsHint')}
        icon="library-outline"
        tone={colors.moss}
        primary
        onPress={() => router.push('/documents')}
      />
    );
  }
  const parts = [
    hub.study ? t('teaching.tile.partStudy') : null,
    hub.courses.length > 0 ? t('teaching.tile.partCourses') : null,
    hub.documents ? t('teaching.tile.partDocuments') : null,
  ].filter(Boolean) as string[];
  const hint = parts.join(', ');
  return (
    <Tile
      label={t('teaching.tile.title')}
      hint={hint.charAt(0).toUpperCase() + hint.slice(1)}
      icon="book-outline"
      tone={colors.moss}
      primary
      badge={badge}
      onPress={() => router.push('/teaching')}
    />
  );
}

/**
 * Indication de la tuile « Suivi de la ville » (maquette de l'accueil, JP 06/11) : sa ville, « 12 villes », « Toutes les villes »
 * pour le superAdmin, « 3 villes ouvertes » pour LEADER / SECRETARIAT, qui ne reçoivent que les villes ouvertes (D-ABO-21).
 */
function cityTileHint(
  me: ReturnType<typeof useAuth>['me'],
  cities: ReturnType<typeof useCityFollowUp>['cities'],
  t: (key: string, options?: any) => string,
): string {
  if (me?.superAdmin) return t('study.city.allCities');
  if (cities.length === 1) return cities[0].localityName;
  return t(isMinistryWideGoals(me) ? 'study.city.cityCountOpen' : 'study.city.cityCount', { count: cities.length });
}

/**
 * Carte « Reprendre » (plan FIN §5.3, JP 06/11) : séance Bertoua ouverte, sinon chapitre en cours, sinon enseignement jamais
 * ouvert. Contrat §10.5 : « Reprendre : chapitre N », jamais « leçon 12 · 12 / 100 » de la maquette.
 */
function ResumeCard({ resume }: { resume: NonNullable<TeachingResume> }) {
  const { t } = useLanguage();
  const course = resume.kind === 'session' ? null : resume.course;
  const total = course?.totalCount ?? 0;
  const completed = course?.completedCount ?? 0;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        resume.kind === 'session'
          ? router.push({ pathname: '/study/session/[id]', params: { id: resume.sessionId } })
          : resume.kind === 'start'
            ? router.push({ pathname: '/teaching/course/[id]', params: { id: resume.course.id } })
            : router.push({ pathname: '/teaching/chapter/[id]', params: { id: resume.chapterId, resume: '1' } })
      }
      style={({ pressed }) => [styles.resume, { opacity: pressed ? 0.92 : 1 }]}
    >
      <View style={styles.resumeRow}>
        <View style={styles.resumePlay}>
          <Ionicons name="play" size={16} color={colors.paper2} style={{ marginLeft: 2 }} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.resumeLabel} numberOfLines={1}>
            {resume.kind === 'session' ? t('dashboard.resume.session', { unit: resume.unitName }) : resume.course.name}
          </Text>
          <Text style={styles.resumeTitle} numberOfLines={1}>
            {resume.kind === 'session'
              ? t('study.tile.title')
              : resume.kind === 'start'
                ? t('dashboard.resume.start')
                : resume.course.nextChapterNumber === 0
                  ? t('dashboard.resume.intro')
                  : t('dashboard.resume.chapter', { number: resume.course.nextChapterNumber })}
          </Text>
        </View>
        {!!course && (
          <Text style={styles.resumeCount}>{t('teaching.course.progress', { completed, total })}</Text>
        )}
      </View>
      {!!course && total > 0 && (
        <View style={styles.resumeTrack}>
          <View style={[styles.resumeFill, { width: `${Math.round((completed / total) * 100)}%` }]} />
        </View>
      )}
    </Pressable>
  );
}

/**
 * Une ligne de tuiles (plan FIN §5.3, JP 06/11) : deux tuiles par ligne, une tuile seule prend toute
 * la largeur, un groupe sans tuile ne laisse aucun vide. Les conditions restent à l'appel ;
 * `Children.toArray` écarte les `false` et `null`.
 */
function TileRow({ children }: { children: ReactNode }) {
  const tiles = Children.toArray(children);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));
  return (
    <>
      {rows.map((row, i) => (
        <View key={i} style={styles.tileRow}>
          {row}
        </View>
      ))}
    </>
  );
}

function Tile({
  label,
  hint,
  icon,
  tone,
  primary,
  badge,
  onPress,
}: {
  label: string;
  hint: string;
  icon: IoniconName;
  tone: string;
  primary?: boolean;
  /** Pastille d'état (ex. « En cours » de l'étude, plan 21/10). */
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        primary ? styles.tilePrimary : styles.tileSurface,
        { opacity: pressed ? 0.92 : 1 },
      ]}
    >
      <View
        style={[
          styles.tileIcon,
          primary
            ? {
                backgroundColor: 'rgba(232,220,196,0.14)',
                borderColor: 'rgba(232,220,196,0.22)',
                borderWidth: 1,
              }
            : { backgroundColor: tone + '1A' },
        ]}
      >
        <Ionicons name={icon} size={21} color={primary ? colors.white : tone} />
      </View>
      <View>
        <Text style={[styles.tileLabel, primary && { color: colors.white }]}>{label}</Text>
        <Text
          style={[
            styles.tileHint,
            primary && { color: 'rgba(242,233,210,0.65)' },
          ]}
        >
          {hint}
        </Text>
      </View>
      {!!badge && <Text style={[styles.comingPill, styles.livePill]}>{badge}</Text>}
    </Pressable>
  );
}

// Cantiques (23/07) : la brique renvoie vers l'app CMFIPraise — liens stores officiels.
const CMFIPRAISE_IOS = 'https://apps.apple.com/fr/app/cmfipraise/id6744709222';
const CMFIPRAISE_ANDROID = 'https://play.google.com/store/apps/details?id=org.cmfi.cmfipraise';

/**
 * Plan FIN §5.3 (JP 06/11) : ouvre CMFIPraise si elle est installée, sinon son store. `openURL` sans
 * `canOpenURL` : celui-ci exigerait de déclarer le schéma (`LSApplicationQueriesSchemes`, `<queries>`)
 * et un nouveau build, alors que `openURL` échoue de lui-même quand aucune app ne le prend en charge.
 * Sur Expo web, aucune app à ouvrir : le lien du store directement.
 */
function openCantiques() {
  const store = Platform.OS === 'ios' ? CMFIPRAISE_IOS : CMFIPRAISE_ANDROID;
  const openStore = () => Linking.openURL(store).catch(() => {});
  if (Platform.OS === 'web') {
    void openStore();
    return;
  }
  Linking.openURL('cmfipraise://').catch(openStore);
}


interface MonthLine {
  currency: string;
  total: number;
  lastTotal: number;
  diff: number;
  diffPct: number;
}

/** Totaux d'une devise, du plus gros au plus petit — ordre d'affichage stable. */
function sortedTotals(totals: CurrencyTotal[] | undefined): CurrencyTotal[] {
  return [...(totals ?? [])].sort((a, b) => b.total - a.total);
}

/**
 * Une ligne par devise présente ce mois-ci OU le mois dernier : une devise qui a disparu doit
 * rester visible (elle affiche 0 et une variation négative), sinon le total « recule » sans
 * explication. Rien n'est additionné entre devises (défaut D, 14/09).
 */
function buildMonthLines(summary: DonationSummary | null): MonthLine[] {
  const current = summary?.currentMonth ?? [];
  const last = summary?.lastMonth ?? [];
  const currencies = Array.from(
    new Set([...current, ...last].map((c) => c.currency)),
  );
  return currencies
    .map((currency) => {
      const total = current.find((c) => c.currency === currency)?.total ?? 0;
      const lastTotal = last.find((c) => c.currency === currency)?.total ?? 0;
      const diff = total - lastTotal;
      return {
        currency,
        total,
        lastTotal,
        diff,
        diffPct: lastTotal > 0 ? Math.round((diff / lastTotal) * 100) : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  date: { fontFamily: fonts.sans, fontSize: 13, color: colors.ink3 },
  greeting: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 32,
    marginTop: 4,
    color: colors.ink,
    letterSpacing: -0.45,
  },
  greetingItalic: { fontStyle: 'italic' },
  verseCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 18,
    borderRadius: 14,
    backgroundColor: colors.parchmentDeep,
    borderWidth: 1,
    borderColor: 'rgba(42,38,32,0.06)',
  },
  verseText: {
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 15,
    lineHeight: 22,
    color: colors.mossDeep,
  },
  verseRef: {
    marginTop: 4,
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.ink3,
    letterSpacing: 0.5,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.white,
    fontFamily: fonts.serif,
    fontSize: 18,
  },
  // marginTop 18 = le rythme vertical de l'accueil (headerRow.marginBottom, scopeCta,
  // tileGrid). Il manquait ici : tant que « Mes objectifs » disparaissait à l'activation
  // des Dons (défaut A, corrigé le 14/09), les deux cartes ne pouvaient jamais être
  // voisines et l'absence de marge ne se voyait pas. Recette 15/09.
  hero: { marginTop: 18, paddingHorizontal: 22, paddingVertical: 22, backgroundColor: colors.moss, borderWidth: 0 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  heroDivider: { height: 1, backgroundColor: 'rgba(232,220,196,0.22)', marginVertical: 16 },
  diffRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  diffPct: { fontFamily: fonts.sans, fontWeight: '600', fontSize: 13 },
  diffNote: { flexShrink: 1, fontFamily: fonts.sans, fontSize: 13, color: colors.parchment },
  yearRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 4,
  },
  extraCurrency: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(232,220,196,0.22)',
  },
  heroEmpty: {
    marginTop: 8,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 16,
    color: colors.white,
  },
  scopeCta: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.moss,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  resume: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 10,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.earthDeep,
    backgroundColor: colors.paper,
  },
  resumeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resumePlay: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.earthDeep,
  },
  resumeLabel: { fontFamily: fonts.sans, fontSize: 12, color: colors.ink2 },
  resumeTitle: { fontFamily: fonts.serif, fontSize: 17, color: colors.ink },
  resumeCount: { fontFamily: fonts.mono, fontSize: 12, color: colors.ink2 },
  resumeTrack: { height: 5, borderRadius: 3, backgroundColor: colors.hairStrong, overflow: 'hidden' },
  resumeFill: { height: 5, borderRadius: 3, backgroundColor: colors.moss },
  scopeTitle: { fontFamily: fonts.serif, fontSize: 18, color: colors.white },
  scopeSub: { fontFamily: fonts.sans, fontSize: 12, color: colors.parchment, opacity: 0.85 },

  tileGrid: {
    marginTop: 18,
    gap: 12,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 12,
  },
  // `flex: 1` et non une largeur fixe : une tuile seule sur sa ligne prend toute la largeur
  // (plan FIN §5.3, JP 06/11). Mesures de la maquette de l'accueil.
  tile: {
    flex: 1,
    minWidth: 0,
    minHeight: 128,
    paddingHorizontal: 15,
    paddingTop: 14,
    paddingBottom: 13,
    borderRadius: radii.lg,
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
  },
  tileSurface: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: 'rgba(42,38,32,0.07)',
  },
  tilePrimary: {
    backgroundColor: colors.mossSoft,
    borderWidth: 0,
    shadowColor: colors.mossDeep,
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 4,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontFamily: fonts.serif,
    fontSize: 16.5,
    lineHeight: 20,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  tileHint: {
    marginTop: 3,
    fontFamily: fonts.sans,
    fontSize: 11.5,
    color: colors.ink3,
  },
  comingPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: colors.ink3,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: 'rgba(42,38,32,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(42,38,32,0.07)',
    overflow: 'hidden',
  },
  livePill: {
    color: colors.white,
    backgroundColor: colors.clay,
    borderColor: colors.clay,
  },

  footerMark: {
    textAlign: 'center',
    marginTop: 24,
    fontFamily: fonts.mono,
    fontSize: 10.5,
    color: colors.ink3,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
