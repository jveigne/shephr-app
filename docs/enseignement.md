# Tuile « Enseignement » — suivi du chantier

> Ouvert le 06/11/2026 par JP. **État au 07/11 : code écrit dans les quatre surfaces, rien de commité, recette à faire** (`cmfipraise-backend/docs/shephr/06_11_2026/03_Plan_de_test_Enseignement.md`). Aucune vidéo n'est envoyée sur R2, aucun build EAS n'est fait.
> Plan technique : `cmfipraise-backend/docs/shephr/06_11_2026/01_Plan_Enseignement_Finances.md`.
> Maquettes : https://claude.ai/artifact/H6g8WGUDrVhNoxG1NcXT7o

## 1. Décisions de JP

| Réf. | Décision |
|---|---|
| D-FIN-01 | Le Message de Bertoua est l'étude **en assemblée**. Les finances sont un parcours à part, chacun seul à son rythme. |
| D-FIN-02 | Multi-ministère ; **CMCI pour le moment** ; tout membre rattaché à son assemblée ; gratuit. |
| D-FIN-03 | Voir l'avancement des membres, même de sa propre assemblée : **offre Caleb**. |
| D-FIN-04 | Le livre payant se vend **en dehors de l'application** : aucun achat, prix ni lien de vente dans l'app. |
| D-FIN-06 | Des enseignements ponctuels du frère Théodore s'ajouteront. |
| D-FIN-08 | **Néhémie** donne le suivi de toute la ville. |
| D-FIN-09 | Vidéos sur **Cloudflare R2**. |
| D-FIN-11 | Barre du bas mobile : Accueil, Objectifs, Assemblées, Profil. « Ne faisons pas trop. » |
| D-FIN-12 | On crée la tuile **Enseignement**. |
| D-FIN-13 | **On part sur les chapitres du livre**, plus sur les 100 leçons : une introduction et 28 chapitres, une vidéo par chapitre. |
| D-FIN-14 | Le **chapitre 26** figure dans le parcours ; son contenu viendra après. |
| D-FIN-15 | `cmfipraise-motion` n'est pas touché par ce chantier pour le moment. |
| D-FIN-16 | Le lot vidéo (stockage R2, envoi, lecture, lecteurs web et mobile) est dans ce lot. Les vidéos seront produites et envoyées à la fin par JP. |

## 2. Accueil mobile

1. Enseignement, Cantiques
2. Suivi de la ville (s'il l'a), Hiérarchie
3. Créer une assemblée, Déclarer un évènement
4. Déclarer un don, Trésorerie

La carte « Vos dons ce mois-ci » passe au-dessus de la ligne 4. Une tuile seule sur sa ligne prend toute la largeur.

## 3. Contenu de la tuile

- **Les enseignements sur les finances** (frère Théodore Andoseh), avec l'avancement.
- **Le Message de Bertoua** : écrans inchangés, pastille « En cours » conservée.
- **Enseignements ponctuels** : un élément par enseignement, ajouté au back-office, sans code.
- **Documents** : déplacé ici depuis l'accueil.

Une seule entrée disponible : la tuile garde son nom d'origine et l'ouvre directement. Sans contenu, le ministère ne voit rien : aucun réglage « CMCI » dans le code.

## 4. Parcours d'un membre

1. Tuile Enseignement, puis « Les enseignements sur les finances ».
2. Liste : introduction et chapitres par partie, aucun bloqué.
3. Ouverture d'un chapitre : titre, résumé du livre, « Lire » et « Regarder la vidéo ».
4. Lecture : texte continu avec les sous-titres du livre, taille réglable, reprise automatique.
5. Fin : vidéo, « J'ai terminé », « Chapitre suivant ».
6. L'accueil affiche « Reprendre : chapitre N ».

**Chapitre sans contenu :** il reste dans la liste avec « Contenu à venir », ne s'ouvre pas et ne compte pas dans le total de l'avancement.

## 5. État du livre

Relevé du 06/11 dans le Google Doc : **introduction + 27 chapitres**. Durée = estimation à 200 mots par minute. Storyboard : `cmfipraise-motion/docs/`. Vidéo rendue : présente dans `cmfipraise-motion/out/` au 06/11, à relire.

