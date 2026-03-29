// ─────────────────────────────────────────────────────────────────────────────
//  datacenterLocations.ts
//  Comprehensive cloud data-center registry used for globe visualisation and
//  "closest data-center" routing logic.
//
//  Sources: cloudinfrastructuremap.com, official provider region pages.
// ─────────────────────────────────────────────────────────────────────────────

export interface DataCenter {
  /** Unique stable identifier, e.g. "aws-us-east-1". */
  id: string;
  lat: number;
  lng: number;
  /** Human-readable city / campus name. */
  name: string;
  /** Cloud provider key — must be a key of PROVIDER_COLORS. */
  provider: string;
  /** Provider-specific region / zone code, e.g. "us-east-1". */
  region?: string;
  /** Electricity Maps zone code, e.g. "US-MIDA-PJM". */
  zone?: string;
  /** Resolved from PROVIDER_COLORS at build time. */
  color: string;
}

// ─── Provider brand colours ───────────────────────────────────────────────────

export const PROVIDER_COLORS: Record<string, string> = {
  'Google Cloud': '#34d399', // emerald
  'AWS':          '#f97316', // orange
  'Azure':        '#3b82f6', // blue
  'Oracle':       '#ef4444', // red
  'SoftBank':     '#a78bfa', // violet
  'Nvidia':       '#84cc16', // lime
  'xAI':          '#f87171', // coral
};

/** Ordered list used for toggle UI. */
export const ALL_PROVIDERS = Object.keys(PROVIDER_COLORS);

// ─── Model → provider mapping ────────────────────────────────────────────────
//  Derived from src/config/models.ts — do not edit here.
//  Keys are exact model_ids; values are fulfillment_companies arrays.

import { MODELS } from "@/config/models";

export const MODEL_PROVIDERS: Record<string, string[]> = Object.fromEntries(
  MODELS.map((m) => [m.model_id, m.fulfillment_companies]),
);

console.log(
  "[datacenterLocations] MODEL_PROVIDERS derived from config:",
  JSON.stringify(MODEL_PROVIDERS, null, 2),
);

// ─── Helper ──────────────────────────────────────────────────────────────────

function dc(
  id: string,
  lat: number,
  lng: number,
  name: string,
  provider: string,
  region?: string,
): DataCenter {
  return { id, lat, lng, name, provider, region, color: PROVIDER_COLORS[provider] ?? '#ffffff' };
}

// ─── Full data-center registry ───────────────────────────────────────────────

