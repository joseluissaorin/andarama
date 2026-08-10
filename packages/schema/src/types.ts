/**
 * Formato tour.json de ULL360, version 1.
 *
 * Este modulo es la unica fuente de verdad del contrato entre el editor
 * (Studio), el motor de visualizacion (Viewer), el exportador y la API.
 * Cualquier cambio incompatible requiere incrementar TOUR_SCHEMA_VERSION
 * y registrar un migrador en ./migrate.ts.
 */

export const TOUR_SCHEMA_VERSION = 1;
export const TOUR_SCHEMA_URL = "https://ull360.dev/schema/tour-1.json";

/**
 * Cadena localizable: o bien un literal (idioma por defecto) o un mapa
 * de codigo de idioma BCP-47 a valor. La resolucion aplica fallback al
 * idioma por defecto del tour.
 */
export type L10n = string | Record<string, string>;

/** Angulos en radianes. yaw: [-PI, PI], pitch: [-PI/2, PI/2], fov vertical: (0, PI). */
export interface ViewParams {
  yaw: number;
  pitch: number;
  fov: number;
}

export interface ViewLimits {
  yawMin?: number;
  yawMax?: number;
  pitchMin?: number;
  pitchMax?: number;
  fovMin?: number;
  fovMax?: number;
}

/** Proyecciones de salida de la camara. */
export type Projection = "rectilinear" | "littlePlanet" | "fisheye" | "pannini" | "architectural";

export type StereoLayout = "mono" | "tb" | "sbs";

// ---------------------------------------------------------------------------
// Fuentes de escena
// ---------------------------------------------------------------------------

/** Piramide multirresolucion de caras de cubo (tiles de 512 px). */
export interface MultiresSource {
  kind: "multires";
  /** Numero de niveles de la piramide. */
  levels: number;
  tileSize: number;
  /** Tamano en px de la cara del cubo en el nivel maximo. */
  faceSize: number;
  /** Prefijo de ruta: {base}/{nivel}/{cara}/{y}/{x}.{ext} */
  base: string;
  /** Extension de tile preferente ("webp" | "jpg" | "avif"). El visor negocia fallback. */
  extension?: string;
  /** Formatos disponibles adicionales. */
  formats?: string[];
  /** Preview equirect pequeno (data URI base64 o ruta). */
  preview?: string;
}

/** Imagen equirectangular unica (completa o parcial). */
export interface EquirectSource {
  kind: "equirect";
  url: string;
  preview?: string;
  /** Panorama parcial: cobertura horizontal/vertical en radianes y offset. */
  partial?: { hfov: number; vfov: number; yawOffset?: number; pitchOffset?: number };
  stereo?: StereoLayout;
  hdr?: boolean;
}

/** Cubemap de 6 caras o tira. */
export interface CubemapSource {
  kind: "cubemap";
  /** Caras individuales. Claves: f, b, l, r, u, d. */
  faces?: Partial<Record<"f" | "b" | "l" | "r" | "u" | "d", string>>;
  /** Tira unica horizontal o vertical con orden de caras krpano/Marzipano. */
  strip?: { url: string; layout: "horizontal" | "vertical"; order?: string };
  preview?: string;
}

/** Panorama plano gigapixel (obra, documento, fachada) con pan/zoom tipo mapa. */
export interface FlatSource {
  kind: "flat";
  width: number;
  height: number;
  /** Multiresolucion opcional para gigapixel. */
  tiles?: { levels: number; tileSize: number; base: string; extension?: string };
  /** Imagen unica si es pequena. */
  url?: string;
  preview?: string;
}

export interface VideoRendition {
  url: string;
  /** MIME, p. ej. video/mp4, video/webm, application/x-mpegURL */
  type: string;
  /** Altura nominal en px para seleccion automatica (p. ej. 1080, 2160, 4320). */
  height?: number;
}

export interface SubtitleTrack {
  lang: string;
  label?: L10n;
  url: string;
}

