import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth';
import StudentLayout from '@/components/StudentLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronLeft, ChevronRight, CalendarDays, Clock, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type SchoolEvent = Tables<'school_events'>;

const CATEGORY_COLORS: Record<string, string> = {
  GENERAL: 'bg-primary/15 text-primary border-primary/20',
  Holiday: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  Exam: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20',
  Break: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20',
  Event: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20',
};

const CATEGORY_DOT: Record<string, string> = {
  GENERAL: 'bg-primary',
  Holiday: 'bg-emerald-500',
  Exam: 'bg-red-500',
  Break: 'bg-amber-500',
  Event: 'bg-blue-500',
};

const StudentCalendar = () => {
  const { student } = useAuth();
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<SchoolEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

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
  const isToday = (date: Date) => date.toDateString() === new Date().toDateString();

  const monthYear = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const days: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i));

  const upcomingEvents = events.filter((e) => new Date(e.start_date) >= new Date()).slice(0, 5);
  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  if (loading) return <StudentLayout><div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></StudentLayout>;

  return (
    <StudentLayout>
      <div className="space-y-5 pb-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">School Calendar</h1>
          <p className="text-sm text-muted-foreground mt-1">View upcoming events and important dates</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
          {/* Calendar Grid */}
          <Card className="shadow-[var(--shadow-card)] border-border overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{monthYear}</CardTitle>
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs px-3" onClick={() => setCurrentMonth(new Date())}>
                    Today
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-2 sm:px-6 pb-4">
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                  <div key={i} className="text-center text-xs font-semibold text-muted-foreground py-2 sm:hidden">{d}</div>
                ))}
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2 hidden sm:block">{d}</div>
                ))}
              </div>
              {/* Days grid */}
              <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                {days.map((date, idx) => {
                  const dayEvents = date ? getEventsForDate(date) : [];
                  const today = date ? isToday(date) : false;
                  const isSelected = date && selectedDate?.toDateString() === date.toDateString();

                  return (
                    <div
                      key={idx}
                      className={`
                        min-h-[3.5rem] sm:min-h-[5.5rem] p-1 sm:p-1.5 transition-colors
                        ${date ? 'bg-card cursor-pointer hover:bg-accent/10' : 'bg-muted/40'}
                        ${isSelected ? 'ring-2 ring-primary ring-inset' : ''}
                      `}
                      onClick={() => date && setSelectedDate(date)}
                    >
                      {date && (
                        <>
                          <div className={`
                            text-xs sm:text-sm font-medium w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full mx-auto sm:mx-0
                            ${today ? 'bg-primary text-primary-foreground' : 'text-foreground'}
                          `}>
                            {date.getDate()}
                          </div>
                          {/* Desktop: event titles */}
                          <div className="hidden sm:block space-y-0.5 mt-1">
                            {dayEvents.slice(0, 2).map((ev) => (
                              <div
                                key={ev.id}
                                className={`text-[10px] leading-tight rounded px-1.5 py-0.5 truncate border cursor-pointer ${CATEGORY_COLORS[ev.category || 'GENERAL']}`}
                                onClick={(e) => { e.stopPropagation(); setSelectedEvent(ev); }}
                              >
                                {ev.title}
                              </div>
                            ))}
                            {dayEvents.length > 2 && (
                              <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 2} more</div>
                            )}
                          </div>
                          {/* Mobile: dots */}
                          {dayEvents.length > 0 && (
                            <div className="flex gap-0.5 justify-center mt-1 sm:hidden">
                              {dayEvents.slice(0, 3).map((ev) => (
                                <div key={ev.id} className={`w-1.5 h-1.5 rounded-full ${CATEGORY_DOT[ev.category || 'GENERAL']}`} />
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Mobile: selected date events */}
              {selectedDate && selectedDateEvents.length > 0 && (
                <div className="mt-4 sm:hidden space-y-2">
                  <p className="text-sm font-semibold text-foreground">
                    {selectedDate.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                  {selectedDateEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3 rounded-lg border border-border bg-muted/30 cursor-pointer active:bg-muted/60"
                      onClick={() => setSelectedEvent(ev)}
                    >
                      <p className="font-medium text-sm text-foreground">{ev.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {new Date(ev.start_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <Badge variant="secondary" className={`text-[10px] border ${CATEGORY_COLORS[ev.category || 'GENERAL']}`}>
                          {ev.category}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Upcoming Events */}
            <Card className="shadow-[var(--shadow-card)] border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Upcoming
                </CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingEvents.length === 0 ? (
                  <div className="text-center py-6">
                    <CalendarDays className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No upcoming events</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {upcomingEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors group"
                        onClick={() => setSelectedEvent(ev)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex flex-col items-center justify-center shrink-0">
                            <span className="text-[8px] font-bold text-primary uppercase leading-none">
                              {new Date(ev.start_date).toLocaleDateString('default', { month: 'short' })}
                            </span>
                            <span className="text-sm font-bold text-primary leading-none">
                              {new Date(ev.start_date).getDate()}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm text-foreground truncate">{ev.title}</p>
                            <Badge variant="secondary" className={`mt-1 text-[10px] border ${CATEGORY_COLORS[ev.category || 'GENERAL']}`}>
                              {ev.category}
                            </Badge>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Category Legend */}
            <Card className="shadow-[var(--shadow-card)] border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(CATEGORY_DOT).map(([cat, color]) => (
                    <div key={cat} className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                      <span className="text-xs text-muted-foreground">{cat}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Event Detail Dialog */}
        <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{selectedEvent?.title}</DialogTitle>
              <DialogDescription>Event Details</DialogDescription>
            </DialogHeader>
            {selectedEvent && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold text-primary uppercase">
                      {new Date(selectedEvent.start_date).toLocaleDateString('default', { month: 'short' })}
                    </span>
                    <span className="text-lg font-bold text-primary leading-none">
                      {new Date(selectedEvent.start_date).getDate()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {new Date(selectedEvent.start_date).toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {new Date(selectedEvent.start_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {selectedEvent.end_date && ` — ${new Date(selectedEvent.end_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <Badge className={`border ${CATEGORY_COLORS[selectedEvent.category || 'GENERAL']}`}>
                    {selectedEvent.category}
                  </Badge>
                </div>

                {selectedEvent.description && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</label>
                    <p className="text-sm mt-1.5 whitespace-pre-wrap text-foreground leading-relaxed">{selectedEvent.description}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </StudentLayout>
  );
};

export default StudentCalendar;
