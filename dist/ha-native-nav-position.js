const VERSION = "0.1.9";
const TAG_NAME = "ha-native-nav-position";
const STYLE_ID = "ha-native-nav-position-style";
const TAB_SHADOW_HOSTS = new Set([
  "ha-tab-group-tab",
  "mwc-tab",
  "md-primary-tab",
  "md-secondary-tab"
]);
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
  bottom_padding: "108px",
  top_padding: "88px",
  background: "rgba(35, 48, 64, 0.54)",
  active_background: "transparent",
  active_color: "var(--primary-text-color)",
  inactive_color: "rgba(255, 255, 255, 0.78)",
  border: "1px solid rgba(255, 255, 255, 0.18)",
  shadow: "0 18px 44px rgba(0, 0, 0, 0.24)",
  z_index: 1000
};

const state = {
  config: { ...DEFAULT_CONFIG },
  observers: new WeakMap(),
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
  const iconSize = "24px";
  const activeSize = "48px";

  return `
    ha-tab-group {
      --mdc-tab-height: 48px !important;
      --mdc-tab-indicator-active-indicator-height: 0 !important;
      --mdc-tab-indicator-active-indicator-color: transparent !important;
      --md-primary-tab-container-height: 48px !important;
      --md-primary-tab-active-indicator-height: 0 !important;
      --md-primary-tab-active-indicator-color: transparent !important;
      min-width: 0 !important;
      width: 100% !important;
    }

    ha-tab-group-tab,
    ha-tab-group-tab[class~="icon-only"] {
      --mdc-tab-min-width: ${tabWidth} !important;
      --mdc-tab-width: ${tabWidth} !important;
      --mdc-tab-height: 48px !important;
      --mdc-tab-indicator-active-indicator-height: 0 !important;
      --mdc-tab-indicator-active-indicator-color: transparent !important;
      --md-primary-tab-container-height: 48px !important;
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
      flex: 0 0 ${tabWidth} !important;
      width: ${tabWidth} !important;
      min-width: ${tabWidth} !important;
      max-width: ${tabWidth} !important;
      height: 48px !important;
      margin: 0 1px !important;
      border-radius: 24px !important;
      overflow: visible !important;
      color: ${config.inactive_color} !important;
      opacity: 0.82 !important;
      background: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }

    ha-tab-group-tab[active],
    ha-tab-group-tab[aria-selected="true"],
    ha-tab-group-tab[aria-current="page"],
    ha-tab-group-tab[selected],
    ha-tab-group-tab.active,
    ha-tab-group-tab.iron-selected {
      color: ${config.active_color} !important;
      opacity: 1 !important;
      background: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
    }

    ha-tab-group-tab::part(base),
    ha-tab-group-tab[class~="icon-only"]::part(base) {
      width: ${activeSize} !important;
      min-width: ${activeSize} !important;
      max-width: ${activeSize} !important;
      height: ${activeSize} !important;
      min-height: ${activeSize} !important;
      max-height: ${activeSize} !important;
      padding: 0 !important;
      border-radius: 50% !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      outline: 0 !important;
      box-sizing: border-box !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }

    ha-tab-group-tab[active]::part(base),
    ha-tab-group-tab[aria-selected="true"]::part(base),
    ha-tab-group-tab[aria-current="page"]::part(base),
    ha-tab-group-tab[selected]::part(base),
    ha-tab-group-tab.active::part(base),
    ha-tab-group-tab.iron-selected::part(base) {
      background: ${config.active_background} !important;
    }

    ha-tab-group-tab .mdc-tab__text-label,
    ha-tab-group-tab .mdc-tab__content span,
    ha-tab-group-tab .label {
      display: none !important;
    }

    ha-tab-group-tab .mdc-tab,
    ha-tab-group-tab mwc-tab,
    ha-tab-group-tab md-primary-tab,
    ha-tab-group-tab md-secondary-tab,
    ha-tab-group-tab .mdc-tab__content,
    ha-tab-group-tab [part~="content"] {
      width: 100% !important;
      height: 48px !important;
      padding: 0 !important;
      margin: 0 !important;
      border-radius: 24px !important;
      background: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-sizing: border-box !important;
    }

    ha-tab-group-tab ha-icon,
    ha-tab-group-tab[class~="icon-only"] ha-icon {
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
    }

    ha-tab-group-tab .mdc-tab-indicator,
    ha-tab-group-tab .mdc-tab-indicator--active,
    ha-tab-group-tab .mdc-tab-indicator__content,
    ha-tab-group-tab .mdc-tab-indicator__content--underline,
    ha-tab-group-tab .mdc-tab-indicator__content--fade,
    ha-tab-group-tab [class*="active-indicator"],
    ha-tab-group-tab [class*="selection-indicator"],
    ha-tab-group-tab .mdc-tab__ripple,
    ha-tab-group-tab mwc-ripple,
    ha-tab-group-tab md-ripple,
    ha-tab-group-tab md-focus-ring,
    ha-tab-group-tab::part(active-indicator),
    ha-tab-group-tab::part(activeIndicator),
    ha-tab-group-tab::part(selection-indicator),
    ha-tab-group-tab::part(indicator),
    ha-tab-group-tab::part(ripple),
    ha-tab-group-tab::part(focus-ring) {
      display: none !important;
      opacity: 0 !important;
      height: 0 !important;
      width: 0 !important;
      border: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      transform: scale(0) !important;
    }

    ha-tab-group-tab .mdc-tab__ripple::before,
    ha-tab-group-tab .mdc-tab__ripple::after,
    ha-tab-group-tab::before,
    ha-tab-group-tab::after {
      display: none !important;
      opacity: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }
  `;
}

