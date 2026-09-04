const VERSION = "1.0.0";
const TAG_NAME = "ha-native-nav-position";
const STYLE_ID = "ha-native-nav-position-style-current";
const NAV_ATTR = "data-ha-native-nav-position-active";
const NAV_PART_ATTR = "data-ha-native-nav-position-part";
const CONTROL_SIZE_VAR = "--ha-native-nav-control-size";
const ICON_SIZE_VAR = "--ha-native-nav-icon-size";
const TAB_Y_OFFSET_VAR = "--ha-native-nav-tab-y-offset";
const ICON_Y_OFFSET_VAR = "--ha-native-nav-icon-y-offset";
const VIEW_ICON_Y_OFFSET_VAR = "--ha-native-nav-view-icon-y-offset";
const CONTENT_Y_OFFSET_VAR = "--ha-native-nav-content-y-offset";
const MENU_Y_OFFSET_VAR = "--ha-native-nav-menu-y-offset";
const SIDEBAR_INSET_VAR = "--ha-native-nav-sidebar-inset";
const IOS_VIEW_Y_OFFSET = "0px";
const TAB_SHADOW_HOSTS = new Set([
  "ha-tab-group-tab",
  "sl-tab",
  "wa-tab",
  "mwc-tab",
  "md-primary-tab",
  "md-secondary-tab"
]);
const TAB_GROUP_SHADOW_HOSTS = new Set([
  "ha-tab-group",
  "sl-tab-group",
  "wa-tab-group",
  "ha-tabs",
  "paper-tabs",
  "mwc-tab-bar"
]);
const BUTTON_SHADOW_HOSTS = new Set([
  "ha-menu-button",
  "ha-icon-button",
  "ha-button-menu",
  "ha-button",
  "mwc-icon-button",
  "md-icon-button",
  "wa-button"
]);
const ICON_SHADOW_HOSTS = new Set([
  "ha-icon",
  "ha-svg-icon",
  "wa-icon",
  "mwc-icon",
  "md-icon",
  "iron-icon"
]);
const VIEW_TAB_SELECTOR = "ha-tab-group-tab, sl-tab, wa-tab, paper-tab, mwc-tab, md-primary-tab, md-secondary-tab";
const DOCK_CONTENT_ICON_SELECTOR = "ha-icon, ha-svg-icon, wa-icon, mwc-icon, md-icon, iron-icon, svg, .ha-icon, .icon, .mdc-icon-button__icon";
const SVG_GRAPHIC_SELECTOR = "path, g, rect, circle, ellipse, line, polyline, polygon, use";
const NON_DASHBOARD_PREFIXES = [
  "/config",
  "/developer-tools",
  "/hacs",
  "/profile",
  "/energy",
  "/map",
  "/history",
  "/logbook",
  "/media-browser",
  "/todo",
  "/calendar",
  "/shopping-list",
  "/settings"
];

const DEFAULT_CONFIG = {
  enabled: true,
  position: "bottom",
  only: "all",
  mobile_only: false,
  mobile_max_width: "768px",
  dock: true,
  hide_labels: true,
  compact: true,
  offset: "18px",
  height: "64px",
  radius: "30px",
  side_gap: "12px",
  tab_y_offset: "0px",
  ios_content_y_offset: "-24px",
  ios_menu_y_offset: "-16px",
  ios_menu_icon_y_offset: "-4px",
  ios_icon_y_offset: "0px",
  ios_view_icon_y_offset: "0px",
  ios_bottom_offset: "8px",
  bottom_padding: "128px",
  top_padding: "88px",
  background: "rgba(35, 48, 64, 0.54)",
  header_background: "rgba(35, 48, 64, 0.54)",
  active_background: "transparent",
  active_color: "var(--accent-color, var(--primary-color))",
  inactive_color: "rgba(255, 255, 255, 0.78)",
  border: "0 solid transparent",
  shadow: "none",
  z_index: 1000
};

const state = {
  config: { ...DEFAULT_CONFIG },
  observers: new WeakMap(),
  tabScrollHandlers: new WeakMap(),
  actionMenuRecords: new WeakMap(),
  viewPointerGesture: {
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    tab: null
  },
  applyTimer: 0,
  started: false
};

const toKebab = (value) =>
  String(value).replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);

const toBool = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const toCssSize = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "number") return `${value}px`;
  const text = String(value).trim();
  return /^\d+(\.\d+)?$/.test(text) ? `${text}px` : text;
};

const safeText = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
};

function addCssSize(base, delta) {
  const deltaText = String(delta || "0px").trim();
  if (!deltaText || deltaText === "0" || deltaText === "0px") return base;
  if (deltaText.startsWith("-")) return `calc(${base} - ${deltaText.slice(1)})`;
  return `calc(${base} + ${deltaText})`;
}

function isIOSLike() {
  const nav = window.navigator || {};
  const userAgent = nav.userAgent || "";
  const platform = nav.platform || "";
  const touchCallout =
    typeof window.CSS?.supports === "function" &&
    window.CSS.supports("-webkit-touch-callout", "none");
  return (
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (platform === "MacIntel" && Number(nav.maxTouchPoints) > 1) ||
    touchCallout
  );
}