/** Video 360 equirectangular. */
export interface VideoSource {
  kind: "video";
  renditions: VideoRendition[];
  /** URL HLS adaptativo (hls.js / nativo Safari). */
  hls?: string;
  /** UID de Cloudflare Stream (si el despliegue lo usa). */
  streamUid?: string;
  stereo?: StereoLayout;
  poster?: string;
  preview?: string;
  subtitles?: SubtitleTrack[];
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  /** Al terminar: bucle, saltar a escena, o congelar ultimo frame. */
  onEnd?: { action: "loop" | "goto" | "hold"; target?: string };
}

export type SceneSource = MultiresSource | EquirectSource | CubemapSource | FlatSource | VideoSource;

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

export interface AudioTrack {
  url: string;
  /** Variantes por idioma: si existe, prevalece sobre url. */
  urlByLang?: Record<string, string>;
  volume?: number;
  loop?: boolean;
}

export interface NarrationTrack extends AudioTrack {
  /** Bloquear la navegacion hasta que termine (docencia). */
  blockNavigation?: boolean;
  /** Transcripcion accesible. */
  transcript?: L10n;
  /** Reproducir automaticamente al entrar en la escena. */
  autoplay?: boolean;
}

/** Fuente de audio espacial anclada a una direccion de la esfera (Web Audio + HRTF). */
export interface SpatialAudioSource {
  id: string;
  url: string;
  yaw: number;
  pitch: number;
  volume?: number;
  loop?: boolean;
  /** Radio angular (rad) de audibilidad plena; fuera decae. */
  radius?: number;
}

export interface SceneAudio {
  ambient?: AudioTrack;
  narration?: NarrationTrack;
  spatial?: SpatialAudioSource[];
  /** Fundido cruzado del ambiente al cambiar de escena (s). */
  crossfade?: number;
}

// ---------------------------------------------------------------------------
// Hotspots
// ---------------------------------------------------------------------------

export type HotspotType =
  | "navigation"
  | "text"
  | "image"
  | "gallery"
  | "videoFile"
  | "embedVideo"
  | "audio"
  | "pdf"
  | "model3d"
  | "web"
  | "form"
  | "compare"
  | "quiz"
  | "polygon"
  | "tooltip"
  | "link"
  | "state";

/** Condicion sobre una variable de estado del tour. */
export interface VarCondition {
  var: string;
  op: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "truthy" | "falsy";
  value?: string | number | boolean;
}

export interface HotspotConditions {
  /** Visible solo en estos idiomas. */
  langs?: string[];
  /** Todas las condiciones deben cumplirse (AND). */
  vars?: VarCondition[];
  /** En escenas de video: visible solo en este rango temporal (s). */
  videoTime?: { from: number; to: number };
}

export interface HotspotIcon {
  /** Nombre de icono de la biblioteca integrada (lucide). */
  name?: string;
  /** SVG propio (saneado en ingesta). */
  svg?: string;
  /** URL de imagen. */
  url?: string;
  /** Tamano base en px. */
  size?: number;
  color?: string;
  /** Fondo circular. */
  chip?: boolean;
}

export interface HotspotStyle {
  icon?: HotspotIcon;
  /** Escalar con la distancia/zoom. */
  distanceScale?: boolean;
  /** Pulso de atencion. */
  pulse?: boolean;
  className?: string;
}

/** Accion generica reutilizable (usada por poligonos y variantes). */
export type HotspotAction =
  | { kind: "goto"; target: string; entry?: ConnectionEntry }
  | { kind: "openUrl"; url: string; newTab?: boolean }
  | { kind: "setVars"; actions: StateAction[] }
  | { kind: "openHotspot"; hotspotId: string }
  | { kind: "none" };

export interface StateAction {
  var: string;
  op: "set" | "inc" | "dec" | "toggle";
  value?: string | number | boolean;
}

