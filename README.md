# HA Native Nav Position

Petit plugin Lovelace/HACS pour placer la navigation native de Home Assistant en haut ou en bas, avec un style dock mobile et des onglets en icones.

![Preview](images/preview.svg)

## Installation HACS

1. Dans Home Assistant, ouvre **HACS**.
2. Clique sur les trois points en haut a droite, puis **Depots personnalises**.
3. Colle cette URL :

```text
https://github.com/Philiphall6/ha-native-nav-position
```

4. Choisis le type **Dashboard**.
5. Clique sur **Ajouter**, puis installe **HA Native Nav Position**.
6. Dans les ressources Lovelace, verifie que HACS a ajoute :

```yaml
url: /hacsfiles/ha-native-nav-position/ha-native-nav-position.js
type: module
```

HACS attend un plugin Dashboard avec un fichier `.js` dans `dist/` ou a la racine, et un fichier JS qui porte le meme nom que le depot.

## Configuration Simple

Par defaut, le plugin met la barre en bas sur mobile :

```yaml
url: /hacsfiles/ha-native-nav-position/ha-native-nav-position.js
type: module
```

## Principe De Configuration

La navigation doit etre configuree depuis cette ressource HACS, pas depuis le theme Home Assistant.

Garde ton theme sans bloc `card-mod-root` pour cette barre. Comme ca, les prochaines corrections de design arrivent simplement via HACS avec **Update information** puis **Redownload**.

Pour forcer le bas :

```yaml
url: /hacsfiles/ha-native-nav-position/ha-native-nav-position.js?position=bottom
type: module
```

Pour remettre en haut :

```yaml
url: /hacsfiles/ha-native-nav-position/ha-native-nav-position.js?position=top
type: module
```

## Options

Les options peuvent etre passees dans l'URL de la ressource :

```yaml
url: /hacsfiles/ha-native-nav-position/ha-native-nav-position.js?position=bottom&dock=true&hide_labels=true&mobile_only=true
type: module
```

Options utiles :

| Option | Defaut | Description |
| --- | --- | --- |
| `position` | `bottom` | `bottom` ou `top` |
| `mobile_only` | `true` | Applique le style seulement sous `mobile_max_width` |
| `mobile_max_width` | `768px` | Largeur max du mode mobile |
| `dock` | `true` | Active le style dock flottant |
| `hide_labels` | `true` | Cache les textes de navigation |
| `compact` | `true` | Utilise une zone tactile 48px avec icone 24px, comme les boutons natifs Home Assistant |
| `offset` | `18px` | Distance avec le bord haut ou bas |
| `height` | `64px` | Hauteur de la barre |
| `active_color` | `var(--accent-color, var(--primary-color))` | Couleur de l'icone de la vue active, reprise depuis le theme |
| `inactive_color` | `rgba(255, 255, 255, 0.78)` | Couleur des icones inactives |

## Icônes Des Vues

Pour avoir une barre composee uniquement de pictogrammes, chaque vue Lovelace doit avoir une icone :

```yaml
views:
  - title: Home
    path: home
    icon: mdi:home-variant
  - title: Volets
    path: volets
    icon: mdi:window-shutter
```

Le plugin peut cacher les textes, mais il ne peut pas deviner automatiquement quelle icone correspond a chaque piece ou vue.

## Carte Invisible Optionnelle

Si tu veux surcharger la config dans un tableau de bord, ajoute cette carte dans une vue :

```yaml
type: custom:ha-native-nav-position
position: bottom
mobile_only: true
dock: true
hide_labels: true
```

La carte est invisible et ne prend pas de place. Pour un comportement parfaitement identique sur un chargement direct de n'importe quelle vue, prefere la configuration par URL de ressource.

## Notes

Ce plugin modifie l'interface native de Home Assistant cote navigateur. Si Home Assistant change fortement sa structure interne, une mise a jour du plugin peut etre necessaire.
