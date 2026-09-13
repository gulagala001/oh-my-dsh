// Whale contours adapted from DSH 0.1.5-rc.1 HeroShell (MIT, DeepSeek).
// See THIRD_PARTY_NOTICES.md. Gradients, lighting and orbit are Oh My DSH's.
const DOWN = "M23.271 2.216C23.039 2.071 22.91 2.287 22.755 2.388C22.703 2.42 22.656 2.464 22.61 2.505C22.214 2.848 21.771 3.054 21.225 2.956C20.412 2.784 19.68 2.919 19.005 3.435C18.92 2.663 18.493 2.157 17.808 1.798C17.446 1.621 17.08 1.449 16.83 1.111C16.656 0.872 16.611 0.612 16.524 0.354C16.469 0.198 16.414 0.039 16.223 0.009C16.017 -0.024 15.936 0.137 15.856 0.271C15.539 0.822 15.418 1.43 15.429 2.046C15.454 3.432 16.041 4.538 17.196 5.36C17.325 5.456 17.356 5.547 17.312 5.674C17.229 5.936 17.134 6.191 17.051 6.454C16.999 6.623 16.921 6.659 16.738 6.58C16.107 6.306 15.56 5.909 15.074 5.433C14.248 4.633 13.5 3.751 12.568 3.06C12.349 2.898 12.13 2.748 11.903 2.605C10.952 1.682 12.028 0.923 12.277 0.833C12.537 0.739 12.367 0.416 11.526 0.42C10.684 0.424 9.914 0.706 8.933 1.081C8.789 1.138 8.638 1.179 8.484 1.213C7.593 1.044 6.668 1.006 5.702 1.115C3.883 1.318 2.43 2.178 1.362 3.646C0.079 5.41 -0.223 7.415 0.147 9.506C0.535 11.71 1.66 13.535 3.389 14.962C5.181 16.441 7.246 17.166 9.601 17.027C11.032 16.944 12.624 16.753 14.421 15.232C14.874 15.458 15.35 15.548 16.138 15.615C16.746 15.672 17.331 15.585 17.784 15.491C18.493 15.341 18.444 14.684 18.188 14.564C16.108 13.595 16.565 13.989 16.15 13.67C17.206 12.42 18.82 10.198 19.278 7.246C19.318 6.948 19.375 6.534 19.371 6.293C19.371 6.145 19.411 6.092 19.597 6.098C20.113 6.109 20.619 6.051 21.096 5.891C22.503 5.375 23.169 4.232 23.448 2.804C23.49 2.586 23.491 2.356 23.271 2.216ZM11.175 14.49C9.159 13.005 8.182 12.567 7.778 12.621C7.401 12.673 7.469 13.087 7.552 13.354C7.639 13.619 7.752 13.797 7.91 14.024C8.02 14.175 8.095 14.406 7.801 14.609C7.152 15.063 6.023 14.63 5.97 14.609C4.657 13.941 3.559 12.965 2.785 11.569C2.037 10.225 1.603 8.783 1.532 7.244C1.513 6.872 1.622 6.741 1.992 6.673C2.479 6.583 2.981 6.564 3.468 6.636C5.525 6.936 7.276 7.843 8.744 9.163C9.582 9.888 10.216 10.783 10.869 11.679C11.563 12.659 12.31 13.617 13.262 14.415C13.598 14.696 13.866 14.91 14.123 15.068C13.349 15.155 12.058 15.177 11.175 14.491L11.175 14.49ZM12.141 8.26C12.141 8.095 12.273 7.963 12.439 7.963C12.476 7.963 12.511 7.971 12.541 7.982C12.582 7.997 12.62 8.019 12.65 8.053C12.704 8.106 12.733 8.181 12.733 8.26C12.733 8.425 12.601 8.556 12.435 8.556C12.27 8.556 12.141 8.425 12.141 8.26ZM15.142 9.799C14.949 9.878 14.757 9.945 14.572 9.953C14.284 9.968 13.972 9.851 13.802 9.709C13.537 9.487 13.348 9.363 13.27 8.977C13.236 8.812 13.255 8.556 13.284 8.41C13.352 8.094 13.277 7.892 13.055 7.708C12.873 7.558 12.643 7.516 12.39 7.516C12.296 7.516 12.209 7.475 12.145 7.441C12.039 7.389 11.952 7.257 12.035 7.096C12.062 7.043 12.19 6.916 12.22 6.893C12.563 6.698 12.96 6.762 13.326 6.908C13.665 7.047 13.922 7.302 14.292 7.663C14.669 8.098 14.738 8.218 14.953 8.545C15.123 8.801 15.277 9.063 15.383 9.364C15.447 9.551 15.364 9.705 15.142 9.799Z";
const UP = "M22.403 0.567C22.145 0.477 22.068 0.718 21.939 0.85C21.895 0.893 21.86 0.947 21.824 0.997C21.515 1.421 21.13 1.721 20.591 1.77C19.829 1.867 19.221 2.244 18.712 2.958C18.535 2.227 18.116 1.839 17.516 1.626C17.203 1.506 16.887 1.379 16.663 1.064C16.508 0.839 16.462 0.581 16.383 0.329C16.332 0.176 16.283 0.02 16.121 -0.002C15.944 -0.029 15.875 0.133 15.805 0.269C15.52 0.822 15.408 1.43 15.42 2.046C15.449 3.432 16.031 4.532 17.202 5.274C17.337 5.356 17.374 5.445 17.335 5.582C17.261 5.862 17.169 6.134 17.086 6.413C17.032 6.59 16.952 6.63 16.764 6.558C16.118 6.301 15.562 5.909 15.074 5.433C14.248 4.633 13.5 3.751 12.568 3.06C12.349 2.898 12.13 2.748 11.903 2.605C10.952 1.682 12.028 0.923 12.277 0.833C12.537 0.739 12.367 0.416 11.526 0.42C10.684 0.424 9.914 0.706 8.933 1.081C8.789 1.138 8.638 1.179 8.484 1.213C7.593 1.044 6.668 1.006 5.702 1.115C3.883 1.318 2.43 2.178 1.362 3.646C0.079 5.41 -0.223 7.415 0.147 9.506C0.535 11.71 1.66 13.535 3.389 14.962C5.181 16.441 7.246 17.166 9.601 17.027C11.032 16.944 12.624 16.753 14.421 15.232C14.874 15.458 15.35 15.548 16.138 15.615C16.746 15.672 17.331 15.585 17.784 15.491C18.493 15.341 18.444 14.684 18.188 14.564C16.108 13.595 16.565 13.989 16.15 13.67C17.206 12.42 18.82 10.198 19.363 7.086C19.421 6.709 19.484 6.171 19.469 5.866C19.458 5.681 19.493 5.604 19.681 5.556C20.199 5.412 20.691 5.172 21.125 4.806C22.366 3.824 22.758 2.554 22.708 1.1C22.7 0.878 22.649 0.654 22.403 0.567ZM11.175 14.451C9.159 12.726 8.182 12.088 7.778 12.067C7.401 12.047 7.469 12.505 7.552 12.807C7.639 13.103 7.752 13.313 7.91 13.581C8.02 13.758 8.095 14.01 7.801 14.16C7.152 14.487 6.023 13.806 5.97 13.772C4.657 12.85 3.559 11.766 2.785 10.369C2.037 9.025 1.603 7.583 1.532 6.044C1.513 5.672 1.622 5.541 1.992 5.473C2.479 5.383 2.981 5.364 3.468 5.436C5.525 5.736 7.276 6.675 8.744 8.323C9.582 9.299 10.216 10.425 10.869 11.496C11.563 12.592 12.31 13.603 13.262 14.414C13.598 14.696 13.866 14.91 14.123 15.068C13.349 15.154 12.058 15.167 11.175 14.452L11.175 14.451ZM12.141 8.26C12.141 8.095 12.273 7.963 12.439 7.963C12.476 7.963 12.511 7.971 12.541 7.982C12.582 7.997 12.62 8.019 12.65 8.053C12.704 8.106 12.733 8.181 12.733 8.26C12.733 8.425 12.601 8.556 12.435 8.556C12.27 8.556 12.141 8.425 12.141 8.26ZM15.142 9.799C14.949 9.878 14.757 9.945 14.572 9.953C14.284 9.968 13.972 9.851 13.802 9.709C13.537 9.487 13.348 9.363 13.27 8.977C13.236 8.812 13.255 8.556 13.284 8.41C13.352 8.094 13.277 7.892 13.055 7.708C12.873 7.558 12.643 7.516 12.39 7.516C12.296 7.516 12.209 7.475 12.145 7.441C12.039 7.389 11.952 7.257 12.035 7.096C12.062 7.043 12.19 6.916 12.22 6.893C12.563 6.698 12.96 6.762 13.326 6.908C13.665 7.047 13.922 7.302 14.292 7.663C14.669 8.098 14.738 8.218 14.953 8.545C15.123 8.801 15.277 9.063 15.383 9.364C15.447 9.551 15.364 9.705 15.142 9.799Z";