export interface ConnectionEntry {
  /**
   * Como se orienta la vista al llegar a la escena de destino:
   *
   * - `forward`: se entra de espaldas a la puerta por la que se ha venido y se
   *   sigue de frente. Es lo natural de un recorrido a pie y se calcula solo a
   *   partir del paso de vuelta, sin que el autor ajuste nada.
   * - `fixed`: el angulo que decida el autor (yaw/pitch/fov).
   * - `lookBack`: se entra mirando la puerta por la que se ha venido.
   * - `relative`: mantiene el rumbo que llevaba el visitante. Con el norte de
   *   cada escena calibrado en el plano, mantiene el rumbo **real**.
   */
  mode: "forward" | "fixed" | "relative" | "lookBack";
  yaw?: number;
  pitch?: number;
  fov?: number;
}

export interface TransitionSpec {
  kind: "fade" | "zoom" | "crossRotate" | "cut";
  /** Duracion en ms. */
  duration?: number;
  easing?: "linear" | "easeIn" | "easeOut" | "easeInOut";
}

interface HotspotBase {
  id: string;
  type: HotspotType;
  yaw: number;
  pitch: number;
  label?: L10n;
  labelVisibility?: "always" | "hover" | "never";
  /** Texto alternativo accesible (obligatorio; el editor lo exige). */
  altText?: L10n;
  style?: HotspotStyle;
  conditions?: HotspotConditions;
  tooltip?: L10n;
}

export interface NavigationHotspot extends HotspotBase {
  type: "navigation";
  target: string;
  entry?: ConnectionEntry;
  transition?: TransitionSpec;
  /** Flecha de suelo direccional estilo Street View. */
  variant?: "icon" | "floorArrow";
}

export interface TextHotspot extends HotspotBase {
  type: "text";
  /** Markdown (saneado al renderizar). */
  body: L10n;
  title?: L10n;
}

export interface ImageHotspot extends HotspotBase {
  type: "image";
  url: string;
  /** Fuente tileada para zoom profundo gigapixel. */
  tiles?: FlatSource;
  caption?: L10n;
  download?: boolean;
}

export interface GalleryHotspot extends HotspotBase {
  type: "gallery";
  items: { url: string; thumb?: string; title?: L10n; description?: L10n }[];
}

export interface VideoFileHotspot extends HotspotBase {
  type: "videoFile";
  url: string;
  /** lightbox o pantalla proyectada sobre un poligono de la escena. */
  mode: "lightbox" | "projected";
  /** Esquinas del rectangulo proyectado (4 puntos yaw/pitch), para mode=projected. */
  corners?: { yaw: number; pitch: number }[];
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  subtitles?: SubtitleTrack[];
}

export interface EmbedVideoHotspot extends HotspotBase {
  type: "embedVideo";
  provider: "youtube" | "vimeo" | "peertube";
  /** ID de video (YouTube/Vimeo) o URL completa (PeerTube). */
  videoId: string;
  /** Host de la instancia PeerTube. */
  host?: string;
  start?: number;
  autoplay?: boolean;
  /** Sin cookies (youtube-nocookie / dnt=1). Activado por defecto. */
  nocookie?: boolean;
}

export interface AudioHotspot extends HotspotBase {
  type: "audio";
  url: string;
  mode: "player" | "spatial";
  volume?: number;
  loop?: boolean;
  radius?: number;
  transcript?: L10n;
}

export interface PdfHotspot extends HotspotBase {
  type: "pdf";
  url: string;
  download?: boolean;
  title?: L10n;
}

export interface Model3dHotspot extends HotspotBase {
  type: "model3d";
  url: string;
  format: "glb" | "gltf" | "obj" | "stl";
  /** AR en moviles (Scene Viewer / Quick Look). */
  ar?: boolean;
  /** USDZ para Quick Look de iOS. */
  usdz?: string;
  poster?: string;
}

export interface WebHotspot extends HotspotBase {
  type: "web";
  url: string;
  /** Flags de sandbox del iframe. */
  sandbox?: string[];
  allow?: string[];
  height?: number;
}

export type FormFieldType = "text" | "email" | "tel" | "select" | "checkbox" | "textarea";