const _RAW_DATA_CENTERS: DataCenter[] = [

  // ══ Google Cloud ═══════════════════════════════════════════════════════════
  dc('gcp-us-east1',          33.84,  -81.16, 'South Carolina',            'Google Cloud', 'us-east1'),
  dc('gcp-us-east4',          38.94,  -77.49, 'N. Virginia',               'Google Cloud', 'us-east4'),
  dc('gcp-us-east5',          41.50,  -81.69, 'Columbus, OH',              'Google Cloud', 'us-east5'),
  dc('gcp-us-central1',       41.26,  -95.86, 'Iowa',                      'Google Cloud', 'us-central1'),
  dc('gcp-us-west1',          45.60, -121.18, 'The Dalles, OR',            'Google Cloud', 'us-west1'),
  dc('gcp-us-west2',          34.05, -118.24, 'Los Angeles',               'Google Cloud', 'us-west2'),
  dc('gcp-us-west3',          40.76, -111.89, 'Salt Lake City',            'Google Cloud', 'us-west3'),
  dc('gcp-us-west4',          36.18, -115.14, 'Las Vegas',                 'Google Cloud', 'us-west4'),
  dc('gcp-us-south1',         32.78,  -96.80, 'Dallas, TX',                'Google Cloud', 'us-south1'),
  dc('gcp-na-ne1',            45.50,  -73.57, 'Montréal',                  'Google Cloud', 'northamerica-northeast1'),
  dc('gcp-na-ne2',            43.65,  -79.38, 'Toronto',                   'Google Cloud', 'northamerica-northeast2'),
  dc('gcp-sa-east1',         -23.55,  -46.63, 'São Paulo',                 'Google Cloud', 'southamerica-east1'),
  dc('gcp-sa-west1',         -33.45,  -70.67, 'Santiago',                  'Google Cloud', 'southamerica-west1'),
  dc('gcp-eu-west1',          50.44,    3.82, 'Belgium',                   'Google Cloud', 'europe-west1'),
  dc('gcp-eu-west2',          51.51,   -0.13, 'London',                    'Google Cloud', 'europe-west2'),
  dc('gcp-eu-west3',          48.86,    2.35, 'Paris',                     'Google Cloud', 'europe-west3'),
  dc('gcp-eu-west4',          53.45,    6.85, 'Netherlands',               'Google Cloud', 'europe-west4'),
  dc('gcp-eu-west6',          47.37,    8.54, 'Zurich',                    'Google Cloud', 'europe-west6'),
  dc('gcp-eu-west8',          45.46,    9.19, 'Milan',                     'Google Cloud', 'europe-west8'),
  dc('gcp-eu-west10',         52.52,   13.40, 'Berlin',                    'Google Cloud', 'europe-west10'),
  dc('gcp-eu-west12',         45.07,    7.69, 'Turin',                     'Google Cloud', 'europe-west12'),
  dc('gcp-eu-north1',         60.57,   27.19, 'Finland',                   'Google Cloud', 'europe-north1'),
  dc('gcp-eu-central2',       52.23,   21.01, 'Warsaw',                    'Google Cloud', 'europe-central2'),
  dc('gcp-eu-southwest1',     40.42,   -3.70, 'Madrid',                    'Google Cloud', 'europe-southwest1'),
  dc('gcp-me-west1',          32.08,   34.78, 'Tel Aviv',                  'Google Cloud', 'me-west1'),
  dc('gcp-me-central1',       25.29,   51.53, 'Doha',                      'Google Cloud', 'me-central1'),
  dc('gcp-me-central2',       24.45,   54.38, 'Abu Dhabi',                 'Google Cloud', 'me-central2'),
  dc('gcp-af-south1',        -26.20,   28.04, 'Johannesburg',              'Google Cloud', 'africa-south1'),
  dc('gcp-as-south1',         19.08,   72.88, 'Mumbai',                    'Google Cloud', 'asia-south1'),
  dc('gcp-as-south2',         28.64,   77.22, 'Delhi',                     'Google Cloud', 'asia-south2'),
  dc('gcp-as-se1',             1.35,  103.82, 'Singapore',                 'Google Cloud', 'asia-southeast1'),
  dc('gcp-as-se2',            -6.21,  106.85, 'Jakarta',                   'Google Cloud', 'asia-southeast2'),
  dc('gcp-as-east1',          25.04,  121.56, 'Taiwan',                    'Google Cloud', 'asia-east1'),
  dc('gcp-as-east2',          22.32,  114.17, 'Hong Kong',                 'Google Cloud', 'asia-east2'),
  dc('gcp-as-ne1',            35.69,  139.69, 'Tokyo',                     'Google Cloud', 'asia-northeast1'),
  dc('gcp-as-ne2',            34.69,  135.50, 'Osaka',                     'Google Cloud', 'asia-northeast2'),
  dc('gcp-as-ne3',            37.57,  126.98, 'Seoul',                     'Google Cloud', 'asia-northeast3'),
  dc('gcp-au-se1',           -33.87,  151.21, 'Sydney',                    'Google Cloud', 'australia-southeast1'),
  dc('gcp-au-se2',           -37.81,  144.97, 'Melbourne',                 'Google Cloud', 'australia-southeast2'),

  // ══ AWS ════════════════════════════════════════════════════════════════════
  dc('aws-us-east-1',         39.05,  -77.46, 'N. Virginia (Ashburn)',     'AWS', 'us-east-1'),
  dc('aws-us-east-2',         39.96,  -82.99, 'Ohio (Columbus)',           'AWS', 'us-east-2'),
  dc('aws-us-west-1',         37.34, -121.89, 'N. California',             'AWS', 'us-west-1'),
  dc('aws-us-west-2',         45.52, -122.68, 'Oregon (Portland)',         'AWS', 'us-west-2'),
  dc('aws-ca-central-1',      45.50,  -73.57, 'Canada (Montréal)',         'AWS', 'ca-central-1'),
  dc('aws-ca-west-1',         51.05, -114.07, 'Canada (Calgary)',          'AWS', 'ca-west-1'),
  dc('aws-eu-west-1',         53.33,   -6.25, 'Ireland (Dublin)',          'AWS', 'eu-west-1'),
  dc('aws-eu-west-2',         51.51,   -0.13, 'London',                    'AWS', 'eu-west-2'),
  dc('aws-eu-west-3',         48.86,    2.35, 'Paris',                     'AWS', 'eu-west-3'),
  dc('aws-eu-central-1',      50.11,    8.68, 'Frankfurt',                 'AWS', 'eu-central-1'),
  dc('aws-eu-central-2',      47.37,    8.54, 'Zurich',                    'AWS', 'eu-central-2'),
  dc('aws-eu-north-1',        59.33,   18.07, 'Stockholm',                 'AWS', 'eu-north-1'),
  dc('aws-eu-south-1',        45.46,    9.19, 'Milan',                     'AWS', 'eu-south-1'),
  dc('aws-eu-south-2',        40.42,   -3.70, 'Spain (Madrid)',            'AWS', 'eu-south-2'),
  dc('aws-ap-southeast-1',     1.35,  103.82, 'Singapore',                 'AWS', 'ap-southeast-1'),
  dc('aws-ap-southeast-2',   -33.87,  151.21, 'Sydney',                    'AWS', 'ap-southeast-2'),
  dc('aws-ap-southeast-3',    -6.21,  106.85, 'Jakarta',                   'AWS', 'ap-southeast-3'),
  dc('aws-ap-southeast-4',   -37.81,  144.97, 'Melbourne',                 'AWS', 'ap-southeast-4'),
  dc('aws-ap-northeast-1',    35.69,  139.69, 'Tokyo',                     'AWS', 'ap-northeast-1'),
  dc('aws-ap-northeast-2',    37.57,  126.98, 'Seoul',                     'AWS', 'ap-northeast-2'),
  dc('aws-ap-northeast-3',    34.69,  135.50, 'Osaka',                     'AWS', 'ap-northeast-3'),
  dc('aws-ap-south-1',        19.08,   72.88, 'Mumbai',                    'AWS', 'ap-south-1'),
  dc('aws-ap-south-2',        17.39,   78.49, 'Hyderabad',                 'AWS', 'ap-south-2'),
  dc('aws-ap-east-1',         22.32,  114.17, 'Hong Kong',                 'AWS', 'ap-east-1'),
  dc('aws-sa-east-1',        -23.55,  -46.63, 'São Paulo',                 'AWS', 'sa-east-1'),
  dc('aws-me-south-1',        26.21,   50.59, 'Bahrain',                   'AWS', 'me-south-1'),
  dc('aws-me-central-1',      25.20,   55.27, 'UAE (Dubai)',               'AWS', 'me-central-1'),
  dc('aws-af-south-1',       -33.93,   18.42, 'Cape Town',                 'AWS', 'af-south-1'),
  dc('aws-il-central-1',      31.97,   34.76, 'Israel (Tel Aviv)',         'AWS', 'il-central-1'),

  // ══ Microsoft Azure ════════════════════════════════════════════════════════
  dc('az-eastus',             37.37,  -79.82, 'East US (Virginia)',         'Azure', 'eastus'),
  dc('az-eastus2',            36.67,  -78.39, 'East US 2 (Virginia)',       'Azure', 'eastus2'),
  dc('az-westus',             37.78, -122.42, 'West US (California)',       'Azure', 'westus'),
  dc('az-westus2',            47.23, -119.85, 'West US 2 (Washington)',     'Azure', 'westus2'),
  dc('az-westus3',            33.45, -112.07, 'West US 3 (Arizona)',        'Azure', 'westus3'),
  dc('az-centralus',          41.59,  -93.62, 'Central US (Iowa)',          'Azure', 'centralus'),
  dc('az-northcentralus',     41.88,  -87.63, 'N. Central US (Illinois)',   'Azure', 'northcentralus'),
  dc('az-southcentralus',     29.42,  -98.50, 'S. Central US (Texas)',      'Azure', 'southcentralus'),
  dc('az-westcentralus',      40.89, -110.23, 'W. Central US (Wyoming)',    'Azure', 'westcentralus'),
  dc('az-canadacentral',      43.65,  -79.38, 'Canada Central (Toronto)',   'Azure', 'canadacentral'),
  dc('az-canadaeast',         46.82,  -71.22, 'Canada East (Québec)',       'Azure', 'canadaeast'),
  dc('az-brazilsouth',       -23.55,  -46.63, 'Brazil South (São Paulo)',   'Azure', 'brazilsouth'),
  dc('az-brazilsoutheast',   -22.91,  -43.17, 'Brazil SE (Rio)',            'Azure', 'brazilsoutheast'),
  dc('az-uksouth',            51.51,   -0.11, 'UK South (London)',          'Azure', 'uksouth'),
  dc('az-ukwest',             51.48,   -3.18, 'UK West (Cardiff)',          'Azure', 'ukwest'),
  dc('az-northeurope',        53.34,   -6.26, 'N. Europe (Ireland)',        'Azure', 'northeurope'),
  dc('az-westeurope',         52.37,    4.90, 'W. Europe (Netherlands)',    'Azure', 'westeurope'),
  dc('az-francecentral',      46.38,    2.37, 'France Central (Paris)',     'Azure', 'francecentral'),
  dc('az-francesouth',        43.60,    1.44, 'France South (Toulouse)',    'Azure', 'francesouth'),
  dc('az-germanywestcentral', 50.11,    8.68, 'Germany W. Central (Frankfurt)', 'Azure', 'germanywestcentral'),
  dc('az-germanynorth',       53.07,    8.80, 'Germany North (Bremen)',     'Azure', 'germanynorth'),
  dc('az-switzerlandnorth',   47.45,    8.56, 'Switzerland North (Zurich)','Azure', 'switzerlandnorth'),
  dc('az-switzerlandwest',    46.21,    6.14, 'Switzerland West (Geneva)', 'Azure', 'switzerlandwest'),
  dc('az-norwayeast',         59.91,   10.75, 'Norway East (Oslo)',         'Azure', 'norwayeast'),
  dc('az-norwaywest',         58.97,    5.73, 'Norway West (Stavanger)',    'Azure', 'norwaywest'),
  dc('az-swedencentral',      60.67,   17.14, 'Sweden Central',             'Azure', 'swedencentral'),
  dc('az-polandcentral',      52.23,   21.01, 'Poland Central (Warsaw)',    'Azure', 'polandcentral'),
  dc('az-italynorth',         45.46,    9.19, 'Italy North (Milan)',        'Azure', 'italynorth'),
  dc('az-spaincentral',       40.42,   -3.70, 'Spain Central (Madrid)',     'Azure', 'spaincentral'),
  dc('az-eastasia',           22.27,  114.19, 'East Asia (Hong Kong)',      'Azure', 'eastasia'),
  dc('az-southeastasia',       1.28,  103.83, 'SE Asia (Singapore)',        'Azure', 'southeastasia'),
  dc('az-australiaeast',     -33.86,  151.21, 'Australia East (Sydney)',    'Azure', 'australiaeast'),
  dc('az-australiasoutheast',-37.81,  144.96, 'Australia SE (Melbourne)',   'Azure', 'australiasoutheast'),
  dc('az-australiacentral',  -35.31,  149.12, 'Australia Central (Canberra)', 'Azure', 'australiacentral'),
  dc('az-japaneast',          35.68,  139.77, 'Japan East (Tokyo)',         'Azure', 'japaneast'),
  dc('az-japanwest',          34.69,  135.50, 'Japan West (Osaka)',         'Azure', 'japanwest'),
  dc('az-koreacentral',       37.57,  126.98, 'Korea Central (Seoul)',      'Azure', 'koreacentral'),
  dc('az-koreasouth',         35.18,  129.08, 'Korea South (Busan)',        'Azure', 'koreasouth'),
  dc('az-centralindia',       18.58,   73.92, 'Central India (Pune)',       'Azure', 'centralindia'),
  dc('az-southindia',         12.98,   80.16, 'South India (Chennai)',      'Azure', 'southindia'),
  dc('az-westindia',          19.09,   72.87, 'West India (Mumbai)',        'Azure', 'westindia'),
  dc('az-uaenorth',           25.20,   55.27, 'UAE North (Dubai)',          'Azure', 'uaenorth'),
  dc('az-uaecentral',         24.45,   54.38, 'UAE Central (Abu Dhabi)',    'Azure', 'uaecentral'),
  dc('az-qatarcentral',       25.29,   51.53, 'Qatar Central (Doha)',       'Azure', 'qatarcentral'),
  dc('az-israelcentral',      31.97,   34.76, 'Israel Central (Tel Aviv)',  'Azure', 'israelcentral'),
  dc('az-southafricanorth',  -25.73,   28.22, 'S. Africa North (Johannesburg)', 'Azure', 'southafricanorth'),
  dc('az-southafricawest',   -33.93,   18.42, 'S. Africa West (Cape Town)','Azure', 'southafricawest'),
  dc('az-mexicocentral',      20.97,  -89.62, 'Mexico Central',             'Azure', 'mexicocentral'),
  dc('az-newzealandnorth',   -36.87,  174.77, 'New Zealand North (Auckland)', 'Azure', 'newzealandnorth'),

  // ══ Oracle Cloud Infrastructure ════════════════════════════════════════════
  dc('oci-us-ashburn',        39.05,  -77.47, 'Ashburn, VA',               'Oracle', 'us-ashburn-1'),
  dc('oci-us-phoenix',        33.45, -112.07, 'Phoenix, AZ',               'Oracle', 'us-phoenix-1'),
  dc('oci-us-chicago',        41.88,  -87.63, 'Chicago, IL',               'Oracle', 'us-chicago-1'),
  dc('oci-us-sanjose',        37.34, -121.89, 'San Jose, CA',              'Oracle', 'us-sanjose-1'),
  dc('oci-ca-toronto',        43.65,  -79.38, 'Toronto',                   'Oracle', 'ca-toronto-1'),
  dc('oci-ca-montreal',       45.50,  -73.57, 'Montréal',                  'Oracle', 'ca-montreal-1'),
  dc('oci-eu-amsterdam',      52.37,    4.90, 'Amsterdam',                 'Oracle', 'eu-amsterdam-1'),
  dc('oci-eu-frankfurt',      50.11,    8.68, 'Frankfurt',                 'Oracle', 'eu-frankfurt-1'),
  dc('oci-eu-london',         51.51,   -0.13, 'London',                    'Oracle', 'eu-london-1'),
  dc('oci-eu-milan',          45.46,    9.19, 'Milan',                     'Oracle', 'eu-milan-1'),
  dc('oci-eu-paris',          48.86,    2.35, 'Paris',                     'Oracle', 'eu-paris-1'),
  dc('oci-eu-stockholm',      59.33,   18.07, 'Stockholm',                 'Oracle', 'eu-stockholm-1'),
  dc('oci-eu-zurich',         47.37,    8.54, 'Zurich',                    'Oracle', 'eu-zurich-1'),
  dc('oci-eu-madrid',         40.42,   -3.70, 'Madrid',                    'Oracle', 'eu-madrid-1'),
  dc('oci-eu-marseille',      43.30,    5.37, 'Marseille',                 'Oracle', 'eu-marseille-1'),
  dc('oci-ap-sydney',        -33.87,  151.21, 'Sydney',                    'Oracle', 'ap-sydney-1'),
  dc('oci-ap-melbourne',     -37.81,  144.97, 'Melbourne',                 'Oracle', 'ap-melbourne-1'),
  dc('oci-ap-tokyo',          35.69,  139.69, 'Tokyo',                     'Oracle', 'ap-tokyo-1'),
  dc('oci-ap-osaka',          34.69,  135.50, 'Osaka',                     'Oracle', 'ap-osaka-1'),
  dc('oci-ap-seoul',          37.57,  126.98, 'Seoul',                     'Oracle', 'ap-seoul-1'),
  dc('oci-ap-chuncheon',      37.88,  127.74, 'Chuncheon',                 'Oracle', 'ap-chuncheon-1'),
  dc('oci-ap-mumbai',         19.08,   72.88, 'Mumbai',                    'Oracle', 'ap-mumbai-1'),
  dc('oci-ap-hyderabad',      17.39,   78.49, 'Hyderabad',                 'Oracle', 'ap-hyderabad-1'),
  dc('oci-ap-singapore',       1.35,  103.82, 'Singapore',                 'Oracle', 'ap-singapore-1'),
  dc('oci-ap-auckland',      -36.87,  174.77, 'Auckland',                  'Oracle', 'ap-auckland-1'),
  dc('oci-me-dubai',          25.20,   55.27, 'Dubai',                     'Oracle', 'me-dubai-1'),
  dc('oci-me-abudhabi',       24.45,   54.38, 'Abu Dhabi',                 'Oracle', 'me-abudhabi-1'),
  dc('oci-me-riyadh',         24.69,   46.72, 'Riyadh',                    'Oracle', 'me-riyadh-1'),
  dc('oci-il-jerusalem',      31.77,   35.21, 'Jerusalem',                 'Oracle', 'il-jerusalem-1'),
  dc('oci-af-johannesburg',  -25.73,   28.22, 'Johannesburg',              'Oracle', 'af-johannesburg-1'),
  dc('oci-sa-saopaulo',      -23.55,  -46.63, 'São Paulo',                 'Oracle', 'sa-saopaulo-1'),
  dc('oci-sa-santiago',      -33.45,  -70.67, 'Santiago',                  'Oracle', 'sa-santiago-1'),
  dc('oci-sa-vinhedo',       -23.02,  -46.98, 'Vinhedo',                   'Oracle', 'sa-vinhedo-1'),
  dc('oci-sa-bogota',          4.71,  -74.07, 'Bogotá',                    'Oracle', 'sa-bogota-1'),

  // ══ SoftBank ═══════════════════════════════════════════════════════════════
  //  SoftBank operates IDC facilities primarily in Japan plus international
  //  PoP sites that host GPU clusters for the OpenAI partnership.
  dc('sb-tokyo1',             35.69,  139.69, 'Tokyo (Shiodome IDC)',      'SoftBank', 'JP-TYO-1'),
  dc('sb-tokyo2',             35.63,  139.74, 'Tokyo (Osaki IDC)',         'SoftBank', 'JP-TYO-2'),
  dc('sb-osaka',              34.69,  135.50, 'Osaka IDC',                 'SoftBank', 'JP-OSA'),
  dc('sb-fukuoka',            33.59,  130.40, 'Fukuoka IDC',               'SoftBank', 'JP-FUK'),
  dc('sb-nagoya',             35.18,  136.91, 'Nagoya IDC',                'SoftBank', 'JP-NGY'),
  dc('sb-sapporo',            43.06,  141.35, 'Sapporo IDC',               'SoftBank', 'JP-SAP'),
  dc('sb-dallas',             32.78,  -96.80, 'Dallas (SoftBank Edge)',     'SoftBank', 'US-DAL'),
  dc('sb-london',             51.51,   -0.13, 'London (SoftBank)',          'SoftBank', 'EU-LON'),
  dc('sb-singapore',           1.35,  103.82, 'Singapore (SoftBank)',       'SoftBank', 'AP-SGP'),

  // ══ Nvidia DGX Cloud ═══════════════════════════════════════════════════════
  //  Nvidia DGX Cloud is collocated with partner clouds at these sites.
  dc('nv-santaclara',         37.37, -121.97, 'Santa Clara, CA (Nvidia HQ/DGX)', 'Nvidia', 'US-SCA'),
  dc('nv-eastus',             37.37,  -79.82, 'E. US — Azure DGX',         'Nvidia', 'US-EAS'),
  dc('nv-centralus',          41.26,  -95.86, 'Central US — GCP DGX',      'Nvidia', 'US-CEN'),
  dc('nv-phoenix',            33.45, -112.07, 'Phoenix — Oracle DGX',      'Nvidia', 'US-PHX'),
  dc('nv-texas',              30.27,  -97.74, 'Austin, TX — CoreWeave',     'Nvidia', 'US-AUS'),
  dc('nv-frankfurt',          50.11,    8.68, 'Frankfurt — Azure DGX',     'Nvidia', 'EU-FRA'),
  dc('nv-netherlands',        52.37,    4.90, 'Amsterdam — Oracle DGX',    'Nvidia', 'EU-AMS'),
  dc('nv-tokyo',              35.69,  139.69, 'Tokyo — Azure DGX',         'Nvidia', 'AP-TYO'),
  dc('nv-singapore',           1.35,  103.82, 'Singapore — Azure DGX',     'Nvidia', 'AP-SGP'),

  // ══ xAI ════════════════════════════════════════════════════════════════════
  //  xAI's Colossus supercomputer cluster is in Memphis, TN.
  dc('xai-memphis',           35.15,  -90.05, 'Memphis, TN (Colossus)',    'xAI', 'US-MEM'),
];