function normalizeOnly(value, legacyMobileOnly) {
  const text = String(value ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (["mobile", "phone", "ios", "android"].includes(text)) return "mobile";
  if (["web", "desktop", "large"].includes(text)) return "web";
  if (["all", "both", "everywhere", "always", ""].includes(text)) {
    return legacyMobileOnly ? "mobile" : "all";
  }
  return legacyMobileOnly ? "mobile" : "all";
}

function scopeCss(config, css) {
  if (config.only === "mobile" || config.mobile_only) {
    return `
      @media (max-width: ${config.mobile_max_width}) {
        ${css}
      }
    `;
  }

  if (config.only === "web") {
    return `
      @media (min-width: ${config.mobile_max_width}) {
        ${css}
      }
    `;
  }

  return css;
}

function readUrlConfig() {
  let url;
  try {
    url = new URL(import.meta.url);
  } catch (_error) {
    return {};
  }

  const config = {};
  for (const [rawKey, rawValue] of url.searchParams.entries()) {
    const key = rawKey.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    config[key] = rawValue;
  }
  return config;
}

function normalizeConfig(input = {}) {
  const merged = { ...DEFAULT_CONFIG, ...input };
  const normalized = {};

  normalized.enabled = toBool(merged.enabled, DEFAULT_CONFIG.enabled);
  normalized.position = String(merged.position || DEFAULT_CONFIG.position).toLowerCase() === "top" ? "top" : "bottom";
  normalized.only = normalizeOnly(merged.only, toBool(merged.mobile_only ?? merged.mobileOnly, DEFAULT_CONFIG.mobile_only));
  normalized.mobile_only = normalized.only === "mobile";
  normalized.dock = toBool(merged.dock, DEFAULT_CONFIG.dock);
  normalized.hide_labels = toBool(merged.hide_labels ?? merged.hideLabels, DEFAULT_CONFIG.hide_labels);
  normalized.compact = toBool(merged.compact, DEFAULT_CONFIG.compact);
  normalized.mobile_max_width = toCssSize(merged.mobile_max_width ?? merged.mobileMaxWidth, DEFAULT_CONFIG.mobile_max_width);
  normalized.offset = toCssSize(merged.offset, DEFAULT_CONFIG.offset);
  normalized.height = toCssSize(merged.height, DEFAULT_CONFIG.height);
  normalized.radius = toCssSize(merged.radius, DEFAULT_CONFIG.radius);
  normalized.side_gap = toCssSize(merged.side_gap ?? merged.sideGap, DEFAULT_CONFIG.side_gap);
  normalized.tab_y_offset = toCssSize(merged.tab_y_offset ?? merged.tabYOffset, DEFAULT_CONFIG.tab_y_offset);
  normalized.ios_content_y_offset = toCssSize(
    merged.ios_content_y_offset ?? merged.iosContentYOffset,
    DEFAULT_CONFIG.ios_content_y_offset
  );
  normalized.ios_menu_y_offset = toCssSize(
    merged.ios_menu_y_offset ?? merged.iosMenuYOffset,
    DEFAULT_CONFIG.ios_menu_y_offset
  );
  normalized.ios_menu_icon_y_offset = toCssSize(
    merged.ios_menu_icon_y_offset ?? merged.iosMenuIconYOffset,
    DEFAULT_CONFIG.ios_menu_icon_y_offset
  );
  normalized.ios_icon_y_offset = toCssSize(
    merged.ios_icon_y_offset ?? merged.iosIconYOffset,
    DEFAULT_CONFIG.ios_icon_y_offset
  );
  normalized.ios_view_icon_y_offset = toCssSize(
    merged.ios_view_icon_y_offset ?? merged.iosViewIconYOffset,
    DEFAULT_CONFIG.ios_view_icon_y_offset
  );
  normalized.ios_bottom_offset = toCssSize(
    merged.ios_bottom_offset ?? merged.iosBottomOffset,
    DEFAULT_CONFIG.ios_bottom_offset
  );
  normalized.bottom_padding = toCssSize(merged.bottom_padding ?? merged.bottomPadding, DEFAULT_CONFIG.bottom_padding);
  normalized.top_padding = toCssSize(merged.top_padding ?? merged.topPadding, DEFAULT_CONFIG.top_padding);
  normalized.background = safeText(merged.background, DEFAULT_CONFIG.background);
  normalized.header_background = safeText(
    merged.header_background ?? merged.headerBackground ?? merged.background,
    DEFAULT_CONFIG.header_background
  );
  normalized.active_background = safeText(merged.active_background ?? merged.activeBackground, DEFAULT_CONFIG.active_background);
  normalized.active_color = safeText(merged.active_color ?? merged.activeColor, DEFAULT_CONFIG.active_color);
  normalized.inactive_color = safeText(merged.inactive_color ?? merged.inactiveColor, DEFAULT_CONFIG.inactive_color);
  normalized.border = safeText(merged.border, DEFAULT_CONFIG.border);
  normalized.shadow = safeText(merged.shadow, DEFAULT_CONFIG.shadow);
  normalized.z_index = Number.parseInt(merged.z_index ?? merged.zIndex, 10) || DEFAULT_CONFIG.z_index;

  return normalized;
}

function buildTabCss(config) {
  if (!config.hide_labels) return "";

  const tabWidth = config.compact ? "48px" : "56px";
  const controlSize = `var(${CONTROL_SIZE_VAR}, ${tabWidth})`;
  const iconSize = `var(${ICON_SIZE_VAR}, 24px)`;
  const tabYOffset = `var(${TAB_Y_OFFSET_VAR}, ${config.tab_y_offset})`;
  const controlRadius = `calc(${controlSize} / 2)`;
  const headerSelector = `.header[${NAV_ATTR}]`;

  return `
    ${headerSelector} ha-tab-group,
    ${headerSelector} sl-tab-group,
    ${headerSelector} wa-tab-group {
      --mdc-tab-height: ${controlSize} !important;
      --mdc-tab-indicator-active-indicator-height: 0 !important;
      --mdc-tab-indicator-active-indicator-color: transparent !important;
      --md-primary-tab-container-height: ${controlSize} !important;
      --md-primary-tab-active-indicator-height: 0 !important;
      --md-primary-tab-active-indicator-color: transparent !important;
      --sl-spacing-large: 0px !important;
      --ha-tab-padding-start: 0px !important;
      --ha-tab-padding-end: 0px !important;
      flex: 1 1 auto !important;
      min-width: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      max-height: ${controlSize} !important;
      align-self: center !important;
      position: relative !important;
      top: calc(${tabYOffset} + var(${CONTENT_Y_OFFSET_VAR}, 0px)) !important;
      transform: none !important;
      translate: 0 0 !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      touch-action: pan-x !important;
      overscroll-behavior-x: contain !important;
      -webkit-overflow-scrolling: touch !important;
      pointer-events: auto !important;
      scroll-behavior: auto !important;
      scroll-snap-type: none !important;
      scroll-padding-inline: 0 !important;
      scrollbar-width: none !important;
    }

    ${headerSelector} ha-tab-group::-webkit-scrollbar,
    ${headerSelector} sl-tab-group::-webkit-scrollbar,
    ${headerSelector} wa-tab-group::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }

    ${headerSelector} ha-tab-group-tab,
    ${headerSelector} ha-tab-group-tab[class~="icon-only"] {
      --mdc-tab-min-width: ${controlSize} !important;
      --mdc-tab-width: ${controlSize} !important;
      --mdc-tab-height: ${controlSize} !important;
      --mdc-tab-indicator-active-indicator-height: 0 !important;
      --mdc-tab-indicator-active-indicator-color: transparent !important;
      --md-primary-tab-container-height: ${controlSize} !important;
      --md-primary-tab-active-indicator-height: 0 !important;
      --md-primary-tab-active-indicator-color: transparent !important;
      --md-focus-ring-color: transparent !important;
      --md-ripple-hover-color: transparent !important;
      --md-ripple-pressed-color: transparent !important;
      --md-ripple-focus-color: transparent !important;
      --mdc-ripple-color: transparent !important;
      --mdc-ripple-hover-opacity: 0 !important;
      --mdc-ripple-focus-opacity: 0 !important;
      --mdc-ripple-press-opacity: 0 !important;
      flex: 0 0 ${controlSize} !important;
      width: ${controlSize} !important;
      min-width: ${controlSize} !important;
      max-width: ${controlSize} !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      max-height: ${controlSize} !important;
      margin: 0 1px !important;
      border: 0 !important;
      border-top: 0 !important;
      border-right: 0 !important;
      border-bottom: 0 !important;
      border-left: 0 !important;
      border-block: 0 !important;
      border-inline: 0 !important;
      border-color: transparent !important;
      border-radius: ${controlRadius} !important;
      overflow: hidden !important;
      position: relative !important;
      inset: auto !important;
      color: ${config.inactive_color} !important;
      opacity: 0.82 !important;
      background: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
      transform: none !important;
      translate: 0 0 !important;
      transition: color 140ms ease, opacity 140ms ease !important;
      touch-action: pan-x !important;
      overscroll-behavior-x: contain !important;
      scroll-snap-align: none !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-sizing: border-box !important;
      line-height: 0 !important;
    }

    ${headerSelector} ha-tab-group-tab[active],
    ${headerSelector} ha-tab-group-tab[aria-selected="true"],
    ${headerSelector} ha-tab-group-tab[aria-current="page"],
    ${headerSelector} ha-tab-group-tab[selected],
    ${headerSelector} ha-tab-group-tab.active,
    ${headerSelector} ha-tab-group-tab.iron-selected {
      color: ${config.active_color} !important;
      opacity: 1 !important;
      background: transparent !important;
      border: 0 !important;
      border-top: 0 !important;
      border-right: 0 !important;
      border-bottom: 0 !important;
      border-left: 0 !important;
      border-block: 0 !important;
      border-inline: 0 !important;
      border-color: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
    }

    ${headerSelector} ha-tab-group-tab::part(base),
    ${headerSelector} ha-tab-group-tab[class~="icon-only"]::part(base) {
      width: ${controlSize} !important;
      min-width: ${controlSize} !important;
      max-width: ${controlSize} !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      max-height: ${controlSize} !important;
      padding: 0 !important;
      border-radius: 50% !important;
      background: transparent !important;
      background-image: none !important;
      border: 0 !important;
      border-top: 0 !important;
      border-right: 0 !important;
      border-bottom: 0 !important;
      border-left: 0 !important;
      border-block: 0 !important;
      border-inline: 0 !important;
      border-color: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
      filter: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      box-sizing: border-box !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      overflow: hidden !important;
      line-height: 0 !important;
    }

    ${headerSelector} ha-tab-group-tab[active]::part(base),
    ${headerSelector} ha-tab-group-tab[aria-selected="true"]::part(base),
    ${headerSelector} ha-tab-group-tab[aria-current="page"]::part(base),
    ${headerSelector} ha-tab-group-tab[selected]::part(base),
    ${headerSelector} ha-tab-group-tab.active::part(base),
    ${headerSelector} ha-tab-group-tab.iron-selected::part(base) {
      background: ${config.active_background} !important;
      border: 0 !important;
      border-top: 0 !important;
      border-right: 0 !important;
      border-bottom: 0 !important;
      border-left: 0 !important;
      border-block: 0 !important;
      border-inline: 0 !important;
      border-color: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
    }

    ${headerSelector} ha-tab-group-tab .mdc-tab__text-label {
      display: none !important;
    }

    ${headerSelector} ha-tab-group-tab .mdc-tab__content span,
    ${headerSelector} ha-tab-group-tab .label,
    ${headerSelector} ha-tab-group-tab [part~="label"] {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 100% !important;
      height: 100% !important;
      padding: 0 !important;
      margin: 0 !important;
      font-size: 0 !important;
      line-height: 0 !important;
      color: inherit !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
    }

    ${headerSelector} ha-tab-group-tab .mdc-tab,
    ${headerSelector} ha-tab-group-tab mwc-tab,
    ${headerSelector} ha-tab-group-tab md-primary-tab,
    ${headerSelector} ha-tab-group-tab md-secondary-tab,
    ${headerSelector} ha-tab-group-tab .mdc-tab__content,
    ${headerSelector} ha-tab-group-tab [part~="content"] {
      width: 100% !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      max-height: ${controlSize} !important;
      padding: 0 !important;
      margin: 0 !important;
      border-radius: ${controlRadius} !important;
      background: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
      border: 0 !important;
      border-top: 0 !important;
      border-right: 0 !important;
      border-bottom: 0 !important;
      border-left: 0 !important;
      border-block: 0 !important;
      border-inline: 0 !important;
      border-color: transparent !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      line-height: 0 !important;
    }

    ${headerSelector} ha-tab-group-tab ha-icon,
    ${headerSelector} ha-tab-group-tab[class~="icon-only"] ha-icon,
    ${headerSelector} ha-tab-group-tab ha-svg-icon,
    ${headerSelector} ha-tab-group-tab[class~="icon-only"] ha-svg-icon,
    ${headerSelector} ha-tab-group-tab svg,
    ${headerSelector} ha-tab-group-tab[class~="icon-only"] svg {
      --mdc-icon-size: ${iconSize};
      width: ${iconSize} !important;
      height: ${iconSize} !important;
      min-width: ${iconSize} !important;
      min-height: ${iconSize} !important;
      margin: 0 !important;
      display: block !important;
      position: static !important;
      top: auto !important;
      left: auto !important;
      right: auto !important;
      bottom: auto !important;
      color: inherit !important;
      line-height: 1 !important;
      transform: translateY(var(${VIEW_ICON_Y_OFFSET_VAR}, 0px)) !important;
      translate: 0 0 !important;
      transition: color 140ms ease, opacity 140ms ease !important;
      pointer-events: none !important;
    }

    ${headerSelector} ha-tab-group-tab .mdc-tab__content span > ha-icon,
    ${headerSelector} ha-tab-group-tab .mdc-tab__content span > ha-svg-icon,
    ${headerSelector} ha-tab-group-tab .mdc-tab__content span > svg,
    ${headerSelector} ha-tab-group-tab .mdc-tab__text-label > ha-icon,
    ${headerSelector} ha-tab-group-tab .mdc-tab__text-label > ha-svg-icon,
    ${headerSelector} ha-tab-group-tab .mdc-tab__text-label > svg,
    ${headerSelector} ha-tab-group-tab .label > ha-icon,
    ${headerSelector} ha-tab-group-tab .label > ha-svg-icon,
    ${headerSelector} ha-tab-group-tab .label > svg,
    ${headerSelector} ha-tab-group-tab [part~="label"] > ha-icon,
    ${headerSelector} ha-tab-group-tab [part~="label"] > ha-svg-icon,
    ${headerSelector} ha-tab-group-tab [part~="label"] > svg {
      --mdc-icon-size: ${iconSize} !important;
      width: ${iconSize} !important;
      height: ${iconSize} !important;
      min-width: ${iconSize} !important;
      min-height: ${iconSize} !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      color: inherit !important;
      fill: currentColor !important;
      stroke: currentColor !important;
      font-size: ${iconSize} !important;
      line-height: 1 !important;
      margin: 0 !important;
      position: static !important;
      top: auto !important;
      left: auto !important;
      right: auto !important;
      bottom: auto !important;
      transform: translateY(var(${VIEW_ICON_Y_OFFSET_VAR}, 0px)) !important;
      translate: 0 0 !important;
    }

    ${headerSelector} ha-tab-group-tab[active] ha-icon,
    ${headerSelector} ha-tab-group-tab[aria-selected="true"] ha-icon,
    ${headerSelector} ha-tab-group-tab[aria-current="page"] ha-icon,
    ${headerSelector} ha-tab-group-tab[selected] ha-icon,
    ${headerSelector} ha-tab-group-tab.active ha-icon,
    ${headerSelector} ha-tab-group-tab.iron-selected ha-icon,
    ${headerSelector} ha-tab-group-tab[active] ha-svg-icon,
    ${headerSelector} ha-tab-group-tab[aria-selected="true"] ha-svg-icon,
    ${headerSelector} ha-tab-group-tab[aria-current="page"] ha-svg-icon,
    ${headerSelector} ha-tab-group-tab[selected] ha-svg-icon,
    ${headerSelector} ha-tab-group-tab.active ha-svg-icon,
    ${headerSelector} ha-tab-group-tab.iron-selected ha-svg-icon,
    ${headerSelector} ha-tab-group-tab[active] svg,
    ${headerSelector} ha-tab-group-tab[aria-selected="true"] svg,
    ${headerSelector} ha-tab-group-tab[aria-current="page"] svg,
    ${headerSelector} ha-tab-group-tab[selected] svg,
    ${headerSelector} ha-tab-group-tab.active svg,
    ${headerSelector} ha-tab-group-tab.iron-selected svg {
      color: ${config.active_color} !important;
      fill: currentColor !important;
    }

    ${headerSelector} ha-tab-group-tab .mdc-tab-indicator,
    ${headerSelector} ha-tab-group-tab .mdc-tab-indicator--active,
    ${headerSelector} ha-tab-group-tab .mdc-tab-indicator__content,
    ${headerSelector} ha-tab-group-tab .mdc-tab-indicator__content--underline,
    ${headerSelector} ha-tab-group-tab .mdc-tab-indicator__content--fade,
    ${headerSelector} ha-tab-group-tab [class*="active-indicator"],
    ${headerSelector} ha-tab-group-tab [class*="selection-indicator"],
    ${headerSelector} ha-tab-group-tab .mdc-tab__ripple,
    ${headerSelector} ha-tab-group-tab mwc-ripple,
    ${headerSelector} ha-tab-group-tab md-ripple,
    ${headerSelector} ha-tab-group-tab md-focus-ring,
    ${headerSelector} ha-tab-group-tab::part(active-indicator),
    ${headerSelector} ha-tab-group-tab::part(activeIndicator),
    ${headerSelector} ha-tab-group-tab::part(selection-indicator),
    ${headerSelector} ha-tab-group-tab::part(indicator),
    ${headerSelector} ha-tab-group-tab::part(ripple),
    ${headerSelector} ha-tab-group-tab::part(focus-ring) {
      display: none !important;
      opacity: 0 !important;
      height: 0 !important;
      width: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      transform: scale(0) !important;
    }

    ${headerSelector} ha-tab-group-tab .mdc-tab__ripple::before,
    ${headerSelector} ha-tab-group-tab .mdc-tab__ripple::after,
    ${headerSelector} ha-tab-group-tab::before,
    ${headerSelector} ha-tab-group-tab::after {
      display: none !important;
      opacity: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    ${headerSelector} sl-tab,
    ${headerSelector} wa-tab {
      --sl-spacing-large: 0px !important;
      flex: 0 0 ${controlSize} !important;
      width: ${controlSize} !important;
      min-width: ${controlSize} !important;
      max-width: ${controlSize} !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      max-height: ${controlSize} !important;
      padding: 0 !important;
      margin: 0 1px !important;
      color: ${config.inactive_color} !important;
      opacity: 0.82 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-sizing: border-box !important;
    }

    ${headerSelector} sl-tab[active],
    ${headerSelector} sl-tab[aria-selected="true"],
    ${headerSelector} sl-tab[selected],
    ${headerSelector} wa-tab[active],
    ${headerSelector} wa-tab[aria-selected="true"],
    ${headerSelector} wa-tab[selected] {
      color: ${config.active_color} !important;
      opacity: 1 !important;
    }

    ${headerSelector} sl-tab::part(base),
    ${headerSelector} wa-tab::part(base) {
      width: ${controlSize} !important;
      min-width: ${controlSize} !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      padding: 0 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }

    ${headerSelector} sl-tab ha-icon,
    ${headerSelector} sl-tab ha-svg-icon,
    ${headerSelector} sl-tab wa-icon,
    ${headerSelector} sl-tab svg,
    ${headerSelector} wa-tab ha-icon,
    ${headerSelector} wa-tab ha-svg-icon,
    ${headerSelector} wa-tab wa-icon,
    ${headerSelector} wa-tab svg {
      --mdc-icon-size: ${iconSize} !important;
      width: ${iconSize} !important;
      height: ${iconSize} !important;
      min-width: ${iconSize} !important;
      min-height: ${iconSize} !important;
      color: inherit !important;
      fill: currentColor !important;
      stroke: currentColor !important;
      display: block !important;
      font-size: ${iconSize} !important;
      line-height: 1 !important;
      margin: 0 !important;
      position: static !important;
      top: auto !important;
      left: auto !important;
      right: auto !important;
      bottom: auto !important;
      transform: translateY(var(${VIEW_ICON_Y_OFFSET_VAR}, 0px)) !important;
      translate: 0 0 !important;
      pointer-events: none !important;
    }
  `;
}

function buildTabShadowCss(config) {
  if (!config.enabled || !config.hide_labels) return "";

  const tabWidth = config.compact ? "48px" : "56px";
  const controlSize = `var(${CONTROL_SIZE_VAR}, ${tabWidth})`;
  const iconSize = `var(${ICON_SIZE_VAR}, 24px)`;
  const controlRadius = `calc(${controlSize} / 2)`;
  const css = `
    :host {
      --mdc-tab-min-width: ${controlSize} !important;
      --mdc-tab-width: ${controlSize} !important;
      --mdc-tab-height: ${controlSize} !important;
      --indicator-color: transparent !important;
      --indicator-height: 0 !important;
      --active-tab-indicator-color: transparent !important;
      --active-tab-indicator-height: 0 !important;
      --mdc-tab-indicator-active-indicator-height: 0 !important;
      --mdc-tab-indicator-active-indicator-color: transparent !important;
      --md-primary-tab-container-height: ${controlSize} !important;
      --md-primary-tab-active-indicator-height: 0 !important;
      --md-primary-tab-active-indicator-color: transparent !important;
      --md-focus-ring-color: transparent !important;
      --md-ripple-hover-color: transparent !important;
      --md-ripple-pressed-color: transparent !important;
      --md-ripple-focus-color: transparent !important;
      --mdc-ripple-color: transparent !important;
      --mdc-ripple-hover-opacity: 0 !important;
      --mdc-ripple-focus-opacity: 0 !important;
      --mdc-ripple-press-opacity: 0 !important;
      height: ${controlSize} !important;
      border-radius: ${controlRadius} !important;
      background: transparent !important;
      border: 0 !important;
      border-top: 0 !important;
      border-right: 0 !important;
      border-bottom: 0 !important;
      border-left: 0 !important;
      border-block: 0 !important;
      border-inline: 0 !important;
      border-bottom-width: 0 !important;
      border-bottom-color: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
      width: ${controlSize} !important;
      min-width: ${controlSize} !important;
      max-width: ${controlSize} !important;
      position: relative !important;
      transform: none !important;
      translate: 0 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      line-height: 0 !important;
      transition: color 140ms ease, opacity 140ms ease !important;
    }

    :host([active]),
    :host([aria-selected="true"]),
    :host([aria-current="page"]),
    :host([selected]),
    :host(.active),
    :host(.iron-selected) {
      color: ${config.active_color} !important;
      opacity: 1 !important;
      background: transparent !important;
      border: 0 !important;
      border-top: 0 !important;
      border-right: 0 !important;
      border-bottom: 0 !important;
      border-left: 0 !important;
      border-block: 0 !important;
      border-inline: 0 !important;
      border-bottom-width: 0 !important;
      border-bottom-color: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
    }

    .tab,
    .tab-active {
      width: 100% !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      max-height: ${controlSize} !important;
      padding: 0 !important;
      margin: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      background-image: none !important;
      border: 0 !important;
      border-top: 0 !important;
      border-right: 0 !important;
      border-bottom: 0 !important;
      border-left: 0 !important;
      border-block: 0 !important;
      border-inline: 0 !important;
      border-bottom-width: 0 !important;
      border-bottom-color: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
      filter: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-sizing: border-box !important;
      position: relative !important;
      overflow: hidden !important;
      line-height: 0 !important;
      transform: none !important;
      translate: 0 0 !important;
      transition: color 140ms ease, opacity 140ms ease !important;
    }

    :host::before,
    :host::after {
      display: none !important;
      opacity: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    .mdc-tab,
    .mdc-tab--active,
    button {
      width: 100% !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      padding: 0 !important;
      margin: 0 !important;
      border-radius: ${controlRadius} !important;
      background: transparent !important;
      border: 0 !important;
      border-top: 0 !important;
      border-right: 0 !important;
      border-bottom: 0 !important;
      border-left: 0 !important;
      border-block: 0 !important;
      border-inline: 0 !important;
      border-bottom-width: 0 !important;
      border-bottom-color: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-sizing: border-box !important;
      position: relative !important;
      overflow: hidden !important;
      line-height: 0 !important;
    }

    .mdc-tab__content,
    [part~="content"] {
      width: 100% !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      max-height: ${controlSize} !important;
      padding: 0 !important;
      margin: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      line-height: 0 !important;
    }

    .mdc-tab__text-label {
      display: none !important;
    }

    .mdc-tab__content span,
    .label,
    [part~="label"] {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 100% !important;
      height: 100% !important;
      padding: 0 !important;
      margin: 0 !important;
      font-size: 0 !important;
      line-height: 0 !important;
      color: inherit !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
    }

    ha-icon,
    ha-svg-icon,
    wa-icon,
    svg,
    .ha-icon,
    .icon {
      --mdc-icon-size: ${iconSize};
      width: ${iconSize} !important;
      height: ${iconSize} !important;
      min-width: ${iconSize} !important;
      min-height: ${iconSize} !important;
      margin: 0 !important;
      color: inherit !important;
      line-height: 1 !important;
      display: block !important;
      box-sizing: border-box !important;
      translate: 0 0 !important;
      pointer-events: none !important;
    }

    ha-icon,
    ha-svg-icon,
    wa-icon,
    svg,
    .ha-icon,
    .icon {
      position: static !important;
      top: auto !important;
      left: auto !important;
      right: auto !important;
      bottom: auto !important;
      margin: 0 !important;
      transform: none !important;
    }

    slot,
    slot[name="icon"],
    slot[name="prefix"],
    slot[name="start"] {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: ${iconSize} !important;
      height: ${iconSize} !important;
      min-width: ${iconSize} !important;
      min-height: ${iconSize} !important;
      color: inherit !important;
      font-size: 0 !important;
      line-height: 0 !important;
      overflow: visible !important;
      box-sizing: border-box !important;
      position: absolute !important;
      top: 50% !important;
      left: 50% !important;
      right: auto !important;
      bottom: auto !important;
      margin: 0 !important;
      transform: translate(-50%, -50%) translateY(var(${VIEW_ICON_Y_OFFSET_VAR}, 0px)) !important;
    }

    slot::slotted(ha-icon),
    slot::slotted(ha-svg-icon),
    slot::slotted(wa-icon),
    slot::slotted(svg),
    slot::slotted(.ha-icon),
    slot::slotted(.icon) {
      --mdc-icon-size: ${iconSize} !important;
      width: ${iconSize} !important;
      height: ${iconSize} !important;
      min-width: ${iconSize} !important;
      min-height: ${iconSize} !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      box-sizing: border-box !important;
      color: inherit !important;
      fill: currentColor !important;
      stroke: currentColor !important;
      font-size: ${iconSize} !important;
      line-height: 1 !important;
      position: static !important;
      top: auto !important;
      left: auto !important;
      right: auto !important;
      bottom: auto !important;
      margin: 0 !important;
      transform: none !important;
      translate: 0 0 !important;
      pointer-events: none !important;
    }

    .mdc-tab-indicator,
    .mdc-tab-indicator--active,
    .mdc-tab-indicator__content,
    .mdc-tab-indicator__content--underline,
    .mdc-tab-indicator__content--fade,
    [class*="active-indicator"],
    [class*="selection-indicator"],
    .mdc-tab__ripple,
    mwc-ripple,
    md-ripple,
    md-focus-ring,
    [part~="active-indicator"],
    [part~="activeIndicator"],
    [part~="selection-indicator"],
    [part~="indicator"],
    [part~="ripple"],
    [part~="focus-ring"] {
      display: none !important;
      opacity: 0 !important;
      width: 0 !important;
      height: 0 !important;
      min-width: 0 !important;
      min-height: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      transform: scale(0) !important;
    }

    .mdc-tab__ripple::before,
    .mdc-tab__ripple::after {
      display: none !important;
      opacity: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }
  `;

  return scopeCss(config, css);
}

function buildTabGroupShadowCss(config) {
  if (!config.enabled || !config.hide_labels) return "";

  const tabWidth = config.compact ? "48px" : "56px";
  const controlSize = `var(${CONTROL_SIZE_VAR}, ${tabWidth})`;
  const css = `
    :host {
      --indicator-color: transparent !important;
      --indicator-height: 0 !important;
      --active-tab-indicator-color: transparent !important;
      --active-tab-indicator-height: 0 !important;
      --mdc-tab-indicator-active-indicator-height: 0 !important;
      --mdc-tab-indicator-active-indicator-color: transparent !important;
      --md-primary-tab-active-indicator-height: 0 !important;
      --md-primary-tab-active-indicator-color: transparent !important;
      --sl-spacing-large: 0px !important;
      --ha-tab-padding-start: 0px !important;
      --ha-tab-padding-end: 0px !important;
      min-width: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
      flex: 1 1 auto !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      touch-action: pan-x !important;
      overscroll-behavior-x: contain !important;
      -webkit-overflow-scrolling: touch !important;
      pointer-events: auto !important;
      scroll-behavior: auto !important;
      scroll-snap-type: none !important;
      scroll-padding-inline: 0 !important;
      border: 0 !important;
      border-top: 0 !important;
      border-right: 0 !important;
      border-bottom: 0 !important;
      border-left: 0 !important;
      border-block: 0 !important;
      border-inline: 0 !important;
      border-bottom-width: 0 !important;
      border-bottom-color: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
      transform: none !important;
      translate: 0 0 !important;
      scrollbar-width: none !important;
    }

    :host::-webkit-scrollbar,
    .tabs::-webkit-scrollbar,
    [part~="tabs"]::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }

    .tab-group,
    .tab-group-top,
    .tab-group-bottom,
    .tab-group__base,
    .tab-group__nav,
    .tab-group__tabs,
    .nav-container,
    .nav,
    .tabs,
    [part~="base"],
    [part~="nav"],
    [part~="tabs"] {
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      max-height: ${controlSize} !important;
      padding: 0 !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      padding-block: 0 !important;
      margin: 0 !important;
      min-width: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
      flex: 1 1 auto !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      touch-action: pan-x !important;
      overscroll-behavior-x: contain !important;
      -webkit-overflow-scrolling: touch !important;
      scroll-behavior: auto !important;
      scroll-snap-type: none !important;
      scroll-padding-inline: 0 !important;
      background: transparent !important;
      background-image: none !important;
      border: 0 !important;
      border-top: 0 !important;
      border-right: 0 !important;
      border-bottom: 0 !important;
      border-left: 0 !important;
      border-block: 0 !important;
      border-inline: 0 !important;
      border-bottom-width: 0 !important;
      border-bottom-color: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
      transform: none !important;
      translate: 0 0 !important;
      position: relative !important;
      top: 0 !important;
      bottom: auto !important;
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      box-sizing: border-box !important;
      scrollbar-width: none !important;
    }

    .tab-group__body,
    .body,
    [part~="body"] {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
      min-width: 0 !important;
      min-height: 0 !important;
      max-width: 0 !important;
      max-height: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
      overflow: hidden !important;
    }

    slot[name="nav"],
    slot:not([name]) {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      min-width: max-content !important;
      width: max-content !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      max-height: ${controlSize} !important;
      padding: 0 !important;
      margin: 0 !important;
      transform: none !important;
      translate: 0 0 !important;
      overflow: visible !important;
      scroll-snap-align: none !important;
    }

    slot[name="nav"]::slotted(ha-tab-group-tab),
    slot:not([name])::slotted(ha-tab-group-tab),
    slot[name="nav"]::slotted(paper-tab),
    slot:not([name])::slotted(paper-tab),
    slot[name="nav"]::slotted(mwc-tab),
    slot:not([name])::slotted(mwc-tab),
    slot[name="nav"]::slotted(md-primary-tab),
    slot:not([name])::slotted(md-primary-tab),
    slot[name="nav"]::slotted(md-secondary-tab),
    slot:not([name])::slotted(md-secondary-tab) {
      align-self: center !important;
      margin-top: 0 !important;
      margin-bottom: 0 !important;
      top: 0 !important;
      bottom: auto !important;
      transform: none !important;
      translate: 0 0 !important;
      scroll-snap-align: none !important;
    }

    :host::before,
    :host::after,
    .tab-group::before,
    .tab-group::after,
    .tab-group-top::before,
    .tab-group-top::after,
    .tab-group-bottom::before,
    .tab-group-bottom::after,
    .nav-container::before,
    .nav-container::after,
    .tabs::before,
    .tabs::after,
    [part~="base"]::before,
    [part~="base"]::after,
    [part~="tabs"]::before,
    [part~="tabs"]::after {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
      width: 0 !important;
      height: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      pointer-events: none !important;
    }

    .mdc-tab-indicator,
    .mdc-tab-indicator--active,
    .mdc-tab-indicator__content,
    .mdc-tab-indicator__content--underline,
    .mdc-tab-indicator__content--fade,
    [part~="active-indicator"],
    [part~="activeIndicator"],
    [part~="selection-indicator"],
    [part~="indicator"],
    [class*="active-indicator"],
    [class*="selection-indicator"],
    [class*="indicator"] {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
      width: 0 !important;
      height: 0 !important;
      min-width: 0 !important;
      min-height: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      pointer-events: none !important;
      transform: scale(0) !important;
    }

    .scroll-button,
    .scroll-button-start,
    .scroll-button-end,
    wa-button.scroll-button,
    [part~="scroll-button"],
    [part~="scroll-button-start"],
    [part~="scroll-button-end"],
    [class*="scroll-button"] {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
      width: 0 !important;
      min-width: 0 !important;
      max-width: 0 !important;
      height: 0 !important;
      min-height: 0 !important;
      max-height: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      pointer-events: none !important;
      transform: none !important;
      translate: 0 0 !important;
    }
  `;

  return scopeCss(config, css);
}

function buildButtonShadowCss(config) {
  if (!config.enabled || !config.hide_labels) return "";

  const controlSize = `var(${CONTROL_SIZE_VAR}, 48px)`;
  const iconSize = `var(${ICON_SIZE_VAR}, 24px)`;
  const css = `
    :host,
    ha-button,
    button,
    [part~="base"],
    [part~="button"] {
      --mdc-icon-button-size: ${controlSize} !important;
      --mdc-icon-size: ${iconSize} !important;
      width: ${controlSize} !important;
      min-width: ${controlSize} !important;
      max-width: ${controlSize} !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      max-height: ${controlSize} !important;
      padding: 0 !important;
      margin: 0 !important;
      background: transparent !important;
      background-image: none !important;
      border: 0 !important;
      box-shadow: none !important;
      outline: 0 !important;
      filter: none !important;
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
      transform: none !important;
      translate: 0 0 !important;
      box-sizing: border-box !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      position: relative !important;
      overflow: hidden !important;
      line-height: 0 !important;
    }

    :host::before,
    :host::after,
    ha-button::before,
    ha-button::after,
    button::before,
    button::after,
    [part~="base"]::before,
    [part~="base"]::after,
    [part~="button"]::before,
    [part~="button"]::after,
    [part~="ripple"],
    ha-ripple,
    mwc-ripple,
    md-ripple,
    md-focus-ring {
      display: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
      width: 0 !important;
      height: 0 !important;
      background: transparent !important;
      background-image: none !important;
      border: 0 !important;
      box-shadow: none !important;
      outline: 0 !important;
      pointer-events: none !important;
      transform: none !important;
      translate: 0 0 !important;
    }

    ha-icon,
    ha-svg-icon,
    wa-icon,
    svg,
    .ha-icon,
    .icon,
    .mdc-icon-button__icon,
    [part~="label"] {
      --mdc-icon-size: ${iconSize} !important;
      width: ${iconSize} !important;
      height: ${iconSize} !important;
      min-width: ${iconSize} !important;
      min-height: ${iconSize} !important;
      margin: 0 !important;
      color: inherit !important;
      line-height: 1 !important;
      display: block !important;
      box-sizing: border-box !important;
      transform: translateY(var(${ICON_Y_OFFSET_VAR}, 0px)) !important;
      translate: 0 0 !important;
    }

    span,
    slot {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: ${iconSize} !important;
      height: ${iconSize} !important;
      min-width: ${iconSize} !important;
      min-height: ${iconSize} !important;
      padding: 0 !important;
      margin: 0 !important;
      color: inherit !important;
      font-size: 0 !important;
      line-height: 0 !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
    }

    slot::slotted(ha-icon),
    slot::slotted(ha-svg-icon),
    slot::slotted(wa-icon),
    slot::slotted(svg),
    slot::slotted(.ha-icon),
    slot::slotted(.icon) {
      --mdc-icon-size: ${iconSize} !important;
      width: ${iconSize} !important;
      height: ${iconSize} !important;
      min-width: ${iconSize} !important;
      min-height: ${iconSize} !important;
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      color: inherit !important;
      fill: currentColor !important;
      stroke: currentColor !important;
      font-size: ${iconSize} !important;
      line-height: 1 !important;
      transform: translateY(var(${ICON_Y_OFFSET_VAR}, 0px)) !important;
      translate: 0 0 !important;
    }
  `;

  return scopeCss(config, css);
}

function buildIconShadowCss(config) {
  if (!config.enabled || !config.hide_labels) return "";

  const iconSize = `var(${ICON_SIZE_VAR}, 24px)`;
  const css = `
    :host {
      --mdc-icon-size: ${iconSize} !important;
      width: ${iconSize} !important;
      min-width: ${iconSize} !important;
      max-width: ${iconSize} !important;
      height: ${iconSize} !important;
      min-height: ${iconSize} !important;
      max-height: ${iconSize} !important;
      flex: 0 0 ${iconSize} !important;
      display: block !important;
      position: relative !important;
      padding: 0 !important;
      margin: 0 !important;
      overflow: hidden !important;
      line-height: 0 !important;
      box-sizing: border-box !important;
    }

    svg,
    [part~="svg"] {
      width: 100% !important;
      min-width: 100% !important;
      max-width: 100% !important;
      height: 100% !important;
      min-height: 100% !important;
      max-height: 100% !important;
      display: block !important;
      position: absolute !important;
      inset: 0 !important;
      padding: 0 !important;
      margin: auto !important;
      overflow: visible !important;
      transform: none !important;
      translate: 0 0 !important;
      box-sizing: border-box !important;
    }

    g,
    path {
      transform: none !important;
      transform-origin: center !important;
    }
  `;

  return scopeCss(config, css);
}

function buildHeaderCss(config) {
  const headerSelector = `.header[${NAV_ATTR}]`;
  const controlSize = `var(${CONTROL_SIZE_VAR}, 48px)`;
  const iconSize = `var(${ICON_SIZE_VAR}, 24px)`;
  const tabYOffset = `var(${TAB_Y_OFFSET_VAR}, ${config.tab_y_offset})`;
  const controlRadius = `calc(${controlSize} / 2)`;
  const actionMenuZIndex = String((Number.parseInt(config.z_index, 10) || 1000) + 20);
  const sideGapLeft = `max(${config.side_gap}, env(safe-area-inset-left))`;
  const sideGapRight = `max(${config.side_gap}, env(safe-area-inset-right))`;
  const dockLeft = `calc(var(${SIDEBAR_INSET_VAR}, 0px) + ${sideGapLeft})`;
  const dockCss = config.dock
    ? `
      left: ${dockLeft} !important;
      right: ${sideGapRight} !important;
      width: auto !important;
      max-width: calc(100vw - var(${SIDEBAR_INSET_VAR}, 0px) - ${sideGapLeft} - ${sideGapRight}) !important;
      height: ${config.height} !important;
      min-height: ${config.height} !important;
      max-height: ${config.height} !important;
      border-radius: ${config.radius} !important;
      box-sizing: border-box !important;
      overflow: visible !important;
      background: ${config.header_background} !important;
      border: ${config.border} !important;
      border-bottom: 0 !important;
      outline: 0 !important;
      box-shadow: ${config.shadow} !important;
      backdrop-filter: blur(22px) saturate(1.45) !important;
      -webkit-backdrop-filter: blur(22px) saturate(1.45) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      pointer-events: auto !important;
    `
    : `
      left: var(${SIDEBAR_INSET_VAR}, 0px) !important;
      right: 0 !important;
      width: auto !important;
      min-height: ${config.height} !important;
      pointer-events: auto !important;
    `;

  const toolbarCss = config.dock
    ? `
      height: ${config.height} !important;
      min-height: ${config.height} !important;
      max-height: ${config.height} !important;
      padding: 0 10px !important;
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-sizing: border-box !important;
      overflow: visible !important;
      pointer-events: auto !important;
    `
    : `
      min-height: ${config.height} !important;
      pointer-events: auto !important;
    `;

  const sideButtonCss = `
    ${headerSelector} app-toolbar,
    ${headerSelector} .toolbar {
      height: ${config.height} !important;
      min-height: ${config.height} !important;
      max-height: ${config.height} !important;
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      padding: 0 4px !important;
      margin: 0 !important;
      background: transparent !important;
      border: 0 !important;
      border-top: 0 !important;
      border-right: 0 !important;
      border-bottom: 0 !important;
      border-left: 0 !important;
      border-block: 0 !important;
      border-inline: 0 !important;
      box-shadow: none !important;
      outline: 0 !important;
      display: grid !important;
      grid-template-columns: ${controlSize} minmax(0, 1fr) max-content !important;
      grid-template-rows: ${config.height} !important;
      align-items: center !important;
      justify-content: stretch !important;
      justify-items: center !important;
      box-sizing: border-box !important;
      gap: 0 !important;
      position: relative !important;
      overflow: visible !important;
      pointer-events: auto !important;
    }

    ${headerSelector} app-toolbar > ha-menu-button,
    ${headerSelector} app-toolbar > ha-icon-button[slot="navigationIcon"],
    ${headerSelector} .toolbar > ha-menu-button,
    ${headerSelector} [${NAV_PART_ATTR}="menu"] {
      order: 0 !important;
      grid-column: 1 !important;
      justify-self: center !important;
      flex: 0 0 ${controlSize} !important;
      z-index: 4 !important;
      pointer-events: auto !important;
    }

    ${headerSelector} app-toolbar > ha-tabs,
    ${headerSelector} app-toolbar > ha-tab-group,
    ${headerSelector} app-toolbar > sl-tab-group,
    ${headerSelector} app-toolbar > wa-tab-group,
    ${headerSelector} .toolbar > ha-tabs,
    ${headerSelector} .toolbar > ha-tab-group,
    ${headerSelector} .toolbar > sl-tab-group,
    ${headerSelector} .toolbar > wa-tab-group,
    ${headerSelector} [${NAV_PART_ATTR}="views"] {
      order: 1 !important;
      grid-column: 2 !important;
      justify-self: stretch !important;
      flex: 1 1 auto !important;
      min-width: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      max-height: ${controlSize} !important;
      align-self: center !important;
      ${TAB_Y_OFFSET_VAR}: ${config.tab_y_offset} !important;
      ${ICON_Y_OFFSET_VAR}: 0px !important;
      ${VIEW_ICON_Y_OFFSET_VAR}: 0px !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      -webkit-overflow-scrolling: touch !important;
      position: relative !important;
      top: calc(var(${TAB_Y_OFFSET_VAR}, ${config.tab_y_offset}) + var(${CONTENT_Y_OFFSET_VAR}, 0px)) !important;
      z-index: 4 !important;
      pointer-events: auto !important;
    }

    ${headerSelector} .action-items {
      order: 2 !important;
      grid-column: 3 !important;
      justify-self: end !important;
      flex: 0 0 auto !important;
      width: max-content !important;
      min-width: ${controlSize} !important;
      max-width: none !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      max-height: ${controlSize} !important;
      margin: 0 !important;
      padding: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: flex-end !important;
      overflow: visible !important;
      position: relative !important;
      top: var(${CONTENT_Y_OFFSET_VAR}, 0px) !important;
      z-index: 5 !important;
      pointer-events: auto !important;
    }

    ${headerSelector} .action-items > ha-icon-button,
    ${headerSelector} .action-items > ha-button-menu,
    ${headerSelector} .action-items > ha-dropdown {
      flex: 0 0 ${controlSize} !important;
      width: ${controlSize} !important;
      min-width: ${controlSize} !important;
      max-width: ${controlSize} !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      max-height: ${controlSize} !important;
      margin: 0 !important;
      padding: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      position: relative !important;
      top: 0 !important;
      overflow: visible !important;
      pointer-events: auto !important;
    }

    ${headerSelector} app-toolbar > ha-icon-button:not([slot="navigationIcon"]),
    ${headerSelector} .toolbar > ha-icon-button:not([slot="navigationIcon"]),
    ${headerSelector} [${NAV_PART_ATTR}="actions"] {
      order: 2 !important;
      grid-column: 3 !important;
      justify-self: end !important;
      flex: 0 0 auto !important;
      width: max-content !important;
      min-width: ${controlSize} !important;
      max-width: none !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      max-height: ${controlSize} !important;
      margin: 0 !important;
      padding: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: flex-end !important;
      position: relative !important;
      top: var(${CONTENT_Y_OFFSET_VAR}, 0px) !important;
      overflow: visible !important;
      z-index: 5 !important;
      pointer-events: auto !important;
    }

    ${headerSelector} app-toolbar > ha-button-menu,
    ${headerSelector} .toolbar > ha-button-menu {
      order: 2 !important;
      grid-column: 3 !important;
      justify-self: end !important;
      flex: 0 0 auto !important;
      width: max-content !important;
      min-width: ${controlSize} !important;
      max-width: none !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      max-height: ${controlSize} !important;
      display: flex !important;
      align-items: center !important;
      justify-content: flex-end !important;
      position: relative !important;
      top: var(${CONTENT_Y_OFFSET_VAR}, 0px) !important;
      overflow: visible !important;
      z-index: 5 !important;
      pointer-events: auto !important;
    }

    ${headerSelector}::before,
    ${headerSelector}::after,
    ${headerSelector} .toolbar::before,
    ${headerSelector} .toolbar::after,
    ${headerSelector} app-toolbar::before,
    ${headerSelector} app-toolbar::after,
    ${headerSelector} ha-tabs::before,
    ${headerSelector} ha-tabs::after,
    ${headerSelector} ha-tab-group::before,
    ${headerSelector} ha-tab-group::after {
      display: none !important;
      opacity: 0 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      outline: 0 !important;
    }

    ${headerSelector} app-toolbar > ha-menu-button,
    ${headerSelector} app-toolbar > ha-icon-button[slot="navigationIcon"],
    ${headerSelector} app-toolbar > ha-button-menu,
    ${headerSelector} .toolbar > ha-menu-button,
    ${headerSelector} .toolbar > ha-icon-button[slot="navigationIcon"],
    ${headerSelector} .toolbar > ha-button-menu,
    ${headerSelector} [${NAV_PART_ATTR}="menu"] {
      --mdc-icon-button-size: ${controlSize} !important;
      --mdc-icon-size: ${iconSize} !important;
      flex: 0 0 ${controlSize} !important;
      width: ${controlSize} !important;
      min-width: ${controlSize} !important;
      max-width: ${controlSize} !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      max-height: ${controlSize} !important;
      margin: 0 !important;
      border-radius: ${controlRadius} !important;
      background: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      position: relative !important;
      top: 0 !important;
      overflow: hidden !important;
      pointer-events: auto !important;
    }

    ${headerSelector} [${NAV_PART_ATTR}="menu"] {
      top: var(${MENU_Y_OFFSET_VAR}, var(${CONTENT_Y_OFFSET_VAR}, 0px)) !important;
    }

    ${headerSelector} [${NAV_PART_ATTR}="actions"],
    ${headerSelector} [${NAV_PART_ATTR}="actions"] ha-dropdown,
    ${headerSelector} [${NAV_PART_ATTR}="actions"] ha-button-menu,
    ${headerSelector} ha-dropdown[slot="actionItems"],
    ${headerSelector} ha-button-menu[slot="actionItems"] {
      overflow: visible !important;
      z-index: 3 !important;
    }

    ${headerSelector} [${NAV_PART_ATTR}="actions"] ha-dropdown::part(popup),
    ${headerSelector} ha-dropdown[slot="actionItems"]::part(popup),
    ${headerSelector} [data-ha-native-nav-position-action-menu]::part(popup),
    ${headerSelector} [data-ha-native-nav-position-action-menu]::part(menu) {
      z-index: ${actionMenuZIndex} !important;
    }

    ${headerSelector} ha-menu-button::part(base),
    ${headerSelector} ha-menu-button::part(button),
    ${headerSelector} ha-menu-button::part(ripple),
    ${headerSelector} ha-icon-button::part(base),
    ${headerSelector} ha-icon-button::part(button),
    ${headerSelector} ha-icon-button::part(ripple),
    ${headerSelector} ha-button-menu::part(base),
    ${headerSelector} ha-button-menu::part(button),
    ${headerSelector} ha-button-menu::part(ripple),
    ${headerSelector} app-toolbar > ha-menu-button::part(base),
    ${headerSelector} app-toolbar > ha-menu-button::part(button),
    ${headerSelector} app-toolbar > ha-menu-button::part(ripple),
    ${headerSelector} app-toolbar > ha-icon-button::part(base),
    ${headerSelector} app-toolbar > ha-icon-button::part(button),
    ${headerSelector} app-toolbar > ha-icon-button::part(ripple),
    ${headerSelector} app-toolbar > ha-button-menu::part(base),
    ${headerSelector} app-toolbar > ha-button-menu::part(button),
    ${headerSelector} app-toolbar > ha-button-menu::part(ripple) {
      background: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
    }
  `;

  if (config.position === "top") {
    return `
      ${headerSelector} {
        position: fixed !important;
      top: calc(${config.offset} + env(safe-area-inset-top)) !important;
        bottom: auto !important;
        z-index: ${config.z_index} !important;
        transform: translateZ(0) !important;
        ${dockCss}
      }

      ${headerSelector} app-toolbar,
      ${headerSelector} .toolbar {
        ${toolbarCss}
      }

      ${sideButtonCss}

      ha-panel-lovelace,
      hui-root,
      hui-view-container,
      #view,
      main,
      hui-view,
      hui-sections-view,
      hui-masonry-view,
      hui-panel-view {
        padding-top: calc(${config.top_padding} + env(safe-area-inset-top)) !important;
        padding-bottom: 0 !important;
        scroll-padding-top: calc(${config.top_padding} + env(safe-area-inset-top)) !important;
      }
    `;
  }

  return `
    ${headerSelector} {
      position: fixed !important;
      top: auto !important;
      bottom: calc(${config.offset} + env(safe-area-inset-bottom)) !important;
      z-index: ${config.z_index} !important;
      transform: translateZ(0) !important;
      ${dockCss}
    }

    @supports (-webkit-touch-callout: none) {
      ${headerSelector} {
        bottom: calc(${config.ios_bottom_offset} + env(safe-area-inset-bottom)) !important;
        ${TAB_Y_OFFSET_VAR}: ${config.tab_y_offset} !important;
        ${ICON_Y_OFFSET_VAR}: ${config.ios_icon_y_offset} !important;
        ${VIEW_ICON_Y_OFFSET_VAR}: ${config.ios_view_icon_y_offset} !important;
      }

      ${headerSelector} app-toolbar > ha-tabs,
      ${headerSelector} app-toolbar > ha-tab-group,
      ${headerSelector} app-toolbar > sl-tab-group,
      ${headerSelector} app-toolbar > wa-tab-group,
      ${headerSelector} .toolbar > ha-tabs,
      ${headerSelector} .toolbar > ha-tab-group,
      ${headerSelector} .toolbar > sl-tab-group,
      ${headerSelector} .toolbar > wa-tab-group,
      ${headerSelector} [${NAV_PART_ATTR}="views"] {
        ${TAB_Y_OFFSET_VAR}: ${addCssSize(config.tab_y_offset, IOS_VIEW_Y_OFFSET)} !important;
        ${ICON_Y_OFFSET_VAR}: ${config.ios_icon_y_offset} !important;
        ${VIEW_ICON_Y_OFFSET_VAR}: ${config.ios_view_icon_y_offset} !important;
      }
    }

    ${headerSelector} app-toolbar,
    ${headerSelector} .toolbar {
      ${toolbarCss}
    }

    ${sideButtonCss}

    ha-panel-lovelace,
    hui-root,
    hui-view-container,
    #view,
    main,
    hui-view,
    hui-sections-view,
    hui-masonry-view,
    hui-panel-view {
      padding-bottom: calc(${config.bottom_padding} + env(safe-area-inset-bottom)) !important;
      scroll-padding-bottom: calc(${config.bottom_padding} + env(safe-area-inset-bottom)) !important;
      box-sizing: border-box !important;
    }
  `;
}

function buildCss(config) {
  const css = `
    ${buildHeaderCss(config)}
    ${buildTabCss(config)}
  `;

  if (!config.enabled) {
    return `#${STYLE_ID}-disabled { display: none; }`;
  }

  return scopeCss(config, css);
}

function isShadowRootFor(root, hosts) {
  return root !== document && root.host && hosts.has(root.host.localName);
}

function rootQuerySelectorAll(root, selector) {
  if (!root || !root.querySelectorAll) return [];
  return Array.from(root.querySelectorAll(selector));
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sizeFromRect(rect, fallback) {
  if (!rect) return fallback;
  const sizes = [rect.width, rect.height].filter((value) => Number.isFinite(value) && value > 0);
  if (!sizes.length) return fallback;
  return Math.round(Math.min(...sizes));
}

function parseCssPixelValue(value, fallback = 0) {
  const number = Number.parseFloat(String(value || "").trim());
  return Number.isFinite(number) ? number : fallback;
}

function matchesMobileLayout(config = state.config) {
  try {
    return Boolean(window.matchMedia?.(`(max-width: ${config.mobile_max_width})`)?.matches);
  } catch (_error) {
    const width = window.innerWidth || document.documentElement?.clientWidth || 0;
    return width > 0 && width <= parseCssPixelValue(config.mobile_max_width, 768);
  }
}

function visibleSidebarInset(header) {
  const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
  if (!viewportWidth || !viewportHeight || state.config.mobile_only || state.config.only === "mobile") return 0;
  if (matchesMobileLayout(state.config)) return 0;

  const selector = [
    "ha-sidebar",
    "ha-drawer",
    "app-drawer",
    "mwc-drawer",
    ".mdc-drawer",
    ".drawer",
    ".drawer-content",
    ".sidebar",
    "#drawer"
  ].join(", ");
  let inset = 0;

  for (const element of collectDeepElements(document, selector)) {
    if (
      !element ||
      element === header ||
      header?.contains?.(element) ||
      closestComposed(element, `.header[${NAV_ATTR}]`)
    ) {
      continue;
    }

    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width < 48 || rect.height < viewportHeight * 0.6) continue;
    if (rect.top > Math.max(80, viewportHeight * 0.15) || rect.bottom < viewportHeight * 0.8) continue;
    if (rect.left > 4 || rect.right <= 48) continue;

    const visibleRight = Math.min(rect.right, rect.width);
    if (visibleRight > Math.min(420, viewportWidth * 0.7)) continue;

    const style = window.getComputedStyle?.(element);
    if (style) {
      if (style.display === "none" || style.visibility === "hidden") continue;
      if (parseCssPixelValue(style.opacity, 1) <= 0.01) continue;
    }

    inset = Math.max(inset, visibleRight);
  }

  return clampNumber(Math.round(inset), 0, 420);
}

function rectCenterY(element) {
  const rect = element?.getBoundingClientRect?.();
  if (!rect || !Number.isFinite(rect.height) || rect.height <= 0) return null;
  return rect.top + rect.height / 2;
}

function averageNumbers(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function collectDeepElements(root, selector, out = [], seen = new Set()) {
  if (!root || seen.has(root)) return out;
  seen.add(root);

  if (root.nodeType === Node.ELEMENT_NODE && root.matches?.(selector)) {
    out.push(root);
  }

  for (const element of Array.from(root.querySelectorAll?.("*") || [])) {
    if (element.matches?.(selector)) out.push(element);

    if (element.localName === "slot") {
      for (const assigned of element.assignedElements?.({ flatten: true }) || []) {
        collectDeepElements(assigned, selector, out, seen);
      }
    }

    if (element.shadowRoot) {
      collectDeepElements(element.shadowRoot, selector, out, seen);
    }
  }

  return out;
}

function findFirstElement(root, selector) {
  if (!root || !root.querySelector) return null;
  return root.querySelector(selector);
}

function findButtonIcon(button) {
  const selector = "ha-icon, ha-svg-icon, mwc-icon, md-icon, iron-icon, svg, .mdc-icon-button__icon";
  return findFirstElement(button.shadowRoot, selector) || findFirstElement(button, selector);
}

function closestComposed(element, selector) {
  let node = element;
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE && node.matches?.(selector)) return node;
    if (node.assignedSlot) {
      node = node.assignedSlot;
      continue;
    }
    if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && node.host) {
      node = node.host;
      continue;
    }
    const parent = node.parentNode;
    if (parent) {
      node = parent;
      continue;
    }
    const root = node.getRootNode?.();
    node = root?.host && root.host !== node ? root.host : null;
  }
  return null;
}

