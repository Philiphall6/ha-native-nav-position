const VERSION = "0.1.2";
const TAG_NAME = "ha-native-nav-position";
const STYLE_ID = "ha-native-nav-position-style";

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
  active_background: "rgba(255, 255, 255, 0.16)",
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
  const iconOffset = config.compact ? "12px" : "10px";

  return `
    ha-tab-group {
      --mdc-tab-height: 48px !important;
      min-width: 0 !important;
      width: 100% !important;
    }

    ha-tab-group-tab,
    ha-tab-group-tab[class~="icon-only"] {
      --mdc-tab-min-width: ${tabWidth} !important;
      --mdc-tab-width: ${tabWidth} !important;
      flex: 0 0 ${tabWidth} !important;
      width: ${tabWidth} !important;
      min-width: ${tabWidth} !important;
      max-width: ${tabWidth} !important;
      height: 48px !important;
      margin: 0 1px !important;
      border-radius: 24px !important;
      overflow: hidden !important;
      color: ${config.inactive_color} !important;
      opacity: 0.82 !important;
    }

    ha-tab-group-tab[active],
    ha-tab-group-tab[aria-selected="true"] {
      color: ${config.active_color} !important;
      opacity: 1 !important;
      background: ${config.active_background} !important;
    }

    ha-tab-group-tab::part(base),
    ha-tab-group-tab[class~="icon-only"]::part(base) {
      width: ${tabWidth} !important;
      min-width: ${tabWidth} !important;
      padding: 0 !important;
      border-radius: 24px !important;
      justify-content: center !important;
    }

    ha-tab-group-tab .mdc-tab__text-label,
    ha-tab-group-tab .mdc-tab__content span,
    ha-tab-group-tab .label {
      display: none !important;
    }

    ha-tab-group-tab ha-icon,
    ha-tab-group-tab[class~="icon-only"] ha-icon {
      --mdc-icon-size: ${iconSize};
      width: ${iconSize} !important;
      height: ${iconSize} !important;
      margin: ${iconOffset} auto 0 !important;
      display: block !important;
      color: inherit !important;
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
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.04)) !important;
    `
    : `
      min-height: ${config.height} !important;
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

function installStyle(root, cssText) {
  const target = root === document ? document.head : root;
  if (!target || !target.querySelector) return;

  let style = target.querySelector(`#${STYLE_ID}`);
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    target.appendChild(style);
  }

  if (style.textContent !== cssText) {
    style.textContent = cssText;
  }
}

function observeRoot(root) {
  const target = root === document ? document.documentElement : root;
  if (!target || state.observers.has(root)) return;

  const observer = new MutationObserver(() => scheduleApply());
  observer.observe(target, { childList: true, subtree: true });
  state.observers.set(root, observer);
}

function walkRoots(root, cssText) {
  installStyle(root, cssText);
  observeRoot(root);

  const start = root === document ? document.documentElement : root;
  if (!start) return;

  const walker = document.createTreeWalker(start, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode;
  while (node) {
    if (node.shadowRoot) {
      walkRoots(node.shadowRoot, cssText);
    }
    node = walker.nextNode();
  }
}

function applyStyles() {
  state.applyTimer = 0;
  walkRoots(document, buildCss(state.config));
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
