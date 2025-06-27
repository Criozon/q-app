import { createClient } from '@supabase/supabase-js'

// Этот код читает ваши секретные ключи из файла .env.local
// Убедитесь, что этот файл существует в корне проекта
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)