function findToolbar(header) {
  return header.querySelector("app-toolbar, .toolbar") || header;
}

function findTabGroup(header) {
  return header.querySelector("ha-tab-group, sl-tab-group, wa-tab-group, ha-tabs, paper-tabs, mwc-tab-bar, [role='tablist']");
}

function collectViewTabs(root) {
  if (!root?.querySelectorAll) return [];
  return Array.from(root.querySelectorAll(VIEW_TAB_SELECTOR));
}

function collectTabGroupViewTabs(tabGroup) {
  return Array.from(new Set([
    ...collectViewTabs(tabGroup),
    ...collectViewTabs(tabGroup?.shadowRoot)
  ]));
}

function isActiveViewTab(tab) {
  if (!tab) return false;
  if (
    tab.hasAttribute?.("active") ||
    tab.hasAttribute?.("selected") ||
    tab.classList?.contains("active") ||
    tab.classList?.contains("iron-selected")
  ) {
    return true;
  }
  if (tab.getAttribute?.("aria-selected") === "true" || tab.getAttribute?.("aria-current") === "page") {
    return true;
  }

  try {
    return Boolean(tab.active || tab.selected);
  } catch (_error) {
    return false;
  }
}

function viewTabKey(tab, tabs) {
  const index = tabs.indexOf(tab);
  const attrs = ["data-path", "href", "path", "value", "aria-label", "id"]
    .map((name) => tab.getAttribute?.(name))
    .filter(Boolean)
    .join("|");
  const text = String(tab.textContent || "").replace(/\s+/g, " ").trim();
  return `${index}:${attrs || text}`;
}

