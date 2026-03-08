import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth';

export function useUnreadNotifications() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user?.id) return;

    const fetchCount = async () => {
      const { count: c } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      setCount(c ?? 0);
    };

    fetchCount();

    const channel = supabase
      .channel('unread-notifications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => fetchCount()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  return count;
}
