import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, Edit2, Plus, ChevronLeft, ChevronRight, CalendarDays, List, Clock, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type SchoolEvent = Tables<'school_events'>;

interface EventFormData {
  title: string;
  description: string;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  category: string;
  target_cohort_id: string;
}

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

const AdminCalendar = () => {
  const { profile } = useAuth();
  const [cohorts, setCohorts] = useState<Tables<'cohorts'>[]>([]);
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showDialog, setShowDialog] = useState(false);
  const [editingEvent, setEditingEvent] = useState<SchoolEvent | null>(null);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const { register, handleSubmit, reset, setValue } = useForm<EventFormData>({
    defaultValues: {
      title: '', description: '', start_date: '', start_time: '09:00',
      end_date: '', end_time: '10:00', category: 'GENERAL', target_cohort_id: '',
    },
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [{ data: cohortsData }, { data: eventsData }] = await Promise.all([
        supabase.from('cohorts').select('*').order('name'),
        supabase.from('school_events').select('*').order('start_date', { ascending: true }),
      ]);
      if (cohortsData) setCohorts(cohortsData);
      if (eventsData) setEvents(eventsData);
    } catch (err) {
      console.error('Load calendar error:', err);
      toast.error('Failed to load calendar');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (values: EventFormData) => {
    try {
      setSubmitting(true);
      const startDateTime = new Date(`${values.start_date}T${values.start_time}`).toISOString();
      const endDateTime = new Date(`${values.end_date}T${values.end_time}`).toISOString();
      const payload = {
        title: values.title,
        description: values.description || null,
        start_date: startDateTime,
        end_date: endDateTime,
        category: values.category || 'GENERAL',
        target_cohort_id: values.target_cohort_id || null,
      };
      if (editingEvent) {
        const { error } = await supabase.from('school_events').update(payload).eq('id', editingEvent.id);
        if (error) throw error;
        toast.success('Event updated');
      } else {
        const { error } = await supabase.from('school_events').insert(payload);
        if (error) throw error;
        toast.success('Event created');
      }
      reset();
      setEditingEvent(null);
      setShowDialog(false);
      await loadData();
    } catch (err) {
      console.error('Save event error:', err);
      toast.error('Failed to save event');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this event?')) return;
    try {
      const { error } = await supabase.from('school_events').delete().eq('id', id);
      if (error) throw error;
      toast.success('Event deleted');
      await loadData();
    } catch (err) {
      console.error('Delete event error:', err);
      toast.error('Failed to delete event');
    }
  };

  const handleEdit = (event: SchoolEvent) => {
    const s = new Date(event.start_date);
    const e = event.end_date ? new Date(event.end_date) : s;
    reset({
      title: event.title,
      description: event.description || '',
      start_date: s.toISOString().split('T')[0],
      start_time: `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`,
      end_date: e.toISOString().split('T')[0],
      end_time: `${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`,
      category: event.category || 'GENERAL',
      target_cohort_id: event.target_cohort_id || '',
    });
    setEditingEvent(event);
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingEvent(null);
    reset();
  };

  const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const getEventsForDate = (date: Date) =>
    events.filter((ev) => new Date(ev.start_date).toDateString() === date.toDateString());

  const isToday = (date: Date) => date.toDateString() === new Date().toDateString();

  const monthYear = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const days: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i));

  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">School Calendar</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage events and schedules</p>
        </div>
        <Button onClick={() => setShowDialog(true)} className="gap-2 shadow-md">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Create Event</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
        <Button
          variant="ghost"
          size="sm"
          className={`gap-2 ${view === 'calendar' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
          onClick={() => setView('calendar')}
        >
          <CalendarDays className="h-4 w-4" />
          <span className="hidden sm:inline">Calendar</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`gap-2 ${view === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
          onClick={() => setView('list')}
        >
          <List className="h-4 w-4" />
          <span className="hidden sm:inline">List</span>
        </Button>
      </div>

      {view === 'calendar' ? (
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
                          {/* Desktop: show event titles */}
                          <div className="hidden sm:block space-y-0.5 mt-1">
                            {dayEvents.slice(0, 2).map((ev) => (
                              <div
                                key={ev.id}
                                className={`text-[10px] leading-tight rounded px-1.5 py-0.5 truncate border ${CATEGORY_COLORS[ev.category || 'GENERAL']}`}
                                onClick={(e) => { e.stopPropagation(); handleEdit(ev); }}
                              >
                                {ev.title}
                              </div>
                            ))}
                            {dayEvents.length > 2 && (
                              <div className="text-[10px] text-muted-foreground pl-1">+{dayEvents.length - 2} more</div>
                            )}
                          </div>
                          {/* Mobile: show dots */}
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
            </CardContent>
          </Card>

          {/* Sidebar: Selected date or upcoming */}
          <div className="space-y-4">
            {selectedDate && (
              <Card className="shadow-[var(--shadow-card)] border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">
                    {selectedDate.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedDateEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No events on this day</p>
                  ) : (
                    <div className="space-y-2.5">
                      {selectedDateEvents.map((ev) => (
                        <div key={ev.id} className="group p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-sm text-foreground truncate">{ev.title}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span className="text-xs text-muted-foreground">
                                  {new Date(ev.start_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <Badge variant="secondary" className={`mt-2 text-[10px] border ${CATEGORY_COLORS[ev.category || 'GENERAL']}`}>
                                {ev.category}
                              </Badge>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(ev)}>
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(ev.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

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
      ) : (
        /* List View */
        <Card className="shadow-[var(--shadow-card)] border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">All Events</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <div className="text-center py-12">
                <CalendarDays className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No events scheduled yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {events.map((ev) => (
                  <div key={ev.id} className="group flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 rounded-lg border border-border hover:bg-muted/40 transition-colors">
                    {/* Date badge */}
                    <div className="flex items-center gap-3 sm:gap-0">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-primary/10 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[10px] font-semibold text-primary uppercase">
                          {new Date(ev.start_date).toLocaleDateString('default', { month: 'short' })}
                        </span>
                        <span className="text-lg sm:text-xl font-bold text-primary leading-none">
                          {new Date(ev.start_date).getDate()}
                        </span>
                      </div>
                      {/* Mobile: inline title */}
                      <div className="sm:hidden min-w-0 flex-1">
                        <p className="font-medium text-sm text-foreground truncate">{ev.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className={`text-[10px] border ${CATEGORY_COLORS[ev.category || 'GENERAL']}`}>
                            {ev.category}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {ev.target_cohort_id ? cohorts.find(c => c.id === ev.target_cohort_id)?.name || 'Cohort' : 'All'}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Desktop: details */}
                    <div className="hidden sm:block flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground">{ev.title}</p>
                      {ev.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{ev.description}</p>}
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge variant="secondary" className={`text-[10px] border ${CATEGORY_COLORS[ev.category || 'GENERAL']}`}>
                          {ev.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {ev.target_cohort_id ? cohorts.find(c => c.id === ev.target_cohort_id)?.name : 'All Students'}
                        </span>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex gap-1.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0 self-end sm:self-center">
                      <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => handleEdit(ev)}>
                        <Edit2 className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline text-xs">Edit</span>
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(ev.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto">
          <DialogHeader className="sticky top-0 bg-background pb-4 border-b">
            <DialogTitle>{editingEvent ? 'Edit Event' : 'Create Event'}</DialogTitle>
            <DialogDescription>Add or update a calendar event</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <div>
              <label className="text-sm font-medium">Title *</label>
              <Input {...register('title', { required: true })} placeholder="Event title" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea {...register('description')} placeholder="Event details" className="mt-1" rows={3} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Start Date *</label>
                <Input {...register('start_date', { required: true })} type="date" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Start Time *</label>
                <Input {...register('start_time', { required: true })} type="time" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">End Date *</label>
                <Input {...register('end_date', { required: true })} type="date" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">End Time *</label>
                <Input {...register('end_time', { required: true })} type="time" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Category</label>
                <select {...register('category')} className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm mt-1">
                  <option value="GENERAL">General</option>
                  <option value="Holiday">Holiday</option>
                  <option value="Exam">Exam</option>
                  <option value="Break">Break</option>
                  <option value="Event">Event</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Target Audience</label>
                <select {...register('target_cohort_id')} className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm mt-1">
                  <option value="">All Students</option>
                  {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="sticky bottom-0 bg-background pt-4 border-t">
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>Cancel</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {editingEvent ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCalendar;
