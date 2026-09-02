const VERSION = "1.0.4";
const TAG_NAME = "ha-native-nav-position";
const STYLE_ID = "ha-native-nav-position-style";
const NAV_ATTR = "data-ha-native-nav-position-active";
const DOCK_ATTR = "data-ha-native-nav-position-dock";
const SOURCE_ATTR = "data-ha-native-nav-position-source";
const INLINE_ATTR = "data-ha-native-nav-position-inline";
const CONTROL_SIZE_VAR = "--ha-native-nav-control-size";
const ICON_SIZE_VAR = "--ha-native-nav-icon-size";
const TAB_Y_OFFSET_VAR = "--ha-native-nav-tab-y-offset";
const TAB_SHADOW_HOSTS = new Set([
  "ha-tab-group-tab",
  "mwc-tab",
  "md-primary-tab",
  "md-secondary-tab"
]);
const TAB_GROUP_SHADOW_HOSTS = new Set([
  "ha-tab-group",
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
const TAB_SELECTOR = "ha-tab-group-tab, paper-tab, mwc-tab, md-primary-tab, md-secondary-tab";
const TAB_GROUP_SELECTOR = "ha-tab-group, ha-tabs, paper-tabs, mwc-tab-bar, [role='tablist']";
const DOCK_TOOLBAR_CLASS = "ha-native-nav-position-toolbar";
const TOOLBAR_CONTAINER_SELECTOR = `.toolbar, app-toolbar, ha-tabs, .${DOCK_TOOLBAR_CLASS}`;
const DOCK_ALIGN_SELECTOR = "ha-menu-button, ha-icon-button, ha-button-menu, ha-tab-group, ha-tabs, paper-tabs, mwc-tab-bar, [role='tablist']";
const SIDE_BUTTON_SELECTOR = "ha-menu-button, ha-icon-button, ha-button-menu, app-toolbar > ha-menu-button, app-toolbar > ha-icon-button, app-toolbar > ha-button-menu";
const ICON_SELECTOR = "ha-icon, ha-svg-icon, wa-icon, mwc-icon, md-icon, iron-icon, svg, .ha-icon, .icon";
const TAB_INTERNAL_SELECTOR = [
  ".tab",
  ".tab-active",
  ".mdc-tab",
  ".mdc-tab--active",
  "button",
  "[part~='tab']",
  "[part~='base']",
  "[part~='content']",
  ".mdc-tab__content"
].join(", ");
const LABEL_SELECTOR = [
  ".label",
  "[part~='label']",
  ".mdc-tab__content span",
  "slot",
  "slot[name='icon']",
  "slot[name='prefix']",
  "slot[name='start']"
].join(", ");
const TEXT_LABEL_SELECTOR = ".mdc-tab__text-label";
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
  mobile_only: true,
  mobile_max_width: "768px",
  dock: true,
  hide_labels: true,
  compact: true,
  offset: "18px",
  height: "64px",
  radius: "30px",
  side_gap: "12px",
  tab_y_offset: "0px",
  bottom_padding: "128px",
  top_padding: "88px",
  background: "rgba(35, 48, 64, 0.54)",
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
  inlineStyles: new WeakMap(),
  inlineElements: new Set(),
  docks: new WeakMap(),
  dockHeaders: new Set(),
  movedElements: new WeakMap(),
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
  normalized.mobile_only = toBool(merged.mobile_only ?? merged.mobileOnly, DEFAULT_CONFIG.mobile_only);
  normalized.dock = toBool(merged.dock, DEFAULT_CONFIG.dock);
  normalized.hide_labels = toBool(merged.hide_labels ?? merged.hideLabels, DEFAULT_CONFIG.hide_labels);
  normalized.compact = toBool(merged.compact, DEFAULT_CONFIG.compact);
  normalized.mobile_max_width = toCssSize(merged.mobile_max_width ?? merged.mobileMaxWidth, DEFAULT_CONFIG.mobile_max_width);
  normalized.offset = toCssSize(merged.offset, DEFAULT_CONFIG.offset);
  normalized.height = toCssSize(merged.height, DEFAULT_CONFIG.height);
  normalized.radius = toCssSize(merged.radius, DEFAULT_CONFIG.radius);
  normalized.side_gap = toCssSize(merged.side_gap ?? merged.sideGap, DEFAULT_CONFIG.side_gap);
  normalized.tab_y_offset = toCssSize(merged.tab_y_offset ?? merged.tabYOffset, DEFAULT_CONFIG.tab_y_offset);
  normalized.bottom_padding = toCssSize(merged.bottom_padding ?? merged.bottomPadding, DEFAULT_CONFIG.bottom_padding);
  normalized.top_padding = toCssSize(merged.top_padding ?? merged.topPadding, DEFAULT_CONFIG.top_padding);
  normalized.background = safeText(merged.background, DEFAULT_CONFIG.background);
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
    ${headerSelector} ha-tab-group {
      --mdc-tab-height: ${controlSize} !important;
      --mdc-tab-indicator-active-indicator-height: 0 !important;
      --mdc-tab-indicator-active-indicator-color: transparent !important;
      --md-primary-tab-container-height: ${controlSize} !important;
      --md-primary-tab-active-indicator-height: 0 !important;
      --md-primary-tab-active-indicator-color: transparent !important;
      min-width: 0 !important;
      width: 100% !important;
      position: relative !important;
      top: ${tabYOffset} !important;
      transform: none !important;
      translate: 0 0 !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      touch-action: pan-x !important;
      scrollbar-width: none !important;
    }

    ${headerSelector} ha-tab-group::-webkit-scrollbar {
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
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-sizing: border-box !important;
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
    ${headerSelector} ha-tab-group-tab::part(tab),
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
    }

    ${headerSelector} ha-tab-group-tab[active]::part(base),
    ${headerSelector} ha-tab-group-tab[active]::part(tab),
    ${headerSelector} ha-tab-group-tab[aria-selected="true"]::part(base),
    ${headerSelector} ha-tab-group-tab[aria-selected="true"]::part(tab),
    ${headerSelector} ha-tab-group-tab[aria-current="page"]::part(base),
    ${headerSelector} ha-tab-group-tab[aria-current="page"]::part(tab),
    ${headerSelector} ha-tab-group-tab[selected]::part(base),
    ${headerSelector} ha-tab-group-tab[selected]::part(tab),
    ${headerSelector} ha-tab-group-tab.active::part(base),
    ${headerSelector} ha-tab-group-tab.active::part(tab),
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
    ${headerSelector} ha-tab-group-tab .label {
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
    }

    ${headerSelector} ha-tab-group-tab .mdc-tab,
    ${headerSelector} ha-tab-group-tab mwc-tab,
    ${headerSelector} ha-tab-group-tab md-primary-tab,
    ${headerSelector} ha-tab-group-tab md-secondary-tab,
    ${headerSelector} ha-tab-group-tab .mdc-tab__content,
    ${headerSelector} ha-tab-group-tab [part~="content"] {
      width: 100% !important;
      height: ${controlSize} !important;
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
      color: inherit !important;
      line-height: 1 !important;
      transform: none !important;
      translate: 0 0 !important;
      transition: color 140ms ease, opacity 140ms ease !important;
      pointer-events: none !important;
    }

    ${headerSelector} ha-tab-group-tab .mdc-tab__content span > ha-icon,
    ${headerSelector} ha-tab-group-tab .mdc-tab__content span > ha-svg-icon,
    ${headerSelector} ha-tab-group-tab .mdc-tab__content span > svg,
    ${headerSelector} ha-tab-group-tab .label > ha-icon,
    ${headerSelector} ha-tab-group-tab .label > ha-svg-icon,
    ${headerSelector} ha-tab-group-tab .label > svg {
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
  `;

  return `${css}\n${css.replaceAll(headerSelector, `[${DOCK_ATTR}]`)}`;
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
      transform: none !important;
      translate: 0 0 !important;
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
      transform: none !important;
      translate: 0 0 !important;
      transition: color 140ms ease, opacity 140ms ease !important;
    }

    [part~="tab"],
    [part~="base"] {
      width: 100% !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      max-height: ${controlSize} !important;
      padding: 0 !important;
      margin: 0 !important;
      border-radius: ${controlRadius} !important;
      background: transparent !important;
      background-image: none !important;
      border: 0 !important;
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
      transform: none !important;
      translate: 0 0 !important;
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
    }

    .mdc-tab__content,
    [part~="content"] {
      width: 100% !important;
      height: ${controlSize} !important;
      padding: 0 !important;
      margin: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-sizing: border-box !important;
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
      overflow: visible !important;
    }

    ha-icon,
    ha-svg-icon,
    wa-icon,
    .ha-icon,
    .icon,
    slot[name="icon"] {
      --mdc-icon-size: ${iconSize};
      width: ${iconSize} !important;
      height: ${iconSize} !important;
      min-width: ${iconSize} !important;
      min-height: ${iconSize} !important;
      margin: 0 !important;
      color: inherit !important;
      line-height: 1 !important;
      transform: none !important;
      translate: 0 0 !important;
      pointer-events: none !important;
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

  if (!config.mobile_only) return css;

  return `
    @media (max-width: ${config.mobile_max_width}) {
      ${css}
    }
  `;
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
      min-width: 0 !important;
      width: 100% !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      touch-action: pan-x !important;
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
      overflow-x: auto !important;
      overflow-y: hidden !important;
      touch-action: pan-x !important;
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

    slot[name="nav"],
    slot:not([name]) {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-start !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      max-height: ${controlSize} !important;
      padding: 0 !important;
      margin: 0 !important;
      transform: none !important;
      translate: 0 0 !important;
      overflow: visible !important;
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

  if (!config.mobile_only) return css;

  return `
    @media (max-width: ${config.mobile_max_width}) {
      ${css}
    }
  `;
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
    }

    ha-button::part(base),
    ha-button::part(button),
    ha-button::part(label),
    ha-button::part(start),
    ha-button::part(end) {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 !important;
      margin: 0 !important;
      color: inherit !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      outline: 0 !important;
      overflow: visible !important;
    }

    ha-button::part(label),
    ha-button::part(start),
    ha-button::part(end) {
      width: ${iconSize} !important;
      height: ${iconSize} !important;
      min-width: ${iconSize} !important;
      min-height: ${iconSize} !important;
      font-size: ${iconSize} !important;
      line-height: 1 !important;
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
      transform: none !important;
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
      overflow: visible !important;
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
      transform: none !important;
      translate: 0 0 !important;
    }
  `;

  if (!config.mobile_only) return css;

  return `
    @media (max-width: ${config.mobile_max_width}) {
      ${css}
    }
  `;
}

function buildHeaderCss(config) {
  const headerSelector = `.header[${NAV_ATTR}]`;
  const dockSelector = `[${DOCK_ATTR}]`;
  const controlSize = `var(${CONTROL_SIZE_VAR}, 48px)`;
  const iconSize = `var(${ICON_SIZE_VAR}, 24px)`;
  const controlRadius = `calc(${controlSize} / 2)`;
  const dockCss = config.dock
    ? `
      left: max(${config.side_gap}, env(safe-area-inset-left)) !important;
      right: max(${config.side_gap}, env(safe-area-inset-right)) !important;
      width: auto !important;
      height: ${config.height} !important;
      min-height: ${config.height} !important;
      border-radius: ${config.radius} !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      background: ${config.background} !important;
      border: ${config.border} !important;
      border-bottom: 0 !important;
      outline: 0 !important;
      box-shadow: ${config.shadow} !important;
      backdrop-filter: blur(22px) saturate(1.45) !important;
      -webkit-backdrop-filter: blur(22px) saturate(1.45) !important;
    `
    : `
      left: 0 !important;
      right: 0 !important;
      width: 100% !important;
      min-height: ${config.height} !important;
    `;

  const toolbarCss = config.dock
    ? `
      height: ${config.height} !important;
      min-height: ${config.height} !important;
      max-height: ${config.height} !important;
      padding: 0 10px !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      padding-block: 0 !important;
      margin: 0 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-sizing: border-box !important;
      overflow: visible !important;
      transform: none !important;
      translate: 0 0 !important;
    `
    : `
      min-height: ${config.height} !important;
    `;

  const sideButtonCss = `
    ${headerSelector} .toolbar {
      height: ${config.height} !important;
      min-height: ${config.height} !important;
      max-height: ${config.height} !important;
      padding: 0 10px !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      padding-block: 0 !important;
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
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-sizing: border-box !important;
      overflow: visible !important;
      transform: none !important;
      translate: 0 0 !important;
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

    ${headerSelector} ha-menu-button,
    ${headerSelector} ha-icon-button,
    ${headerSelector} ha-button-menu,
    ${headerSelector} app-toolbar > ha-menu-button,
    ${headerSelector} app-toolbar > ha-icon-button,
    ${headerSelector} app-toolbar > ha-button-menu {
      --mdc-icon-button-size: ${controlSize} !important;
      --mdc-icon-size: ${iconSize} !important;
      flex: 0 0 ${controlSize} !important;
      width: ${controlSize} !important;
      min-width: ${controlSize} !important;
      height: ${controlSize} !important;
      min-height: ${controlSize} !important;
      margin: 0 !important;
      border-radius: ${controlRadius} !important;
      background: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
      color: ${config.inactive_color} !important;
      opacity: 1 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
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

    ${headerSelector} ha-menu-button::part(label),
    ${headerSelector} ha-icon-button::part(label),
    ${headerSelector} ha-button-menu::part(label),
    ${headerSelector} app-toolbar > ha-menu-button::part(label),
    ${headerSelector} app-toolbar > ha-icon-button::part(label),
    ${headerSelector} app-toolbar > ha-button-menu::part(label) {
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
      overflow: visible !important;
    }

    ${headerSelector} ha-menu-button ha-icon,
    ${headerSelector} ha-menu-button ha-svg-icon,
    ${headerSelector} ha-menu-button svg,
    ${headerSelector} ha-icon-button ha-icon,
    ${headerSelector} ha-icon-button ha-svg-icon,
    ${headerSelector} ha-icon-button svg,
    ${headerSelector} ha-button-menu ha-icon,
    ${headerSelector} ha-button-menu ha-svg-icon,
    ${headerSelector} ha-button-menu svg,
    ${headerSelector} app-toolbar > ha-menu-button ha-icon,
    ${headerSelector} app-toolbar > ha-menu-button ha-svg-icon,
    ${headerSelector} app-toolbar > ha-menu-button svg,
    ${headerSelector} app-toolbar > ha-icon-button ha-icon,
    ${headerSelector} app-toolbar > ha-icon-button ha-svg-icon,
    ${headerSelector} app-toolbar > ha-icon-button svg,
    ${headerSelector} app-toolbar > ha-button-menu ha-icon,
    ${headerSelector} app-toolbar > ha-button-menu ha-svg-icon,
    ${headerSelector} app-toolbar > ha-button-menu svg {
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
      transform: none !important;
      translate: 0 0 !important;
    }
  `;

  const dockToolbarCss = `
    ${dockSelector} .${DOCK_TOOLBAR_CLASS} {
      width: 100% !important;
      height: ${config.height} !important;
      min-height: ${config.height} !important;
      max-height: ${config.height} !important;
      padding: 0 10px !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      padding-block: 0 !important;
      margin: 0 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      outline: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 0 !important;
      box-sizing: border-box !important;
      overflow: visible !important;
      transform: none !important;
      translate: 0 0 !important;
      pointer-events: auto !important;
    }

    ${dockSelector} .${DOCK_TOOLBAR_CLASS}::before,
    ${dockSelector} .${DOCK_TOOLBAR_CLASS}::after {
      display: none !important;
      opacity: 0 !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      outline: 0 !important;
    }
  `;

  const dockSideButtonCss = sideButtonCss.replaceAll(headerSelector, dockSelector);

  if (config.dock) {
    const dockPositionCss =
      config.position === "top"
        ? `
          top: calc(${config.offset} + env(safe-area-inset-top)) !important;
          bottom: auto !important;
        `
        : `
          top: auto !important;
          bottom: calc(${config.offset} + env(safe-area-inset-bottom)) !important;
        `;
    const viewPaddingCss =
      config.position === "top"
        ? `
          padding-top: calc(${config.top_padding} + env(safe-area-inset-top)) !important;
          padding-bottom: 0 !important;
          scroll-padding-top: calc(${config.top_padding} + env(safe-area-inset-top)) !important;
        `
        : `
          padding-bottom: calc(${config.bottom_padding} + env(safe-area-inset-bottom)) !important;
          scroll-padding-bottom: calc(${config.bottom_padding} + env(safe-area-inset-bottom)) !important;
        `;

    return `
      ${headerSelector} {
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        background: transparent !important;
        border: 0 !important;
        box-shadow: none !important;
        outline: 0 !important;
        overflow: visible !important;
        pointer-events: none !important;
      }

      ${headerSelector} > :not([${DOCK_ATTR}]) {
        visibility: hidden !important;
        pointer-events: none !important;
      }

      ${dockSelector} {
        position: fixed !important;
        ${dockPositionCss}
        z-index: ${config.z_index} !important;
        transform: translateZ(0) !important;
        color: ${config.inactive_color} !important;
        pointer-events: auto !important;
        ${dockCss}
      }

      ${dockToolbarCss}

      ${dockSelector} app-toolbar,
      ${dockSelector} ha-tabs,
      ${dockSelector} ha-tab-group {
        ${toolbarCss}
      }

      ${sideButtonCss}
      ${dockSideButtonCss}

      ha-panel-lovelace,
      hui-root,
      hui-view-container,
      #view,
      main,
      hui-view,
      hui-sections-view,
      hui-masonry-view,
      hui-panel-view {
        ${viewPaddingCss}
        box-sizing: border-box !important;
      }
    `;
  }

  if (config.position === "top") {
    return `
      ${headerSelector} {
        position: fixed !important;
        top: calc(${config.offset} + env(safe-area-inset-top)) !important;
        bottom: auto !important;
        z-index: ${config.z_index} !important;
        transform: translateZ(0) !important;
        color: ${config.inactive_color} !important;
        ${dockCss}
      }

      ${headerSelector} app-toolbar,
      ${headerSelector} ha-tabs,
      ${headerSelector} ha-tab-group {
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
      color: ${config.inactive_color} !important;
      ${dockCss}
    }

    ${headerSelector} app-toolbar,
    ${headerSelector} ha-tabs,
    ${headerSelector} ha-tab-group {
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

  if (!config.mobile_only) return css;

  return `
    @media (max-width: ${config.mobile_max_width}) {
      ${css}
    }
  `;
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

function setInlineStyles(element, declarations) {
  if (!element?.style) return;

  let props = state.inlineStyles.get(element);
  if (!props) {
    props = new Set();
    state.inlineStyles.set(element, props);
    state.inlineElements.add(element);
  }

  for (const [property, value] of Object.entries(declarations)) {
    const cssProperty = property.startsWith("--") ? property : toKebab(property);
    props.add(cssProperty);
    element.style.setProperty(cssProperty, value, "important");
  }

  element.setAttribute?.(INLINE_ATTR, "");
}

function clearInlineStyles(element) {
  const props = state.inlineStyles.get(element);
  if (!props || !element?.style) return;

  for (const property of props) {
    element.style.removeProperty(property);
  }

  state.inlineStyles.delete(element);
  state.inlineElements.delete(element);
  element.removeAttribute?.(INLINE_ATTR);
}

function clearInlineStylesForHeader(header) {
  for (const element of Array.from(state.inlineElements)) {
    if (!element?.isConnected || closestComposed(element, ".header") === header) {
      clearInlineStyles(element);
    }
  }
}

function clearAllInlineStyles() {
  restoreAllDocks();
  for (const element of Array.from(state.inlineElements)) {
    clearInlineStyles(element);
  }
}

function findSourceToolbar(header) {
  return header.querySelector(".toolbar") || header.querySelector("app-toolbar") || header;
}

function getDockRecord(header) {
  let record = state.docks.get(header);
  if (record?.dock?.isConnected && record?.toolbar?.isConnected) return record;

  const dock = document.createElement("div");
  dock.setAttribute(DOCK_ATTR, "");

  const toolbar = document.createElement("div");
  toolbar.className = DOCK_TOOLBAR_CLASS;
  dock.appendChild(toolbar);

  const parent = header.parentNode;
  if (parent) {
    parent.insertBefore(dock, header.nextSibling);
  } else {
    document.body.appendChild(dock);
  }

  record = {
    dock,
    toolbar,
    items: new Set()
  };
  state.docks.set(header, record);
  state.dockHeaders.add(header);
  return record;
}

function isNestedInSelectedElement(element, selected) {
  let parent = element.parentElement;
  while (parent) {
    if (selected.has(parent)) return true;
    parent = parent.parentElement;
  }
  return false;
}

function collectDockItems(header) {
  const source = findSourceToolbar(header);
  const directItems = Array.from(source.children || []).filter(
    (element) =>
      element.matches?.(DOCK_ALIGN_SELECTOR) ||
      element.querySelector?.(TAB_GROUP_SELECTOR) ||
      element.querySelector?.(SIDE_BUTTON_SELECTOR)
  );

  if (directItems.length) return directItems;

  const candidates = new Set(header.querySelectorAll(DOCK_ALIGN_SELECTOR));
  return Array.from(candidates).filter((element) => !isNestedInSelectedElement(element, candidates));
}

function restoreMovedElement(element) {
  const original = state.movedElements.get(element);
  if (!original?.parent) return;

  const nextSibling =
    original.nextSibling?.isConnected && original.nextSibling.parentNode === original.parent
      ? original.nextSibling
      : null;
  original.parent.insertBefore(element, nextSibling);
  element.removeAttribute?.(SOURCE_ATTR);
  state.movedElements.delete(element);
}

function restoreDock(header) {
  const record = state.docks.get(header);
  if (!record) return;

  for (const element of Array.from(record.items)) {
    restoreMovedElement(element);
  }

  record.dock.remove();
  state.docks.delete(header);
  state.dockHeaders.delete(header);
}

function restoreAllDocks() {
  for (const header of Array.from(state.dockHeaders)) {
    restoreDock(header);
  }
}

function ensureDock(header) {
  if (!state.config.dock) return header;

  const record = getDockRecord(header);
  const items = collectDockItems(header);

  for (const element of items) {
    if (!state.movedElements.has(element)) {
      state.movedElements.set(element, {
        parent: element.parentNode,
        nextSibling: element.nextSibling
      });
    }
    element.setAttribute?.(SOURCE_ATTR, "");
    record.items.add(element);
    record.toolbar.appendChild(element);
  }

  return record.dock;
}

function collectComposedElements(root, selector, results = new Set()) {
  if (!root || !selector) return results;

  if (root.nodeType === Node.ELEMENT_NODE && root.matches?.(selector)) {
    results.add(root);
  }

  if (root.querySelectorAll) {
    for (const element of root.querySelectorAll(selector)) {
      results.add(element);
    }
  }

  const walkerRoot = root === document ? document.documentElement : root;
  if (!walkerRoot) return results;

  const walker = document.createTreeWalker(walkerRoot, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode;
  while (node) {
    if (node.shadowRoot) {
      collectComposedElements(node.shadowRoot, selector, results);
    }
    node = walker.nextNode();
  }

  return results;
}

function collectAssignedSlotElements(root, results = new Set()) {
  if (!root?.querySelectorAll) return results;

  for (const slot of root.querySelectorAll("slot")) {
    const assigned = slot.assignedElements?.({ flatten: true }) || [];
    for (const element of assigned) {
      results.add(element);
      collectComposedElements(element, ICON_SELECTOR, results);
    }
  }

  return results;
}

function isActiveTab(tab) {
  return Boolean(
    tab?.hasAttribute?.("active") ||
      tab?.hasAttribute?.("selected") ||
      tab?.hasAttribute?.("iron-selected") ||
      tab?.getAttribute?.("aria-selected") === "true" ||
      tab?.getAttribute?.("aria-current") === "page" ||
      tab?.classList?.contains("active") ||
      tab?.classList?.contains("iron-selected")
  );
}

function styleIconElement(icon, iconSize, color) {
  setInlineStyles(icon, {
    "--mdc-icon-size": iconSize,
    width: iconSize,
    height: iconSize,
    minWidth: iconSize,
    minHeight: iconSize,
    maxWidth: iconSize,
    maxHeight: iconSize,
    display: "block",
    visibility: "visible",
    opacity: "1",
    color,
    fill: "currentColor",
    stroke: "currentColor",
    fontSize: iconSize,
    lineHeight: "1",
    transform: "none",
    translate: "0 0",
    pointerEvents: "none",
    flex: `0 0 ${iconSize}`
  });
}

function styleCenteredControl(element, controlSize, radius, color) {
  setInlineStyles(element, {
    width: controlSize,
    height: controlSize,
    minWidth: controlSize,
    minHeight: controlSize,
    maxWidth: controlSize,
    maxHeight: controlSize,
    padding: "0",
    margin: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    border: "0",
    borderBottom: "0",
    borderRadius: radius,
    background: "transparent",
    backgroundImage: "none",
    boxShadow: "none",
    outline: "0",
    filter: "none",
    backdropFilter: "none",
    "-webkit-backdrop-filter": "none",
    color,
    transform: "none",
    translate: "0 0"
  });
}

function styleLabelContainer(element, size, color) {
  setInlineStyles(element, {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    padding: "0",
    margin: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    overflow: "visible",
    fontSize: "0",
    lineHeight: "0",
    border: "0",
    background: "transparent",
    boxShadow: "none",
    color
  });
}

function syncIconsInRoot(root, iconSize, color) {
  const icons = collectComposedElements(root, ICON_SELECTOR);
  collectAssignedSlotElements(root?.shadowRoot || root, icons);
  for (const icon of icons) {
    styleIconElement(icon, iconSize, color);
  }
}

function syncTabControl(tab, controlSize, iconSize, radius) {
  const active = isActiveTab(tab);
  const color = active ? state.config.active_color : state.config.inactive_color;

  setInlineStyles(tab, {
    "--mdc-tab-min-width": controlSize,
    "--mdc-tab-width": controlSize,
    "--mdc-tab-height": controlSize,
    "--md-primary-tab-container-height": controlSize,
    "--md-primary-tab-active-indicator-height": "0",
    "--md-primary-tab-active-indicator-color": "transparent",
    "--mdc-tab-indicator-active-indicator-height": "0",
    "--mdc-tab-indicator-active-indicator-color": "transparent",
    flex: `0 0 ${controlSize}`,
    width: controlSize,
    height: controlSize,
    minWidth: controlSize,
    minHeight: controlSize,
    maxWidth: controlSize,
    maxHeight: controlSize,
    margin: "0 1px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    overflow: "visible",
    border: "0",
    borderBottom: "0",
    borderRadius: radius,
    background: "transparent",
    boxShadow: "none",
    outline: "0",
    color,
    opacity: active ? "1" : "0.82",
    transform: "none",
    translate: "0 0",
    touchAction: "pan-x"
  });

  const internals = collectComposedElements(tab.shadowRoot, TAB_INTERNAL_SELECTOR);
  for (const element of internals) {
    styleCenteredControl(element, controlSize, radius, color);
  }

  const textLabels = collectComposedElements(tab.shadowRoot, TEXT_LABEL_SELECTOR);
  for (const label of textLabels) {
    setInlineStyles(label, { display: "none", opacity: "0" });
  }

  const labels = collectComposedElements(tab.shadowRoot, LABEL_SELECTOR);
  for (const label of labels) {
    styleLabelContainer(label, label.localName === "slot" ? iconSize : "100%", color);
  }

  syncIconsInRoot(tab, iconSize, color);
}

function syncSideButton(button, controlSize, iconSize, radius) {
  const color = state.config.inactive_color;
  setInlineStyles(button, {
    "--mdc-icon-button-size": controlSize,
    "--mdc-icon-size": iconSize,
    flex: `0 0 ${controlSize}`,
    width: controlSize,
    height: controlSize,
    minWidth: controlSize,
    minHeight: controlSize,
    maxWidth: controlSize,
    maxHeight: controlSize,
    margin: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius,
    background: "transparent",
    boxShadow: "none",
    outline: "0",
    color,
    opacity: "1",
    transform: "none",
    translate: "0 0"
  });

  const internals = collectComposedElements(
    button.shadowRoot,
    "ha-button, button, [part~='base'], [part~='button'], [part~='label'], .mdc-icon-button"
  );
  for (const element of internals) {
    styleCenteredControl(element, element.matches?.("[part~='label']") ? iconSize : controlSize, radius, color);
  }

  syncIconsInRoot(button, iconSize, color);
}

function syncToolbarContainer(container) {
  setInlineStyles(container, {
    height: state.config.height,
    minHeight: state.config.height,
    maxHeight: state.config.height,
    padding: "0 10px",
    paddingTop: "0",
    paddingBottom: "0",
    paddingBlock: "0",
    margin: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    overflow: "hidden",
    background: "transparent",
    border: "0",
    borderBottom: "0",
    boxShadow: "none",
    outline: "0",
    transform: "none",
    translate: "0 0"
  });
}

function syncTabGroupInternals(group, controlSize) {
  const root = group.shadowRoot;
  if (!root) return;

  const elements = collectComposedElements(
    root,
    ".tab-group, .tab-group-top, .tab-group-bottom, .nav-container, .nav, .tabs, [part~='base'], [part~='nav'], [part~='tabs'], slot[name='nav'], slot:not([name])"
  );

  for (const element of elements) {
    setInlineStyles(element, {
      height: controlSize,
      minHeight: controlSize,
      maxHeight: controlSize,
      padding: "0",
      paddingTop: "0",
      paddingBottom: "0",
      paddingBlock: "0",
      margin: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      boxSizing: "border-box",
      overflowX: element.localName === "slot" ? "visible" : "auto",
      overflowY: element.localName === "slot" ? "visible" : "hidden",
      position: "relative",
      top: "0",
      bottom: "auto",
      transform: "none",
      translate: "0 0",
      scrollbarWidth: "none"
    });
  }

  collectAssignedSlotElements(root).forEach((element) => {
    if (element.matches?.(TAB_SELECTOR)) {
      setInlineStyles(element, {
        alignSelf: "center",
        marginTop: "0",
        marginBottom: "0",
        top: "0",
        bottom: "auto",
        transform: "none",
        translate: "0 0"
      });
    }
  });
}

function elementCenterY(element) {
  if (!element?.getBoundingClientRect) return null;
  const rect = element.getBoundingClientRect();
  if (!Number.isFinite(rect.height) || rect.height <= 0) return null;
  return rect.top + rect.height / 2;
}

function average(values) {
  const valid = values.filter((value) => Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function visualCenterY(control) {
  if (!control) return null;

  const iconCenters = Array.from(collectComposedElements(control, ICON_SELECTOR))
    .map(elementCenterY)
    .filter((value) => value !== null);
  const assignedIconCenters = Array.from(collectAssignedSlotElements(control.shadowRoot || control))
    .filter((element) => element.matches?.(ICON_SELECTOR))
    .map(elementCenterY)
    .filter((value) => value !== null);
  const centers = [...iconCenters, ...assignedIconCenters];

  return average(centers) ?? elementCenterY(control);
}

function topLevelDockControls(navRoot) {
  const candidates = new Set(navRoot.querySelectorAll(DOCK_ALIGN_SELECTOR));
  return Array.from(candidates).filter((element) => !isNestedInSelectedElement(element, candidates));
}

function syncDockContentAlignment(navRoot) {
  if (!state.config.dock) return;

  const target = elementCenterY(navRoot);
  if (target === null) return;

  for (const control of topLevelDockControls(navRoot)) {
    const current = visualCenterY(control);
    if (current === null) continue;

    const shift = clampNumber(target - current, -96, 96);
    const transform = Math.abs(shift) < 0.5 ? "none" : `translateY(${shift.toFixed(2)}px)`;
    setInlineStyles(control, {
      transform,
      translate: "0 0",
      willChange: "transform"
    });
  }
}

function syncNavigationControls(header, controlSizeValue, iconSizeValue) {
  const controlSize = `${controlSizeValue}px`;
  const iconSize = `${iconSizeValue}px`;
  const radius = `${Math.round(controlSizeValue / 2)}px`;

  for (const container of header.querySelectorAll(TOOLBAR_CONTAINER_SELECTOR)) {
    syncToolbarContainer(container);
  }

  for (const group of header.querySelectorAll(TAB_GROUP_SELECTOR)) {
    setInlineStyles(group, {
      minWidth: "0",
      width: "100%",
      height: controlSize,
      minHeight: controlSize,
      overflowX: "auto",
      overflowY: "hidden",
      scrollbarWidth: "none",
      touchAction: "pan-x",
      transform: "none",
      translate: "0 0"
    });
    syncTabGroupInternals(group, controlSize);
  }

  for (const button of header.querySelectorAll(SIDE_BUTTON_SELECTOR)) {
    syncSideButton(button, controlSize, iconSize, radius);
  }

  for (const tab of header.querySelectorAll(TAB_SELECTOR)) {
    syncTabControl(tab, controlSize, iconSize, radius);
  }

  syncDockContentAlignment(header);
}

function syncHeaderMetrics(header) {
  const navRoot = state.config.dock ? ensureDock(header) : header;
  const button = navRoot.querySelector(
    "ha-menu-button, app-toolbar > ha-menu-button, ha-icon-button[slot='navigationIcon'], app-toolbar > ha-icon-button"
  );

  const controlSize = clampNumber(sizeFromRect(button?.getBoundingClientRect(), 48), 40, 56);
  const icon = button ? findButtonIcon(button) : null;
  const iconSize = clampNumber(sizeFromRect(icon?.getBoundingClientRect(), Math.round(controlSize / 2)), 20, 30);

  header.style.setProperty(CONTROL_SIZE_VAR, `${controlSize}px`);
  header.style.setProperty(ICON_SIZE_VAR, `${iconSize}px`);
  header.style.setProperty(TAB_Y_OFFSET_VAR, state.config.tab_y_offset);
  if (navRoot !== header) {
    navRoot.style.setProperty(CONTROL_SIZE_VAR, `${controlSize}px`);
    navRoot.style.setProperty(ICON_SIZE_VAR, `${iconSize}px`);
    navRoot.style.setProperty(TAB_Y_OFFSET_VAR, state.config.tab_y_offset);
  }
  syncNavigationControls(navRoot, controlSize, iconSize);
  if (navRoot !== header) {
    window.requestAnimationFrame(() => syncNavigationControls(navRoot, controlSize, iconSize));
  }
}

function clearHeaderMetrics(header) {
  restoreDock(header);
  clearInlineStylesForHeader(header);
  header.style.removeProperty(CONTROL_SIZE_VAR);
  header.style.removeProperty(ICON_SIZE_VAR);
  header.style.removeProperty(TAB_Y_OFFSET_VAR);
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
    element.querySelector("ha-tabs, ha-tab-group, paper-tabs, mwc-tab-bar, [role='tablist']")
  );
}

function updateMarkedHeaders(root, routeEnabled) {
  for (const header of rootQuerySelectorAll(root, `.header, [${NAV_ATTR}]`)) {
    const dockRecord = state.docks.get(header);
    const shouldMark =
      routeEnabled &&
      header.classList?.contains("header") &&
      (hasNavigationTabs(header) || Boolean(dockRecord?.items?.size));
    if (shouldMark) {
      header.setAttribute(NAV_ATTR, "");
      syncHeaderMetrics(header);
    } else {
      clearHeaderMetrics(header);
      header.removeAttribute(NAV_ATTR);
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
  return isShadowRootFor(root, TAB_SHADOW_HOSTS) && closestComposed(root.host, `.header[${NAV_ATTR}], [${DOCK_ATTR}]`);
}

function isMarkedTabGroupShadowRoot(root) {
  return isShadowRootFor(root, TAB_GROUP_SHADOW_HOSTS) && closestComposed(root.host, `.header[${NAV_ATTR}], [${DOCK_ATTR}]`);
}

function isMarkedButtonShadowRoot(root) {
  return isShadowRootFor(root, BUTTON_SHADOW_HOSTS) && closestComposed(root.host, `.header[${NAV_ATTR}], [${DOCK_ATTR}]`);
}

function rootCss(root, cssText, tabShadowCss, tabGroupShadowCss, buttonShadowCss, routeEnabled) {
  if (!routeEnabled) return "";
  if (isShadowRootFor(root, TAB_SHADOW_HOSTS)) return isMarkedTabShadowRoot(root) ? tabShadowCss : "";
  if (isShadowRootFor(root, TAB_GROUP_SHADOW_HOSTS)) return isMarkedTabGroupShadowRoot(root) ? tabGroupShadowCss : "";
  if (isShadowRootFor(root, BUTTON_SHADOW_HOSTS)) return isMarkedButtonShadowRoot(root) ? buttonShadowCss : "";
  if (hasMarkedNavigation(root) || hasDashboardView(root)) return cssText;
  return "";
}

function installStyle(root, cssText, tabShadowCss, tabGroupShadowCss, buttonShadowCss, routeEnabled) {
  const target = root === document ? document.head : root;
  if (!target || !target.querySelector) return;
  const nextCssText = rootCss(root, cssText, tabShadowCss, tabGroupShadowCss, buttonShadowCss, routeEnabled);

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
  observer.observe(target, { childList: true, subtree: true });
  state.observers.set(root, observer);
}

function walkRoots(root, cssText, tabShadowCss, tabGroupShadowCss, buttonShadowCss, routeEnabled) {
  updateMarkedHeaders(root, routeEnabled);
  installStyle(root, cssText, tabShadowCss, tabGroupShadowCss, buttonShadowCss, routeEnabled);
  observeRoot(root);

  const start = root === document ? document.documentElement : root;
  if (!start) return;

  const walker = document.createTreeWalker(start, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode;
  while (node) {
    if (node.shadowRoot) {
      walkRoots(node.shadowRoot, cssText, tabShadowCss, tabGroupShadowCss, buttonShadowCss, routeEnabled);
    }
    node = walker.nextNode();
  }
}

function applyStyles() {
  state.applyTimer = 0;
  const routeEnabled = allowsCurrentRoute();
  if (!routeEnabled) {
    clearAllInlineStyles();
  }
  walkRoots(
    document,
    buildCss(state.config),
    buildTabShadowCss(state.config),
    buildTabGroupShadowCss(state.config),
    buildButtonShadowCss(state.config),
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
      mobile_only: true,
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

window.__haNativeNavPositionVersion = VERSION;

start(readUrlConfig());

console.info(
  `%c${TAG_NAME}%c ${VERSION}`,
  "color: #03a9f4; font-weight: 700;",
  "color: inherit; font-weight: 400;"
);
