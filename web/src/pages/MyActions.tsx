import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { TopBar } from '../components/ui';
import { DeclarePanel, EventEmptyState, MyEventsList } from '../components/EventDeclare';
import { FEATURES } from '../config/features';
import { getAccessibleModules } from '../services/authApi';

// ---------------------------------------------------------------------------------------------
//  « Mes actions » de l'espace membre (MemberShell, §6.2 du plan du 14/10, lot E8) — déclarer une
//  action d'évangélisation (spec §4.2) puis la retrouver dans sa liste (spec §6.1).
//  [HYPOTHÈSE §6.2] le membre déclare aussi depuis le web. RG-EVT-02 : un MEMBRE n'a qu'une
//  assemblée — pas de sélecteur, seulement le bandeau du rattachement.
//  D-EVT-05 / RG-06 : sans abonnement EVENTS, l'entrée de menu est masquée ; une URL tapée à la
//  main tombe sur un message.
// ---------------------------------------------------------------------------------------------

export function MyActionsPage() {
  const { t } = useTranslation();
  const modulesQ = useQuery({ queryKey: ['accessible-modules'], queryFn: getAccessibleModules });
  const hasEvents = FEATURES.events && (modulesQ.data ?? []).includes('EVENTS');

  return (
    <>
      <TopBar title={t('events.mine.pageTitle')} crumbs={[t('common.brand'), t('events.mine.pageTitle')]} />
      <div className="content">
        {modulesQ.isLoading ? (
          <p style={{ color: 'var(--ink-500)' }}>{t('common.loading')}</p>
        ) : !hasEvents ? (
          <EventEmptyState title={t('events.moduleOff')} text={t('events.moduleOffHint')} />
        ) : (
          <>
            <DeclarePanel />
            <MyEventsList />
          </>
        )}
      </div>
    </>
  );
}
