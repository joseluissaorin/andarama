/**
 * Versión de este build del Studio: «<versión>+<sha corto> · <fecha>». La
 * inyecta Vite (`define` en vite.config.ts); fuera de Vite queda «dev».
 */
export const STUDIO_VERSION: string = typeof __ANDARAMA_VERSION__ === "string" ? __ANDARAMA_VERSION__ : "dev";