function buildTabShadowCss(config) {
  if (!config.enabled || !config.hide_labels) return "";

  const tabWidth = config.compact ? "48px" : "56px";
  const iconSize = "24px";
  const css = `
    :host {
      --mdc-tab-min-width: ${tabWidth} !important;
      --mdc-tab-width: ${tabWidth} !important;
      --mdc-tab-height: 48px !important;
      --mdc-tab-indicator-active-indicator-height: 0 !important;
      --mdc-tab-indicator-active-indicator-color: transparent !important;
      --md-primary-tab-container-height: 48px !important;
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
      height: 48px !important;
      border-radius: 24px !important;
      background: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
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
      box-shadow: none !important;
      outline: 0 !important;
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
      height: 48px !important;
      min-height: 48px !important;
      padding: 0 !important;
      margin: 0 !important;
      border-radius: 24px !important;
      background: transparent !important;
      border: 0 !important;
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
      height: 48px !important;
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

    .mdc-tab__text-label,
    .mdc-tab__content span,
    .label,
    [part~="label"] {
      display: none !important;
    }

    ha-icon,
    ha-svg-icon,
    .ha-icon,
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

function buildHeaderCss(config) {
  const dockCss = config.dock
    ? `
      left: max(${config.side_gap}, env(safe-area-inset-left)) !important;
      right: max(${config.side_gap}, env(safe-area-inset-right)) !important;
      width: auto !important;
      height: ${config.height} !important;
      min-height: ${config.height} !important;
      border-radius: ${config.radius} !important;
      overflow: hidden !important;
      background: ${config.background} !important;
      border: ${config.border} !important;
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
      padding: 0 10px !important;
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      align-items: center !important;
    `
    : `
      min-height: ${config.height} !important;
    `;

  const sideButtonCss = `
    .header ha-menu-button,
    .header ha-icon-button,
    .header app-toolbar > ha-menu-button,
    .header app-toolbar > ha-icon-button {
      --mdc-icon-button-size: 48px !important;
      --mdc-icon-size: 24px !important;
      flex: 0 0 48px !important;
      width: 48px !important;
      min-width: 48px !important;
      height: 48px !important;
      min-height: 48px !important;
      margin: 0 !important;
      border-radius: 24px !important;
      background: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }

    .header ha-menu-button::part(base),
    .header ha-menu-button::part(button),
    .header ha-menu-button::part(ripple),
    .header ha-icon-button::part(base),
    .header ha-icon-button::part(button),
    .header ha-icon-button::part(ripple),
    .header app-toolbar > ha-menu-button::part(base),
    .header app-toolbar > ha-menu-button::part(button),
    .header app-toolbar > ha-menu-button::part(ripple),
    .header app-toolbar > ha-icon-button::part(base),
    .header app-toolbar > ha-icon-button::part(button),
    .header app-toolbar > ha-icon-button::part(ripple) {
      background: transparent !important;
      box-shadow: none !important;
      outline: 0 !important;
    }
  `;

  if (config.position === "top") {
    return `
      .header {
        position: fixed !important;
        top: calc(${config.offset} + env(safe-area-inset-top)) !important;
        bottom: auto !important;
        z-index: ${config.z_index} !important;
        ${dockCss}
      }

      .header app-toolbar,
      .header ha-tabs,
      .header ha-tab-group {
        ${toolbarCss}
      }

      ${sideButtonCss}

      hui-view,
      #view,
      main {
        padding-top: calc(${config.top_padding} + env(safe-area-inset-top)) !important;
        padding-bottom: 0 !important;
      }
    `;
  }

  return `
    .header {
      position: fixed !important;
      top: auto !important;
      bottom: calc(${config.offset} + env(safe-area-inset-bottom)) !important;
      z-index: ${config.z_index} !important;
      ${dockCss}
    }

    .header app-toolbar,
    .header ha-tabs,
    .header ha-tab-group {
      ${toolbarCss}
    }

    ${sideButtonCss}

    hui-view,
    #view,
    main {
      padding-bottom: calc(${config.bottom_padding} + env(safe-area-inset-bottom)) !important;
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

function isTabShadowRoot(root) {
  return root !== document && root.host && TAB_SHADOW_HOSTS.has(root.host.localName);
}

function allowsCurrentRoute() {
  const path = window.location?.pathname || "";
  return !NON_DASHBOARD_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

function hasDashboardNavigation(root) {
  if (!root || !root.querySelector) return false;
  return Boolean(
    root.querySelector(
      ".header ha-tabs, .header ha-tab-group, .header paper-tabs, .header mwc-tab-bar, .header [role='tablist']"
    )
  );
}

function hasDashboardView(root) {
  if (root === document) return true;
  if (!root || !root.querySelector) return false;
  return Boolean(
    root.querySelector(
      "ha-panel-lovelace, hui-root, hui-view, hui-sections-view, hui-masonry-view, hui-panel-view, #view"
    )
  );
}

function rootCss(root, cssText, tabShadowCss, routeEnabled) {
  if (!routeEnabled) return "";
  if (isTabShadowRoot(root)) return tabShadowCss;
  if (hasDashboardNavigation(root) || hasDashboardView(root)) return cssText;
  return "";
}

function installStyle(root, cssText, tabShadowCss, routeEnabled) {
  const target = root === document ? document.head : root;
  if (!target || !target.querySelector) return;
  const nextCssText = rootCss(root, cssText, tabShadowCss, routeEnabled);

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

function walkRoots(root, cssText, tabShadowCss, routeEnabled) {
  installStyle(root, cssText, tabShadowCss, routeEnabled);
  observeRoot(root);

  const start = root === document ? document.documentElement : root;
  if (!start) return;

  const walker = document.createTreeWalker(start, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode;
  while (node) {
    if (node.shadowRoot) {
      walkRoots(node.shadowRoot, cssText, tabShadowCss, routeEnabled);
    }
    node = walker.nextNode();
  }
}

function applyStyles() {
  state.applyTimer = 0;
  const routeEnabled = allowsCurrentRoute();
  walkRoots(document, buildCss(state.config), buildTabShadowCss(state.config), routeEnabled);
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

start(readUrlConfig());

console.info(
  `%c${TAG_NAME}%c ${VERSION}`,
  "color: #03a9f4; font-weight: 700;",
  "color: inherit; font-weight: 400;"
);