export interface FormField {
  id: string;
  type: FormFieldType;
  label: L10n;
  required?: boolean;
  placeholder?: L10n;
  options?: { value: string; label: L10n }[];
}

export interface FormHotspot extends HotspotBase {
  type: "form";
  title?: L10n;
  fields: FormField[];
  destination: { api?: boolean; webhook?: string; email?: string };
  /** Proteccion anti-spam Turnstile (clave se inyecta en publicacion). */
  turnstile?: boolean;
  successMessage?: L10n;
  submitLabel?: L10n;
}

export interface CompareHotspot extends HotspotBase {
  type: "compare";
  /** images: dos imagenes con deslizador; panoramas: dos panoramas de la misma escena. */
  mode: "images" | "panoramas";
  before: { url?: string; sceneId?: string; label?: L10n };
  after: { url?: string; sceneId?: string; label?: L10n };
}

export interface QuizOption {
  id: string;
  text: L10n;
  correct?: boolean;
}

export interface QuizHotspot extends HotspotBase {
  type: "quiz";
  question: L10n;
  kind: "single" | "multiple" | "boolean";
  options: QuizOption[];
  feedbackCorrect?: L10n;
  feedbackWrong?: L10n;
  points?: number;
  /** Compuerta: no permite avanzar (deshabilita navegacion saliente) hasta acertar. */
  gate?: boolean;
  /** Numero de intentos permitidos (0 = ilimitados). */
  attempts?: number;
}

export interface PolygonHotspot extends HotspotBase {
  type: "polygon";
  points: { yaw: number; pitch: number }[];
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  action?: HotspotAction;
  hoverFill?: string;
}

export interface TooltipHotspot extends HotspotBase {
  type: "tooltip";
  text: L10n;
  permanent?: boolean;
}

export interface LinkHotspot extends HotspotBase {
  type: "link";
  url: string;
  scheme?: "url" | "tel" | "mailto";
  newTab?: boolean;
}

export interface StateHotspot extends HotspotBase {
  type: "state";
  actions: StateAction[];
  /** Cambiar de escena tras aplicar (puertas, dia/noche). */
  thenGoto?: string;
  thenEntry?: ConnectionEntry;
}

export type Hotspot =
  | NavigationHotspot
  | TextHotspot
  | ImageHotspot
  | GalleryHotspot
  | VideoFileHotspot
  | EmbedVideoHotspot
  | AudioHotspot
  | PdfHotspot
  | Model3dHotspot
  | WebHotspot
  | FormHotspot
  | CompareHotspot
  | QuizHotspot
  | PolygonHotspot
  | TooltipHotspot
  | LinkHotspot
  | StateHotspot;

// ---------------------------------------------------------------------------
// Escenas, conexiones, mapas
// ---------------------------------------------------------------------------

export interface SceneMapPlacement {
  /** ID del plano de planta. */
  floorplan?: string;
  /** Posicion normalizada [0,1] sobre el plano. */
  x?: number;
  y?: number;
  /** Rumbo del norte del panorama respecto al plano (rad) para el radar. */
  north?: number;
  /** Coordenadas geograficas (mapa OSM). */
  lat?: number;
  lng?: number;
}

export interface Scene {
  id: string;
  type: "image" | "video" | "flat";
  title: L10n;
  description?: L10n;
  /** Texto alternativo accesible de la escena (obligatorio). */
  altText?: L10n;
  /** Categoria para agrupar en el menu de escenas. */
  category?: L10n;
  source: SceneSource;
  thumbnail?: string;
  initialView?: ViewParams;
  limits?: ViewLimits;
  audio?: SceneAudio;
  map?: SceneMapPlacement;
  hotspots: Hotspot[];
  /** Excluir del menu de escenas. */
  hidden?: boolean;
  /** Rotacion automatica especifica de la escena (anula la del tour). */
  autorotate?: AutorotateConfig | false;
}

export interface Floorplan {
  id: string;
  title: L10n;
  /** Imagen del plano. */
  url: string;
  /** Orden del selector de nivel (planta -1, 0, 1...). */
  level?: number;
  width?: number;
  height?: number;
}

