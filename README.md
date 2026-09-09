# Site de sondages

Site web permettant de créer des sondages, voter, et gérer des comptes
administrateurs. Construit avec Node.js, Express, EJS et une base de
données **Turso** (compatible SQLite, gratuite et persistante).

## ⚠️ À propos du mot de passe

Aucun mot de passe n'est écrit dans le code. Tu définis toi-même le mot
de passe du compte `hugo425266@gmail.com` (et de tout futur admin) via
un fichier `.env` que **toi seul possèdes**, jamais commité ni partagé.

---

## Étape 1 — Créer la base de données Turso (gratuite)

1. Va sur https://turso.tech et crée un compte gratuit (tu peux te
   connecter avec GitHub).
2. Une fois dans le tableau de bord, crée une nouvelle base de données
   (bouton "Create Database"). Donne-lui un nom, ex. `sondages`.
3. Choisis une région proche de toi (ex. Paris/Frankfurt).
4. Une fois créée, ouvre l'onglet de connexion de la base et récupère :
   - l'**URL de la base** (commence par `libsql://...`)
   - un **jeton d'authentification** (auth token) — génère-en un si besoin
     (bouton "Create Token").

Garde ces deux valeurs sous la main, tu en auras besoin à l'étape 3.

## Étape 2 — Tester en local (recommandé avant de déployer)

```bash
npm install
cp .env.example .env
```

Ouvre `.env` et remplis :
- `SESSION_SECRET` : une longue chaîne aléatoire, ex. générée avec
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `TURSO_DATABASE_URL` et `TURSO_AUTH_TOKEN` : les valeurs récupérées à l'étape 1
- `SUPERADMIN_PASSWORD` : le mot de passe que **tu** choisis pour
  `hugo425266@gmail.com` (8 caractères minimum)

Crée ensuite le compte super-administrateur (à relancer si tu changes
le mot de passe plus tard) :

```bash
npm run init-admin
```

Puis lance le site :

```bash
npm start
```

Le site est sur http://localhost:3000. Connecte-toi avec
`hugo425266@gmail.com` et le mot de passe défini dans `.env`.

## Étape 3 — Publier le code sur GitHub

Render déploie à partir d'un dépôt Git.

1. Crée un compte sur https://github.com si tu n'en as pas.
2. Crée un nouveau dépôt (public ou privé, peu importe).
3. Depuis le dossier du projet :
   ```bash
   git init
   git add .
   git commit -m "Premier envoi du site de sondages"
   git branch -M main
   git remote add origin https://github.com/TON-COMPTE/TON-DEPOT.git
   git push -u origin main
   ```
   Le fichier `.env` ne sera **pas** envoyé (il est dans `.gitignore`) :
   c'est voulu, tes secrets restent privés.

## Étape 4 — Déployer sur Render (gratuit)

1. Va sur https://render.com et crée un compte gratuit (connexion possible
   avec GitHub, aucune carte bancaire requise pour cette étape).
2. Clique sur "New +" → "Web Service".
3. Choisis "Build and deploy from a Git repository", puis sélectionne
   ton dépôt GitHub.
4. Configure :
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : Free
5. Dans l'onglet "Environment", ajoute exactement les mêmes variables
   que dans ton `.env` :
   - `SESSION_SECRET`
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `SUPERADMIN_EMAIL`
   - `SUPERADMIN_PASSWORD`
6. Clique sur "Create Web Service". Render installe et démarre le site
   (ça prend 1 à 2 minutes). Tu obtiens une URL du type
   `https://ton-site.onrender.com`.
7. Crée le compte super-administrateur **une seule fois** en production :
   ouvre l'onglet "Shell" de ton service sur Render et lance :
   ```bash
   npm run init-admin
   ```

Ton site est en ligne ! Connecte-toi avec `hugo425266@gmail.com` et le
mot de passe défini dans les variables d'environnement Render.

## 4bis. À savoir sur l'offre gratuite de Render

- Le service **s'endort après 15 minutes** sans visite, et met 30 à 60
  secondes à se "réveiller" au visiteur suivant. C'est normal, gratuit,
  et sans impact sur tes données (qui sont sur Turso, pas sur Render).
- Toutes les sessions de connexion sont effacées à chaque redémarrage
  (les visiteurs devront se reconnecter) — mais **aucun sondage, vote ou
  compte n'est perdu**, car tout est sur Turso.
- 750h gratuites par mois, largement suffisant pour un site personnel.

## Fonctionnalités

- Inscription / connexion (mots de passe hachés avec bcrypt)
- Création de sondages, vote (un vote par compte et par sondage),
  résultats en temps réel
- **Super-administrateur** (`hugo425266@gmail.com`) : peut ajouter
  d'autres comptes administrateurs
- **Administrateurs** (super-admin inclus) : peuvent supprimer
  n'importe quel compte (sauf le super-admin) et n'importe quel sondage

## Sécurité — points importants

- Change `SESSION_SECRET` avant toute mise en production.
- Une fois le site en HTTPS (Render le fait automatiquement), tu peux
  décommenter `secure: true` dans `server.js` (config des cookies).
- Ne commite jamais `.env` ni tes jetons Turso.