// ─── Electricity Maps zone codes ─────────────────────────────────────────────
//  Maps each data-center ID to an Electricity Maps zone code.
//  Zone codes verified against the /v3/carbon-intensity/latest endpoint.

export const DC_ZONE_MAP: Record<string, string> = {
  // ── Google Cloud ──────────────────────────────────────────────────────────
  'gcp-us-east1':      'US-CAR-DEC',   // South Carolina
  'gcp-us-east4':      'US-MIDA-PJM',  // N. Virginia
  'gcp-us-east5':      'US-MIDA-PJM',  // Columbus OH
  'gcp-us-central1':   'US-MIDW-MISO', // Iowa
  'gcp-us-west1':      'US-NW-PACW',   // The Dalles OR
  'gcp-us-west2':      'US-CAL-CISO',  // Los Angeles
  'gcp-us-west3':      'US-NW-PACW',   // Salt Lake City
  'gcp-us-west4':      'US-SW-NEVP',   // Las Vegas
  'gcp-us-south1':     'US-TEX-ERCO',  // Dallas TX
  'gcp-na-ne1':        'CA-QC',        // Montréal
  'gcp-na-ne2':        'CA-ON',        // Toronto
  'gcp-sa-east1':      'BR-CS',        // São Paulo
  'gcp-sa-west1':      'CL-SEN',       // Santiago
  'gcp-eu-west1':      'BE',           // Belgium
  'gcp-eu-west2':      'GB',           // London
  'gcp-eu-west3':      'FR',           // Paris
  'gcp-eu-west4':      'NL',           // Netherlands
  'gcp-eu-west6':      'CH',           // Zurich
  'gcp-eu-west8':      'IT-NO',        // Milan
  'gcp-eu-west10':     'DE',           // Berlin
  'gcp-eu-west12':     'IT-NO',        // Turin
  'gcp-eu-north1':     'FI',           // Finland
  'gcp-eu-central2':   'PL',           // Warsaw
  'gcp-eu-southwest1': 'ES',           // Madrid
  'gcp-me-west1':      'IL',           // Tel Aviv
  'gcp-me-central1':   'QA',           // Doha
  'gcp-me-central2':   'AE',           // Abu Dhabi
  'gcp-af-south1':     'ZA',           // Johannesburg
  'gcp-as-south1':     'IN-WE',        // Mumbai
  'gcp-as-south2':     'IN-NO',        // Delhi
  'gcp-as-se1':        'SG',           // Singapore
  'gcp-as-se2':        'ID-JW',        // Jakarta
  'gcp-as-east1':      'TW',           // Taiwan
  'gcp-as-east2':      'HK',           // Hong Kong
  'gcp-as-ne1':        'JP-TK',        // Tokyo
  'gcp-as-ne2':        'JP-KY',        // Osaka
  'gcp-as-ne3':        'KR',           // Seoul
  'gcp-au-se1':        'AU-NSW',       // Sydney
  'gcp-au-se2':        'AU-VIC',       // Melbourne

  // ── AWS ───────────────────────────────────────────────────────────────────
  'aws-us-east-1':     'US-MIDA-PJM',  // N. Virginia
  'aws-us-east-2':     'US-MIDA-PJM',  // Ohio
  'aws-us-west-1':     'US-CAL-CISO',  // N. California
  'aws-us-west-2':     'US-NW-PACW',   // Oregon
  'aws-ca-central-1':  'CA-QC',        // Montréal
  'aws-ca-west-1':     'CA-AB',        // Calgary
  'aws-eu-west-1':     'IE',           // Ireland
  'aws-eu-west-2':     'GB',           // London
  'aws-eu-west-3':     'FR',           // Paris
  'aws-eu-central-1':  'DE',           // Frankfurt
  'aws-eu-central-2':  'CH',           // Zurich
  'aws-eu-north-1':    'SE',           // Stockholm
  'aws-eu-south-1':    'IT-NO',        // Milan
  'aws-eu-south-2':    'ES',           // Madrid
  'aws-ap-southeast-1':'SG',           // Singapore
  'aws-ap-southeast-2':'AU-NSW',       // Sydney
  'aws-ap-southeast-3':'ID-JW',        // Jakarta
  'aws-ap-southeast-4':'AU-VIC',       // Melbourne
  'aws-ap-northeast-1':'JP-TK',        // Tokyo
  'aws-ap-northeast-2':'KR',           // Seoul
  'aws-ap-northeast-3':'JP-KY',        // Osaka
  'aws-ap-south-1':    'IN-WE',        // Mumbai
  'aws-ap-south-2':    'IN-SO',        // Hyderabad
  'aws-ap-east-1':     'HK',           // Hong Kong
  'aws-sa-east-1':     'BR-CS',        // São Paulo
  'aws-me-south-1':    'BH',           // Bahrain
  'aws-me-central-1':  'AE',           // UAE Dubai
  'aws-af-south-1':    'ZA',           // Cape Town
  'aws-il-central-1':  'IL',           // Israel

  // ── Azure ─────────────────────────────────────────────────────────────────
  'az-eastus':         'US-MIDA-PJM',  // East US Virginia
  'az-eastus2':        'US-MIDA-PJM',  // East US 2 Virginia
  'az-westus':         'US-CAL-CISO',  // West US California
  'az-westus2':        'US-NW-PACW',   // West US 2 Washington
  'az-westus3':        'US-SW-AZPS',   // West US 3 Arizona
  'az-centralus':      'US-MIDW-MISO', // Central US Iowa
  'az-northcentralus': 'US-MIDW-MISO', // N. Central US Chicago
  'az-southcentralus': 'US-TEX-ERCO',  // S. Central US Texas
  'az-westcentralus':  'US-NW-PACW',   // W. Central US Wyoming
  'az-canadacentral':  'CA-ON',        // Canada Central Toronto
  'az-canadaeast':     'CA-QC',        // Canada East Québec
  'az-brazilsouth':    'BR-CS',        // Brazil South
  'az-northeurope':    'IE',           // North Europe Ireland
  'az-westeurope':     'NL',           // West Europe Netherlands
  'az-uksouth':        'GB',           // UK South
  'az-ukwest':         'GB',           // UK West
  'az-francecentral':  'FR',           // France Central
  'az-germanywestcentral': 'DE',       // Germany West Central
  'az-switzerlandnorth': 'CH',         // Switzerland North
  'az-norwayeast':     'NO',           // Norway East
  'az-swedencentral':  'SE',           // Sweden Central
  'az-polandcentral':  'PL',           // Poland Central
  'az-italynorth':     'IT-NO',        // Italy North
  'az-spaincentral':   'ES',           // Spain Central
  'az-uaenorth':       'AE',           // UAE North
  'az-southafricanorth': 'ZA',         // South Africa North
  'az-eastasia':       'HK',           // East Asia Hong Kong
  'az-southeastasia':  'SG',           // Southeast Asia Singapore
  'az-australiaeast':  'AU-NSW',       // Australia East Sydney
  'az-australiasoutheast': 'AU-VIC',   // Australia Southeast Melbourne
  'az-japaneast':      'JP-TK',        // Japan East Tokyo
  'az-japanwest':      'JP-KY',        // Japan West Osaka
  'az-koreacentral':   'KR',           // Korea Central Seoul
  'az-centralindia':   'IN-WE',        // Central India Pune
  'az-southindia':     'IN-SO',        // South India Chennai
  'az-westindia':      'IN-WE',        // West India Mumbai
  'az-israelcentral':  'IL',           // Israel Central
  'az-qatarcentral':   'QA',           // Qatar Central

  // ── Oracle (keys must match `id` in registry, e.g. oci-us-ashburn) ─────────
  'oci-us-ashburn':      'US-MIDA-PJM',
  'oci-us-phoenix':      'US-SW-AZPS',
  'oci-us-chicago':      'US-MIDW-MISO',
  'oci-us-sanjose':      'US-CAL-CISO',
  'oci-ca-toronto':      'CA-ON',
  'oci-ca-montreal':     'CA-QC',
  'oci-eu-frankfurt':    'DE',
  'oci-eu-amsterdam':    'NL',
  'oci-eu-london':       'GB',
  'oci-eu-paris':        'FR',
  'oci-eu-milan':        'IT-NO',
  'oci-eu-stockholm':    'SE',
  'oci-eu-madrid':       'ES',
  'oci-eu-zurich':       'CH',
  'oci-eu-marseille':    'FR',
  'oci-me-dubai':        'AE',
  'oci-me-abudhabi':     'AE',
  'oci-me-riyadh':       'SA',
  'oci-il-jerusalem':    'IL',
  'oci-af-johannesburg': 'ZA',
  'oci-ap-mumbai':       'IN-WE',
  'oci-ap-hyderabad':    'IN-SO',
  'oci-ap-singapore':    'SG',
  'oci-ap-sydney':       'AU-NSW',
  'oci-ap-melbourne':    'AU-VIC',
  'oci-ap-auckland':     'NZ',
  'oci-ap-osaka':        'JP-KY',
  'oci-ap-tokyo':        'JP-TK',
  'oci-ap-seoul':        'KR',
  'oci-ap-chuncheon':    'KR',
  'oci-sa-saopaulo':     'BR-CS',
  'oci-sa-santiago':     'CL-SEN',
  'oci-sa-vinhedo':      'BR-CS',
  'oci-sa-bogota':       'CO',

  // ── SoftBank (keys must match `id` in registry) ───────────────────────────
  'sb-tokyo1':         'JP-TK',
  'sb-tokyo2':         'JP-TK',
  'sb-osaka':          'JP-KY',
  'sb-fukuoka':        'JP-KY',
  'sb-nagoya':         'JP-TK',
  'sb-sapporo':        'JP-TK',
  'sb-dallas':         'US-TEX-ERCO',
  'sb-london':         'GB',
  'sb-singapore':      'SG',

  // ── Nvidia ────────────────────────────────────────────────────────────────
  'nv-santaclara':     'US-CAL-CISO',
  'nv-eastus':         'US-MIDA-PJM',
  'nv-centralus':      'US-MIDW-MISO',
  'nv-phoenix':        'US-SW-AZPS',
  'nv-texas':          'US-TEX-ERCO',
  'nv-frankfurt':      'DE',
  'nv-netherlands':    'NL',
  'nv-tokyo':          'JP-TK',
  'nv-singapore':      'SG',

  // ── xAI ───────────────────────────────────────────────────────────────────
  'xai-memphis':       'US-TEN-TVA',
};

