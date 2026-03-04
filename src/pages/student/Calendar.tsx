import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

interface CalendarEvent extends Tables<'calendar_events'> {}

const StudentCalendar = () => {
  const { student } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    if (!student) return;
    loadEvents();
  }, [student?.cohort_id]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      if (!student) return;

      const cohortId = student.cohort_id;
      
      // Fetch events where target_cohort_id is null (General) OR equals student's cohort
      const orQuery = cohortId 
        ? `target_cohort_id.is.null,target_cohort_id.eq.${cohortId}`
        : `target_cohort_id.is.null`;
      
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .or(orQuery)
        .order('start_date', { ascending: true });
      
      if (error) throw error;
      setEvents((data as any) || []);
    } catch (err) {
      console.error('Load calendar error:', err);
      toast.error('Failed to load calendar');
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const getEventsForDate = (date: Date) => {
    return events?.filter((e) => {
      const eventDate = new Date(e.start_date);
      return eventDate.toDateString() === date.toDateString();
    }) || [];
  };

  const monthYear = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const days = [];

  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i));
  }

  const upcomingEvents = events
    ?.filter((e) => new Date(e.start_date) >= new Date())
    .slice(0, 5) || [];

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 pb-6">
      <div>
        <h1 className="text-2xl font-bold">School Calendar</h1>
        <p className="text-sm text-gray-600 mt-1">View upcoming events and important dates</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{monthYear}</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
                    Today
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="text-center font-semibold text-sm py-2">
                    {day}
                  </div>
                ))}
                {days.map((date, idx) => (
                  <div
                    key={idx}
                    className={`min-h-24 border rounded p-2 ${
                      date ? 'bg-white' : 'bg-gray-100'
                    }`}
                  >
                    {date && (
                      <>
                        <div className="font-semibold text-sm mb-1">{date.getDate()}</div>
                        <div className="space-y-1">
                          {getEventsForDate(date)?.map((event) => (
                            <div
                              key={event.id}
                              className="text-xs bg-blue-100 text-blue-800 rounded px-2 py-1 cursor-pointer hover:bg-blue-200 truncate"
                              onClick={() => setSelectedEvent(event)}
                              title={event.title}
                            >
                              {event.title}
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
            <CardHeader>
              <CardTitle>Upcoming Events</CardTitle>
            </CardHeader>
            <CardContent>
              {!upcomingEvents || upcomingEvents.length === 0 ? (
                <p className="text-sm text-gray-500">No upcoming events</p>
              ) : (
                <div className="space-y-3">
                  {upcomingEvents?.map((event) => (
                    <div
                      key={event.id}
                      className="p-3 border rounded hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => setSelectedEvent(event)}
                    >
                      <div className="font-medium text-sm">{event.title}</div>
                      <div className="text-xs text-gray-600 mt-1">
                        {new Date(event.start_date).toLocaleDateString()}
                      </div>
                      <Badge className="mt-2 text-xs" variant="secondary">
                        {event.category}
                      </Badge>
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
            <div className="flex items-center justify-between">
              <DialogTitle>{selectedEvent?.title}</DialogTitle>
              <button onClick={() => setSelectedEvent(null)} className="text-gray-500 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <DialogDescription>Event Details</DialogDescription>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Date</label>
                <p className="text-sm mt-1">{new Date(selectedEvent.start_date).toLocaleDateString()}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Time</label>
                <p className="text-sm mt-1">
                  {new Date(selectedEvent.start_date).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  -{' '}
                  {new Date(selectedEvent.end_date).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Category</label>
                <Badge className="mt-2">{selectedEvent.category}</Badge>
              </div>

              {selectedEvent.description && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Description</label>
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
