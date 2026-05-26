import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ufgfsethtoefnzmlwdhv.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmZ2ZzZXRodG9lZm56bWx3ZGh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTgzNjIsImV4cCI6MjA5NTMzNDM2Mn0.Z3SpJRu3LItLwxwkUiC6OYvTRuihBk0tYXpenywjImo';

export const supabase = createClient(supabaseUrl, supabaseKey);
