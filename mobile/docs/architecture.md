# shephr Mobile — Architecture

## Vue d'ensemble

Application Expo Router (file-based routing) consommant le module `donation` du backend `cmfipraise-backend`.

## Endpoints backend utilisés

Base URL configurée via `app.json` → `extra.API_URL` (par défaut `http://localhost:8080`).

### Auth (préfixe `/api/cmfipraise/auth`)
| Méthode | Route | Service |
| --- | --- | --- |
| POST | `/login` | `services/authApi.login` |
| POST | `/register` | `services/authApi.register` |

### Module donation (préfixe `/api/church`)
| Méthode | Route | Service |
| --- | --- | --- |
| GET | `/auth/me` | `services/authApi.fetchMe` |
| GET | `/units/me` | `services/unitApi.getMyUnit` |
| POST | `/units/join` (joinCode 6 car.) | `services/unitApi.joinUnit` |
| POST | `/units/leave` | `services/unitApi.leaveUnit` |
| POST GET PATCH DELETE | `/donations[/:id]` | `services/donationApi.*` |
| GET | `/donations/stats/summary` | `services/statsApi.getSummary` |
| GET | `/donations/stats/by-unit` | `services/statsApi.getByUnit` |
| GET | `/donations/stats/by-category` | `services/statsApi.getByCategory` |
| GET | `/donations/stats/by-month` | `services/statsApi.getByMonth` |
| GET | `/donations/stats/by-user` | `services/statsApi.getByUser` |
| GET | `/donations/export?format=csv` | `services/statsApi.buildExportUrl` |
| GET | `/leader/units` | `services/leaderApi.listMyUnits` |
| GET | `/leader/members` | `services/leaderApi.listMyMembers` |

## Arborescence

```
mobile/
├── app/                       # Expo Router
│   ├── _layout.tsx            # Root stack + providers + fonts
│   ├── index.tsx              # Redirect login ↔ home selon auth
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── signup.tsx         # 2 étapes : compte + joinCode
│   ├── (tabs)/
│   │   ├── _layout.tsx        # Tabs (leader masqué si !isLeader)
│   │   ├── home.tsx           # Dashboard fidèle
│   │   ├── donations.tsx      # Mes dons (history)
│   │   ├── profile.tsx
│   │   └── leader/
│   │       ├── _layout.tsx
│   │       ├── index.tsx      # Périmètre
│   │       ├── stats.tsx
│   │       └── unit/[unitId].tsx
│   ├── declare.tsx            # Modal de déclaration de don
│   └── donation/[id].tsx      # Détail d'un don (certificat)
├── components/                # UI atomiques
├── constants/categories.ts    # Catégories CMCI (dime, offrande, ...)
├── contexts/
│   ├── AuthContext.tsx        # JWT, /auth/me, isLeader
│   └── LanguageContext.tsx
├── services/                  # Couche API (axios + JWT bearer)
├── theme/                     # Tokens (couleurs, typo) shephr
├── utils/
│   ├── format.ts              # fmtAmount, fmtDate, parseLocalDate
│   └── i18n/                  # fr + en
└── docs/
```

## Design system

Couleurs principales (`theme/colors.ts`) :
- `moss` `#1E3A2F` — vert pastoral, primaire
- `parchment` `#E8DCC4` — fond canvas
- `earth` `#C9956B` — accent terre
- `clay` `#B86A4A` — alerte / destructif

Typographies (Expo Google Fonts) :
- `Fraunces` — serif chaleureux pour titres et montants
- `Inter` — sans humaniste pour le corps
- `JetBrainsMono` — mono pour références et codes

## Catégories de don

Définies côté mobile dans `constants/categories.ts` : `dime`, `offrande`, `mission`, `batiment`, `special`, `autre`. Le backend stocke la catégorie en `String(100)` libre — la liste mobile reste alignable.

## À venir

- Conformation des champs de don à un `DateTimePicker` natif (actuellement `donationDate` = `today`)
- Édition de don (`PATCH /donations/:id`)
- Module invitation : nécessite des endpoints backend dédiés (génération de joinCode côté admin → à confirmer côté backend)
- Export CSV : ouverture via `Linking` ou `expo-file-system` avec téléchargement authentifié
- Web companion dans `/web` (Vite/Next à décider)
