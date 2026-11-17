// ثوابت تُحقن عند البناء (vite define)
declare const __APP_VERSION__: string;
interface ImportMetaEnv { readonly VITE_ANALYTICS_TOKEN?: string }
interface ImportMeta { readonly env: ImportMetaEnv }