export interface GeoMapConfig {
  enabled: boolean;
  /** Plantilla de tiles (por defecto OSM). */
  tileUrl?: string;
  attribution?: string;
  /** Centro/zoom inicial; si no, se ajusta a los marcadores. */
  center?: { lat: number; lng: number };
  zoom?: number;
}

// ---------------------------------------------------------------------------
// Autopilot, gamificacion
// ---------------------------------------------------------------------------

export interface AutorotateConfig {
  enabled: boolean;
  /** Velocidad en rad/s. */
  speed?: number;
  /** Retardo de inactividad antes de arrancar (s). */
  delay?: number;
  direction?: "cw" | "ccw";
}

export interface AutopilotStep {
  scene: string;
  /** Vista objetivo al llegar. */
  view?: ViewParams;
  /** Tiempo de permanencia en la escena (s), ademas de la rotacion. */
  dwell?: number;
  /** Angulo a rotar en la escena (rad; 2*PI = vuelta completa). */
  rotate?: number;
  /** Pausar sobre estos hotspots (abre el panel n segundos). */
  pauseOnHotspots?: string[];
}

export interface AutopilotRoute {
  id: string;
  title: L10n;
  steps: AutopilotStep[];
  /** Reanudar tras n segundos de inactividad del usuario. */
  resumeAfter?: number;
  loop?: boolean;
}

export interface QuizConfig {
  /** Puntuacion minima para aprobar (porcentaje 0-100). */
  passingScore?: number;
  /** Aleatorizar orden de opciones. */
  randomize?: boolean;
  /** Intentos por pregunta (0 = ilimitados). */
  attempts?: number;
  /** Mostrar informe final. */
  finalReport?: boolean;
  /** Certificado de finalizacion (PDF con nombre del participante). */
  certificate?: { enabled: boolean; title?: L10n; signature?: string };
}

export interface TreasureHuntConfig {
  enabled: boolean;
  title?: L10n;
  /** IDs de hotspots objetivo a encontrar. */
  targets: { hotspotId: string; sceneId: string; label?: L10n }[];
  /** Mensaje al completar. */
  completionMessage?: L10n;
}

// ---------------------------------------------------------------------------
// UI / skin
// ---------------------------------------------------------------------------

export interface WelcomeScreen {
  enabled: boolean;
  title?: L10n;
  body?: L10n;
  image?: string;
  startLabel?: L10n;
  /** Mostrar instrucciones de control. */
  showControls?: boolean;
}

export interface FinalScreen {
  enabled: boolean;
  title?: L10n;
  body?: L10n;
  cta?: { label: L10n; url: string };
}

export interface ThemeConfig {
  /** Predefinidos: "light" | "dark" | "auto" | "ull". */
  base?: "light" | "dark" | "auto" | "ull";
  primaryColor?: string;
  fontFamily?: string;
  borderRadius?: string;
  /** CSS propio del tour (saneado). */
  customCss?: string;
}

export interface UIConfig {
  /** Tamaño en px del botón de los hotspots (por defecto 44). */
  hotspotSize?: number;
  titleBar?: boolean;
  sceneMenu?: boolean;
  thumbnails?: boolean;
  compass?: boolean;
  loadingIndicator?: boolean;
  zoomControls?: boolean;
  gyroToggle?: boolean;
  vr?: boolean;
  fullscreen?: boolean;
  share?: boolean;
  mute?: boolean;
  help?: boolean;
  langSelector?: boolean;
  /** Logotipo con enlace. */
  logo?: { image: string; link?: string };
  /** Marca de agua / parche de nadir con logo. */
  watermark?: { image: string; link?: string };
  nadirPatch?: { image: string; size?: number };
  welcome?: WelcomeScreen;
  final?: FinalScreen;
  theme?: ThemeConfig;
  /** Modo accesible lineal disponible. */
  accessibleMode?: boolean;
}