function activeViewTab(tabGroup) {
  const tabs = collectTabGroupViewTabs(tabGroup);
  const tab = tabs.find(isActiveViewTab);
  return tab ? { tab, key: viewTabKey(tab, tabs) } : null;
}

function eventViewTab(event, tabGroup) {
  const tabs = collectTabGroupViewTabs(tabGroup);
  if (!tabs.length) return null;
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const pathTab = path.find((node) => tabs.includes(node));
  if (pathTab) return pathTab;

  const targetTab = tabs.find((tab) => tab.contains?.(event.target));
  if (targetTab) return targetTab;

  const clientX = Number(event.clientX);
  const clientY = Number(event.clientY);
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;

  return tabs.find((tab) => {
    const rect = tab.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    return (
      clientX >= rect.left - 8 &&
      clientX <= rect.right + 8 &&
      clientY >= rect.top - 12 &&
      clientY <= rect.bottom + 12
    );
  }) || null;
}

function rectContainsPoint(rect, clientX, clientY, padX = 0, padY = 0) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  return (
    clientX >= rect.left - padX &&
    clientX <= rect.right + padX &&
    clientY >= rect.top - padY &&
    clientY <= rect.bottom + padY
  );
}

function markedHeaders() {
  return collectDeepElements(document, `.header[${NAV_ATTR}]`);
}

