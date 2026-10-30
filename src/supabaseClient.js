import { createClient } from '@supabase/supabase-js';

// THAY URL VÀ ANON KEY SUPABASE CỦA BẠN VÀO ĐÂY:
const supabaseUrl = 'https://usgsahwgnbmwyblezilm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzZ3NhaHdnbmJtd3libGV6aWxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyODY0MDQsImV4cCI6MjEwODg2MjQwNH0.ydm05isjL8xzXEYzpOvWMc20AkU1OPyJAjHcqDTsGMg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