/**
 * Qué se puede accionar dentro de las gafas. Hay recorridos donde solo se
 * quiere caminar y que el contenido se lea fuera, y otros donde todo debe
 * estar disponible: se decide por familias o tipo a tipo.
 */
/**
 * Lo que se ve cuando alguien pega el enlace del tour en WhatsApp, en Twitter,
 * en Teams o en el aula virtual. Sin esto, cada red inventa lo que le parece a
 * partir del título de la página.
 */
export interface SocialConfig {
  /** Título de la tarjeta (por defecto, el del tour). */
  title?: L10n;
  /** Texto de la tarjeta (por defecto, la descripción del tour). */
  description?: L10n;
  /** Imagen de la tarjeta: 1200x630 px es lo que esperan casi todas. */
  image?: string;
  /** Texto alternativo de esa imagen. */
  imageAlt?: L10n;
  /** og:type — "website" salvo casos raros. */
  type?: string;
  /** og:site_name: el nombre de la institución. */
  siteName?: string;
  /** Tarjeta de X/Twitter. */
  twitterCard?: "summary" | "summary_large_image" | "player";
  /** @usuario del sitio y del autor, con arroba. */
  twitterSite?: string;
  twitterCreator?: string;
  /** Idioma declarado (og:locale), p. ej. es_ES. */
  locale?: string;
  /** Pedir a los buscadores que no lo indexen. */
  noindex?: boolean;
}

export interface VrConfig {
  /** Modo inmersivo disponible (por defecto sí). */
  enabled?: boolean;
  /** all: todos; navigationOnly: solo pasos; custom: la lista `types`. */
  hotspots?: "all" | "navigationOnly" | "custom";
  /** Excepciones por tipo cuando `hotspots` es "custom" (true = disponible). */
  types?: Record<string, boolean>;
  /** Retículo de mirada: segundos de permanencia para activar. */
  dwellSeconds?: number;
}

export interface AnalyticsConfig {
  /** Analitica propia sin cookies (activada por defecto en publicacion). */
  enabled?: boolean;
  /** Endpoint propio para paquetes exportados. */
  endpoint?: string;
  /** Integraciones opcionales, desactivadas por defecto. */
  ga4?: string;
  matomo?: { url: string; siteId: string };
}

// ---------------------------------------------------------------------------
// Tour raiz
// ---------------------------------------------------------------------------

export interface TourMeta {
  title: L10n;
  description?: L10n;
  author?: string;
  defaultLang: string;
  langs: string[];
  /** Imagen OG de comparticion. */
  ogImage?: string;
}

export interface TourStart {
  scene: string;
  view?: ViewParams;
  /** Efecto de introduccion. */
  intro?: "none" | "littlePlanet" | "fade";
}

export interface ControlsConfig {
  /** Sensibilidad de arrastre (multiplicador). */
  sensitivity?: number;
  /** Inercia [0,1]. */
  inertia?: number;
  invertX?: boolean;
  invertY?: boolean;
  wheelZoom?: boolean;
  gyroAvailable?: boolean;
  keyboard?: boolean;
  gamepad?: boolean;
}

export interface Tour {
  $schema?: string;
  version: number;
  meta: TourMeta;
  start: TourStart;
  scenes: Scene[];
  floorplans?: Floorplan[];
  geoMap?: GeoMapConfig;
  ui?: UIConfig;
  controls?: ControlsConfig;
  /** Comportamiento en gafas y cardboard. */
  vr?: VrConfig;
  /** Metadatos de compartición (Open Graph y tarjetas de X/Twitter). */
  social?: SocialConfig;
  /** Transicion por defecto entre escenas. */
  transition?: TransitionSpec;
  autorotate?: AutorotateConfig;
  autopilot?: AutopilotRoute[];
  /** Variables de estado iniciales. */
  variables?: Record<string, string | number | boolean>;
  quiz?: QuizConfig;
  treasureHunt?: TreasureHuntConfig;
  /** Musica de fondo global con ducking en narraciones. */
  globalAudio?: AudioTrack;
  analytics?: AnalyticsConfig;
}
