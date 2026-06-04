/**
 * Minimal English → French label mapping for the most frequent country
 * and region names used by the IOM dataset. The dataset itself stays in
 * English (matches the Phase 2 charts and notes); translation is done
 * only at display time for the tooltip and other UI strings.
 */

const COUNTRY_FR = {
  'Libya': 'Libye',
  'Italy': 'Italie',
  'Spain': 'Espagne',
  'Greece': 'Grèce',
  'Tunisia': 'Tunisie',
  'Morocco': 'Maroc',
  'Algeria': 'Algérie',
  'Egypt': 'Égypte',
  'Malta': 'Malte',
  'Cyprus': 'Chypre',
  'Lebanon': 'Liban',
  'Croatia': 'Croatie',
  'France': 'France',
  'United Kingdom of Great Britain and Northern Ireland': 'Royaume-Uni',
  'Syrian Arab Republic': 'Syrie',
  'Türkiye': 'Türkiye',
  'Turkey': 'Türkiye',
};

const ORIGIN_COUNTRY_FR = {
  ...COUNTRY_FR,
  'Afghanistan': 'Afghanistan',
  'Bangladesh': 'Bangladesh',
  'Iraq': 'Irak',
  'Sudan': 'Soudan',
  'Eritrea': 'Érythrée',
  'Somalia': 'Somalie',
  'Nigeria': 'Nigeria',
  'Guinea': 'Guinée',
  "Côte d'Ivoire": "Côte d'Ivoire",
  'Mali': 'Mali',
  'Cameroon': 'Cameroun',
  'Senegal': 'Sénégal',
  'Pakistan': 'Pakistan',
  'Yemen': 'Yémen',
  'Ethiopia': 'Éthiopie',
  'Ghana': 'Ghana',
  'Gambia': 'Gambie',
  'Mauritania': 'Mauritanie',
  'Niger': 'Niger',
  'Sierra Leone': 'Sierra Leone',
  'Comoros': 'Comores',
  'State of Palestine': 'Palestine',
  'Palestinian Territories': 'Palestine',
  'Iran (Islamic Republic of)': 'Iran',
};

const REGION_FR = {
  'Northern Africa': 'Afrique du Nord',
  'Sub-Saharan Africa': 'Afrique subsaharienne',
  'Western Asia': 'Asie occidentale',
  'Western Africa': 'Afrique de l’Ouest',
  'Eastern Africa': 'Afrique de l’Est',
  'Southern Asia': 'Asie du Sud',
  'Western / Southern Asia': 'Asie occidentale / du Sud',
  'Middle Africa': 'Afrique centrale',
  'Caribbean': 'Caraïbes',
  'Oceania': 'Océanie',
  'Mixed': 'Mixte',
};

export function localizeCountry(name) {
  if (!name) return null;
  return COUNTRY_FR[name] || name;
}

export function localizeOrigin(label, level) {
  if (!label) return null;
  if (level === 'country') {
    // Country fields may carry comma-separated lists; localize each part.
    return label
      .split(',')
      .map((s) => s.trim())
      .map((s) => ORIGIN_COUNTRY_FR[s] || s)
      .join(', ');
  }
  if (level === 'region') {
    return REGION_FR[label] || label;
  }
  return label;
}

const FR_DATE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatDate(isoString) {
  if (!isoString) return null;
  const [y, m, d] = isoString.split('-').map(Number);
  if (!y || !m || !d) return isoString;
  // Construct in local TZ to avoid Intl pulling a date forward/back.
  return FR_DATE.format(new Date(y, m - 1, d));
}

const QUALITY_HINT = {
  1: 'qualité 1 — presse seule',
  2: 'qualité 2 — corroboration limitée',
  3: 'qualité 3 — ONG + presse',
  4: 'qualité 4 — bureau IOM',
  5: 'qualité 5 — autorité officielle',
};

export function sourceQualityLabel(q) {
  return QUALITY_HINT[q] || null;
}