/** All data centers enriched with Electricity Maps zone codes. */
export const ALL_DATA_CENTERS: DataCenter[] = _RAW_DATA_CENTERS.map((d) => ({
  ...d,
  zone: DC_ZONE_MAP[d.id] ?? d.zone,
}));

/** Deduplicated list of all zone codes present in the registry. */
export const ALL_ZONES: string[] = [
  ...new Set(Object.values(DC_ZONE_MAP).filter(Boolean)),
];

// ─── Haversine distance (km) ─────────────────────────────────────────────────

export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Closest-data-center resolver ────────────────────────────────────────────

/**
 * Given a model name and the user's coordinates, returns the data center
 * belonging to one of the model's providers that is geographically closest
 * to the user.
 *
 * Falls back to the first registered data center if no match is found.
 */
export function resolveClosestDataCenter(
  modelName: string,
  userLat: number,
  userLng: number,
): DataCenter {
  // Exact model_id lookup (MODEL_PROVIDERS keys are now exact model ids from config)
  const providers: string[] = MODEL_PROVIDERS[modelName] ?? [];

  const candidates = providers.length > 0
    ? ALL_DATA_CENTERS.filter((d) => providers.includes(d.provider))
    : ALL_DATA_CENTERS;

  if (candidates.length === 0) return ALL_DATA_CENTERS[0];

  let closest = candidates[0];
  let minDist = haversineKm(userLat, userLng, closest.lat, closest.lng);

  for (const d of candidates.slice(1)) {
    const dist = haversineKm(userLat, userLng, d.lat, d.lng);
    if (dist < minDist) {
      minDist = dist;
      closest = d;
    }
  }

  console.log(
    `[datacenterLocations] resolveClosestDataCenter: model=${modelName}, providers=${JSON.stringify(providers)}, closest=${closest.id}`,
  );
  return closest;
}

/**
 * Backward-compatible wrapper — resolves closest DC using Ashburn, VA as the
 * default user location (AWS us-east-1).
 *
 * Prefer `resolveClosestDataCenter` when the real user position is known.
 */
export function resolveDataCenter(modelName: string): DataCenter {
  return resolveClosestDataCenter(modelName, 39.05, -77.46);
}
