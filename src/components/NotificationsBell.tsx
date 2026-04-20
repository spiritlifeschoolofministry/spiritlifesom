import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/useAuth";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  type: string;
  is_read: boolean;
  created_at: string;
}

const NotificationsBell = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const userId = profile?.id;
  const unread = items.filter((n) => !n.is_read).length;

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data as Notification[]) || []);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    load();
    const channel = supabase
      .channel(`notif-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const markAllRead = async () => {
    if (!userId || unread === 0) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
    load();
  };

  const handleClick = async (n: Notification) => {
    if (!n.is_read) {
      await supabase.from("notifications").update({ is_read: true }).eq("id", n.id);
    }
    setOpen(false);
    if (n.link) navigate(n.link);
    load();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title="Notifications">
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <Badge className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground hover:bg-destructive h-4 min-w-4 px-1 text-[9px] font-bold rounded-full flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <h4 className="font-semibold text-sm">Notifications</h4>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="h-7 text-xs">
              <Check className="w-3 h-3 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet</div>
          ) : (
            <div className="divide-y">
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
                    !n.is_read ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      {n.body && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationsBell;