function viewTabAtPoint(clientX, clientY) {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;

  for (const header of markedHeaders()) {
    const tabGroup = findTabGroup(header);
    if (!tabGroup) continue;

    const groupRect = tabGroup.getBoundingClientRect?.();
    if (!rectContainsPoint(groupRect, clientX, clientY, 4, 14)) continue;

    for (const tab of collectTabGroupViewTabs(tabGroup)) {
      if (rectContainsPoint(tab.getBoundingClientRect?.(), clientX, clientY, 10, 14)) {
        return tab;
      }
    }
  }

  return null;
}

function viewTabRoute(tab) {
  if (!tab) return "";
  const route =
    tab.getAttribute?.("data-path") ||
    tab.getAttribute?.("path") ||
    tab.getAttribute?.("href") ||
    tab.getAttribute?.("value") ||
    "";
  return String(route).trim();
}

function dashboardBasePath() {
  const parts = String(window.location?.pathname || "").split("/").filter(Boolean);
  return parts.length ? `/${parts[0]}` : "/lovelace";
}

function dashboardViewUrl(route) {
  const text = String(route || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (text.startsWith("/")) return text;

  const encoded = text
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(decodeURIComponent(part)))
    .join("/");
  return `${dashboardBasePath()}/${encoded}`;
}

