# Death in the Sea — Dashboard

Tableau de bord interactif sur les morts et disparitions de personnes migrantes en **Méditerranée**, construit à partir des données ouvertes du **Missing Migrants Project** de l'OIM (Organisation internationale pour les migrations).

> ⚠️ Tous les chiffres affichés sont des **estimations minimales**. Les pertes réelles sont plus élevées. La couverture médiatique et institutionnelle de la mort en migration reste très inégale selon les régions du monde.

## À propos

Ce dépôt contient **uniquement le tableau de bord** (interface front-end). Le pipeline de nettoyage des données, la documentation méthodologique complète et les ancres éditoriales qui structurent le projet vivent dans le dépôt principal `DEATH_IN_THE_SEA` (non public).

Le dataset embarqué ici (`public/data/incidents.geojson`) couvre les **3 033 incidents** enregistrés par l'OIM sur les trois routes méditerranéennes (Centrale, Western, Eastern) entre janvier 2014 et mai 2026 — instantané du **19 mai 2026**.

## Aperçu

Le dashboard propose une carte interactive de la Méditerranée avec :

- **Filtres par route** : Toutes / Centrale / Western / Eastern (avec couleur dédiée)
- **Frise temporelle rétractable** : victimes par année (2014–2026), cliquable pour filtrer
- **Compteurs vivants** : nombre d'incidents et de victimes dans la portée actuelle
- **Signalisation de la qualité de donnée** : localisations imprécises de l'OIM affichées en transparence, coordonnées corrigées éditorialement (36 cas) signalées par un contour blanc

L'ensemble est sobre, dignité-first, sans gamification du drame — voir les contraintes éditoriales du projet d'origine.

## Stack

| Couche | Outil |
|---|---|
| Bundler | [Vite](https://vitejs.dev/) 5 |
| Carte | [Mapbox GL JS](https://docs.mapbox.com/mapbox-gl-js/) 3 (fond CARTO Dark Matter, sans tuiles Mapbox) |
| Graphiques | [D3](https://d3js.org/) 7 |
| JavaScript | Vanilla (modules ES) |

## Installation locale

```bash
git clone git@github.com:hericlibong/death-in-the-sea-dashboard.git
cd death-in-the-sea-dashboard
npm install
```

### Configurer le token Mapbox

Mapbox GL JS v3 exige un token, même quand on utilise un style externe (CARTO ici).

1. Crée un compte gratuit sur <https://account.mapbox.com/> (plan gratuit : 50 000 chargements de carte par mois)
2. Récupère ton **« Default public token »** (commence par `pk.eyJ…`)
3. Copie `.env.example` vers `.env` et colle ton token :

```bash
cp .env.example .env
# édite .env et remplace pk.your_token_here par le tien
```

`.env` est ignoré par git — ton token ne sera pas commité.

## Lancer en développement

```bash
npm run dev
```

Le serveur Vite démarre sur <http://localhost:5173/> avec rechargement à chaud.

## Construire pour la production

```bash
npm run build
npm run preview   # tester la build localement
```

Le dossier `dist/` contient l'output statique, déployable sur n'importe quel hébergeur (GitHub Pages, Netlify, Vercel, S3…).

## Compatibilité navigateurs

- ✅ **Firefox**, **Edge**, **Safari** : OK
- ⚠️ **Chrome** : nécessite l'accélération matérielle (et donc WebGL). Si le dashboard ne charge pas, vérifier `chrome://settings/system` → *« Utiliser l'accélération matérielle si disponible »*. Cause possible : driver GPU sur la blocklist de Chrome (voir `chrome://gpu`).

## Source des données

**IOM Missing Migrants Project** — <https://missingmigrants.iom.int/>

Méthodologie : <https://missingmigrants.iom.int/methodology>

Les données publiées par l'OIM sont **anonymisées** : les noms et pays d'origine individuels sont retirés du dataset public pour respecter les familles (Guidelines §3.4). Le projet n'effectue aucune ré-identification.

## Licence

Code source : sous licence MIT (à confirmer / formaliser).
Données : © IOM Missing Migrants Project, redistribuées conformément aux conditions du portail OIM.

## Crédits

Projet conçu et réalisé par [Héric Libong](https://github.com/hericlibong) — journaliste & data storytelling.