| Entrée | Titre | Lecture | Storyboard | Vidéo rendue |
|---|---|---|---|---|
| — | Introduction | 4 min | ☐ | ☐ |
| **Partie 1** | **L'argent, vecteur spirituel** | | | |
| 1 | L'argent, test et thermomètre de la vie spirituelle | 7 min | ✅ | ✅ |
| 2 | La Pentecôte et l'argent | 15 min | ✅ | ✅ |
| 3 | La poubelle de l'Église et la banque de la foi | 4 min | ✅ | ✅ |
| 4 | Le débordement d'un cœur plein | 4 min | ✅ | ✅ |
| **Partie 2** | **Dieu qui pourvoit** | | | |
| 5 | La provision, présence manifeste de Dieu | 6 min | ✅ | ✅ |
| 6 | Les signes de l'appel : Saül et Cyrus | 4 min | ✅ | ✅ |
| 7 | Comment Dieu pourvoit pour Son œuvre | 8 min | ✅ | ✅ |
| 8 | Dieu paie Ses ouvriers | 9 min | ✅ | ☐ |
| **Partie 3** | **L'homme qui donne : l'adoration dans le don** | | | |
| 9 | Le don, voie de la rencontre avec Dieu | 5 min | ✅ | ☐ |
| 10 | Les exemples de la Genèse : Caïn et Abel, Noé, Abraham | 25 min | ✅ | ☐ |
| 11 | Salomon, David et le contre-exemple de Malachie | 17 min | ✅ | ☐ |
| 12 | Les dîmes et les offrandes | 9 min | ✅ | ☐ |
| 13 | La grâce du don : l'exemple des Macédoniens | 8 min | ✅ | ☐ |
| 14 | La croissance dans le don : du don spontané au don en projets | 5 min | ✅ | ☐ |
| **Partie 4** | **Produire et gérer la richesse à dessein** | | | |
| 15 | Qu'est-ce que la richesse, et pourquoi Dieu la donne | 4 min | ✅ | ☐ |
| 16 | Riches pour une mission : exemples bibliques | 9 min | ✅ | ☐ |
| 17 | Les neuf lois pour produire la richesse à dessein | 22 min | ✅ | ☐ |
| 18 | L'intendance de la richesse | 15 min | ✅ | ☐ |
| 19 | Joseph l'intendant | 21 min | ✅ | ☐ |
| 20 | La puissance de l'épargne | 3 min | ✅ | ☐ |
| **Partie 5** | **Diriger, c'est donner** | | | |
| 21 | Le leadership, vecteur le plus critique | 2 min | ✅ | ☐ |
| 22 | David, modèle du dirigeant qui donne | 3 min | ✅ | ☐ |
| 23 | Les deux axes du leadership : la vision et les hommes | 2 min | ✅ | ☐ |
| 24 | Faire des disciples de ceux qui ont des moyens | 3 min | ✅ | ☐ |
| 25 | Les ministres des finances et la gestion des dons | 6 min | ✅ | ☐ |
| **Partie 6** | **Paroles prophétiques et promesses sur les finances de la CMCI** | | | |
| 26 | L'exemple de ZTF | contenu à venir | ☐ | ☐ |
| 27 | Paroles prophétiques et promesses reçues | 16 min | ☐ | ☐ |
| 28 | **À préciser : absent du document** | | ☐ | ☐ |

Le rendu tourne en arrière-plan : la colonne « Vidéo rendue » change sans ce fichier.

## 6. À faire

**JP — contenu**

- [ ] Préciser le chapitre 28
- [ ] Écrire le contenu du chapitre 26
- [ ] Vérifier les vidéos et trancher les défauts (`cmfipraise-motion/docs/defauts-finances.md`)
- [ ] Faire produire les vidéos manquantes (introduction, chapitres 26 à 28)

**Lot 1 — Accueil et barre du bas (mobile, sans backend)**

- [x] Réordonner les tuiles et renommer « Déclarer un évènement »
- [x] Cantiques : ouvrir CMFIPraise si elle est installée, sinon son store (⚠ à essayer sur un vrai téléphone)
- [x] Retirer la tuile Membres ; entrées depuis la Hiérarchie et le Suivi de la ville (filtre sur la ville)
- [x] Barre à 4 onglets ; accès à Déclarations, Évènements et Brebis
- [x] Descendre la carte « Vos dons ce mois-ci »

**Lot 2 — Contenu (backend, back-office)**

- [x] Migration : type de module, texte structuré et vidéo par chapitre, table d'avancement
- [x] Exclure ces modules des comptes rendus et de l'étude
- [x] Convertir le livre Google Docs en texte structuré (`docs/shephr/06_11_2026/enseignement-finances-import.json`, 38 images non reprises, plan §11)
- [ ] **JP** : importer ce fichier au back-office, dans le ministère CMCI, le relire puis l'activer (`ministryId` à remplacer)
- [x] Back-office : créer, importer, publier, relire

**Lot 3 — Tuile et parcours (web, mobile)**

- [x] Routes membre : catalogue, parcours, chapitre, avancement
- [x] Tuile Enseignement : Bertoua, finances, ponctuels, Documents
- [x] Écrans : parcours, ouverture, lecture, fin de chapitre
- [x] Carte « Reprendre » et lecture hors ligne sur mobile
- [x] Traductions FR et EN, suppression de l'avancement avec le compte, `/privacy`

**Lot 4 — Vidéos sur R2**

- [x] Stockage : envoi direct, copie (essayés en stockage local seulement, jamais sur R2)
- [ ] **JP** : poser la règle CORS du bucket (contrat §6.7, à garder avec les origines existantes)
- [ ] **À recetter sur R2** : confirmation d'un fichier de 2 Go, délai de 5 min du client HTTP (plan §11)
- [x] Back-office : envoi, vignette, publication
- [x] Lecture : route protégée, lecteur web, `expo-video` dans le code
- [ ] **JP** : nouveau build EAS, sans lui le mobile dit « Mettez à jour l'application » et ne lit pas la vidéo
- [ ] **JP** : envoyer les vidéos une fois prêtes depuis `/videos-enseignement`

**Lot 5 — Suivi payant**

- [x] Caleb : bloc d'avancement, chiffre gratuit, verrou
- [x] Néhémie : code de droit de ville, onglet, verrou
- [x] Mise à jour de `/offres`

**Lot 6 — Recette et présentation**

- [x] Plan de test (`docs/shephr/06_11_2026/03_Plan_de_test_Enseignement.md`), vérifications automatiques
- [ ] Recette manuelle, essais sur de vrais téléphones Android et iPhone
- [x] Contrat figé : aucun changement, écarts datés au §11 du plan, **à arbitrer par JP**
- [ ] **JP** : mise à jour de `CLAUDE.md` (n°25), texte prêt, à valider et appliquer
- [ ] Présenter au frère Théodore

## 7. Reporté

Push « nouvel enseignement », bouton « Relancer », tableau de mesures, parties suivantes selon le contenu.

Les 100 leçons ne sont plus le support du parcours. Celles déjà écrites (1 à 3) pourront devenir des enseignements ponctuels, si JP le souhaite.