function navigateDashboardView(route) {
  const nextUrl = dashboardViewUrl(route);
  if (!nextUrl || nextUrl === window.location?.pathname) return false;

  if (window.history?.pushState) {
    window.history.pushState(null, "", nextUrl);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
    return true;
  }

  window.location.assign(nextUrl);
  return true;
}

function scheduleViewClickFallback(event, tabGroup) {
  const tab = eventViewTab(event, tabGroup);
  if (!tab || isActiveViewTab(tab)) return;

  const route = viewTabRoute(tab);
  if (!route) return;

  const before = window.location?.pathname || "";
  window.setTimeout(() => {
    if ((window.location?.pathname || "") !== before) return;
    if (isActiveViewTab(tab)) return;
    navigateDashboardView(route);
  }, 80);
}

function stopViewClickThrough(event) {
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
}

function navigateViewTab(tab) {
  if (!tab) return false;
  const route = viewTabRoute(tab);
  if (!route) return false;
  if (isActiveViewTab(tab)) return true;
  return navigateDashboardView(route);
}

function resetGlobalViewGesture() {
  state.viewPointerGesture.active = false;
  state.viewPointerGesture.pointerId = null;
  state.viewPointerGesture.tab = null;
}

function onGlobalViewPointerDown(event) {
  if (!state.config.enabled || !allowsCurrentRoute()) return;
  if (event.isPrimary === false) return;
  if (typeof event.button === "number" && event.button !== 0) return;

  const tab = viewTabAtPoint(Number(event.clientX), Number(event.clientY));
  if (!tab) {
    resetGlobalViewGesture();
    return;
  }

  state.viewPointerGesture.active = true;
  state.viewPointerGesture.pointerId = event.pointerId;
  state.viewPointerGesture.startX = Number(event.clientX);
  state.viewPointerGesture.startY = Number(event.clientY);
  state.viewPointerGesture.tab = tab;
}

function onGlobalViewPointerUp(event) {
  const gesture = state.viewPointerGesture;
  if (!gesture.active || gesture.pointerId !== event.pointerId) return;

  const clientX = Number(event.clientX);
  const clientY = Number(event.clientY);
  const moved = Math.hypot(clientX - gesture.startX, clientY - gesture.startY);
  const tab = moved <= 10 ? viewTabAtPoint(clientX, clientY) || gesture.tab : null;
  resetGlobalViewGesture();
  if (!tab) return;

  stopViewClickThrough(event);
  navigateViewTab(tab);
}

function onGlobalViewClick(event) {
  if (!state.config.enabled || !allowsCurrentRoute()) return;
  if (typeof event.button === "number" && event.button !== 0) return;

  const tab = viewTabAtPoint(Number(event.clientX), Number(event.clientY));
  if (!tab) return;

  stopViewClickThrough(event);
  navigateViewTab(tab);
}

function setViewTabIconOffset(header, tabGroup, offset) {
  const tabs = new Set([
    ...collectViewTabs(header),
    ...collectViewTabs(tabGroup),
    ...collectViewTabs(tabGroup?.shadowRoot)
  ]);

  for (const tab of tabs) {
    tab.style.setProperty(VIEW_ICON_Y_OFFSET_VAR, offset);
  }
}

function clearViewTabIconOffset(header, tabGroup) {
  const tabs = new Set([
    ...collectViewTabs(header),
    ...collectViewTabs(tabGroup),
    ...collectViewTabs(tabGroup?.shadowRoot)
  ]);

  for (const tab of tabs) {
    tab.style.removeProperty(VIEW_ICON_Y_OFFSET_VAR);
  }
}

function dockContentControls(header) {
  return Array.from(
    header?.querySelectorAll?.(
      `[${NAV_PART_ATTR}="menu"], [${NAV_PART_ATTR}="views"], [${NAV_PART_ATTR}="actions"]`
    ) || []
  ).filter((control) => {
    const rect = control.getBoundingClientRect?.();
    return rect && rect.width > 0 && rect.height > 0;
  });
}

function isUsableDockIconRect(element, rect, headerRect) {
  if (!rect || rect.width <= 2 || rect.height <= 2) return false;
  if (rect.height > headerRect.height * 1.4 || rect.width > headerRect.width * 0.8) return false;
  if (rect.bottom < headerRect.top - 1 || rect.top > headerRect.bottom + 1) return false;

  const style = window.getComputedStyle?.(element);
  if (!style) return true;
  if (style.display === "none" || style.visibility === "hidden") return false;
  return parseCssPixelValue(style.opacity, 1) > 0.01;
}

function svgScreenPoint(svg, matrix, x, y) {
  if (typeof DOMPoint === "function") {
    return new DOMPoint(x, y).matrixTransform(matrix);
  }

  const point = svg.createSVGPoint?.();
  if (!point) return null;
  point.x = x;
  point.y = y;
  return point.matrixTransform(matrix);
}

function svgGraphicCenterY(svg, headerRect) {
  const rects = Array.from(svg?.querySelectorAll?.(SVG_GRAPHIC_SELECTOR) || [])
    .map((element) => {
      const rect = element.getBoundingClientRect?.();
      return isUsableDockIconRect(element, rect, headerRect) ? rect : null;
    })
    .filter(Boolean);

  if (!rects.length) return null;

  const top = Math.min(...rects.map((rect) => rect.top));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return top + (bottom - top) / 2;
}

function svgVisualCenterY(svg, headerRect) {
  if (!svg) return null;

  if (svg.getBBox && svg.getScreenCTM) {
    try {
      const box = svg.getBBox();
      const matrix = svg.getScreenCTM();
      if (matrix && box.width > 0 && box.height > 0) {
        const points = [
          svgScreenPoint(svg, matrix, box.x, box.y),
          svgScreenPoint(svg, matrix, box.x + box.width, box.y),
          svgScreenPoint(svg, matrix, box.x, box.y + box.height),
          svgScreenPoint(svg, matrix, box.x + box.width, box.y + box.height)
        ].filter(Boolean);
        if (points.length) {
          const ys = points.map((point) => point.y).filter((value) => Number.isFinite(value));
          if (ys.length) return (Math.min(...ys) + Math.max(...ys)) / 2;
        }
      }
    } catch (_error) {
      // Some Home Assistant WebViews expose SVG nodes without getBBox support.
    }
  }

  return svgGraphicCenterY(svg, headerRect);
}

function dockIconCenterYsForControl(control, headerRect) {
  const elements = collectDeepElements(control, DOCK_CONTENT_ICON_SELECTOR);
  const svgCenters = elements
    .filter((element) => element.localName === "svg")
    .map((element) => {
      const rect = element.getBoundingClientRect?.();
      if (!isUsableDockIconRect(element, rect, headerRect)) return null;
      return svgVisualCenterY(element, headerRect);
    })
    .filter((center) => Number.isFinite(center));

  if (svgCenters.length) return svgCenters;

  return elements
    .map((element) => {
      const rect = element.getBoundingClientRect?.();
      if (!isUsableDockIconRect(element, rect, headerRect)) return null;
      return rect.top + rect.height / 2;
    })
    .filter((center) => Number.isFinite(center));
}

function currentDockContentOffset(header) {
  return parseCssPixelValue(
    header?.style?.getPropertyValue(CONTENT_Y_OFFSET_VAR) ||
      window.getComputedStyle?.(header)?.getPropertyValue(CONTENT_Y_OFFSET_VAR),
    0
  );
}

function setDockContentOffset(header, offset) {
  const value = `${offset}px`;
  header?.style?.setProperty(CONTENT_Y_OFFSET_VAR, value);
  findTabGroup(header)?.style?.setProperty(CONTENT_Y_OFFSET_VAR, value);
  for (const control of dockContentControls(header)) {
    control.style.setProperty(CONTENT_Y_OFFSET_VAR, value);
  }
}

function clearDockContentCenter(header) {
  if (!header) return;
  const elements = new Set([header, findTabGroup(header), ...dockContentControls(header)]);
  for (const element of elements) {
    element?.style?.removeProperty(CONTENT_Y_OFFSET_VAR);
  }
}

function syncDockContentCenter(header) {
  if (!header || !header.isConnected || !state.config.dock) {
    clearDockContentCenter(header);
    return;
  }

  const headerRect = header.getBoundingClientRect?.();
  if (!headerRect || headerRect.width <= 0 || headerRect.height <= 0) return;

  const controls = dockContentControls(header);
  if (!controls.length) return;

  const currentOffset = currentDockContentOffset(header);
  let centers = controls.flatMap((control) => dockIconCenterYsForControl(control, headerRect));
  if (!centers.length) {
    centers = controls.map(rectCenterY).filter((center) => Number.isFinite(center));
  }

  const rawCenter = averageNumbers(centers.map((center) => center - currentOffset));
  if (!Number.isFinite(rawCenter)) return;

  const headerCenter = headerRect.top + headerRect.height / 2;
  const nextOffset = clampNumber(headerCenter - rawCenter, -24, 24);
  const rounded = Math.abs(nextOffset) < 0.25 ? 0 : Math.round(nextOffset * 10) / 10;
  setDockContentOffset(header, rounded);
}

function scheduleDockContentCenter(header) {
  syncDockContentCenter(header);
  window.requestAnimationFrame?.(() => syncDockContentCenter(header));
  window.setTimeout(() => syncDockContentCenter(header), 80);
  window.setTimeout(() => syncDockContentCenter(header), 250);
}

function isNavigationButton(button) {
  if (!button) return false;
  return button.localName === "ha-menu-button" || button.getAttribute?.("slot") === "navigationIcon";
}

function buttonText(button) {
  const parts = [
    button.localName,
    button.getAttribute?.("aria-label"),
    button.getAttribute?.("title"),
    button.getAttribute?.("label"),
    button.getAttribute?.("icon"),
    button.textContent
  ];

  for (const icon of button.querySelectorAll?.("ha-icon, ha-svg-icon, mwc-icon, md-icon, iron-icon") || []) {
    parts.push(icon.getAttribute("icon"), icon.textContent);
  }

  if (button.shadowRoot) {
    for (const icon of button.shadowRoot.querySelectorAll("ha-icon, ha-svg-icon, mwc-icon, md-icon, iron-icon, [aria-label], [title]")) {
      parts.push(icon.getAttribute("aria-label"), icon.getAttribute("title"), icon.getAttribute("icon"), icon.textContent);
    }
  }

  return parts.filter(Boolean).join(" ").toLowerCase();
}

function isDashboardMenuButton(button) {
  if (!button || isNavigationButton(button)) return false;
  if (
    button.localName === "ha-button-menu" ||
    button.localName === "ha-dropdown" ||
    button.localName === "ha-icon-overflow-menu"
  ) {
    return true;
  }
  const text = buttonText(button);
  return /dots|more|overflow|kebab|menu|mdi:dots-vertical|more_vert|plus|edit|modifier/.test(text);
}

function markNavPart(element, part) {
  if (element?.setAttribute) element.setAttribute(NAV_PART_ATTR, part);
}

function clearNavPartMarkers(header) {
  for (const element of header?.querySelectorAll?.(`[${NAV_PART_ATTR}]`) || []) {
    element.removeAttribute(NAV_PART_ATTR);
  }
}

