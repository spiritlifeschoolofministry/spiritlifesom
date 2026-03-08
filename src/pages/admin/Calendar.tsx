import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, Edit2, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
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

  const monthYear = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const days: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i));

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6 pb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">School Calendar</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage events and view schedule</p>
        </div>
        <Button onClick={() => setShowDialog(true)} className="gap-2"><Plus className="h-4 w-4" />Create Event</Button>
      </div>

      <div className="flex gap-2">
        <Button variant={view === 'calendar' ? 'default' : 'outline'} onClick={() => setView('calendar')}>Calendar</Button>
        <Button variant={view === 'list' ? 'default' : 'outline'} onClick={() => setView('list')}>List</Button>
      </div>

      {view === 'calendar' ? (
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
                <div key={idx} className={`min-h-24 border rounded p-1.5 ${date ? 'bg-card hover:bg-muted/50 cursor-pointer' : 'bg-muted/30'}`}>
                  {date && (
                    <>
                      <div className="font-semibold text-sm mb-1">{date.getDate()}</div>
                      <div className="space-y-0.5">
                        {getEventsForDate(date).map((ev) => (
                          <div key={ev.id} className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5 cursor-pointer hover:bg-primary/20 truncate" onClick={() => handleEdit(ev)}>
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
      ) : (
        <Card>
          <CardHeader><CardTitle>All Events</CardTitle></CardHeader>
          <CardContent>
            {events.length === 0 ? <p className="text-sm text-muted-foreground">No events scheduled</p> : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Audience</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((ev) => (
                      <TableRow key={ev.id}>
                        <TableCell className="font-medium">{ev.title}</TableCell>
                        <TableCell>{new Date(ev.start_date).toLocaleDateString()}</TableCell>
                        <TableCell><Badge variant="secondary">{ev.category}</Badge></TableCell>
                        <TableCell>{ev.target_cohort_id ? cohorts.find(c => c.id === ev.target_cohort_id)?.name || 'Unknown Cohort' : 'All Students'}</TableCell>
                        <TableCell className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEdit(ev)}><Edit2 className="h-4 w-4" /></Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(ev.id)}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Edit Event' : 'Create Event'}</DialogTitle>
            <DialogDescription>Add or update a calendar event</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title *</label>
              <Input {...register('title', { required: true })} placeholder="Event title" />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea {...register('description')} placeholder="Event details" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">Start Date *</label><Input {...register('start_date', { required: true })} type="date" /></div>
              <div><label className="text-sm font-medium">Start Time *</label><Input {...register('start_time', { required: true })} type="time" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-sm font-medium">End Date *</label><Input {...register('end_date', { required: true })} type="date" /></div>
              <div><label className="text-sm font-medium">End Time *</label><Input {...register('end_time', { required: true })} type="time" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Category</label>
                <select {...register('category')} className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="GENERAL">General</option>
                  <option value="Holiday">Holiday</option>
                  <option value="Exam">Exam</option>
                  <option value="Break">Break</option>
                  <option value="Event">Event</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Target Audience</label>
                <select {...register('target_cohort_id')} className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">All Students</option>
                  {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={handleCloseDialog}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : editingEvent ? 'Update' : 'Create'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCalendar;