// A unique id is required when multiple inline marks share the same document.
export function whaleSvg(id = 'omd-whale') {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="omd-whale" viewBox="-3 -6 30 30" fill="none" aria-hidden="true">
<defs>
  <path id="${id}-shape" class="omd-whale-contour" d="${DOWN}"/>
  <linearGradient id="${id}-body" x1="4" y1="0" x2="16" y2="19" gradientUnits="userSpaceOnUse">
    <stop stop-color="#a8fbff"/><stop offset=".18" stop-color="#43d5ff"/><stop offset=".4" stop-color="#268cfa"/><stop offset=".7" stop-color="#2458df"/><stop offset="1" stop-color="#9878ff"/>
  </linearGradient>
  <radialGradient id="${id}-glass" cx=".23" cy=".12" r=".83">
    <stop stop-color="white" stop-opacity=".76"/><stop offset=".25" stop-color="#8cedff" stop-opacity=".18"/><stop offset=".6" stop-color="#0734b3" stop-opacity=".08"/><stop offset=".9" stop-color="#5149ea" stop-opacity=".28"/><stop offset="1" stop-color="#cfbdff" stop-opacity=".6"/>
  </radialGradient>
  <linearGradient id="${id}-rim" x1="4" y1="1" x2="15" y2="17" gradientUnits="userSpaceOnUse">
    <stop stop-color="#e7ffff"/><stop offset=".45" stop-color="#6fe9ff" stop-opacity=".58"/><stop offset="1" stop-color="#c4b7ff"/>
  </linearGradient>
  <linearGradient id="${id}-trail"><stop stop-color="#5778ff" stop-opacity="0"/><stop offset=".6" stop-color="#a590ff"/><stop offset="1" stop-color="#85f3ff"/></linearGradient>
  <filter id="${id}-glow" x="-40%" y="-50%" width="180%" height="200%"><feGaussianBlur stdDeviation=".38"/></filter>
</defs>
<g class="omd-whale-orbit" opacity="0">
  <ellipse cx="11.7" cy="8.5" rx="13.4" ry="10.7" transform="rotate(-28 11.7 8.5)" stroke="#657eff" stroke-width=".12" opacity=".25"/>
  <g class="omd-whale-rotor">
    <ellipse cx="11.7" cy="8.5" rx="13.4" ry="10.7" transform="rotate(-28 11.7 8.5)" stroke="url(#${id}-trail)" stroke-width=".24" pathLength="100" stroke-dasharray="29 71"/>
    <g transform="rotate(-28 11.7 8.5)"><circle cx="25.1" cy="8.5" r=".7" fill="#48cfff" filter="url(#${id}-glow)"/><circle cx="25.1" cy="8.5" r=".32" fill="#d3fbff"/></g>
  </g>
</g>
<g class="omd-whale-body">
  <use href="#${id}-shape" fill="url(#${id}-body)"/>
  <use href="#${id}-shape" fill="url(#${id}-glass)"/>
  <use href="#${id}-shape" stroke="url(#${id}-rim)" stroke-width=".23"/>
  <path d="M2.1 5.2C3.7 1.5 7.6 .9 10.5 2" stroke="#d3ffff" stroke-width=".2" stroke-linecap="round" opacity=".65"/>
  <path d="M3.2 12.8C5.7 16.4 9.3 17 12.2 15.4" stroke="#b4a5ff" stroke-width=".22" stroke-linecap="round" opacity=".65"/>
</g>
</svg>`;
}

export const whaleCss = `
.tx-brand-mark { display: inline-grid; place-items: center; position: relative; isolation: isolate; flex-shrink: 0; overflow: visible; background: transparent; border-radius: 0; color: #67ccff; }
.omd-whale { width: 100%; height: 100%; overflow: visible; display: block; }
.omd-whale-body { transform-origin: 11.7px 8.5px; filter: drop-shadow(0 .35px .4px #1d5fc347); transition: filter .3s ease; }
.omd-whale-orbit { opacity: 0; transition: opacity .35s ease; pointer-events: none; }
.omd-whale-rotor { transform-origin: 11.7px 8.5px; }
.tx-brand-mark:is(:hover,[data-omd-state="hover"],[data-omd-state="running"]) .omd-whale-body,
button:is(:hover,:focus-visible) .tx-brand-mark .omd-whale-body { filter: drop-shadow(0 .35px .55px #397fff80) drop-shadow(0 0 .45px #6edbff55); }
.trisoul-shell[data-omd-running] .tx-brand-mark .omd-whale-orbit,
.tx-brand-mark[data-omd-state="running"] .omd-whale-orbit { opacity: 1; }
@media (prefers-color-scheme: dark) {
  .omd-whale-body { filter: drop-shadow(0 .4px .65px #206cff88); }
}
@media (prefers-reduced-motion: no-preference) {
  .tx-brand-mark:is(:hover,[data-omd-state="hover"]) .omd-whale-contour,
  button:is(:hover,:focus-visible) .tx-brand-mark .omd-whale-contour { animation: omd-whale-tail 1.65s ease-in-out infinite; }
  .tx-brand-mark:is(:hover,[data-omd-state="hover"]) .omd-whale-body,
  button:is(:hover,:focus-visible) .tx-brand-mark .omd-whale-body { animation: omd-whale-swim 1.65s ease-in-out infinite; }
  .trisoul-shell[data-omd-running] .tx-brand-mark .omd-whale-rotor,
  .tx-brand-mark[data-omd-state="running"] .omd-whale-rotor { animation: omd-whale-orbit 2.6s linear infinite; }
}
@keyframes omd-whale-tail { 0%,100% { d: path("${DOWN}"); } 45% { d: path("${UP}"); } }
@keyframes omd-whale-swim { 0%,100% { transform: rotate(0); } 45% { transform: translateY(-.2px) rotate(-2.5deg); } }
@keyframes omd-whale-orbit { to { transform: rotate(360deg); } }
@media (forced-colors: active) {
  .omd-whale-body { filter: none !important; }
  .omd-whale-body use { fill: CanvasText; stroke: none; }
  .omd-whale-body > path { display: none; }
  .omd-whale-orbit { display: none; }
}
`;