function normalizeDockParts(header) {
  const toolbar = findToolbar(header);
  const menuButton = header.querySelector("ha-menu-button, ha-icon-button[slot='navigationIcon']");
  const tabGroup = findTabGroup(header);
  const actionItems = header.querySelector(".action-items");
  const actionButton = Array.from(
    header.querySelectorAll("ha-icon-overflow-menu, ha-dropdown, ha-button-menu, ha-icon-button, mwc-icon-button, md-icon-button")
  ).find(isDashboardMenuButton);
  const actionPart = actionItems || actionButton;

  clearNavPartMarkers(header);

  markNavPart(menuButton, "menu");
  markNavPart(tabGroup, "views");
  markNavPart(actionPart, "actions");

  if (!toolbar || !tabGroup) return;

  if (menuButton && menuButton.parentElement === toolbar && toolbar.firstElementChild !== menuButton) {
    toolbar.insertBefore(menuButton, toolbar.firstElementChild);
  }

  if (tabGroup.parentElement === toolbar && actionPart?.parentElement === toolbar) {
    toolbar.insertBefore(tabGroup, actionPart);
  }
}

function dashboardActionMenus(header) {
  const actionPart = header?.querySelector?.(`[${NAV_PART_ATTR}="actions"]`);
  const menus = new Set();

  for (const root of [actionPart, actionPart?.shadowRoot]) {
    for (const menu of collectDeepElements(root, "ha-dropdown, ha-button-menu")) {
      menus.add(menu);
    }
  }

  for (const menu of collectDeepElements(header, "ha-dropdown, ha-button-menu")) {
    if (
      menu.getAttribute?.("slot") === "actionItems" ||
      menu.querySelector?.("#dashboardmenu") ||
      menu.shadowRoot?.querySelector?.("#dashboardmenu") ||
      closestComposed(menu, `[${NAV_PART_ATTR}="actions"]`)
    ) {
      menus.add(menu);
    }
  }

  return Array.from(menus);
}

function rememberActionMenu(menu) {
  let record = state.actionMenuRecords.get(menu);
  if (record) return record;

  record = {
    hadPlacement: menu.hasAttribute?.("placement") || false,
    placement: menu.getAttribute?.("placement") ?? "",
    placementProperty: "placement" in menu ? menu.placement : undefined,
    hadHoist: menu.hasAttribute?.("hoist") || false,
    hoistProperty: "hoist" in menu ? menu.hoist : undefined,
    hadCorner: menu.hasAttribute?.("corner") || false,
    corner: menu.getAttribute?.("corner") ?? "",
    cornerProperty: "corner" in menu ? menu.corner : undefined,
    hadMenuCorner: menu.hasAttribute?.("menu-corner") || false,
    menuCorner: menu.getAttribute?.("menu-corner") ?? "",
    menuCornerProperty: "menuCorner" in menu ? menu.menuCorner : undefined,
    fixedProperty: "fixed" in menu ? menu.fixed : undefined
  };
  state.actionMenuRecords.set(menu, record);
  return record;
}

function setElementProperty(element, property, value) {
  if (!(property in element)) return;
  try {
    element[property] = value;
  } catch (_error) {
    // Some Home Assistant elements expose read-only reflected properties.
  }
}

function restoreAttribute(element, name, hadAttribute, value) {
  if (hadAttribute) {
    element.setAttribute(name, value);
  } else {
    element.removeAttribute(name);
  }
}

function syncActionMenuPlacement(header) {
  const placement = state.config.position === "bottom" ? "top-end" : "bottom-end";
  const legacyCorner = state.config.position === "bottom" ? "TOP_END" : "BOTTOM_END";

  for (const menu of dashboardActionMenus(header)) {
    rememberActionMenu(menu);
    menu.setAttribute("data-ha-native-nav-position-action-menu", "");

    if (menu.localName === "ha-dropdown") {
      menu.setAttribute("placement", placement);
      menu.setAttribute("hoist", "");
      setElementProperty(menu, "placement", placement);
      setElementProperty(menu, "hoist", true);
      continue;
    }

    menu.setAttribute("corner", legacyCorner);
    menu.setAttribute("menu-corner", "END");
    setElementProperty(menu, "corner", legacyCorner);
    setElementProperty(menu, "menuCorner", "END");
    setElementProperty(menu, "fixed", true);
  }
}

function clearActionMenuPlacement(header) {
  for (const menu of dashboardActionMenus(header)) {
    const record = state.actionMenuRecords.get(menu);
    if (!record) continue;

    menu.removeAttribute("data-ha-native-nav-position-action-menu");
    restoreAttribute(menu, "placement", record.hadPlacement, record.placement);
    restoreAttribute(menu, "hoist", record.hadHoist, "");
    restoreAttribute(menu, "corner", record.hadCorner, record.corner);
    restoreAttribute(menu, "menu-corner", record.hadMenuCorner, record.menuCorner);
    setElementProperty(menu, "placement", record.placementProperty);
    setElementProperty(menu, "hoist", record.hoistProperty);
    setElementProperty(menu, "corner", record.cornerProperty);
    setElementProperty(menu, "menuCorner", record.menuCornerProperty);
    setElementProperty(menu, "fixed", record.fixedProperty);
    state.actionMenuRecords.delete(menu);
  }
}

function findTabScrollTarget(tabGroup) {
  if (!tabGroup) return null;
  return (
    tabGroup.shadowRoot?.querySelector(".tabs, .tab-group__tabs, [part~='tabs']") ||
    tabGroup
  );
}

function maxScrollLeft(element) {
  if (!element) return 0;
  return Math.max(0, Math.round((element.scrollWidth || 0) - (element.clientWidth || 0)));
}

function readScrollLeft(element) {
  const value = Number(element?.scrollLeft);
  return Number.isFinite(value) ? value : 0;
}

function writeScrollLeft(element, left) {
  if (!element) return;
  const next = clampNumber(Math.round(left), 0, maxScrollLeft(element));
  if (typeof element.scrollTo === "function") {
    element.scrollTo({ left: next, behavior: "auto" });
    return;
  }

  try {
    element.scrollLeft = next;
  } catch (_error) {
    // Some Home Assistant scroll containers expose scrollLeft through scrollTo only.
  }
}

function scrollLeftForTabCenter(scrollTarget, tab) {
  const scrollRect = scrollTarget?.getBoundingClientRect?.();
  const tabRect = tab?.getBoundingClientRect?.();
  if (
    !scrollRect ||
    !tabRect ||
    scrollRect.width <= 0 ||
    tabRect.width <= 0
  ) {
    return null;
  }

  const currentLeft = readScrollLeft(scrollTarget);
  const scrollCenter = scrollRect.left + scrollRect.width / 2;
  const tabCenter = tabRect.left + tabRect.width / 2;
  return clampNumber(currentLeft + tabCenter - scrollCenter, 0, maxScrollLeft(scrollTarget));
}

function removeTabScrollHandler(record) {
  if (!record) return;
  for (const [target, type, handler, capture] of record.listeners) {
    target.removeEventListener(type, handler, capture);
  }
}

function enableHorizontalTabScroll(tabGroup) {
  const scrollTarget = findTabScrollTarget(tabGroup);
  if (!tabGroup || !scrollTarget) return;

  const current = state.tabScrollHandlers.get(tabGroup);
  if (current?.scrollTarget === scrollTarget) {
    if (current.syncActive) {
      current.syncActive();
    } else {
      current.restore?.();
    }
    return;
  }
  removeTabScrollHandler(current);

  let desiredLeft = readScrollLeft(scrollTarget);
  let activeKey = "";
  let userScrolled = false;
  let restoreTimer = 0;
  const gesture = {
    active: false,
    horizontal: false,
    pointerId: null,
    lastTouchAt: 0,
    startX: 0,
    startY: 0,
    startLeft: 0,
    suppressClick: false
  };

  const canScroll = () => maxScrollLeft(scrollTarget) > 1;
  const restore = () => {
    restoreTimer = 0;
    if (!userScrolled || !canScroll()) return;
    desiredLeft = clampNumber(desiredLeft, 0, maxScrollLeft(scrollTarget));
    if (Math.abs(readScrollLeft(scrollTarget) - desiredLeft) > 1) {
      writeScrollLeft(scrollTarget, desiredLeft);
    }
  };

  const scheduleRestore = (delay = 80) => {
    if (restoreTimer) return;
    restoreTimer = window.setTimeout(restore, delay);
  };

  const rememberScrollLeft = (left) => {
    desiredLeft = clampNumber(left, 0, maxScrollLeft(scrollTarget));
    userScrolled = true;
    writeScrollLeft(scrollTarget, desiredLeft);
    window.requestAnimationFrame(restore);
    scheduleRestore(80);
    window.setTimeout(restore, 250);
    window.setTimeout(restore, 800);
  };

  const syncActive = () => {
    const active = activeViewTab(tabGroup);
    if (!active || !canScroll()) return;
    const activeChanged = active.key !== activeKey;
    activeKey = active.key;

    if (!activeChanged && userScrolled) {
      restore();
      return;
    }

    const nextLeft = scrollLeftForTabCenter(scrollTarget, active.tab);
    if (nextLeft === null) return;
    rememberScrollLeft(nextLeft);
  };

  const scheduleActiveSync = () => {
    syncActive();
    window.requestAnimationFrame?.(syncActive);
    window.setTimeout(syncActive, 80);
    window.setTimeout(syncActive, 250);
    window.setTimeout(syncActive, 800);
  };

  const beginGesture = (clientX, clientY) => {
    gesture.active = true;
    gesture.horizontal = false;
    gesture.startX = clientX;
    gesture.startY = clientY;
    gesture.startLeft = readScrollLeft(scrollTarget);
  };

  const moveGesture = (event, clientX, clientY) => {
    if (!gesture.active) return;
    const deltaX = gesture.startX - clientX;
    const deltaY = gesture.startY - clientY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!gesture.horizontal) {
      if (absX < 8 && absY < 8) return;
      if (absY > absX) {
        gesture.active = false;
        return;
      }
      gesture.horizontal = true;
    }

    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    rememberScrollLeft(gesture.startLeft + deltaX);
  };

  const finishGesture = (event) => {
    if (gesture.horizontal) {
      event?.stopPropagation?.();
      gesture.suppressClick = true;
      window.setTimeout(() => {
        gesture.suppressClick = false;
      }, 160);
    }
    gesture.active = false;
    gesture.horizontal = false;
    gesture.pointerId = null;
  };

  const onTouchStart = (event) => {
    if (!canScroll() || event.touches?.length !== 1) return;
    const touch = event.touches[0];
    gesture.lastTouchAt = Date.now();
    gesture.pointerId = null;
    beginGesture(touch.clientX, touch.clientY);
  };

  const onTouchMove = (event) => {
    if (!gesture.active || event.touches?.length !== 1) return;
    const touch = event.touches[0];
    moveGesture(event, touch.clientX, touch.clientY);
  };

  const onTouchEnd = finishGesture;
  const onPointerDown = (event) => {
    if (!canScroll() || event.pointerType === "mouse" || event.isPrimary === false) return;
    if (Date.now() - gesture.lastTouchAt < 500) return;
    if (typeof event.button === "number" && event.button !== 0) return;
    gesture.pointerId = event.pointerId;
    beginGesture(event.clientX, event.clientY);
    try {
      tabGroup.setPointerCapture?.(event.pointerId);
    } catch (_error) {
      // Some synthetic events and WebViews do not allow pointer capture.
    }
  };

  const onPointerMove = (event) => {
    if (gesture.pointerId !== event.pointerId) return;
    moveGesture(event, event.clientX, event.clientY);
  };

  const onPointerEnd = (event) => {
    if (gesture.pointerId !== event.pointerId) return;
    const shouldFallback = !gesture.horizontal && !gesture.suppressClick;
    try {
      tabGroup.releasePointerCapture?.(event.pointerId);
    } catch (_error) {
      // Pointer capture may not have been established.
    }
    finishGesture(event);
    if (shouldFallback) scheduleViewClickFallback(event, tabGroup);
  };

  const onClick = (event) => {
    if (gesture.suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      gesture.suppressClick = false;
      return;
    }

    scheduleViewClickFallback(event, tabGroup);
  };

  const onWheel = (event) => {
    if (!canScroll()) return;
    const absX = Math.abs(event.deltaX);
    const absY = Math.abs(event.deltaY);
    const delta = absX >= absY ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    if (!delta) return;

    const before = readScrollLeft(scrollTarget);
    writeScrollLeft(scrollTarget, before + delta);
    if (readScrollLeft(scrollTarget) !== before) {
      rememberScrollLeft(before + delta);
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    }
  };

  const listeners = [
    [tabGroup, "touchstart", onTouchStart, true],
    [tabGroup, "touchmove", onTouchMove, true],
    [tabGroup, "touchend", onTouchEnd, true],
    [tabGroup, "touchcancel", onTouchEnd, true],
    [tabGroup, "pointerdown", onPointerDown, true],
    [tabGroup, "pointermove", onPointerMove, true],
    [tabGroup, "pointerup", onPointerEnd, true],
    [tabGroup, "pointercancel", onPointerEnd, true],
    [tabGroup, "click", onClick, true],
    [tabGroup, "wheel", onWheel, true]
  ];

  for (const [target, type, handler, capture] of listeners) {
    const passive = !["touchmove", "pointermove", "wheel"].includes(type);
    target.addEventListener(type, handler, { capture, passive });
  }

  tabGroup.setAttribute("data-ha-native-nav-scroll", "");
  state.tabScrollHandlers.set(tabGroup, { scrollTarget, listeners, restore, syncActive: scheduleActiveSync });
  scheduleActiveSync();
}

