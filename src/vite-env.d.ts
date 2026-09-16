/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** URL проекта Supabase. Задаётся в .env, на хостинге — в переменных окружения. */
    readonly VITE_SUPABASE_URL: string;
    /** Публичный anon-ключ Supabase. Публичный по устройству: уезжает в бандл,
     *  доступ ограничивают политики RLS, а не секретность ключа. */
    readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
