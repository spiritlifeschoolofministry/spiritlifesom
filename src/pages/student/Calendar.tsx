import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth';
import StudentLayout from '@/components/StudentLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type SchoolEvent = Tables<'school_events'>;

const StudentCalendar = () => {
  const { student } = useAuth();
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<SchoolEvent | null>(null);

  useEffect(() => {
    if (student) loadEvents();
  }, [student?.cohort_id]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const cohortId = student?.cohort_id;
      const orQuery = cohortId
        ? `target_cohort_id.is.null,target_cohort_id.eq.${cohortId}`
        : `target_cohort_id.is.null`;

      const { data, error } = await supabase
        .from('school_events')
        .select('*')
        .or(orQuery)
        .order('start_date', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (err) {
      console.error('Load calendar error:', err);
      toast.error('Failed to load calendar');
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const getEventsForDate = (date: Date) =>
    events.filter((e) => new Date(e.start_date).toDateString() === date.toDateString());

  const monthYear = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const days: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i));

  const upcomingEvents = events.filter((e) => new Date(e.start_date) >= new Date()).slice(0, 5);

  if (loading) return <StudentLayout><div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin" /></div></StudentLayout>;

  return (
    <StudentLayout><div className="space-y-6 pb-6">
      <div>
        <h1 className="text-2xl font-bold">School Calendar</h1>
        <p className="text-sm text-muted-foreground mt-1">View upcoming events and important dates</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{monthYear}</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>Today</Button>
                  <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="text-center font-semibold text-sm py-2">{d}</div>
                ))}
                {days.map((date, idx) => (
                  <div key={idx} className={`min-h-24 border rounded p-1.5 ${date ? 'bg-card' : 'bg-muted/30'}`}>
                    {date && (
                      <>
                        <div className="font-semibold text-sm mb-1">{date.getDate()}</div>
                        <div className="space-y-0.5">
                          {getEventsForDate(date).map((ev) => (
                            <div key={ev.id} className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5 cursor-pointer hover:bg-primary/20 truncate" onClick={() => setSelectedEvent(ev)} title={ev.title}>
                              {ev.title}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader><CardTitle>Upcoming Events</CardTitle></CardHeader>
            <CardContent>
              {upcomingEvents.length === 0 ? <p className="text-sm text-muted-foreground">No upcoming events</p> : (
                <div className="space-y-3">
                  {upcomingEvents.map((ev) => (
                    <div key={ev.id} className="p-3 border rounded hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => setSelectedEvent(ev)}>
                      <div className="font-medium text-sm">{ev.title}</div>
                      <div className="text-xs text-muted-foreground mt-1">{new Date(ev.start_date).toLocaleDateString()}</div>
                      <Badge className="mt-2 text-xs" variant="secondary">{ev.category}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedEvent?.title}</DialogTitle>
            <DialogDescription>Event Details</DialogDescription>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Date</label>
                <p className="text-sm mt-1">{new Date(selectedEvent.start_date).toLocaleDateString()}</p>
              </div>
              {selectedEvent.end_date && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">End</label>
                  <p className="text-sm mt-1">{new Date(selectedEvent.end_date).toLocaleDateString()}</p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Category</label>
                <Badge className="mt-1 ml-2">{selectedEvent.category}</Badge>
              </div>
              {selectedEvent.description && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Description</label>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{selectedEvent.description}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentCalendar;