function syncHeaderMetrics(header) {
  normalizeDockParts(header);
  syncActionMenuPlacement(header);

  const tabGroup = findTabGroup(header);
  enableHorizontalTabScroll(tabGroup);
  header.style.setProperty(SIDEBAR_INSET_VAR, `${visibleSidebarInset(header)}px`);

  const button = header.querySelector(
    "ha-menu-button, app-toolbar > ha-menu-button, ha-icon-button[slot='navigationIcon'], app-toolbar > ha-icon-button"
  );
  if (!button) return;

  const controlSize = clampNumber(sizeFromRect(button.getBoundingClientRect(), 48), 40, 56);
  const icon = findButtonIcon(button);
  const iconSize = clampNumber(sizeFromRect(icon?.getBoundingClientRect(), Math.round(controlSize / 2)), 20, 30);
  const controlYOffset =
    isIOSLike() && state.config.position === "bottom"
      ? addCssSize(state.config.tab_y_offset, IOS_VIEW_Y_OFFSET)
      : state.config.tab_y_offset;
  const iconYOffset =
    isIOSLike() && state.config.position === "bottom"
      ? state.config.ios_icon_y_offset
      : "0px";
  const menuIconYOffset =
    isIOSLike() && state.config.position === "bottom"
      ? state.config.ios_menu_icon_y_offset
      : "0px";
  const viewIconYOffset =
    isIOSLike() && state.config.position === "bottom"
      ? state.config.ios_view_icon_y_offset
      : "0px";
  const contentYOffset =
    isIOSLike() && state.config.position === "bottom"
      ? state.config.ios_content_y_offset
      : "0px";
  const menuYOffset =
    isIOSLike() && state.config.position === "bottom"
      ? state.config.ios_menu_y_offset
      : "0px";
  const menuButton = header.querySelector(`[${NAV_PART_ATTR}="menu"]`);

  header.style.setProperty(CONTROL_SIZE_VAR, `${controlSize}px`);
  header.style.setProperty(ICON_SIZE_VAR, `${iconSize}px`);
  header.style.setProperty(TAB_Y_OFFSET_VAR, state.config.tab_y_offset);
  header.style.setProperty(ICON_Y_OFFSET_VAR, iconYOffset);
  header.style.setProperty(VIEW_ICON_Y_OFFSET_VAR, viewIconYOffset);
  header.style.setProperty(CONTENT_Y_OFFSET_VAR, contentYOffset);
  header.style.setProperty(MENU_Y_OFFSET_VAR, "0px");
  menuButton?.style.setProperty(MENU_Y_OFFSET_VAR, menuYOffset);
  menuButton?.style.setProperty(ICON_Y_OFFSET_VAR, menuIconYOffset);
  menuButton?.style.setProperty("position", "relative", "important");
  menuButton?.style.setProperty("top", menuYOffset, "important");

  if (tabGroup) {
    tabGroup.style.setProperty(TAB_Y_OFFSET_VAR, controlYOffset);
    tabGroup.style.setProperty(ICON_Y_OFFSET_VAR, iconYOffset);
    tabGroup.style.setProperty(VIEW_ICON_Y_OFFSET_VAR, viewIconYOffset);
    tabGroup.style.setProperty(CONTENT_Y_OFFSET_VAR, contentYOffset);
    tabGroup.style.setProperty(MENU_Y_OFFSET_VAR, "0px");
    setViewTabIconOffset(header, tabGroup, viewIconYOffset);
  }
}

function clearHeaderMetrics(header) {
  const tabGroup = findTabGroup(header);
  clearActionMenuPlacement(header);
  clearViewTabIconOffset(header, tabGroup);
  clearDockContentCenter(header);
  header.querySelector(`[${NAV_PART_ATTR}="menu"]`)?.style.removeProperty(ICON_Y_OFFSET_VAR);
  header.querySelector(`[${NAV_PART_ATTR}="menu"]`)?.style.removeProperty(MENU_Y_OFFSET_VAR);
  header.querySelector(`[${NAV_PART_ATTR}="menu"]`)?.style.removeProperty("top");
  header.style.removeProperty(CONTROL_SIZE_VAR);
  header.style.removeProperty(ICON_SIZE_VAR);
  header.style.removeProperty(TAB_Y_OFFSET_VAR);
  header.style.removeProperty(ICON_Y_OFFSET_VAR);
  header.style.removeProperty(VIEW_ICON_Y_OFFSET_VAR);
  header.style.removeProperty(CONTENT_Y_OFFSET_VAR);
  header.style.removeProperty(MENU_Y_OFFSET_VAR);
  header.style.removeProperty(SIDEBAR_INSET_VAR);
  tabGroup?.style.removeProperty(TAB_Y_OFFSET_VAR);
  tabGroup?.style.removeProperty(ICON_Y_OFFSET_VAR);
  tabGroup?.style.removeProperty(VIEW_ICON_Y_OFFSET_VAR);
  tabGroup?.style.removeProperty(CONTENT_Y_OFFSET_VAR);
  tabGroup?.style.removeProperty(MENU_Y_OFFSET_VAR);
  clearNavPartMarkers(header);
}

function allowsCurrentRoute() {
  const path = window.location?.pathname || "";
  return !NON_DASHBOARD_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

function hasNavigationTabs(element) {
  if (!element || !element.querySelector) return false;
  return Boolean(
    element.querySelector("ha-tabs, ha-tab-group, sl-tab-group, wa-tab-group, paper-tabs, mwc-tab-bar, [role='tablist']")
  );
}

function elementEditModeValue(element) {
  if (!element) return false;
  try {
    return Boolean(element.lovelace?.editMode || element._lovelace?.editMode || element.editMode || element._editMode);
  } catch (_error) {
    return false;
  }
}

function isDashboardEditMode(header) {
  if (!header) return false;
  if (closestComposed(header, ".edit-mode")) return true;
  return elementEditModeValue(closestComposed(header, "hui-root")) ||
    elementEditModeValue(closestComposed(header, "ha-panel-lovelace"));
}

function updateMarkedHeaders(root, routeEnabled) {
  for (const header of rootQuerySelectorAll(root, `.header, [${NAV_ATTR}]`)) {
    const shouldMark =
      routeEnabled &&
      header.classList?.contains("header") &&
      !isDashboardEditMode(header) &&
      hasNavigationTabs(header);
    if (shouldMark) {
      header.setAttribute(NAV_ATTR, "");
      syncHeaderMetrics(header);
    } else {
      header.removeAttribute(NAV_ATTR);
      clearHeaderMetrics(header);
    }
  }
}

function hasMarkedNavigation(root) {
  if (!root || !root.querySelector) return false;
  return Boolean(root.querySelector(`.header[${NAV_ATTR}]`));
}

function hasDashboardView(root) {
  if (!root || !root.querySelector) return false;
  return Boolean(
    root.querySelector(
      "ha-panel-lovelace, hui-root, hui-view, hui-sections-view, hui-masonry-view, hui-panel-view"
    )
  );
}

function isMarkedTabShadowRoot(root) {
  return isShadowRootFor(root, TAB_SHADOW_HOSTS) && closestComposed(root.host, `.header[${NAV_ATTR}]`);
}

function isMarkedTabGroupShadowRoot(root) {
  return isShadowRootFor(root, TAB_GROUP_SHADOW_HOSTS) && closestComposed(root.host, `.header[${NAV_ATTR}]`);
}

function isMarkedButtonShadowRoot(root) {
  return isShadowRootFor(root, BUTTON_SHADOW_HOSTS) && closestComposed(root.host, `.header[${NAV_ATTR}]`);
}

function isMarkedIconShadowRoot(root) {
  return isShadowRootFor(root, ICON_SHADOW_HOSTS) && closestComposed(root.host, `.header[${NAV_ATTR}]`);
}

function rootCss(root, cssText, tabShadowCss, tabGroupShadowCss, buttonShadowCss, iconShadowCss, routeEnabled) {
  if (!routeEnabled) return "";
  if (isShadowRootFor(root, TAB_SHADOW_HOSTS)) return isMarkedTabShadowRoot(root) ? tabShadowCss : "";
  if (isShadowRootFor(root, TAB_GROUP_SHADOW_HOSTS)) return isMarkedTabGroupShadowRoot(root) ? tabGroupShadowCss : "";
  if (isShadowRootFor(root, BUTTON_SHADOW_HOSTS)) return isMarkedButtonShadowRoot(root) ? buttonShadowCss : "";
  if (isShadowRootFor(root, ICON_SHADOW_HOSTS)) return isMarkedIconShadowRoot(root) ? iconShadowCss : "";
  if (hasMarkedNavigation(root) || hasDashboardView(root)) return cssText;
  return "";
}

function installStyle(root, cssText, tabShadowCss, tabGroupShadowCss, buttonShadowCss, iconShadowCss, routeEnabled) {
  const target = root === document ? document.head : root;
  if (!target || !target.querySelector) return;
  const nextCssText = rootCss(root, cssText, tabShadowCss, tabGroupShadowCss, buttonShadowCss, iconShadowCss, routeEnabled);

  let style = target.querySelector(`#${STYLE_ID}`);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    target.appendChild(style);
  }

  if (style.textContent !== nextCssText) {
    style.textContent = nextCssText;
  }
}

function observeRoot(root) {
  const target = root === document ? document.documentElement : root;
  if (!target || state.observers.has(root)) return;

  const observer = new MutationObserver(() => scheduleApply());
  observer.observe(target, {
    attributes: true,
    attributeFilter: ["active", "aria-current", "aria-selected", "class", "selected"],
    childList: true,
    subtree: true
  });
  state.observers.set(root, observer);
}

function walkRoots(root, cssText, tabShadowCss, tabGroupShadowCss, buttonShadowCss, iconShadowCss, routeEnabled) {
  updateMarkedHeaders(root, routeEnabled);
  installStyle(root, cssText, tabShadowCss, tabGroupShadowCss, buttonShadowCss, iconShadowCss, routeEnabled);
  observeRoot(root);

  const start = root === document ? document.documentElement : root;
  if (!start) return;

  const walker = document.createTreeWalker(start, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode;
  while (node) {
    if (node.shadowRoot) {
      walkRoots(node.shadowRoot, cssText, tabShadowCss, tabGroupShadowCss, buttonShadowCss, iconShadowCss, routeEnabled);
    }
    node = walker.nextNode();
  }
}

function applyStyles() {
  state.applyTimer = 0;
  const routeEnabled = allowsCurrentRoute();
  walkRoots(
    document,
    buildCss(state.config),
    buildTabShadowCss(state.config),
    buildTabGroupShadowCss(state.config),
    buildButtonShadowCss(state.config),
    buildIconShadowCss(state.config),
    routeEnabled
  );
}

function scheduleApply() {
  if (state.applyTimer) return;
  state.applyTimer = window.setTimeout(applyStyles, 50);
}

function start(config) {
  if (config) {
    state.config = normalizeConfig({ ...state.config, ...config });
  }

  if (state.started) {
    scheduleApply();
    return;
  }

  state.started = true;
  scheduleApply();
  window.addEventListener("location-changed", scheduleApply);
  window.addEventListener("popstate", scheduleApply);
  window.addEventListener("resize", scheduleApply);
  window.addEventListener("pointerdown", onGlobalViewPointerDown, true);
  window.addEventListener("pointerup", onGlobalViewPointerUp, true);
  window.addEventListener("pointercancel", resetGlobalViewGesture, true);
  window.addEventListener("click", onGlobalViewClick, true);
  window.setInterval(scheduleApply, 2500);
}

class HaNativeNavPosition extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = "<style>:host{display:none!important}</style>";
  }

  setConfig(config) {
    start(config);
  }

  getCardSize() {
    return 0;
  }

  getGridOptions() {
    return {
      columns: 1,
      rows: 1
    };
  }

  static getStubConfig() {
    return {
      position: "bottom",
      only: "all",
      mobile_only: false,
      dock: true,
      hide_labels: true
    };
  }
}

if (!customElements.get(TAG_NAME)) {
  customElements.define(TAG_NAME, HaNativeNavPosition);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: TAG_NAME,
  name: "HA Native Nav Position",
  description: "Move Home Assistant's native dashboard navigation to the top or bottom."
});

start(readUrlConfig());

console.info(
  `%c${TAG_NAME}%c ${VERSION}`,
  "color: #03a9f4; font-weight: 700;",
  "color: inherit; font-weight: 400;"
);
