import { createClient } from '@supabase/supabase-js'

// ВАЖНО: URL и ключ теперь в кавычках, это правильный синтаксис
const supabaseUrl = 'https://orkpvyenyawrotzrfxeh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ya3B2eWVueWF3cm90enJmeGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NzA2NzgsImV4cCI6MjA2NjQ0NjY3OH0.ZNX-ftVym8B84qvzb85dYWa96XXFD_LEz73aXSbVEvQ';

// Создаем и экспортируем клиент Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});